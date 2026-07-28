import { spawn } from 'child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync
} from 'fs'
import { tmpdir } from 'os'
import { basename, extname, join } from 'path'
import type { ContentKind, InstalledMod, ModSource } from '../../shared/types'
import {
  beginContentDownload,
  emitContentProgress
} from './contentProgress'
import { contentDir, normalizeContentKind } from './contentKinds'
import { downloadFileWithProgress } from './downloadFile'
import { modsDir, upsertInstalledMod } from './manifest'
import { enableModsInWorldSave } from '../worlds'

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(destDir, { recursive: true })
    const child =
      process.platform === 'win32'
        ? spawn(
            'powershell.exe',
            [
              '-NoProfile',
              '-Command',
              `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
            ],
            { stdio: 'ignore' }
          )
        : spawn('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Extract failed (exit ${code}).`))
    })
  })
}

async function downloadToTemp(url: string, fileName: string, headers: Record<string, string>): Promise<string> {
  const staging = join(tmpdir(), `spire-content-${Date.now()}`)
  mkdirSync(staging, { recursive: true })
  const dest = join(staging, fileName.replace(/[\\/:*?"<>|]/g, '_'))
  try {
    emitContentProgress({
      phase: 'downloading',
      bytesReceived: 0,
      bytesTotal: 0,
      message: `Downloading “${fileName}”…`
    })
    await downloadFileWithProgress(url, dest, headers)
  } catch (err) {
    rmSync(staging, { recursive: true, force: true })
    throw err
  }
  return dest
}

function collectFiles(dir: string, exts: Set<string>, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === '__MACOSX' || name.startsWith('.')) continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) collectFiles(path, exts, out)
    else if (exts.has(extname(name).toLowerCase())) out.push(path)
  }
  return out
}

function uniqueWorldName(root: string, preferred: string): string {
  const base = preferred.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Downloaded-World'
  let name = base
  let i = 2
  while (existsSync(join(root, name))) {
    name = `${base}-${i}`
    i += 1
  }
  return name
}

/** If the archive wrapped everything in a single folder, lift children up. */
function unwrapSingleRootDir(dir: string): void {
  const entries = readdirSync(dir).filter((n) => n !== '__MACOSX' && !n.startsWith('.'))
  if (entries.length !== 1) return
  const only = join(dir, entries[0])
  if (!statSync(only).isDirectory()) return
  for (const name of readdirSync(only)) {
    const from = join(only, name)
    const to = join(dir, name)
    if (existsSync(to)) rmSync(to, { recursive: true, force: true })
    renameSync(from, to)
  }
  rmSync(only, { recursive: true, force: true })
}

/**
 * World packs often ship plugin jars under Saves/.../mods/. Hytale loads jars from
 * UserData/Mods (instance mods/) — move archives there and leave data folders in the save.
 */
