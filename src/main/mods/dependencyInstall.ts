import type {
  ContentKind,
  InstalledMod,
  ModDependencyRef,
  ModInstallMode,
  ModInstallResult,
  ModSource
} from '../../shared/types'
import { errorMessage } from '../../shared/errors'
import { logInfo, logWarn } from '../logging'
import { resolveCurseForgeKey } from '../settings'
import { listCurseForgeAutoDependencies } from './curseforge'
import { emitContentProgress } from './contentProgress'
import { listInstalledMods } from './manifest'
import { listThunderstoreAutoDependencies } from './thunderstore'

export type LeafInstallFn = (
  instanceId: string,
  source: ModSource,
  modId: string,
  fileId: string | undefined,
  mode: ModInstallMode,
  modName: string | undefined,
  kind: ContentKind
) => Promise<ModInstallResult>

/**
 * Installs a mod and recursively auto-downloads store-declared required dependencies
 * (CurseForge required/embedded/include, Thunderstore package deps).
 */
export class ModDependencyInstaller {
  constructor(private readonly installLeaf: LeafInstallFn) {}

  async install(
    instanceId: string,
    source: ModSource,
    modId: string,
    fileId: string | undefined,
    mode: ModInstallMode,
    modName: string | undefined,
    kind: ContentKind
  ): Promise<ModInstallResult> {
    return this.#installTree(
      instanceId,
      source,
      modId,
      fileId,
      mode,
      modName,
      kind,
      new Set()
    )
  }

  async #installTree(
    instanceId: string,
    source: ModSource,
    modId: string,
    fileId: string | undefined,
    mode: ModInstallMode,
    modName: string | undefined,
    kind: ContentKind,
    visited: Set<string>
  ): Promise<ModInstallResult> {
    const key = `${source}:${modId}`
    if (visited.has(key)) {
      return { ok: true, message: 'Skipped cyclic dependency.' }
    }
    visited.add(key)

    const dependenciesInstalled: InstalledMod[] = []
    const deps = await this.#listAutoDeps(source, modId, fileId)

    for (const dep of deps) {
      if (this.#isInstalled(instanceId, dep.source, dep.modId)) continue

      emitContentProgress({
        phase: 'resolving',
        message: `Installing dependency ${dep.modId}…`
      })

      const depResult = await this.#installTree(
        instanceId,
        dep.source,
        dep.modId,
        undefined,
        mode,
        undefined,
        'mods',
        visited
      )

      if (depResult.ok && depResult.installed) {
        dependenciesInstalled.push(depResult.installed)
      }
      if (depResult.dependenciesInstalled?.length) {
        dependenciesInstalled.push(...depResult.dependenciesInstalled)
      }

      if (!depResult.ok && !depResult.needsManualDownload) {
        logWarn(
          'mods',
          `Dependency ${dep.source}:${dep.modId} failed: ${depResult.message}`
        )
      } else if (depResult.needsManualDownload) {
        logWarn(
          'mods',
          `Dependency ${dep.source}:${dep.modId} needs manual download — ${depResult.message}`
        )
      }
    }

    if (this.#isInstalled(instanceId, source, modId)) {
      const existing = listInstalledMods(instanceId).find(
        (m) => m.source === source && String(m.modId) === String(modId)
      )
      return {
        ok: true,
        message: this.#formatMessage(
          existing?.name || modName || modId,
          true,
          dependenciesInstalled
        ),
        installed: existing,
        dependenciesInstalled: dependenciesInstalled.length
          ? dependenciesInstalled
          : undefined
      }
    }

    const primary = await this.installLeaf(
      instanceId,
      source,
      modId,
      fileId,
      mode,
      modName,
      kind
    )

    if (!primary.ok) {
      return {
        ...primary,
        dependenciesInstalled: dependenciesInstalled.length
          ? dependenciesInstalled
          : undefined
      }
    }

    if (dependenciesInstalled.length) {
      logInfo(
        'mods',
        `Installed “${primary.installed?.name || modId}” with ${dependenciesInstalled.length} dependenc${
          dependenciesInstalled.length === 1 ? 'y' : 'ies'
        }`
      )
    }

    return {
      ...primary,
      dependenciesInstalled: dependenciesInstalled.length
        ? dependenciesInstalled
        : undefined,
      message: this.#formatMessage(
        primary.installed?.name || modName || modId,
        false,
        dependenciesInstalled,
        primary.message
      )
    }
  }

  async #listAutoDeps(
    source: ModSource,
    modId: string,
    fileId?: string
  ): Promise<ModDependencyRef[]> {
    try {
      if (source === 'curseforge') {
        const apiKey = resolveCurseForgeKey()
        if (!apiKey) return []
        return await listCurseForgeAutoDependencies(apiKey, modId, fileId)
      }
      if (source === 'thunderstore') {
        return await listThunderstoreAutoDependencies(modId, fileId)
      }
    } catch (err) {
      logWarn('mods', `Could not resolve dependencies: ${errorMessage(err)}`)
    }
    return []
  }

  #isInstalled(instanceId: string, source: ModSource, modId: string): boolean {
    return listInstalledMods(instanceId).some(
      (m) => m.source === source && String(m.modId) === String(modId)
    )
  }

  #formatMessage(
    name: string,
    alreadyInstalled: boolean,
    deps: InstalledMod[],
    baseMessage?: string
  ): string {
    const depNames = deps.map((d) => d.name).filter(Boolean)
    const unique = [...new Set(depNames)]
    if (unique.length === 0) {
      if (alreadyInstalled) return `“${name}” is already installed.`
      return baseMessage || `Installed “${name}”`
    }
    const depList =
      unique.length <= 3
        ? unique.map((n) => `“${n}”`).join(', ')
        : `${unique.length} dependencies`
    if (alreadyInstalled) {
      return `“${name}” already installed — also installed ${depList}.`
    }
    return `Installed “${name}” (+ ${depList}).`
  }
}
