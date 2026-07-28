import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'fs'
import { basename, dirname, join, relative, sep } from 'path'
import { app, dialog } from 'electron'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type {
  ExportSpirePackOptions,
  ExportSpirePackResult,
  ImportSpirePackResult,
  SpirePackManifest
} from '../shared/types'
import { errorMessage } from '../shared/errors'
import {
  createInstance,
  ensureInstanceLayout,
  getInstance,
  getInstancePath,
  listInstances,
  updateInstance
} from './instances'
import { ensureModsLink } from './isolation'
import { logInfo } from './logging'

const PACK_FORMAT = 1
const SPIRE_MIN_VERSION = '0.1.0'

function walkFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === '.' || name === '..') continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      // Skip Mods junction under userdata — recreated on import
      if (name === 'Mods' && baselowerEndsWith(base, 'userdata')) continue
      out.push(...walkFiles(full, base))
    } else if (st.isFile()) {
      out.push(full)
    }
  }
  return out
}

function baselowerEndsWith(path: string, segment: string): boolean {
  const parts = path.split(/[/\\]/).map((p) => p.toLowerCase())
  return parts[parts.length - 1] === segment.toLowerCase()
}

function toZipPath(abs: string, root: string): string {
  return relative(root, abs).split(sep).join('/')
}

function safePackName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
  return cleaned || 'spire-pack'
}

function uniqueImportName(base: string): string {
  const names = new Set(listInstances().map((i) => i.name.toLowerCase()))
  if (!names.has(base.toLowerCase())) return base
  const imported = `${base} imported`
  if (!names.has(imported.toLowerCase())) return imported
  let n = 2
  while (names.has(`${imported} ${n}`.toLowerCase())) n += 1
  return `${imported} ${n}`
}

export async function exportInstancePack(
  instanceId: string,
  options: ExportSpirePackOptions = {}
): Promise<ExportSpirePackResult> {
  const instance = getInstance(instanceId)
  if (!instance) throw new Error('Instance not found.')

  let includeWorlds: boolean
  if (typeof options.includeWorlds === 'boolean') {
    includeWorlds = options.includeWorlds
  } else {
    const choice = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Without saves', 'Include saves', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'Export Spire pack',
      message: 'Include world saves in this pack?',
      detail: 'Packs always include mods, prefabs, and profile settings. Cancel aborts the export.'
    })
    if (choice.response === 2) {
      return { ok: false, canceled: true, path: null, message: 'Export cancelled.' }
    }
    includeWorlds = choice.response === 1
  }

  const root = getInstancePath(instanceId)
  const defaultName = `${safePackName(instance.name)}.spirepack`

  let destPath = options.destPath?.trim() || null
  if (!destPath) {
    const picked = await dialog.showSaveDialog({
      title: 'Export Spire pack',
      defaultPath: join(app.getPath('documents'), defaultName),
      filters: [
        { name: 'Spire pack', extensions: ['spirepack'] },
        { name: 'Zip', extensions: ['zip'] }
      ]
    })
    if (picked.canceled || !picked.filePath) {
      return { ok: false, canceled: true, path: null, message: 'Export cancelled.' }
    }
    destPath = picked.filePath.endsWith('.spirepack') || picked.filePath.endsWith('.zip')
      ? picked.filePath
      : `${picked.filePath}.spirepack`
  }

  const manifest: SpirePackManifest = {
    formatVersion: PACK_FORMAT,
    name: instance.name,
    notes: instance.notes ?? '',
    channel: instance.channel,
    gameVersion: instance.gameVersion ?? null,
    javaArgs: instance.javaArgs ?? [],
    includeWorlds,
    createdAt: new Date().toISOString(),
    spireMinVersion: SPIRE_MIN_VERSION
  }

  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2))
  }

  const addTree = (absDir: string, zipPrefix: string): void => {
    if (!existsSync(absDir)) return
    for (const file of walkFiles(absDir)) {
      const rel = toZipPath(file, absDir)
      if (!rel || rel.startsWith('..')) continue
      files[`${zipPrefix}/${rel}`.replace(/\\/g, '/')] = readFileSync(file)
    }
  }

  addTree(join(root, 'mods'), 'mods')
  addTree(join(root, 'prefabs'), 'prefabs')

  const serversPath = join(root, 'servers.json')
  if (existsSync(serversPath)) {
    files['servers.json'] = readFileSync(serversPath)
  }

  if (includeWorlds) {
    addTree(join(root, 'userdata', 'Saves'), 'userdata/Saves')
  }

  const zipped = zipSync(files, { level: 6 })
  writeFileSync(destPath, zipped)
  logInfo('pack', `Exported “${instance.name}” → ${destPath}`)
  return {
    ok: true,
    canceled: false,
    path: destPath,
    message: `Exported “${instance.name}” to ${basename(destPath)}`
  }
}

export async function importInstancePack(
  filePath?: string | null
): Promise<ImportSpirePackResult> {
  let path = filePath?.trim() || null
  if (!path) {
    const picked = await dialog.showOpenDialog({
      title: 'Import Spire pack',
      properties: ['openFile'],
      filters: [
        { name: 'Spire pack', extensions: ['spirepack', 'zip'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (picked.canceled || !picked.filePaths[0]) {
      return {
        ok: false,
        canceled: true,
        instance: null,
        message: 'Import cancelled.'
      }
    }
    path = picked.filePaths[0]
  }

  if (!existsSync(path)) {
    throw new Error('Pack file not found.')
  }

  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(readFileSync(path))
  } catch (err) {
    throw new Error(`Could not read pack: ${errorMessage(err)}`)
  }

  const manifestRaw = unzipped['manifest.json']
  if (!manifestRaw) {
    throw new Error('Not a Spire pack — missing manifest.json.')
  }

  let manifest: SpirePackManifest
  try {
    manifest = JSON.parse(strFromU8(manifestRaw)) as SpirePackManifest
  } catch {
    throw new Error('Invalid pack manifest.json.')
  }

  if (manifest.formatVersion !== PACK_FORMAT) {
    throw new Error(`Unsupported pack format version ${String(manifest.formatVersion)}.`)
  }

  const baseName = (manifest.name || 'Imported pack').trim() || 'Imported pack'
  const name = uniqueImportName(baseName)
  const instance = createInstance({
    name,
    channel: manifest.channel === 'pre-release' ? 'pre-release' : 'release',
    gameVersion: manifest.gameVersion ?? null,
    notes: manifest.notes ?? ''
  })

  if (manifest.javaArgs && manifest.javaArgs.length > 0) {
    updateInstance(instance.id, { javaArgs: manifest.javaArgs })
  }

  ensureInstanceLayout(instance.id)
  const root = getInstancePath(instance.id)

  for (const [entry, data] of Object.entries(unzipped)) {
    if (entry === 'manifest.json') continue
    const normalized = entry.replace(/\\/g, '/')
    if (normalized.includes('..')) continue
    // Never restore userdata/Mods from pack
    if (
      normalized === 'userdata/Mods' ||
      normalized.startsWith('userdata/Mods/') ||
      normalized.toLowerCase() === 'userdata/mods' ||
      normalized.toLowerCase().startsWith('userdata/mods/')
    ) {
      continue
    }
    const dest = join(root, ...normalized.split('/'))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, data)
  }

  ensureModsLink(instance.id)
  const refreshed = getInstance(instance.id) ?? instance
  logInfo('pack', `Imported “${refreshed.name}” from ${basename(path)}`)
  return {
    ok: true,
    canceled: false,
    instance: refreshed,
    message: `Imported “${refreshed.name}”`
  }
}
