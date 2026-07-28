import { spawn } from 'child_process'
import {
  createWriteStream,
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
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import type { ContentKind, InstalledMod, ModSource } from '../../shared/types'
import { SPIRE_USER_AGENT } from './constants'
import { contentDir, normalizeContentKind } from './contentKinds'
import { upsertInstalledMod } from './manifest'

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
  const res = await fetch(url, {
    headers: { 'User-Agent': SPIRE_USER_AGENT, ...headers },
    redirect: 'follow'
  })
  if (!res.ok || !res.body) {
    rmSync(staging, { recursive: true, force: true })
    throw new Error(`Download failed (${res.status})`)
  }
  await pipeline(
    Readable.fromWeb(res.body as import('stream/web').ReadableStream),
    createWriteStream(dest)
  )
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
  const tempFile = await downloadToTemp(options.url, safeName, headers)
  const stagingRoot = join(tempFile, '..')

  try {
    if (kind === 'worlds') {
      const worldsRoot = contentDir(options.instanceId, 'worlds')
      const worldName = uniqueWorldName(worldsRoot, options.name)
      const dest = join(worldsRoot, worldName)
      mkdirSync(dest, { recursive: true })
      const ext = extname(tempFile).toLowerCase()
      if (ext === '.zip') {
        await extractZip(tempFile, dest)
      } else {
        renameSync(tempFile, join(dest, basename(tempFile)))
      }
      return upsertInstalledMod(options.instanceId, {
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
    }

    if (kind === 'prefabs') {
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
          // Keep whole zip as fallback asset
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
      return upsertInstalledMod(options.instanceId, {
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
    }

    // mods / bootstrap / translations → mods/
    const modsRoot = contentDir(options.instanceId, kind)
    const dest = join(modsRoot, safeName)
    if (existsSync(dest)) unlinkSync(dest)
    renameSync(tempFile, dest)
    return upsertInstalledMod(options.instanceId, {
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
  } finally {
    try {
      rmSync(stagingRoot, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}
