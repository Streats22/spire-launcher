import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import type { InstalledMod, ModSource } from '../../shared/types'
import { ensureInstanceLayout, getInstancePath } from '../instances'
import { SPIRE_USER_AGENT } from './constants'

function manifestPath(instanceId: string): string {
  return join(getInstancePath(instanceId), 'mods', 'spire-mods.json')
}

export function modsDir(instanceId: string): string {
  ensureInstanceLayout(instanceId)
  return join(getInstancePath(instanceId), 'mods')
}

export function disabledModsDir(instanceId: string): string {
  const dir = join(modsDir(instanceId), 'disabled')
  mkdirSync(dir, { recursive: true })
  return dir
}

function normalizeMod(mod: InstalledMod): InstalledMod {
  return {
    ...mod,
    modId: String(mod.modId),
    fileId: String(mod.fileId),
    enabled: mod.enabled !== false
  }
}

export function listInstalledMods(instanceId: string): InstalledMod[] {
  const path = manifestPath(instanceId)
  if (!existsSync(path)) return []
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { mods?: InstalledMod[] }
    return (data.mods ?? []).map(normalizeMod)
  } catch {
    return []
  }
}

function saveManifest(instanceId: string, mods: InstalledMod[]): void {
  const dir = modsDir(instanceId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(manifestPath(instanceId), JSON.stringify({ mods }, null, 2), 'utf8')
}

function modFilePath(instanceId: string, mod: InstalledMod): string {
  const enabled = mod.enabled !== false
  return join(enabled ? modsDir(instanceId) : disabledModsDir(instanceId), mod.fileName)
}

export function upsertInstalledMod(instanceId: string, mod: InstalledMod): InstalledMod {
  const mods = listInstalledMods(instanceId).filter(
    (m) => !(m.source === mod.source && String(m.modId) === String(mod.modId))
  )
  const normalized = normalizeMod(mod)
  mods.push(normalized)
  mods.sort((a, b) => a.name.localeCompare(b.name))
  saveManifest(instanceId, mods)
  return normalized
}

export function setModEnabled(
  instanceId: string,
  source: ModSource,
  modId: string,
  enabled: boolean
): InstalledMod {
  const mods = listInstalledMods(instanceId)
  const target = mods.find((m) => m.source === source && String(m.modId) === String(modId))
  if (!target) throw new Error('Mod not found.')

  const wasEnabled = target.enabled !== false
  if (wasEnabled === enabled) return target

  const from = join(wasEnabled ? modsDir(instanceId) : disabledModsDir(instanceId), target.fileName)
  const toDir = enabled ? modsDir(instanceId) : disabledModsDir(instanceId)
  mkdirSync(toDir, { recursive: true })
  const to = join(toDir, target.fileName)

  if (existsSync(from)) {
    if (existsSync(to) && from !== to) {
      try {
        unlinkSync(to)
      } catch {
        // ignore
      }
    }
    if (from !== to) renameSync(from, to)
  }

  target.enabled = enabled
  saveManifest(instanceId, mods)
  return target
}

export function removeInstalledMod(
  instanceId: string,
  source: ModSource,
  modId: string
): void {
  const existing = listInstalledMods(instanceId)
  const target = existing.find((m) => m.source === source && String(m.modId) === String(modId))
  if (target) {
    for (const path of [
      join(modsDir(instanceId), target.fileName),
      join(disabledModsDir(instanceId), target.fileName)
    ]) {
      if (existsSync(path)) {
        try {
          unlinkSync(path)
        } catch {
          // keep going — manifest should still update
        }
      }
    }
  }
  saveManifest(
    instanceId,
    existing.filter((m) => !(m.source === source && String(m.modId) === String(modId)))
  )
}

export async function downloadToModsFolder(
  instanceId: string,
  url: string,
  fileName: string,
  headers: Record<string, string> = {}
): Promise<string> {
  const dir = modsDir(instanceId)
  const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_')
  const dest = join(dir, safeName)

  const res = await fetch(url, {
    headers: {
      'User-Agent': SPIRE_USER_AGENT,
      ...headers
    },
    redirect: 'follow'
  })

  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status})`)
  }

  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  await pipeline(nodeStream, createWriteStream(dest))
  return dest
}

/** Resolve on-disk path for a mod (active or disabled). */
export function resolveModFilePath(instanceId: string, mod: InstalledMod): string {
  return modFilePath(instanceId, mod)
}
