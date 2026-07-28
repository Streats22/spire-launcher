import { app } from 'electron'
import type { UpdateCheckResult } from '../shared/types'
import { DEFAULT_UPDATE_MANIFEST_URL } from '../shared/update'
import { loadSettings } from './settings'

interface UpdateManifest {
  version?: string
  url?: string
  notes?: string
}

function updateManifestUrl(): string {
  return process.env['SPIRE_UPDATE_URL']?.trim() || DEFAULT_UPDATE_MANIFEST_URL
}

/** Compare simple semver-ish strings: 1.2.3 vs 1.2.10 */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((n) => (Number.isFinite(n) ? n : 0))

  const a = parse(latest)
  const b = parse(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return false
}

/**
 * Spire's only first-party network request.
 * Does not send user identity, profiles, keys, or install paths — just a GET for the public manifest.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const settings = loadSettings()

  if (!settings.checkForUpdates) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      notes: null,
      checked: false,
      skipped: true,
      error: null
    }
  }

  try {
    const res = await fetch(updateManifestUrl(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': `Spire/${currentVersion}`
      }
    })

    if (!res.ok) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        notes: null,
        checked: true,
        skipped: false,
        error: `Update check failed (${res.status})`
      }
    }

    const manifest = (await res.json()) as UpdateManifest
    const latestVersion = manifest.version?.trim() || null
    const updateAvailable = Boolean(
      latestVersion && isNewerVersion(latestVersion, currentVersion)
    )

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: manifest.url?.trim() || null,
      notes: manifest.notes?.trim() || null,
      checked: true,
      skipped: false,
      error: null
    }
  } catch (err) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      notes: null,
      checked: true,
      skipped: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
