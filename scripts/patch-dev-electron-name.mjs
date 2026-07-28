#!/usr/bin/env node
/**
 * Rebrand the stock Electron binary used by `npm run dev`.
 *
 * macOS Dock label / menu bar / Cmd+Tab read CFBundleName from the running
 * .app Info.plist at launch — app.setName('Spire') cannot override that.
 * Packaged Spire.app builds are unaffected (electron-builder productName).
 *
 * Idempotent. No-op when Electron.app is missing (e.g. Linux CI without mac dist).
 */

import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const APP_NAME = 'Spire'
const APP_ID = 'dev.spire.launcher.dev'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const require = createRequire(import.meta.url)

function electronDistDir() {
  return join(dirname(require.resolve('electron/package.json')), 'dist')
}

function replacePlistString(xml, key, value) {
  const pattern = new RegExp(
    `(<key>${key}<\\/key>\\s*<string>)([^<]*)(<\\/string>)`,
    'm'
  )
  if (!pattern.test(xml)) {
    // Insert before </dict></plist> if missing
    return xml.replace(
      /<\/dict>\s*<\/plist>/m,
      `  <key>${key}</key>\n  <string>${value}</string>\n</dict>\n</plist>`
    )
  }
  return xml.replace(pattern, `$1${value}$3`)
}

function writePlistAtomic(plistPath, xml) {
  // Unlink first so we don't mutate a shared pnpm-store inode.
  const tmp = `${plistPath}.spire-tmp`
  writeFileSync(tmp, xml, 'utf8')
  try {
    unlinkSync(plistPath)
  } catch {
    // ignore
  }
  renameSync(tmp, plistPath)
}

function patchInfoPlist(plistPath) {
  if (!existsSync(plistPath)) return false
  let xml = readFileSync(plistPath, 'utf8')
  const before = xml
  xml = replacePlistString(xml, 'CFBundleName', APP_NAME)
  xml = replacePlistString(xml, 'CFBundleDisplayName', APP_NAME)
  xml = replacePlistString(xml, 'CFBundleIdentifier', APP_ID)
  if (xml === before) return false
  writePlistAtomic(plistPath, xml)
  return true
}

function patchMacBundle() {
  const dist = electronDistDir()
  const appPath = join(dist, 'Electron.app')
  if (!existsSync(appPath)) {
    console.log('[patch-dev-electron-name] Electron.app not found — skip')
    return
  }

  const plistPaths = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(full)
      else if (name === 'Info.plist') plistPaths.push(full)
    }
  }
  walk(appPath)

  let changed = 0
  for (const plist of plistPaths) {
    if (patchInfoPlist(plist)) changed += 1
  }

  const icnsSrc = join(ROOT, 'resources', 'icon.icns')
  const icnsDst = join(appPath, 'Contents', 'Resources', 'electron.icns')
  if (existsSync(icnsSrc) && existsSync(dirname(icnsDst))) {
    copyFileSync(icnsSrc, icnsDst)
  }

  // Refresh Launch Services / Dock cache for the renamed bundle.
  try {
    execFileSync('/usr/bin/touch', [appPath], { stdio: 'ignore' })
  } catch {
    // ignore
  }

  // Ad-hoc re-sign so Gatekeeper accepts the mutated bundle (esp. Apple Silicon).
  try {
    execFileSync(
      '/usr/bin/codesign',
      ['--force', '--deep', '--sign', '-', appPath],
      { stdio: 'ignore' }
    )
  } catch {
    // codesign may be unavailable in some environments
  }

  console.log(
    `[patch-dev-electron-name] macOS Electron.app → "${APP_NAME}" (${changed} plist(s))`
  )
}

function patchWindowsExecutableMetadata() {
  // Dev still launches electron.exe; taskbar grouping uses AppUserModelId
  // (set in main). Nothing safe to rename here without breaking electron's path.txt.
  const dist = electronDistDir()
  const exe = join(dist, 'electron.exe')
  if (!existsSync(exe)) return
  console.log(
    '[patch-dev-electron-name] Windows: electron.exe kept; AppUserModelId=dev.spire.launcher in main'
  )
}

function ensureLinuxDesktopStub() {
  // Optional .desktop for local packaged-like launches; harmless in CI.
  const dist = electronDistDir()
  const bin = join(dist, 'electron')
  if (!existsSync(bin)) return
  const appsDir = join(ROOT, '.local-dev')
  mkdirSync(appsDir, { recursive: true })
  const desktop = join(appsDir, 'spire-dev.desktop')
  const icon = join(ROOT, 'resources', 'icon.png')
  writeFileSync(
    desktop,
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${APP_NAME}`,
      'Comment=Spire Hytale launcher (dev)',
      `Exec=${bin}`,
      `Icon=${icon}`,
      'Terminal=false',
      'Categories=Game;',
      'StartupWMClass=Spire',
      ''
    ].join('\n'),
    'utf8'
  )
}

function main() {
  if (process.platform === 'darwin') {
    patchMacBundle()
    return
  }
  if (process.platform === 'win32') {
    patchWindowsExecutableMetadata()
    return
  }
  ensureLinuxDesktopStub()
  console.log('[patch-dev-electron-name] Linux: WM class set via electron --class=Spire on dev')
}

main()
