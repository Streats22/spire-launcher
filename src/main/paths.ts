import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import type { Platform } from '../shared/types'

export function getPlatform(): Platform {
  return process.platform
}

/** Spire-owned data (instances, settings) — never stores game binaries */
export function getSpireRoot(): string {
  return join(app.getPath('appData'), 'Spire')
}

export function getInstancesRoot(): string {
  return join(getSpireRoot(), 'instances')
}

export function getSettingsPath(): string {
  return join(getSpireRoot(), 'settings.json')
}

/**
 * Official Hytale layout (per community / HyPrism docs):
 *   {install}/install/release/package/game/latest/Client/HytaleClient.exe  (win)
 *   {install}/install/release/package/jre/latest/bin/java(.exe)
 *   {install}/UserData
 */
export function resolveClientPath(installRoot: string): string | null {
  const candidates =
    process.platform === 'win32'
      ? [
          join(installRoot, 'install', 'release', 'package', 'game', 'latest', 'Client', 'HytaleClient.exe'),
          join(installRoot, 'Client', 'HytaleClient.exe'),
          join(installRoot, 'HytaleClient.exe')
        ]
      : process.platform === 'darwin'
        ? [
            join(installRoot, 'install', 'release', 'package', 'game', 'latest', 'Client', 'HytaleClient.app'),
            join(installRoot, 'HytaleClient.app'),
            join(installRoot, 'Hytale.app')
          ]
        : [
            join(installRoot, 'install', 'release', 'package', 'game', 'latest', 'Client', 'HytaleClient'),
            join(installRoot, 'Client', 'HytaleClient'),
            join(installRoot, 'HytaleClient')
          ]

  return candidates.find((p) => existsSync(p)) ?? null
}

export function resolveJavaPath(installRoot: string): string | null {
  const bin = process.platform === 'win32' ? 'java.exe' : 'java'
  const candidates = [
    join(installRoot, 'install', 'release', 'package', 'jre', 'latest', 'bin', bin),
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