function promotePackModArchives(
  savePath: string,
  instanceId: string,
  worldName: string,
  source: ModSource
): void {
  const packMods = join(savePath, 'mods')
  if (!existsSync(packMods)) return
  const destRoot = modsDir(instanceId)
  mkdirSync(destRoot, { recursive: true })
  for (const name of readdirSync(packMods)) {
    const src = join(packMods, name)
    let st
    try {
      st = statSync(src)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    const ext = extname(name).toLowerCase()
    if (ext !== '.jar' && ext !== '.zip') continue
    const safe = name.replace(/[\\/:*?"<>|]/g, '_')
    const dest = join(destRoot, safe)
    if (existsSync(dest)) unlinkSync(dest)
    renameSync(src, dest)
    upsertInstalledMod(instanceId, {
      source,
      modId: `world-pack:${worldName}:${safe}`,
      fileId: 'pack',
      name: `${basename(safe, ext)} (from ${worldName})`,
      fileName: safe,
      installedAt: new Date().toISOString(),
      pageUrl: '',
      enabled: true,
      kind: 'mods'
    })
  }
}

type InstallContentOptions = {
  instanceId: string
  kind: ContentKind
  source: ModSource
  modId: string
  fileId: string
  name: string
  pageUrl: string
  fileName: string
}

async function placeDownloadedContent(
  options: InstallContentOptions,
  kind: ContentKind,
  tempFile: string,
  stagingRoot: string,
  safeName: string
): Promise<InstalledMod> {
  if (kind === 'worlds') {
    emitContentProgress({
      phase: 'extracting',
      message: `Extracting world “${options.name}”…`
    })
    const worldsRoot = contentDir(options.instanceId, 'worlds')
    const worldName = uniqueWorldName(worldsRoot, options.name)
    const dest = join(worldsRoot, worldName)
    mkdirSync(dest, { recursive: true })
    const ext = extname(tempFile).toLowerCase()
    if (ext === '.zip') {
      await extractZip(tempFile, dest)
      unwrapSingleRootDir(dest)
    } else {
      renameSync(tempFile, join(dest, basename(tempFile)))
    }
    promotePackModArchives(dest, options.instanceId, worldName, options.source)
    try {
      enableModsInWorldSave(options.instanceId, worldName)
    } catch {
      // Save may not have config.json yet; launch sync will retry.
    }
    const installed = upsertInstalledMod(options.instanceId, {
      source: options.source,
      modId: options.modId,
      fileId: options.fileId,
      name: options.name,
      fileName: worldName,
      installedAt: new Date().toISOString(),
      pageUrl: options.pageUrl,
      enabled: true,
      kind: 'worlds'
    })
    emitContentProgress({
      phase: 'done',
      message: `Installed “${options.name}” into Saves/`
    })
    return installed
  }

  if (kind === 'prefabs') {
    emitContentProgress({
      phase: 'extracting',
      message: `Installing prefab “${options.name}”…`
    })
    const prefabsRoot = contentDir(options.instanceId, 'prefabs')
    const ext = extname(tempFile).toLowerCase()
    let installedFile = basename(tempFile)
    if (ext === '.zip') {
      const extractDir = join(stagingRoot, 'prefab-out')
      await extractZip(tempFile, extractDir)
      const prefabFiles = collectFiles(
        extractDir,
        new Set(['.json', '.prefab', '.prefab.json'])
      )
      if (prefabFiles.length === 0) {
        const dest = join(prefabsRoot, installedFile)
        if (existsSync(dest)) unlinkSync(dest)
        renameSync(tempFile, dest)
      } else {
        for (const file of prefabFiles) {
          const destName = basename(file).replace(/[\\/:*?"<>|]/g, '_')
          const dest = join(prefabsRoot, destName)
          if (existsSync(dest)) unlinkSync(dest)
          renameSync(file, dest)
          installedFile = destName
        }
      }
    } else {
      const dest = join(prefabsRoot, installedFile)
      if (existsSync(dest)) unlinkSync(dest)
      renameSync(tempFile, dest)
    }
    const installed = upsertInstalledMod(options.instanceId, {
      source: options.source,
      modId: options.modId,
      fileId: options.fileId,
      name: options.name,
      fileName: installedFile,
      installedAt: new Date().toISOString(),
      pageUrl: options.pageUrl,
      enabled: true,
      kind: 'prefabs'
    })
    emitContentProgress({
      phase: 'done',
      message: `Installed “${options.name}” into prefabs/`
    })
    return installed
  }

  emitContentProgress({
    phase: 'extracting',
    message: `Installing “${options.name}”…`
  })
  const modsRoot = contentDir(options.instanceId, kind)
  const dest = join(modsRoot, safeName)
  if (existsSync(dest)) unlinkSync(dest)
  renameSync(tempFile, dest)
  const installed = upsertInstalledMod(options.instanceId, {
    source: options.source,
    modId: options.modId,
    fileId: options.fileId,
    name: options.name,
    fileName: safeName,
    installedAt: new Date().toISOString(),
    pageUrl: options.pageUrl,
    enabled: true,
    kind
  })
  emitContentProgress({
    phase: 'done',
    message: `Installed “${options.name}” into mods/`
  })
  return installed
}

/**
 * Download content into the logical instance folder for its kind.
 * Worlds/prefabs extract archives; mods/bootstrap/translations land as files in mods/.
 */
export async function installDownloadedContent(options: {
  instanceId: string
  kind: ContentKind
  source: ModSource
  modId: string
  fileId: string
  name: string
  pageUrl: string
  url: string
  fileName: string
  headers?: Record<string, string>
}): Promise<InstalledMod> {
  const kind = normalizeContentKind(options.kind)
  const headers = options.headers ?? {}
  const safeName = options.fileName.replace(/[\\/:*?"<>|]/g, '_')
  beginContentDownload(kind, options.name)
  const tempFile = await downloadToTemp(options.url, safeName, headers)
  const stagingRoot = join(tempFile, '..')

  try {
    return await placeDownloadedContent(options, kind, tempFile, stagingRoot, safeName)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitContentProgress({ phase: 'error', message })
    throw err
  } finally {
    try {
      rmSync(stagingRoot, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

/** Install a local archive (browser Downloads watcher / Import). */
export async function installLocalContent(options: {
  instanceId: string
  kind: ContentKind
  source: ModSource
  modId: string
  fileId: string
  name: string
  pageUrl: string
  localPath: string
  fileName?: string
}): Promise<InstalledMod> {
  const kind = normalizeContentKind(options.kind)
  const safeName = (options.fileName || basename(options.localPath)).replace(
    /[\\/:*?"<>|]/g,
    '_'
  )
  beginContentDownload(kind, options.name)
  const stagingRoot = join(tmpdir(), `spire-content-${Date.now()}`)
  mkdirSync(stagingRoot, { recursive: true })
  const tempFile = join(stagingRoot, safeName)
  copyFileSync(options.localPath, tempFile)

  try {
    return await placeDownloadedContent(
      {
        instanceId: options.instanceId,
        kind,
        source: options.source,
        modId: options.modId,
        fileId: options.fileId,
        name: options.name,
        pageUrl: options.pageUrl,
        fileName: safeName
      },
      kind,
      tempFile,
      stagingRoot,
      safeName
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitContentProgress({ phase: 'error', message })
    throw err
  } finally {
    try {
      rmSync(stagingRoot, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}
