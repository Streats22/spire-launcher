import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname } from 'path'
import type { LocalDataInfo, SpireSettings } from '../shared/types'
import {
  defaultInstallGuesses,
  getInstancesRoot,
  getSettingsPath,
  getSpireRoot
} from './paths'

const defaultSettings = (): SpireSettings => ({
  gameInstallPath: null,
  activeInstanceId: null,
  curseForgeApiKey: null,
  nexusApiKey: null,
  checkForUpdates: true
})

export function ensureSpireDirs(): void {
  mkdirSync(getSpireRoot(), { recursive: true })
}

export function loadSettings(): SpireSettings {
  ensureSpireDirs()
  const path = getSettingsPath()
  if (!existsSync(path)) {
    const settings = defaultSettings()
    const guess = defaultInstallGuesses().find((p) => existsSync(p))
    if (guess) settings.gameInstallPath = guess
    saveSettings(settings)
    return settings
  }
  try {
    return { ...defaultSettings(), ...JSON.parse(readFileSync(path, 'utf8')) }
  } catch {
    return defaultSettings()
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
  return next
}

export function clearLocalCredentials(): SpireSettings {
  return updateSettings({
    curseForgeApiKey: null,
    nexusApiKey: null
  })
}

export function getLocalDataInfo(): LocalDataInfo {
  return {
    spireRoot: getSpireRoot(),
    instancesRoot: getInstancesRoot(),
    settingsPath: getSettingsPath()
  }
}

export function resolveCurseForgeKey(): string | null {
  const fromEnv = process.env['SPIRE_CURSEFORGE_API_KEY']?.trim()
  if (fromEnv) return fromEnv
  return loadSettings().curseForgeApiKey?.trim() || null
}

export function resolveNexusKey(): string | null {
  const fromEnv = process.env['SPIRE_NEXUS_API_KEY']?.trim()
  if (fromEnv) return fromEnv
  return loadSettings().nexusApiKey?.trim() || null
}
