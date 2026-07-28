import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  CreateInstanceOptions,
  InstanceChannel,
  InstancePatch,
  SpireInstance
} from '../shared/types'
import { getInstancesRoot } from './paths'
import { loadSettings, updateSettings } from './settings'

function normalizeInstance(raw: SpireInstance): SpireInstance {
  const channel: InstanceChannel =
    raw.channel === 'pre-release' ? 'pre-release' : 'release'
  return {
    ...raw,
    channel,
    // Legacy profiles omit gameVersion — treat as unpinned.
    gameVersion: raw.gameVersion ?? null
  }
}

function instanceDir(id: string): string {
  return join(getInstancesRoot(), id)
}

function metaPath(id: string): string {
  return join(instanceDir(id), 'instance.json')
}

function writeMeta(instance: SpireInstance): void {
  writeFileSync(metaPath(instance.id), JSON.stringify(instance, null, 2), 'utf8')
}

export function ensureInstancesRoot(): void {
  mkdirSync(getInstancesRoot(), { recursive: true })
}

export function getInstancePath(id: string): string {
  return instanceDir(id)
}

/** Isolated userdata + mods per profile (Prism-style) */
export function ensureInstanceLayout(id: string): void {
  const root = instanceDir(id)
  mkdirSync(join(root, 'mods'), { recursive: true })
  mkdirSync(join(root, 'userdata'), { recursive: true })
  mkdirSync(join(root, 'worlds'), { recursive: true })
  mkdirSync(join(root, 'prefabs'), { recursive: true })
  mkdirSync(join(root, 'logs'), { recursive: true })
}

export function listInstances(): SpireInstance[] {
  ensureInstancesRoot()
  const root = getInstancesRoot()
  if (!existsSync(root)) return []

  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const path = metaPath(d.name)
      if (!existsSync(path)) return null
      try {
        return normalizeInstance(JSON.parse(readFileSync(path, 'utf8')) as SpireInstance)
      } catch {
        return null
      }
    })
    .filter((x): x is SpireInstance => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function createInstance(options: CreateInstanceOptions | string): SpireInstance {
  ensureInstancesRoot()
  const opts: CreateInstanceOptions =
    typeof options === 'string' ? { name: options } : options
  const trimmed = opts.name.trim() || 'New profile'
  const channel: InstanceChannel =
    opts.channel === 'pre-release' ? 'pre-release' : 'release'
  const gameVersion =
    opts.gameVersion === undefined
      ? null
      : opts.gameVersion?.trim()
        ? opts.gameVersion.trim()
        : null
  const id = randomUUID()
  const now = new Date().toISOString()
  const instance: SpireInstance = {
    id,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    notes: opts.notes?.trim() ?? '',
    channel,
    gameVersion
  }
  ensureInstanceLayout(id)
  writeMeta(instance)

  const settings = loadSettings()
  if (!settings.activeInstanceId) {
    updateSettings({ activeInstanceId: id })
  }
  return instance
}

export function updateInstance(id: string, patch: InstancePatch): SpireInstance {
  const current = getInstance(id)
  if (!current) throw new Error('Profile not found.')

  const next: SpireInstance = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() || current.name : current.name,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    channel: patch.channel ?? current.channel,
    gameVersion:
      patch.gameVersion !== undefined
        ? patch.gameVersion?.trim()
          ? patch.gameVersion.trim()
          : null
        : (current.gameVersion ?? null),
    javaArgs: patch.javaArgs ?? current.javaArgs,
    updatedAt: new Date().toISOString()
  }
  writeMeta(next)
  return next
}

export function duplicateInstance(id: string, newName?: string): SpireInstance {
  const source = getInstance(id)
  if (!source) throw new Error('Profile not found.')

  ensureInstancesRoot()
  const newId = randomUUID()
  const now = new Date().toISOString()
  const destRoot = instanceDir(newId)

  cpSync(instanceDir(id), destRoot, { recursive: true })

  const copy: SpireInstance = {
    ...source,
    id: newId,
    name: (newName?.trim() || `${source.name} copy`).trim(),
    createdAt: now,
    updatedAt: now
  }
  writeMeta(copy)
  ensureInstanceLayout(newId)
  return copy
}

export function deleteInstance(id: string): void {
  const dir = instanceDir(id)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
  const settings = loadSettings()
  if (settings.activeInstanceId === id) {
    const remaining = listInstances()
    updateSettings({ activeInstanceId: remaining[0]?.id ?? null })
  }
}

export function getInstance(id: string): SpireInstance | null {
  const path = metaPath(id)
  if (!existsSync(path)) return null
  try {
    return normalizeInstance(JSON.parse(readFileSync(path, 'utf8')) as SpireInstance)
  } catch {
    return null
  }
}
