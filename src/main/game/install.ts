import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { HytaleDownloadResult, HytalePatchline } from '../../shared/types'
import { requireLauncherAccess } from '../auth/account'
import { ACCOUNT_DATA, USER_AGENT } from '../auth/constants'
import { withAuthRetry } from '../auth/oauth'
import { getGameRoot, resolveClientPath } from '../paths'
import { loadSettings, updateSettings } from '../settings'
import { applyPwr, ensureButler } from './butler'
import { ensureChannelJre, javaBinaryIn } from './jre'
import {
  channelMetaDir,
  channelPackageGameDir,
  channelPackageJreDir,
  downloadAuthenticatedOrSigned,
  fetchPatchSet,
  readInstalledBuild,
  type OfficialPatchStep
} from './patches'
import { emitProgress, getDownloadProgress } from './progress'

let installBusy = false

function writeChannelMeta(
  channel: HytalePatchline,
  build: number,
  version: string | null,
  installRoot: string
): void {
  const meta = channelMetaDir(channel)
  mkdirSync(meta, { recursive: true })
  writeFileSync(join(meta, 'BUILD'), String(build), 'utf8')
  if (version) writeFileSync(join(meta, 'VERSION'), version, 'utf8')
  writeFileSync(join(meta, 'PATH'), installRoot, 'utf8')

  const latest = join(meta, 'latest')
  mkdirSync(latest, { recursive: true })
  writeFileSync(join(latest, 'VERSION'), version ?? String(build), 'utf8')
  writeFileSync(join(latest, 'PATH'), installRoot, 'utf8')
  writeFileSync(join(latest, 'BUILD'), String(build), 'utf8')
}

async function fetchTipVersion(channel: HytalePatchline): Promise<string | null> {
  try {
    return await withAuthRetry(async (token) => {
      const signedRes = await fetch(`${ACCOUNT_DATA}/game-assets/version/${channel}.json`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': USER_AGENT
        }
      })
      const signedText = await signedRes.text()
      if (signedText === 'invalid token' || signedRes.status === 401) throw new Error('unauthorized')
      if (!signedRes.ok) return null
      const { url } = JSON.parse(signedText) as { url?: string }
      if (!url) return null
      const manRes = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (!manRes.ok) return null
      const man = (await manRes.json()) as { version?: string }
      return man.version ?? null
    })
  } catch {
    return null
  }
}

function findClientUnderChannel(channel: HytalePatchline): string | null {
  const root = channelMetaDir(channel)
  const gameDir = channelPackageGameDir(channel)
  return resolveClientPath(root) || resolveClientPath(gameDir)
}

