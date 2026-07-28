/** OS / arch labels used by official Hytale patch + redist endpoints. */

export function hytaleOs(): 'windows' | 'darwin' | 'linux' {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
}

export function hytaleArch(): 'amd64' | 'arm64' {
  return process.arch === 'arm64' ? 'arm64' : 'amd64'
}

/** Broth channel for itch.io butler. macOS always uses amd64 (Rosetta on Apple Silicon) — matches HyPrism. */
export function butlerBrothChannel(): { os: string; arch: string } {
  const os = hytaleOs()
  if (os === 'darwin') return { os: 'darwin', arch: 'amd64' }
  return { os, arch: hytaleArch() }
}
