import { createHash } from 'crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join, dirname } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { spawn } from 'child_process'
import type {
  GameVersionInfo,
  HytaleChannelInfo,
  HytaleDownloadResult,
  HytalePatchline
} from '../../shared/types'
import { ACCOUNT_DATA, USER_AGENT } from '../auth/constants'
import { requireSignedIn } from '../auth/account'
import { getValidAccessTokenOrNull, withAuthRetry } from '../auth/oauth'
import { getGameRoot, resolveClientPath } from '../paths'
import { loadSettings, updateSettings } from '../settings'
import { getChannelInstallStatus, installFullChannel } from './install'
import { channelMetaDir, readInstalledBuild } from './patches'
import { emitProgress, getDownloadProgress } from './progress'

export { getDownloadProgress }

interface VersionManifest {
  version?: string
  download_url?: string
  sha256?: string
}

let downloadBusy = false

function channelLabelFromAssetPath(path: string): string {
  if (path.includes('pre-release')) return 'pre-release'
  if (path.includes('release')) return 'release'
  return 'requested'
}

async function getSignedUrl(path: string, accessToken: string): Promise<string> {
  const url = `${ACCOUNT_DATA}/game-assets/${path.replace(/^\//, '')}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    }
  })
  const text = await res.text()
  if (text === 'invalid token' || res.status === 401) throw new Error('unauthorized')
  if (text === 'no access to patchline' || res.status === 403) {
    const channel = channelLabelFromAssetPath(path)
    throw new Error(
      `No access to the “${channel}” patchline. ` +
        `Confirm this Hytale account owns the game, try Release instead of Pre-release, and that the correct account is active under Install.`
    )
  }
  if (!res.ok) throw new Error(`Game assets HTTP ${res.status}: ${text.slice(0, 160)}`)
  const json = JSON.parse(text) as { url?: string }
  if (!json.url) throw new Error('Missing signed URL from game-assets.')
  return json.url
}

async function fetchVersionManifest(
  channel: HytalePatchline,
  accessToken: string
): Promise<VersionManifest> {
  const signed = await getSignedUrl(`version/${channel}.json`, accessToken)
  const res = await fetch(signed, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Failed to fetch ${channel} version manifest (${res.status}).`)
  return (await res.json()) as VersionManifest
}

