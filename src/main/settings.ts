import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname } from 'path'
import { BrowserWindow } from 'electron'
import type { LocalDataInfo, SpireSettings } from '../shared/types'
import { SPIRE_EMBEDDED_CURSEFORGE_API_KEY } from './mods/constants'
import {
  detectBestGameInstall,
  detectGameInstalls,
  getGameRoot,
  getInstancesRoot,
  getSettingsPath,
  getSpireRoot,
  resolveClientPath
} from './paths'
import { clearAllAccounts } from './auth/store'
import { cancelLogin } from './auth/account'

const THEME_IDS = new Set([
  'slate',
  'ember',
  'ocean',
  'mist',
  'midnight',
  'daybreak',
  'fog',
  'contrast'
])
const DENSITY_IDS = new Set(['compact', 'comfortable', 'readable'])
const HOME_LAYOUT_IDS = new Set(['grid', 'list'])

const defaultSettings = (): SpireSettings => ({
  gameInstallPath: null,
  activeInstanceId: null,
  curseForgeApiKey: null,
  nexusApiKey: null,
  checkForUpdates: true,
  openRunWindowOnLaunch: false,
  minimizeOnLaunch: false,
  showModPhotos: true,
  theme: 'slate',
  density: 'comfortable',
  homeLayout: 'grid',
  instanceGroups: []
})

/** Fresh settings after a full data wipe (may still get install path autofilled). */
export function defaultSettingsForReset(): SpireSettings {
  return defaultSettings()
}

export function ensureSpireDirs(): void {
  mkdirSync(getSpireRoot(), { recursive: true })
}

export function loadSettings(): SpireSettings {
  ensureSpireDirs()
  const path = getSettingsPath()
  if (!existsSync(path)) {
    const settings = defaultSettings()
    const guess = detectBestGameInstall()
    if (guess) settings.gameInstallPath = guess
    saveSettings(settings)
    return settings
  }
  try {
    const raw = { ...defaultSettings(), ...JSON.parse(readFileSync(path, 'utf8')) } as SpireSettings
    if (!THEME_IDS.has(String(raw.theme))) raw.theme = 'slate'
    if (!DENSITY_IDS.has(String(raw.density))) raw.density = 'comfortable'
    if (!HOME_LAYOUT_IDS.has(String(raw.homeLayout))) raw.homeLayout = 'grid'
    if (!Array.isArray(raw.instanceGroups)) raw.instanceGroups = []
    raw.instanceGroups = raw.instanceGroups
      .filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string')
      .map((g, i) => ({
        id: g.id,
        name: String(g.name).trim() || 'Group',
        sortIndex: typeof g.sortIndex === 'number' ? g.sortIndex : i
      }))
      .sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name))
    return maybeAutofillInstallPath(raw)
  } catch {
    return defaultSettings()
  }
}

/**
 * If Settings has no install (or a dead path), adopt the best detected official install.
 * Does not overwrite a path that still resolves a client.
 */
function maybeAutofillInstallPath(settings: SpireSettings): SpireSettings {
  const current = settings.gameInstallPath
  if (current && existsSync(current) && resolveClientPath(current)) {
    return settings
  }
  const guess = detectBestGameInstall()
  if (!guess || guess === current) return settings
  const next = { ...settings, gameInstallPath: guess }
  saveSettings(next)
  return next
}

/**
 * Scan likely Hytale folders. When `forceApply` is true (Detect button), always
 * set Settings to the best match. Otherwise only fills in when unset/invalid.
 */
export function detectAndApplyGameInstall(forceApply = false): {
  applied: boolean
  path: string | null
  detections: ReturnType<typeof detectGameInstalls>
  settings: SpireSettings
} {
  const detections = detectGameInstalls()
  const best = detections[0]?.path ?? null
  let settings = loadSettings()
  let applied = false

  if (best) {
    const current = settings.gameInstallPath
    const currentOk = Boolean(current && existsSync(current) && resolveClientPath(current))
    if ((forceApply || !currentOk) && current !== best) {
      settings = updateSettings({ gameInstallPath: best })
      applied = true
    }
  }

  return {
    applied,
    path: best ?? settings.gameInstallPath,
    detections,
    settings
  }
}

export function saveSettings(settings: SpireSettings): void {
  ensureSpireDirs()
  const path = getSettingsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(settings, null, 2), 'utf8')
}

export function updateSettings(patch: Partial<SpireSettings>): SpireSettings {
  const next = { ...loadSettings(), ...patch }
  saveSettings(next)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('spire:settingsChanged', next)
    }
  }
  return next
}

export function clearLocalCredentials(): SpireSettings {
  cancelLogin()
  clearAllAccounts()
  return updateSettings({
    curseForgeApiKey: null,
    nexusApiKey: null
  })
}

export function getLocalDataInfo(): LocalDataInfo {
  return {
    spireRoot: getSpireRoot(),
    instancesRoot: getInstancesRoot(),
    settingsPath: getSettingsPath(),
    gameRoot: getGameRoot()
  }
}

/**
 * Resolution: env → Settings → embedded Spire key.
 * End users should not need to paste a CF key when Spire ships one.
 */
export function resolveCurseForgeKey(): string | null {
  const fromEnv = process.env['SPIRE_CURSEFORGE_API_KEY']?.trim()
  if (fromEnv) return fromEnv
  const fromSettings = loadSettings().curseForgeApiKey?.trim()
  if (fromSettings) return fromSettings
  const embedded = SPIRE_EMBEDDED_CURSEFORGE_API_KEY?.trim()
  if (embedded) return embedded
  return null
}

export function resolveNexusKey(): string | null {
  const fromEnv = process.env['SPIRE_NEXUS_API_KEY']?.trim()
  if (fromEnv) return fromEnv
  return loadSettings().nexusApiKey?.trim() || null
}

export function hasCurseForgeKey(): boolean {
  return Boolean(resolveCurseForgeKey())
}

export function hasNexusKey(): boolean {
  return Boolean(resolveNexusKey())
}
