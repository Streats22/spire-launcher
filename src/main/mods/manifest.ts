import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
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

export function listInstalledMods(instanceId: string): InstalledMod[] {
  const path = manifestPath(instanceId)
  if (!existsSync(path)) return []
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { mods?: InstalledMod[] }
    return data.mods ?? []
  } catch {
    return []
  }
}

function saveManifest(instanceId: string, mods: InstalledMod[]): void {
  const dir = modsDir(instanceId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(manifestPath(instanceId), JSON.stringify({ mods }, null, 2), 'utf8')
}

export function upsertInstalledMod(instanceId: string, mod: InstalledMod): InstalledMod {
  const mods = listInstalledMods(instanceId).filter(
    (m) => !(m.source === mod.source && String(m.modId) === String(mod.modId))
  )
  // normalize legacy numeric ids
  const normalized = { ...mod, modId: String(mod.modId), fileId: String(mod.fileId) }
  mods.push(normalized)
  mods.sort((a, b) => a.name.localeCompare(b.name))
  saveManifest(instanceId, mods)
  return normalized
}

export function removeInstalledMod(
  instanceId: string,
  source: ModSource,
  modId: string
): void {
  const existing = listInstalledMods(instanceId)
  const target = existing.find((m) => m.source === source && String(m.modId) === String(modId))
  if (target) {
    const filePath = join(modsDir(instanceId), target.fileName)
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath)
      } catch {
        // keep going — manifest should still update
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

  // Node 18+ / Electron fetch body → Web ReadableStream
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  await pipeline(nodeStream, createWriteStream(dest))
  return dest
}