export async function listChannels(): Promise<HytaleChannelInfo[]> {
  await requireSignedIn()
  const channels: HytalePatchline[] = ['release', 'pre-release']
  const results: HytaleChannelInfo[] = []

  for (const channel of channels) {
    try {
      const manifest = await withAuthRetry((token) => fetchVersionManifest(channel, token))
      const status = getChannelInstallStatus(channel)
      results.push({
        channel,
        version: manifest.version ?? status.version,
        downloadUrl: manifest.download_url ?? null,
        sha256: manifest.sha256 ?? null,
        available: Boolean(manifest.version || status.ready),
        error: null,
        clientPatchPending: !status.ready,
        installedBuild: status.build || null,
        clientReady: status.ready
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const status = getChannelInstallStatus(channel)
      results.push({
        channel,
        version: status.version,
        downloadUrl: null,
        sha256: null,
        available: status.ready,
        error: message,
        clientPatchPending: !status.ready,
        installedBuild: status.build || null,
        clientReady: status.ready
      })
    }
  }

  return results
}

function listLocalVersions(channel: HytalePatchline): Array<{ version: string; path: string }> {
  const root = join(getGameRoot(), channel)
  if (!existsSync(root)) return []
  const out: Array<{ version: string; path: string }> = []

  const status = getChannelInstallStatus(channel)
  if (status.ready && (status.version || status.build)) {
    out.push({
      version: status.version || `build-${status.build}`,
      path: status.installRoot
    })
  }

  try {
    for (const ent of readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue
      if (ent.name === 'latest' || ent.name === 'package' || ent.name.startsWith('.')) continue
      const path = join(root, ent.name)
      if (out.some((x) => x.version === ent.name)) continue
      out.push({ version: ent.name, path })
    }
  } catch {
    return out
  }
  out.sort((a, b) => b.version.localeCompare(a.version))
  return out
}

/**
 * Wizard-friendly version list for one channel.
 * Remote tip (when signed in) + any Spire-cached installs. No public older catalog.
 */
export async function listGameVersions(channel: HytalePatchline): Promise<GameVersionInfo[]> {
  const byVersion = new Map<string, GameVersionInfo>()

  for (const local of listLocalVersions(channel)) {
    const clientReady = Boolean(resolveClientPath(local.path) || findClientUnder(local.path))
    byVersion.set(local.version, {
      channel,
      version: local.version,
      downloadUrl: null,
      sha256: null,
      latest: false,
      installedLocally: true,
      localPath: local.path,
      downloadable: false,
      clientReady
    })
  }

  const token = await getValidAccessTokenOrNull()
  if (token) {
    try {
      const manifest = await withAuthRetry((access) => fetchVersionManifest(channel, access))
      if (manifest.version) {
        const existing = byVersion.get(manifest.version)
        const status = getChannelInstallStatus(channel)
        const clientReady = Boolean(existing?.clientReady || status.ready)
        byVersion.set(manifest.version, {
          channel,
          version: manifest.version,
          downloadUrl: manifest.download_url ?? null,
          sha256: manifest.sha256 ?? null,
          latest: true,
          installedLocally: Boolean(existing?.installedLocally || status.ready),
          localPath: existing?.localPath ?? (status.ready ? status.installRoot : null),
          downloadable: true,
          clientReady
        })
        for (const [ver, info] of byVersion) {
          if (ver !== manifest.version && info.latest) {
            byVersion.set(ver, { ...info, latest: false })
          }
        }
      }
    } catch {
      // Signed-out / no entitlement: still return local installs.
    }
  }

  return [...byVersion.values()].sort((a, b) => {
    if (a.latest !== b.latest) return a.latest ? -1 : 1
    return b.version.localeCompare(a.version)
  })
}

function channelInstallRoot(channel: HytalePatchline, version: string): string {
  return join(getGameRoot(), channel, version)
}

/**
 * Resolve a playable install root for an instance channel/version pin.
 * Prefers the pinned Spire package, then channel “latest” marker, else null
 * (caller falls back to Settings.gameInstallPath).
 */
export function resolveChannelInstall(
  channel: HytalePatchline,
  gameVersion?: string | null
): string | null {
  const channelRoot = channelMetaDir(channel)
  if (existsSync(channelRoot) && findClientUnder(channelRoot)) {
    if (!gameVersion?.trim()) return channelRoot
    const pinnedVersion = readFileSyncSafe(join(channelRoot, 'VERSION'))
    if (!pinnedVersion || pinnedVersion === gameVersion.trim()) return channelRoot
  }

  if (gameVersion?.trim()) {
    const pinned = channelInstallRoot(channel, gameVersion.trim())
    if (existsSync(pinned) && findClientUnder(pinned)) return pinned
    if (existsSync(pinned)) return pinned
  }

  const latestMeta = join(getGameRoot(), channel, 'latest')
  const pathFile = join(latestMeta, 'PATH')
  if (existsSync(pathFile)) {
    try {
      const pointed = readFileSync(pathFile, 'utf8').trim()
      if (pointed && existsSync(pointed)) return pointed
    } catch {
      // ignore
    }
  }

  if (gameVersion?.trim()) {
    const pinned = channelInstallRoot(channel, gameVersion.trim())
    if (existsSync(pinned)) return pinned
  }

  if (existsSync(channelRoot)) return channelRoot
  return null
}

function readFileSyncSafe(path: string): string | null {
  try {
    if (!existsSync(path)) return null
    return readFileSync(path, 'utf8').trim() || null
  } catch {
    return null
  }
}

function findClientUnder(root: string): string | null {
  const direct = resolveClientPath(root)
  if (direct) return direct
  try {
    for (const ent of readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue
      const child = join(root, ent.name)
      const found = resolveClientPath(child)
      if (found) return found
      try {
        for (const nested of readdirSync(child, { withFileTypes: true })) {
          if (!nested.isDirectory()) continue
          const deeper = resolveClientPath(join(child, nested.name))
          if (deeper) return deeper
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return null
}

/** Prefer pointing Settings at the install root that contains Client/. */
function inferInstallRootFromClient(clientPath: string, fallbackRoot: string): string {
  let dir = dirname(clientPath)
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'install')) || resolveClientPath(dir)) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return fallbackRoot
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  await new Promise<void>((resolve, reject) => {
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

async function downloadToFile(
  url: string,
  destPath: string,
  onBytes: (received: number, total: number) => void
): Promise<string> {
  mkdirSync(dirname(destPath), { recursive: true })
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}).`)
  }
  const total = Number(res.headers.get('content-length') || 0)
  let received = 0
  const hash = createHash('sha256')
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  const out = createWriteStream(destPath)

  nodeStream.on('data', (chunk: Buffer | string) => {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    received += buf.length
    hash.update(buf)
    onBytes(received, total)
  })

  await pipeline(nodeStream, out)
  return hash.digest('hex')
}

/** Full Wharf client + JRE install (preferred). Falls back to game-assets zip if patches deny access. */
export async function downloadChannel(channel: HytalePatchline): Promise<HytaleDownloadResult> {
  const result = await installFullChannel(channel)
  if (result.ok) return result

  const denied = /no access to the|no access to this patchline|PatchlineAccessError/i.test(
    result.message
  )
  if (!denied) return result

  emitProgress({
    phase: 'resolving',
    channel,
    message:
      'Client patchline blocked for this account — trying official game-assets package instead…'
  })

  const zip = await downloadAssetsZip(channel)
  if (zip.ok) {
    return {
      ...zip,
      message: zip.clientMissing
        ? `${zip.message} Full Client Wharf patches need a licensed account with patchline access — use Release, another account, or the official launcher.`
        : `Patchline access was limited; installed game-assets package instead. ${zip.message}`
    }
  }

  return {
    ok: false,
    message:
      `${result.message} Also couldn’t download game-assets (${zip.message}). ` +
      `Sign in with a licensed Hytale account that can see this channel.`
  }
}

/** Repair = force re-apply from build 0. */
export async function repairChannel(channel: HytalePatchline): Promise<HytaleDownloadResult> {
  return installFullChannel(channel, { force: true })
}

/** Legacy game-assets zip (server/assets package) — optional fallback. */
export async function downloadAssetsZip(channel: HytalePatchline): Promise<HytaleDownloadResult> {
  if (downloadBusy) {
    return { ok: false, message: 'A download is already in progress.' }
  }

  downloadBusy = true
  const tmpRoot = join(getGameRoot(), '.tmp')
  mkdirSync(getGameRoot(), { recursive: true })
  mkdirSync(tmpRoot, { recursive: true })

  let zipPath: string | null = null
  let staging: string | null = null

  try {
    await requireSignedIn()

    emitProgress({
      phase: 'resolving',
      channel,
      version: null,
      bytesReceived: 0,
      bytesTotal: 0,
      message: `Resolving ${channel} assets package…`,
      installPath: null
    })

    const manifest = await withAuthRetry((token) => fetchVersionManifest(channel, token))
    if (!manifest.version || !manifest.download_url) {
      throw new Error(`No build published for ${channel}.`)
    }

    emitProgress({
      phase: 'resolving',
      version: manifest.version,
      message: `Requesting signed CDN URL for ${manifest.version}…`
    })

    const zipSigned = await withAuthRetry((token) => getSignedUrl(manifest.download_url!, token))

    zipPath = join(tmpRoot, `${channel}-${manifest.version}.zip`)
    emitProgress({
      phase: 'downloading',
      version: manifest.version,
      message: `Downloading assets zip ${manifest.version}…`
    })

    const digest = await downloadToFile(zipSigned, zipPath, (received, total) => {
      emitProgress({
        phase: 'downloading',
        bytesReceived: received,
        bytesTotal: total,
        message: total
          ? `Downloading… ${Math.floor((received / total) * 100)}%`
          : `Downloading… ${(received / 1_048_576).toFixed(1)} MB`
      })
    })

    if (manifest.sha256 && digest.toLowerCase() !== manifest.sha256.toLowerCase()) {
      throw new Error('SHA-256 mismatch — download corrupted. Try again.')
    }

    emitProgress({
      phase: 'verifying',
      message: 'Checksum OK. Extracting…',
      bytesReceived: getDownloadProgress().bytesTotal || getDownloadProgress().bytesReceived,
      bytesTotal: getDownloadProgress().bytesTotal || getDownloadProgress().bytesReceived
    })

    staging = join(tmpRoot, `extract-${channel}-${manifest.version}`)
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
    emitProgress({ phase: 'extracting', message: 'Extracting package…' })
    await extractZip(zipPath, staging)

    const dest = channelInstallRoot(channel, manifest.version)
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    mkdirSync(dirname(dest), { recursive: true })
    renameSync(staging, dest)
    staging = null

    const clientPath = findClientUnder(dest)
    const clientMissing = !clientPath
    if (clientPath) {
      const installRoot = inferInstallRootFromClient(clientPath, dest)
      const settings = loadSettings()
      if (!settings.gameInstallPath || !resolveClientPath(settings.gameInstallPath)) {
        updateSettings({ gameInstallPath: installRoot })
      }
    }

    const latest = join(getGameRoot(), channel, 'latest')
    try {
      if (existsSync(latest)) rmSync(latest, { recursive: true, force: true })
    } catch {
      // ignore
    }
    mkdirSync(latest, { recursive: true })
    writeFileSync(join(latest, 'VERSION'), manifest.version, 'utf8')
    writeFileSync(join(latest, 'PATH'), dest, 'utf8')

    emitProgress({
      phase: 'done',
      version: manifest.version,
      installPath: dest,
      message: clientMissing
        ? `Downloaded assets zip ${manifest.version}. Prefer “Install full client” for playable Client + JRE.`
        : `Installed assets package ${manifest.version}.`
    })

    return {
      ok: true,
      message: getDownloadProgress().message,
      channel,
      version: manifest.version,
      installPath: dest,
      clientMissing
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitProgress({ phase: 'error', message })
    return { ok: false, message }
  } finally {
    downloadBusy = false
    if (zipPath && existsSync(zipPath)) {
      try {
        unlinkSync(zipPath)
      } catch {
        // ignore
      }
    }
    if (staging && existsSync(staging)) {
      try {
        rmSync(staging, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  }
}

export function getLocalBuild(channel: HytalePatchline): number {
  return readInstalledBuild(channel)
}
