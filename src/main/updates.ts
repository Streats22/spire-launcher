import { app } from 'electron'
import type { UpdateCheckResult } from '../shared/types'
import { DEFAULT_UPDATE_MANIFEST_URL, isNewerVersion } from '../shared/update'
import { checkAutoUpdate, getAutoUpdateStatus } from './autoUpdate'
import { loadSettings } from './settings'

interface UpdateManifest {
  version?: string
  url?: string
  notes?: string
}

function updateManifestUrl(): string {
  return process.env['SPIRE_UPDATE_URL']?.trim() || DEFAULT_UPDATE_MANIFEST_URL
}

export { isNewerVersion }

function emptyResult(
  currentVersion: string,
  patch: Partial<UpdateCheckResult>
): UpdateCheckResult {
  return {
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: null,
    notes: null,
    checked: false,
    skipped: false,
    error: null,
    autoUpdateSupported: getAutoUpdateStatus().supported,
    ...patch
  }
}

/**
 * Spire's only first-party network request (plus optional GitHub Releases feed
 * when auto-update is supported).
 * Does not send user identity, profiles, keys, or install paths.
 *
 * JSON manifest is the source of truth for “is there an update?”.
 * electron-updater is best-effort for in-app install when latest.yml exists.
 */
export async function checkForUpdate(force = false): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const settings = loadSettings()
  const autoUpdateSupported = getAutoUpdateStatus().supported

  if (!force && !settings.checkForUpdates) {
    return emptyResult(currentVersion, {
      skipped: true,
      autoUpdateSupported
    })
  }

  let manifestResult = emptyResult(currentVersion, {
    checked: true,
    autoUpdateSupported
  })

  try {
    const res = await fetch(updateManifestUrl(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': `Spire/${currentVersion}`
      }
    })

    if (!res.ok) {
      manifestResult = emptyResult(currentVersion, {
        checked: true,
        autoUpdateSupported,
        error: `Update check failed (${res.status})`
      })
    } else {
      const manifest = (await res.json()) as UpdateManifest
      const latestVersion = manifest.version?.trim() || null
      const updateAvailable = Boolean(
        latestVersion && isNewerVersion(latestVersion, currentVersion)
      )

      manifestResult = emptyResult(currentVersion, {
        latestVersion,
        updateAvailable,
        releaseUrl: manifest.url?.trim() || null,
        notes: manifest.notes?.trim() || null,
        checked: true,
        autoUpdateSupported
      })
    }
  } catch (err) {
    manifestResult = emptyResult(currentVersion, {
      checked: true,
      autoUpdateSupported,
      error: err instanceof Error ? err.message : String(err)
    })
  }

  // Best-effort GitHub Releases feed — never override a healthy JSON result with feed noise.
  if (autoUpdateSupported) {
    try {
      const auto = await checkAutoUpdate()
      if (auto.version && isNewerVersion(auto.version, currentVersion)) {
        return {
          ...manifestResult,
          latestVersion: auto.version,
          updateAvailable: true,
          // Keep manifest error only if we somehow have no manifest success.
          error: manifestResult.error,
          autoUpdateSupported: true
        }
      }
    } catch {
      // Manifest result still useful as fallback.
    }
  }

  return manifestResult
}