async function downloadAndApplyStep(
  step: OfficialPatchStep,
  gameDir: string,
  index: number,
  total: number
): Promise<void> {
  const tmp = join(getGameRoot(), '.tmp', 'patches')
  mkdirSync(tmp, { recursive: true })
  const pwrPath = join(tmp, `${step.from}-${step.to}.pwr`)
  const sigPath = step.sig ? join(tmp, `${step.from}-${step.to}.sig`) : null

  emitProgress({
    phase: 'downloading',
    message: `Downloading client patch ${index + 1}/${total} (build ${step.from}→${step.to})…`,
    bytesReceived: 0,
    bytesTotal: 0
  })

  await downloadAuthenticatedOrSigned(step.pwr, pwrPath, (received, totalBytes) => {
    emitProgress({
      phase: 'downloading',
      bytesReceived: received,
      bytesTotal: totalBytes,
      message: totalBytes
        ? `Patch ${index + 1}/${total}: ${Math.floor((received / totalBytes) * 100)}%`
        : `Patch ${index + 1}/${total}: ${(received / 1_048_576).toFixed(1)} MB`
    })
  })

  if (step.sig && sigPath) {
    try {
      await downloadAuthenticatedOrSigned(step.sig, sigPath)
    } catch {
      // Signature unused for apply (HyPrism-compatible); keep best-effort download for future verify.
    }
  }

  emitProgress({
    phase: 'extracting',
    message: `Applying Wharf patch ${index + 1}/${total} with butler…`
  })

  await applyPwr(pwrPath, gameDir, {
    onOutput: (line) => {
      if (line.includes('%') || /error|fail|invalid|mismatch/i.test(line)) {
        emitProgress({ phase: 'extracting', message: `Applying patch… ${line}` })
      }
    }
  })

  for (const p of [pwrPath, sigPath]) {
    if (p && existsSync(p)) {
      try {
        unlinkSync(p)
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Full official client install/update via Wharf patches + official JRE.
 * Layout: `{Spire}/game/{channel}/package/game|jre/latest`
 */
export async function installFullChannel(
  channel: HytalePatchline,
  opts?: { force?: boolean }
): Promise<HytaleDownloadResult> {
  if (installBusy) {
    return { ok: false, message: 'A download is already in progress.' }
  }
  installBusy = true

  try {
    await requireLauncherAccess()

    emitProgress({
      phase: 'resolving',
      channel,
      version: null,
      bytesReceived: 0,
      bytesTotal: 0,
      message: `Preparing full ${channel} client install…`,
      installPath: null
    })

    await ensureButler((msg) => {
      emitProgress({ phase: 'resolving', message: msg })
    })

    const tipVersion = await fetchTipVersion(channel)
    const installedBuild = opts?.force ? 0 : readInstalledBuild(channel)
    const gameDir = channelPackageGameDir(channel)
    mkdirSync(getGameRoot(), { recursive: true })
    mkdirSync(gameDir, { recursive: true })

    if (opts?.force || installedBuild === 0) {
      if (existsSync(gameDir)) {
        try {
          rmSync(gameDir, { recursive: true, force: true })
        } catch {
          // ignore
        }
      }
      mkdirSync(gameDir, { recursive: true })
    }

    emitProgress({
      phase: 'resolving',
      version: tipVersion,
      message:
        installedBuild > 0 && !opts?.force
          ? `Fetching patches from build ${installedBuild}…`
          : 'Fetching full client patch set (from build 0)…'
    })

    const fromBuild = opts?.force ? 0 : installedBuild
    const patchSet = await fetchPatchSet(channel, fromBuild)
    if (!patchSet.steps.length) {
      if (findClientUnderChannel(channel)) {
        const installRoot = channelMetaDir(channel)
        emitProgress({
          phase: 'done',
          message: 'Already up to date — no patches returned.',
          installPath: installRoot
        })
        return {
          ok: true,
          message: 'Client already up to date.',
          channel,
          version: tipVersion ?? undefined,
          installPath: installRoot,
          clientMissing: false
        }
      }
      throw new Error('No patches returned for this channel. Check account access / try again.')
    }

    const targetBuild = Math.max(...patchSet.steps.map((s) => s.to))
    emitProgress({
      phase: 'downloading',
      version: tipVersion ?? `build-${targetBuild}`,
      message: `Installing client build ${targetBuild} (${patchSet.steps.length} step(s))…`
    })

    for (let i = 0; i < patchSet.steps.length; i++) {
      await downloadAndApplyStep(patchSet.steps[i], gameDir, i, patchSet.steps.length)
    }

    emitProgress({
      phase: 'extracting',
      message: 'Installing official Hytale JRE…'
    })
    await ensureChannelJre(channel, (message, bytesReceived, bytesTotal) => {
      emitProgress({
        phase: 'downloading',
        message,
        bytesReceived: bytesReceived ?? 0,
        bytesTotal: bytesTotal ?? 0
      })
    })

    const installRoot = channelMetaDir(channel)
    writeChannelMeta(channel, targetBuild, tipVersion, installRoot)

    const clientPath = findClientUnderChannel(channel)
    const clientMissing = !clientPath

    if (clientPath) {
      const settings = loadSettings()
      if (!settings.gameInstallPath || !resolveClientPath(settings.gameInstallPath)) {
        updateSettings({ gameInstallPath: installRoot })
      }
    }

    const versionLabel = tipVersion ?? `build-${targetBuild}`
    const message = clientMissing
      ? `Patched ${versionLabel} but Client binary not found — report layout mismatch.`
      : `Installed full ${channel} client ${versionLabel} (build ${targetBuild}).`

    emitProgress({
      phase: 'done',
      version: versionLabel,
      installPath: installRoot,
      message
    })

    return {
      ok: true,
      message,
      channel,
      version: versionLabel,
      installPath: installRoot,
      clientMissing
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitProgress({ phase: 'error', message })
    return { ok: false, message }
  } finally {
    installBusy = false
  }
}

export function getChannelInstallStatus(channel: HytalePatchline): {
  installRoot: string
  build: number
  version: string | null
  clientPath: string | null
  javaPath: string | null
  ready: boolean
} {
  const installRoot = channelMetaDir(channel)
  const build = readInstalledBuild(channel)
  let version: string | null = null
  const versionFile = join(installRoot, 'VERSION')
  if (existsSync(versionFile)) {
    try {
      version = readFileSync(versionFile, 'utf8').trim() || null
    } catch {
      version = null
    }
  }
  const clientPath = findClientUnderChannel(channel)
  const javaPath = javaBinaryIn(channelPackageJreDir(channel))
  return {
    installRoot,
    build,
    version,
    clientPath,
    javaPath,
    ready: Boolean(clientPath)
  }
}

export function isInstallBusy(): boolean {
  return installBusy || getDownloadProgress().phase === 'downloading'
}
