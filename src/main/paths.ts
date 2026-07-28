import { app } from 'electron'
import { existsSync } from 'fs'
import { join, sep } from 'path'
import type { Platform } from '../shared/types'

export function getPlatform(): Platform {
  return process.platform
}

/** Spire-owned data (instances, settings, auth, downloaded packages). */
export function getSpireRoot(): string {
  return join(app.getPath('appData'), 'Spire')
}

export function getInstancesRoot(): string {
  return join(getSpireRoot(), 'instances')
}

export function getSettingsPath(): string {
  return join(getSpireRoot(), 'settings.json')
}

/** Official packages downloaded by Spire (Hypixel CDN only). */
export function getGameRoot(): string {
  return join(getSpireRoot(), 'game')
}

/**
 * Official Hytale layout (official launcher / HyPrism):
 *   {root}/install/{channel}/package/game/latest/Client/…
 *   {root}/package/game/latest/Client/…          (Spire-managed channel root)
 *   {root}/install/{channel}/package/jre/latest/bin/java
 */
export function resolveClientPath(installRoot: string): string | null {
  const win = process.platform === 'win32'
  const mac = process.platform === 'darwin'
  const clientName = win ? 'HytaleClient.exe' : mac ? 'HytaleClient.app' : 'HytaleClient'
  const altMac = 'Hytale.app'

  const gameLatestRoots = [
    join(installRoot, 'package', 'game', 'latest'),
    join(installRoot, 'install', 'release', 'package', 'game', 'latest'),
    join(installRoot, 'install', 'pre-release', 'package', 'game', 'latest'),
    join(installRoot, 'Client'),
    installRoot
  ]

  const candidates: string[] = []
  for (const root of gameLatestRoots) {
    candidates.push(join(root, 'Client', clientName))
    if (mac) {
      candidates.push(join(root, 'Client', altMac))
      candidates.push(join(root, 'Client', 'Hytale.app'))
      candidates.push(
        join(root, 'Client', 'Hytale.app', 'Contents', 'MacOS', 'HytaleClient')
      )
      candidates.push(
        join(root, 'Client', 'HytaleClient.app', 'Contents', 'MacOS', 'HytaleClient')
      )
    }
    candidates.push(join(root, clientName))
    if (mac) candidates.push(join(root, altMac))
  }

  return candidates.find((p) => existsSync(p)) ?? null
}

export function resolveJavaPath(installRoot: string): string | null {
  const bin = process.platform === 'win32' ? 'java.exe' : 'java'
  const candidates = [
    join(installRoot, 'package', 'jre', 'latest', 'bin', bin),
    join(installRoot, 'install', 'release', 'package', 'jre', 'latest', 'bin', bin),
    join(installRoot, 'install', 'pre-release', 'package', 'jre', 'latest', 'bin', bin),
    join(installRoot, 'jre', 'bin', bin)
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

export function defaultInstallGuesses(): string[] {
  const home = app.getPath('home')
  const appData = app.getPath('appData')
  const guesses: string[] = []

  if (process.platform === 'win32') {
    const local = process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local')
    const programFiles = process.env['PROGRAMFILES'] ?? 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    guesses.push(
      // Official launcher (docs: %appdata%\Hytale\install\release\…)
      join(appData, 'Hytale'),
      join(local, 'Hytale'),
      join(programFiles, 'Hytale'),
      join(programFilesX86, 'Hytale'),
      // Spire-managed Wharf installs
      join(getGameRoot(), 'release'),
      join(getGameRoot(), 'pre-release'),
      getGameRoot()
    )
  } else if (process.platform === 'darwin') {
    guesses.push(
      join(home, 'Library', 'Application Support', 'Hytale'),
      '/Applications/Hytale.app',
      join(home, 'Applications', 'Hytale.app'),
      join(getGameRoot(), 'release'),
      join(getGameRoot(), 'pre-release'),
      getGameRoot()
    )
  } else {
    const xdg =
      process.env['XDG_DATA_HOME']?.trim() || join(home, '.local', 'share')
    guesses.push(
      join(xdg, 'Hytale'),
      join(home, '.local', 'share', 'Hytale'),
      join(home, 'Hytale'),
      '/opt/Hytale',
      join(getGameRoot(), 'release'),
      join(getGameRoot(), 'pre-release'),
      getGameRoot()
    )
  }

  return [...new Set(guesses)]
}

export interface DetectedInstall {
  path: string
  clientPath: string
  javaPath: string | null
  /** Higher = more preferred (official roaming first). */
  score: number
  label: string
}

/**
 * Scan common Hytale locations and return roots that contain a playable client.
 * Prefer official AppData/Application Support installs over Spire-managed copies.
 */
export function detectGameInstalls(): DetectedInstall[] {
  const guesses = defaultInstallGuesses()
  const found: DetectedInstall[] = []

  for (let i = 0; i < guesses.length; i++) {
    const path = guesses[i]
    if (!path || !existsSync(path)) continue
    const clientPath = resolveClientPath(path)
    if (!clientPath) continue
    const javaPath = resolveJavaPath(path)
    const isSpireManaged = path === getGameRoot() || path.startsWith(getGameRoot() + sep)
    // Prefer earlier guesses; bump official (non-Spire) roots.
    const score = (guesses.length - i) * 10 + (isSpireManaged ? 0 : 100) + (javaPath ? 5 : 0)
    found.push({
      path,
      clientPath,
      javaPath,
      score,
      label: isSpireManaged ? 'Spire download' : 'Official launcher'
    })
  }

  found.sort((a, b) => b.score - a.score)
  // De-dupe by resolved client path (same install via different roots).
  const seen = new Set<string>()
  return found.filter((item) => {
    if (seen.has(item.clientPath)) return false
    seen.add(item.clientPath)
    return true
  })
}

/** Best detected install root, or null. */
export function detectBestGameInstall(): string | null {
  return detectGameInstalls()[0]?.path ?? null
}
