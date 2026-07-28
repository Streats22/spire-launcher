import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { ServerEntry } from '../shared/types'
import { ensureInstanceLayout, getInstancePath } from './instances'

function serversPath(instanceId: string): string {
  ensureInstanceLayout(instanceId)
  return join(getInstancePath(instanceId), 'servers.json')
}

function load(instanceId: string): ServerEntry[] {
  const path = serversPath(instanceId)
  if (!existsSync(path)) return []
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { servers?: ServerEntry[] }
    return data.servers ?? []
  } catch {
    return []
  }
}

function save(instanceId: string, servers: ServerEntry[]): void {
  const path = serversPath(instanceId)
  mkdirSync(getInstancePath(instanceId), { recursive: true })
  writeFileSync(path, JSON.stringify({ servers }, null, 2), 'utf8')
}

export function listServers(instanceId: string): ServerEntry[] {
  return load(instanceId).sort((a, b) => a.name.localeCompare(b.name))
}

export function upsertServer(
  instanceId: string,
  input: Partial<ServerEntry> & { name: string; address: string }
): ServerEntry {
  const servers = load(instanceId)
  const now = new Date().toISOString()
  const existing = input.id ? servers.find((s) => s.id === input.id) : undefined

  if (existing) {
    existing.name = input.name.trim() || existing.name
    existing.address = input.address.trim() || existing.address
    existing.port = input.port ?? existing.port
    existing.notes = input.notes ?? existing.notes
    existing.updatedAt = now
    save(instanceId, servers)
    return existing
  }

  const created: ServerEntry = {
    id: randomUUID(),
    name: input.name.trim() || 'Server',
    address: input.address.trim() || '127.0.0.1',
    port: input.port ?? 5520,
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now
  }
  servers.push(created)
  save(instanceId, servers)
  return created
}

export function deleteServer(instanceId: string, serverId: string): void {
  save(
    instanceId,
    load(instanceId).filter((s) => s.id !== serverId)
  )
}
