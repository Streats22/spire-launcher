import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { ACCOUNT_DATA, USER_AGENT } from '../auth/constants'
import { withAuthRetry } from '../auth/oauth'
import { getGameRoot } from '../paths'
import { hytaleArch, hytaleOs } from './platform'

export interface OfficialPatchStep {
  from: number
  to: number
  pwr: string
  pwrHead?: string
  sig?: string
}

export interface OfficialPatchesResponse {
  steps: OfficialPatchStep[]
}

let launcherVersionCache: { value: string; at: number } | null = null

async function getLauncherVersion(): Promise<string> {
  if (launcherVersionCache && Date.now() - launcherVersionCache.at < 6 * 60 * 60 * 1000) {
    return launcherVersionCache.value
  }
  try {
    const res = await fetch('https://launcher.hytale.com/version/release/launcher.json', {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
    })
    if (res.ok) {
      const json = (await res.json()) as { version?: string }
      if (json.version) {
        launcherVersionCache = { value: json.version, at: Date.now() }
        return json.version
      }
    }
  } catch {
    // ignore
  }
  return launcherVersionCache?.value ?? 'unknown'
}

function patchHeaders(
  accessToken: string,
  launcherVersion: string,
  channel: string
): Record<string, string> {
  const branch = channel === 'pre-release' ? 'release' : channel
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'User-Agent': `hytale-launcher/${launcherVersion}`,
    'x-hytale-launcher-version': launcherVersion,
    'x-hytale-launcher-branch': branch
  }
}

function normalizeSteps(raw: unknown): OfficialPatchStep[] {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>
  const stepsRaw = obj.steps
  if (!Array.isArray(stepsRaw)) return []
  return stepsRaw
    .map((s) => {
      const step = s as Record<string, unknown>
      const from = Number(step.from ?? step.From ?? step.FromBuild ?? 0)
      const to = Number(step.to ?? step.To ?? step.ToBuild ?? 0)
      const pwr = String(step.pwr ?? step.Pwr ?? step.PatchURL ?? '')
      const pwrHead = step.pwrHead ?? step.PwrHead
      const sig = step.sig ?? step.Sig ?? step.SignatureURL
      return {
        from,
        to,
        pwr,
        pwrHead: typeof pwrHead === 'string' ? pwrHead : undefined,
        sig: typeof sig === 'string' ? sig : undefined
      }
    })
    .filter((s) => s.pwr && Number.isFinite(s.to))
}

/**
 * Official patch set:
 * GET https://account-data.hytale.com/patches/{os}/{arch}/{channel}/{fromBuild}
 * fromBuild=0 → full latest client .pwr; fromBuild=N → incremental chain from N.
 */
export async function fetchPatchSet(
  channel: string,
  fromBuild: number
): Promise<OfficialPatchesResponse> {
  const os = hytaleOs()
  const arches: Array<'amd64' | 'arm64'> =
    hytaleArch() === 'arm64' ? ['arm64', 'amd64'] : ['amd64']
  const launcherVersion = await getLauncherVersion()

  let lastAccessDenied: Error | null = null

  for (const arch of arches) {
    const url = `${ACCOUNT_DATA}/patches/${os}/${arch}/${channel}/${fromBuild}`
    try {
      return await withAuthRetry(async (accessToken) => {
        const res = await fetch(url, {
          headers: patchHeaders(accessToken, launcherVersion, channel)
        })
        const text = await res.text()
        if (text === 'invalid token' || res.status === 401) throw new Error('unauthorized')
        if (res.status === 403 || text.trim() === 'no access to patchline') {
          throw new PatchlineAccessError(channel, os, arch)
        }
        if (!res.ok) {
          throw new Error(`Patches HTTP ${res.status}: ${text.slice(0, 180)}`)
        }
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          throw new Error('Patches response was not JSON.')
        }
        return { steps: normalizeSteps(json) }
      })
    } catch (err) {
      // Only retry the next arch when this one is entitlement-denied.
      if (
        err instanceof PatchlineAccessError ||
        (err instanceof Error && /no access to the .+ patchline/i.test(err.message))
      ) {
        lastAccessDenied = err instanceof Error ? err : new Error(String(err))
        continue
      }
      throw err
    }
  }

  throw (
    lastAccessDenied ??
    new PatchlineAccessError(channel, os, hytaleArch())
  )
}

export class PatchlineAccessError extends Error {
  constructor(
    public channel: string,
    public os: string,
    public arch: string
  ) {
    super(
      `No access to the “${channel}” patchline (${os}/${arch}). ` +
        `Use an account that owns Hytale, switch to Release if you don’t have pre-release, ` +
        `or pick the right saved account under Install.`
    )
    this.name = 'PatchlineAccessError'
  }
}

export async function downloadAuthenticatedOrSigned(
  url: string,
  destPath: string,
  onBytes?: (received: number, total: number) => void
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow'
  })
  if (!res.ok || !res.body) {
    throw new Error(`Patch download failed (${res.status}).`)
  }
  const total = Number(res.headers.get('content-length') || 0)
  let received = 0
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  const out = createWriteStream(destPath)
  nodeStream.on('data', (chunk: Buffer | string) => {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    received += buf.length
    onBytes?.(received, total)
  })
  await pipeline(nodeStream, out)
  if (received === 0) {
    try {
      unlinkSync(destPath)
    } catch {
      // ignore
    }
    throw new Error('Downloaded empty patch file (0 bytes).')
  }
}

export function channelPackageGameDir(channel: string): string {
  return join(getGameRoot(), channel, 'package', 'game', 'latest')
}

export function channelPackageJreDir(channel: string): string {
  return join(getGameRoot(), channel, 'package', 'jre', 'latest')
}

export function channelMetaDir(channel: string): string {
  return join(getGameRoot(), channel)
}

export function readInstalledBuild(channel: string): number {
  const buildFile = join(channelMetaDir(channel), 'BUILD')
  if (!existsSync(buildFile)) return 0
  try {
    const n = Number(readFileSync(buildFile, 'utf8').trim())
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}
