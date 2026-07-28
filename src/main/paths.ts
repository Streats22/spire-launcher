import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
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
  if (process.platform === 'win32') {
    return [
      join(process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local'), 'Hytale'),
      join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Hytale')
    ]
  }
  if (process.platform === 'darwin') {
    return [
      join(home, 'Library', 'Application Support', 'Hytale'),
      '/Applications/Hytale.app',
      join(home, 'Applications', 'Hytale.app')
    ]
  }
  return [
    join(home, '.local', 'share', 'Hytale'),
    join(home, 'Hytale'),
    '/opt/Hytale'
  ]
}
