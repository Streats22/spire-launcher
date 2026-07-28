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
  InstanceGroup,
  InstanceOrganizationItem,
  InstancePatch,
  SpireInstance,
  SpireSettings
} from '../shared/types'
import { getInstancesRoot } from './paths'
import { loadSettings, updateSettings } from './settings'

function normalizeInstance(raw: SpireInstance): SpireInstance {
  const channel: InstanceChannel =
    raw.channel === 'pre-release' ? 'pre-release' : 'release'
  const groupId =
    typeof raw.groupId === 'string' && raw.groupId.trim() ? raw.groupId.trim() : null
  const sortIndex =
    typeof raw.sortIndex === 'number' && Number.isFinite(raw.sortIndex) ? raw.sortIndex : 0
  return {
    ...raw,
    channel,
    gameVersion: raw.gameVersion ?? null,
    groupId,
    sortIndex
  }
}

function compareInstances(a: SpireInstance, b: SpireInstance): number {
  const ai = a.sortIndex ?? 0
  const bi = b.sortIndex ?? 0
  if (ai !== bi) return ai - bi
  return a.name.localeCompare(b.name)
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
    .sort(compareInstances)
}

function nextSortIndex(groupId: string | null): number {
  const inGroup = listInstances().filter((i) => (i.groupId ?? null) === groupId)
  if (inGroup.length === 0) return 0
  return Math.max(...inGroup.map((i) => i.sortIndex ?? 0)) + 1
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
  const groupId =
    typeof opts.groupId === 'string' && opts.groupId.trim() ? opts.groupId.trim() : null
  const id = randomUUID()
  const now = new Date().toISOString()
  const instance: SpireInstance = {
    id,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    notes: opts.notes?.trim() ?? '',
    channel,
    gameVersion,
    groupId,
    sortIndex: nextSortIndex(groupId)
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
    groupId:
      patch.groupId !== undefined
        ? patch.groupId?.trim()
          ? patch.groupId.trim()
          : null
        : (current.groupId ?? null),
    sortIndex:
      patch.sortIndex !== undefined && Number.isFinite(patch.sortIndex)
        ? patch.sortIndex
        : (current.sortIndex ?? 0),
    updatedAt: new Date().toISOString()
  }
  writeMeta(next)
  return next
}

/** Batch-assign group + order for home drag-and-drop. */
export function organizeInstances(items: InstanceOrganizationItem[]): SpireInstance[] {
  const byId = new Map(listInstances().map((i) => [i.id, i]))
  const now = new Date().toISOString()
  for (const item of items) {
    const current = byId.get(item.id)
    if (!current) continue
    const groupId =
      typeof item.groupId === 'string' && item.groupId.trim() ? item.groupId.trim() : null
    const sortIndex = Number.isFinite(item.sortIndex) ? item.sortIndex : 0
    if ((current.groupId ?? null) === groupId && (current.sortIndex ?? 0) === sortIndex) {
      continue
    }
    const next: SpireInstance = {
      ...current,
      groupId,
      sortIndex,
      updatedAt: now
    }
    writeMeta(next)
    byId.set(item.id, next)
  }
  return listInstances()
}

export function createInstanceGroup(name: string): SpireSettings {
  const trimmed = name.trim() || 'New group'
  const settings = loadSettings()
  const groups = [...(settings.instanceGroups ?? [])]
  const sortIndex =
    groups.length === 0 ? 0 : Math.max(...groups.map((g) => g.sortIndex)) + 1
  const group: InstanceGroup = {
    id: randomUUID(),
    name: trimmed,
    sortIndex
  }
  groups.push(group)
  return updateSettings({ instanceGroups: groups })
}

export function renameInstanceGroup(id: string, name: string): SpireSettings {
  const trimmed = name.trim() || 'Group'
  const settings = loadSettings()
  const groups = (settings.instanceGroups ?? []).map((g) =>
    g.id === id ? { ...g, name: trimmed } : g
  )
  if (!groups.some((g) => g.id === id)) throw new Error('Group not found.')
  return updateSettings({ instanceGroups: groups })
}

export function deleteInstanceGroup(id: string): {
  settings: SpireSettings
  instances: SpireInstance[]
} {
  const settings = loadSettings()
  const groups = (settings.instanceGroups ?? []).filter((g) => g.id !== id)
  if (groups.length === (settings.instanceGroups ?? []).length) {
    throw new Error('Group not found.')
  }
  const ungrouped = listInstances().filter((i) => (i.groupId ?? null) === null)
  const toMove = listInstances().filter((i) => i.groupId === id)
  let nextIndex =
    ungrouped.length === 0 ? 0 : Math.max(...ungrouped.map((i) => i.sortIndex ?? 0)) + 1
  const moved = toMove.map((i) => ({
    id: i.id,
    groupId: null as string | null,
    sortIndex: nextIndex++
  }))
  const instances = moved.length ? organizeInstances(moved) : listInstances()
  const nextSettings = updateSettings({
    instanceGroups: groups.map((g, i) => ({ ...g, sortIndex: i }))
  })
  return { settings: nextSettings, instances }
}

export function reorderInstanceGroups(ids: string[]): SpireSettings {
  const settings = loadSettings()
  const byId = new Map((settings.instanceGroups ?? []).map((g) => [g.id, g]))
  const ordered: InstanceGroup[] = []
  for (const id of ids) {
    const g = byId.get(id)
    if (g) {
      ordered.push(g)
      byId.delete(id)
    }
  }
  for (const g of byId.values()) ordered.push(g)
  return updateSettings({
    instanceGroups: ordered.map((g, i) => ({ ...g, sortIndex: i }))
  })
}

export function duplicateInstance(id: string, newName?: string): SpireInstance {
  const source = getInstance(id)
  if (!source) throw new Error('Profile not found.')

  ensureInstancesRoot()
  const newId = randomUUID()
  const now = new Date().toISOString()
  const destRoot = instanceDir(newId)

  cpSync(instanceDir(id), destRoot, { recursive: true })

  const groupId = source.groupId ?? null
  const copy: SpireInstance = {
    ...source,
    id: newId,
    name: (newName?.trim() || `${source.name} copy`).trim(),
    createdAt: now,
    updatedAt: now,
    groupId,
    sortIndex: nextSortIndex(groupId)
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
