import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AutoUpdateStatus } from '../shared/types'
import { isNewerVersion } from '../shared/update'
import { logWarn } from './logging'

let configured = false
let status: AutoUpdateStatus = {
  supported: false,
  checking: false,
  available: false,
  downloaded: false,
  version: null,
  percent: null,
  error: null
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('spire:autoUpdateStatus', status)
  }
}

function setStatus(patch: Partial<AutoUpdateStatus>): AutoUpdateStatus {
  status = { ...status, ...patch }
  broadcast()
  return status
}

function canUseAutoUpdater(): boolean {
  if (!app.isPackaged) return false
  // Portable Windows builds are not a good fit for in-place updater installs.
  if (process.env['PORTABLE_EXECUTABLE_DIR']) return false
  return true
}

/** Short user-facing message; never dump HttpError stacks into Settings. */
export function friendlyAutoUpdateError(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : String(raw)
  const lower = message.toLowerCase()
  if (
    lower.includes('latest.yml') ||
    lower.includes('latest-mac.yml') ||
    lower.includes('cannot find') ||
    (lower.includes('404') && lower.includes('releases/download'))
  ) {
    return 'In-app update feed is not on this release yet (missing latest.yml). Use the download page, or wait for the next publish.'
  }
  if (lower.includes('net::') || lower.includes('enotfound') || lower.includes('econn')) {
    return 'Could not reach GitHub Releases. Check your network and try again.'
  }
  // First line only, truncate hard.
  const first = message.split(/\r?\n/)[0]?.trim() || 'Auto-update failed'
  return first.length > 160 ? `${first.slice(0, 157)}…` : first
}

/** Wire electron-updater once after app is ready. */
export function initAutoUpdater(): void {
  if (configured) return
  configured = true

  const supported = canUseAutoUpdater()
  setStatus({ supported })

  if (!supported) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    setStatus({ checking: true, error: null })
  })

  autoUpdater.on('update-available', (info) => {
    setStatus({
      checking: false,
      available: true,
      downloaded: false,
      version: info.version ?? null,
      percent: null,
      error: null
    })
  })

  autoUpdater.on('update-not-available', () => {
    setStatus({
      checking: false,
      available: false,
      downloaded: false,
      version: null,
      percent: null,
      error: null
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      percent: Number.isFinite(progress.percent) ? Math.round(progress.percent) : null
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setStatus({
      downloaded: true,
      percent: 100,
      version: info.version ?? status.version,
      error: null
    })
  })

  autoUpdater.on('error', (err) => {
    const friendly = friendlyAutoUpdateError(err)
    logWarn('autoUpdate', friendly)
    setStatus({
      checking: false,
      error: friendly
    })
  })
}

export function getAutoUpdateStatus(): AutoUpdateStatus {
  return status
}

/**
 * Ask GitHub Releases for a newer installer (requires latest.yml on the release).
 * No-op when running from source or portable.
 * Missing feed files are treated as soft failures (logged, short error).
 */
export async function checkAutoUpdate(): Promise<AutoUpdateStatus> {
  if (!canUseAutoUpdater()) {
    return setStatus({
      supported: false,
      checking: false,
      available: false,
      downloaded: false,
      version: null,
      percent: null,
      error: null
    })
  }

  try {
    setStatus({ checking: true, error: null, supported: true })
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo?.version ?? null
    const available = Boolean(version && isNewerVersion(version, app.getVersion()))
    return setStatus({
      checking: false,
      available: available || status.available,
      version: version ?? status.version,
      error: null
    })
  } catch (err) {
    const friendly = friendlyAutoUpdateError(err)
    logWarn('autoUpdate', `check failed: ${friendly}`)
    return setStatus({
      checking: false,
      error: friendly
    })
  }
}

export async function downloadAutoUpdate(): Promise<AutoUpdateStatus> {
  if (!canUseAutoUpdater()) {
    return setStatus({
      supported: false,
      error: 'In-app updates need the installed Spire build (not portable / dev).'
    })
  }

  try {
    setStatus({ error: null, percent: 0 })
    await autoUpdater.downloadUpdate()
    return getAutoUpdateStatus()
  } catch (err) {
    const friendly = friendlyAutoUpdateError(err)
    logWarn('autoUpdate', `download failed: ${friendly}`)
    return setStatus({ error: friendly })
  }
}

/** Quit and install the downloaded update. */
export function installAutoUpdate(): void {
  if (!status.downloaded) return
  autoUpdater.quitAndInstall(false, true)
}
