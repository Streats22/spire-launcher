import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { WorldEntry } from '../shared/types'
import { ensureInstanceLayout, getInstancePath } from './instances'

function worldsRoot(instanceId: string): string {
  ensureInstanceLayout(instanceId)
  const dir = join(getInstancePath(instanceId), 'worlds')
  mkdirSync(dir, { recursive: true })
  // also keep a userdata/worlds mirror path for future official layout
  mkdirSync(join(getInstancePath(instanceId), 'userdata', 'worlds'), { recursive: true })
  return dir
}

function dirSize(path: string): number {
  try {
    const st = statSync(path)
    if (st.isFile()) return st.size
    if (!st.isDirectory()) return 0
    return readdirSync(path).reduce((sum, name) => sum + dirSize(join(path, name)), 0)
  } catch {
    return 0
  }
}

export function listWorlds(instanceId: string): WorldEntry[] {
  const root = worldsRoot(instanceId)
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const path = join(root, d.name)
      const st = statSync(path)
      return {
        id: d.name,
        name: d.name,
        path,
        updatedAt: st.mtime.toISOString(),
        sizeBytes: dirSize(path)
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function createWorld(instanceId: string, name: string): WorldEntry {
  const safe = name.trim().replace(/[\\/:*?"<>|]/g, '_') || `World-${randomUUID().slice(0, 8)}`
  const path = join(worldsRoot(instanceId), safe)
  if (existsSync(path)) {
    throw new Error('A world with that name already exists.')
  }
  mkdirSync(path, { recursive: true })
  writeFileSync(
    join(path, 'spire-world.json'),
    JSON.stringify({ name: safe, createdAt: new Date().toISOString() }, null, 2),
    'utf8'
  )
  return listWorlds(instanceId).find((w) => w.id === safe)!
}

export function renameWorld(instanceId: string, worldId: string, name: string): WorldEntry {
  const root = worldsRoot(instanceId)
  const from = join(root, worldId)
  const safe = name.trim().replace(/[\\/:*?"<>|]/g, '_')
  if (!existsSync(from)) throw new Error('World not found.')
  if (!safe) throw new Error('Name required.')
  const to = join(root, safe)
  if (from !== to && existsSync(to)) throw new Error('A world with that name already exists.')
  if (from !== to) renameSync(from, to)
  return listWorlds(instanceId).find((w) => w.id === safe)!
}

export function deleteWorld(instanceId: string, worldId: string): void {
  const path = join(worldsRoot(instanceId), worldId)
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
  }
}

export function getWorldPath(instanceId: string, worldId: string): string {
  return join(worldsRoot(instanceId), worldId)
}
