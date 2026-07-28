import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { spawn } from 'child_process'
import { USER_AGENT } from '../auth/constants'
import { getGameRoot } from '../paths'
import { hytaleArch, hytaleOs } from './platform'
import { channelPackageJreDir } from './patches'

interface JreManifest {
  version?: string
  download_url?: Record<
    string,
    Record<string, { url?: string; sha256?: string }>
  >
}

async function fetchJreManifest(): Promise<JreManifest> {
  const res = await fetch('https://launcher.hytale.com/version/release/jre.json', {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
  })
  if (!res.ok) throw new Error(`JRE manifest HTTP ${res.status}`)
  return (await res.json()) as JreManifest
}

async function downloadToFile(
  url: string,
  dest: string,
  onBytes?: (received: number, total: number) => void
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`JRE download failed (${res.status}).`)
  const total = Number(res.headers.get('content-length') || 0)
  let received = 0
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  nodeStream.on('data', (chunk: Buffer | string) => {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    received += buf.length
    onBytes?.(received, total)
  })
  await pipeline(nodeStream, createWriteStream(dest))
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  const isZip = archivePath.endsWith('.zip')
  await new Promise<void>((resolve, reject) => {
    const child = isZip
      ? process.platform === 'win32'
        ? spawn(
            'powershell.exe',
            [
              '-NoProfile',
              '-Command',
              `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
            ],
            { stdio: 'ignore' }
          )
        : spawn('unzip', ['-o', '-q', archivePath, '-d', destDir], { stdio: 'ignore' })
      : spawn('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`JRE extract failed (exit ${code}).`))
    })
  })
}

/** If extract created a single nested folder, flatten so bin/ is under dest. */
function flattenIfNeeded(destDir: string): void {
  const binName = process.platform === 'win32' ? 'java.exe' : 'java'
  if (existsSync(join(destDir, 'bin', binName))) return
  try {
    const kids = readdirSync(destDir, { withFileTypes: true }).filter(
      (d) => d.isDirectory() && !d.name.startsWith('.')
    )
    if (kids.length === 1) {
      const nested = join(destDir, kids[0].name)
      if (existsSync(join(nested, 'bin', binName))) {
        for (const ent of readdirSync(nested)) {
          renameSync(join(nested, ent), join(destDir, ent))
        }
        rmSync(nested, { recursive: true, force: true })
      }
    }
  } catch {
    // ignore
  }
}

export function javaBinaryIn(jreDir: string): string | null {
  const bin = process.platform === 'win32' ? 'java.exe' : 'java'
  const path = join(jreDir, 'bin', bin)
  return existsSync(path) ? path : null
}

/**
 * Install official Hytale JRE under the channel package tree
 * (`…/{channel}/package/jre/latest`) — same layout the official launcher uses.
 */
export async function ensureChannelJre(
  channel: string,
  onProgress?: (message: string, bytesReceived?: number, bytesTotal?: number) => void
): Promise<string> {
  const dest = channelPackageJreDir(channel)
  const existing = javaBinaryIn(dest)
  const marker = join(dest, '.jre_version')
  const manifest = await fetchJreManifest()
  const wantVersion = manifest.version ?? 'unknown'

  if (existing && existsSync(marker)) {
    try {
      if (readFileSync(marker, 'utf8').trim() === wantVersion) {
        onProgress?.(`JRE ${wantVersion} ready`)
        return existing
      }
    } catch {
      // reinstall
    }
  }

  const os = hytaleOs()
  const arch = hytaleArch()
  const entry = manifest.download_url?.[os]?.[arch]
  if (!entry?.url) {
    throw new Error(`No official JRE for ${os}/${arch}.`)
  }

  onProgress?.(`Downloading official JRE ${wantVersion}…`)
  const tmpRoot = join(getGameRoot(), '.tmp')
  mkdirSync(tmpRoot, { recursive: true })
  const archiveName = entry.url.split('/').pop() || `jre.${os === 'windows' ? 'zip' : 'tar.gz'}`
  const archivePath = join(tmpRoot, archiveName)

  await downloadToFile(entry.url, archivePath, (received, total) => {
    onProgress?.(
      total
        ? `Downloading JRE… ${Math.floor((received / total) * 100)}%`
        : `Downloading JRE… ${(received / 1_048_576).toFixed(1)} MB`,
      received,
      total
    )
  })

  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  onProgress?.('Extracting JRE…')
  await extractArchive(archivePath, dest)
  flattenIfNeeded(dest)
  try {
    unlinkSync(archivePath)
  } catch {
    // ignore
  }

  const javaPath = javaBinaryIn(dest)
  if (!javaPath) {
    throw new Error('JRE extracted but java binary not found.')
  }
  writeFileSync(marker, wantVersion, 'utf8')
  onProgress?.(`JRE ${wantVersion} installed`)
  return javaPath
}
