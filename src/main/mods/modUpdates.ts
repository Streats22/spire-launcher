import type {
  ContentKind,
  InstalledMod,
  ModInstallMode,
  ModInstallResult,
  ModSource,
  ModUpdateInfo
} from '../../shared/types'
import { listInstalledMods, removeInstalledMod, setModEnabled } from './manifest'
import { getModFiles, installMod } from './service'

function isLocalImport(mod: InstalledMod): boolean {
  return String(mod.modId) === 'local'
}

function pickLatestFileId(
  files: Awaited<ReturnType<typeof getModFiles>>
): { fileId: string; displayName: string } | null {
  const latest = files.find((f) => f.primary) ?? files[0]
  if (!latest) return null
  return {
    fileId: latest.fileId,
    displayName: latest.displayName || latest.fileName
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  }

  const workers = Math.min(Math.max(1, concurrency), Math.max(1, items.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

async function checkOne(mod: InstalledMod): Promise<ModUpdateInfo> {
  const base = {
    source: mod.source,
    modId: mod.modId,
    name: mod.name,
    kind: (mod.kind ?? 'mods') as ContentKind,
    installedFileId: mod.fileId,
    installedFileName: mod.fileName
  }

  try {
    const files = await getModFiles(mod.source, mod.modId)
    const latest = pickLatestFileId(files)
    if (!latest) {
      return {
        ...base,
        latestFileId: mod.fileId,
        latestDisplayName: null,
        updateAvailable: false,
        error: 'No files found on the store.'
      }
    }

    return {
      ...base,
      latestFileId: latest.fileId,
      latestDisplayName: latest.displayName,
      updateAvailable: String(latest.fileId) !== String(mod.fileId),
      error: null
    }
  } catch (err) {
    return {
      ...base,
      latestFileId: mod.fileId,
      latestDisplayName: null,
      updateAvailable: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/** Compare installed store mods against the latest published file on each source. */
export async function checkModUpdates(
  instanceId: string,
  kind?: ContentKind
): Promise<ModUpdateInfo[]> {
  const mods = listInstalledMods(instanceId).filter((m) => {
    if (isLocalImport(m)) return false
    if (kind != null && (m.kind ?? 'mods') !== kind) return false
    return true
  })

  if (mods.length === 0) return []
  return mapPool(mods, 4, checkOne)
}

/**
 * Replace an installed mod with a specific file (or the store’s latest).
 * Preserves enabled/disabled state when possible.
 */
export async function updateInstalledMod(
  instanceId: string,
  source: ModSource,
  modId: string,
  fileId?: string,
  mode: ModInstallMode = 'quick',
  kind: ContentKind = 'mods'
): Promise<ModInstallResult> {
  if (String(modId) === 'local') {
    return { ok: false, message: 'Local imports cannot be updated from a store.' }
  }

  const existing = listInstalledMods(instanceId).find(
    (m) => m.source === source && String(m.modId) === String(modId)
  )

  if (!existing) {
    return installMod(instanceId, source, modId, fileId, mode, undefined, kind)
  }

  let targetFileId = fileId
  let targetLabel: string | null = null
  if (!targetFileId) {
    const files = await getModFiles(source, modId)
    const latest = pickLatestFileId(files)
    if (!latest) {
      return { ok: false, message: 'No downloadable version found for this mod.' }
    }
    targetFileId = latest.fileId
    targetLabel = latest.displayName
  }

  if (String(targetFileId) === String(existing.fileId)) {
    return {
      ok: true,
      message: `“${existing.name}” is already up to date.`,
      installed: existing
    }
  }

  const wasEnabled = existing.enabled !== false
  const contentKind = existing.kind ?? kind
  removeInstalledMod(instanceId, source, modId)

  const result = await installMod(
    instanceId,
    source,
    modId,
    targetFileId,
    mode,
    existing.name,
    contentKind
  )

  if (result.ok && result.installed && !wasEnabled) {
    try {
      const disabled = setModEnabled(instanceId, source, modId, false)
      result.installed = disabled
    } catch {
      // Install succeeded; enabled state is best-effort.
    }
  }

  if (result.ok && result.installed) {
    result.message = targetLabel
      ? `Updated “${result.installed.name}” to ${targetLabel}.`
      : `Updated “${result.installed.name}”.`
  }

  return result
}
