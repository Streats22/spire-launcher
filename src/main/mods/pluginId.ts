import { spawnSync } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { extname, join } from 'path'
import { listInstalledMods, modsDir } from './manifest'

interface PluginManifest {
  Group?: unknown
  Name?: unknown
}

function listArchiveEntries(archivePath: string): string[] {
  const result = spawnSync('tar', ['-tf', archivePath], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  })
  if (result.status !== 0 || !result.stdout) return []
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function readArchiveEntry(archivePath: string, entry: string): string | null {
  const result = spawnSync('tar', ['-xOf', archivePath, entry], {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true
  })
  if (result.status !== 0 || result.stdout == null || result.stdout === '') return null
  return result.stdout
}

function pluginIdFromManifest(raw: string): string | null {
  try {
    const data = JSON.parse(raw) as PluginManifest
    const group = typeof data.Group === 'string' ? data.Group.trim() : ''
    const name = typeof data.Name === 'string' ? data.Name.trim() : ''
    if (!group || !name) return null
    return `${group}:${name}`
  } catch {
    return null
  }
}

/** Read Hytale plugin id (`Group:Name`) from a .jar / .zip pack. */
export function readPluginIdFromArchive(archivePath: string): string | null {
  if (!existsSync(archivePath)) return null
  const entries = listArchiveEntries(archivePath)
  const manifestEntry =
    entries.find((e) => e === 'manifest.json') ||
    entries.find((e) => /(^|\/)manifest\.json$/i.test(e) && !e.includes('META-INF'))
  if (!manifestEntry) return null
  const raw = readArchiveEntry(archivePath, manifestEntry)
  if (!raw) return null
  return pluginIdFromManifest(raw)
}

/**
 * Plugin ids for mods Spire considers enabled (present under instance/mods).
 * Skips translations / packs without a Hytale manifest.
 */
export function listEnabledPluginIds(instanceId: string): string[] {
  const enabled = listInstalledMods(instanceId).filter((m) => m.enabled !== false)
  const root = modsDir(instanceId)
  const ids = new Set<string>()

  for (const mod of enabled) {
    const path = join(root, mod.fileName)
    const id = readPluginIdFromArchive(path)
    if (id) ids.add(id)
  }

  // Also pick up loose archives not yet in the Spire manifest.
  if (existsSync(root)) {
    for (const name of readdirSync(root)) {
      const ext = extname(name).toLowerCase()
      if (ext !== '.jar' && ext !== '.zip') continue
      if (name === 'spire-mods.json') continue
      const id = readPluginIdFromArchive(join(root, name))
      if (id) ids.add(id)
    }
  }

  return [...ids].sort((a, b) => a.localeCompare(b))
}
