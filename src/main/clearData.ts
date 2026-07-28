import { existsSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import type { ClearAllDataResult } from '../shared/types'
import { errorMessage } from '../shared/errors'
import { cancelLogin } from './auth/account'
import { clearAllAccounts } from './auth/store'
import { stopAllLaunches } from './launch'
import { logInfo, logWarn } from './logging'
import { stopDownloadWatch } from './mods/downloadWatch'
import { detectBestGameInstall, getSpireRoot } from './paths'
import {
  defaultSettingsForReset,
  ensureSpireDirs,
  getLocalDataInfo,
  saveSettings
} from './settings'
import { closeAuxiliaryWindows } from './windows'
import { stopAllWorldSaveWatches } from './worlds'

/**
 * Wipe all Spire-owned AppData (instances, auth, game cache, logs, tools, settings).
 * Does not touch the Spire app install, this git repo, or the official Hytale folder.
 */
export function clearAllSpireData(): ClearAllDataResult {
  const root = getSpireRoot()
  const removed: string[] = []
  const errors: string[] = []

  try {
    stopDownloadWatch('Stopped — clearing Spire data.')
  } catch (err) {
    errors.push(`download watch: ${errorMessage(err)}`)
  }
  try {
    stopAllLaunches()
  } catch (err) {
    errors.push(`launches: ${errorMessage(err)}`)
  }
  try {
    stopAllWorldSaveWatches()
  } catch (err) {
    errors.push(`world watches: ${errorMessage(err)}`)
  }
  try {
    closeAuxiliaryWindows()
  } catch (err) {
    errors.push(`windows: ${errorMessage(err)}`)
  }

  try {
    cancelLogin()
  } catch {
    // ignore
  }
  try {
    clearAllAccounts()
  } catch (err) {
    errors.push(`auth: ${errorMessage(err)}`)
  }

  if (existsSync(root)) {
    for (const name of readdirSync(root)) {
      const path = join(root, name)
      try {
        rmSync(path, { recursive: true, force: true })
        removed.push(name)
      } catch (err) {
        errors.push(`${name}: ${errorMessage(err)}`)
      }
    }
  }

  ensureSpireDirs()
  const settings = defaultSettingsForReset()
  try {
    const detected = detectBestGameInstall()
    if (detected) settings.gameInstallPath = detected
  } catch {
    // ignore
  }
  saveSettings(settings)

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('spire:settingsChanged', settings)
      win.webContents.send('spire:dataCleared')
    }
  }

  if (errors.length > 0) {
    logWarn('clearData', `Finished with issues: ${errors.join('; ')}`)
  } else {
    logInfo('clearData', `Cleared Spire data under ${root} (${removed.length} entries)`)
  }

  return {
    ok: errors.length === 0,
    spireRoot: root,
    removed,
    errors,
    settings,
    dataInfo: getLocalDataInfo()
  }
}
