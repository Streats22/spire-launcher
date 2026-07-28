import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync
} from 'fs'
import { join, normalize, resolve, sep } from 'path'
import { app } from 'electron'
import { errorMessage } from '../shared/errors'
import { getInstancePath } from './instances'
import { getInstancesRoot } from './paths'
import { logWarn } from './logging'

export type ModsLinkStatus = 'ok' | 'repaired' | 'warning' | 'missing'

export interface IsolationDescription {
  instanceId: string
  instanceRoot: string
  userdata: string
  modsDir: string
  modsLink: ModsLinkStatus
  modsLinkDetail: string | null
  isolated: boolean
  flags: string[]
}

function normalizePath(p: string): string {
  try {
    return normalize(realpathSync(p)).toLowerCase()
  } catch {
    return normalize(resolve(p)).toLowerCase()
  }
}

function isPathInside(child: string, parent: string): boolean {
  const c = normalizePath(child)
  const p = normalizePath(parent)
  if (c === p) return true
  const prefix = p.endsWith(sep) ? p : p + sep
  return c.startsWith(prefix)
}

/** Official Hytale UserData roots we must never use as Spire --user-dir. */
export function officialHytaleUserDataRoots(): string[] {
  const home = app.getPath('home')
  const appData = app.getPath('appData')
  const roots: string[] = []

  if (process.platform === 'win32') {
    const local = process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local')
    roots.push(join(appData, 'Hytale', 'UserData'), join(local, 'Hytale', 'UserData'))
  } else if (process.platform === 'darwin') {
    roots.push(join(home, 'Library', 'Application Support', 'Hytale', 'UserData'))
  } else {
    const xdg = process.env['XDG_DATA_HOME']?.trim() || join(home, '.local', 'share')
    roots.push(join(xdg, 'Hytale', 'UserData'), join(home, '.local', 'share', 'Hytale', 'UserData'))
  }

  return [...new Set(roots)]
}

/**
 * Ensure userdata is under Spire instances and not the official Hytale UserData.
 * Throws if isolation is violated.
 */
export function assertInstanceUserDir(instanceId: string): string {
  const instanceRoot = getInstancePath(instanceId)
  const userdata = join(instanceRoot, 'userdata')
  const instancesRoot = getInstancesRoot()

  if (!isPathInside(userdata, instancesRoot)) {
    throw new Error(
      `Isolation failed: user-dir is outside Spire instances (${userdata}).`
    )
  }

  for (const official of officialHytaleUserDataRoots()) {
    if (
      normalizePath(userdata) === normalizePath(official) ||
      isPathInside(userdata, official) ||
      isPathInside(official, userdata)
    ) {
      throw new Error(
        `Isolation failed: user-dir overlaps official Hytale UserData (${official}).`
      )
    }
  }

  return userdata
}

/**
 * Link `{userdata}/Mods` → `{instance}/mods` (junction on Windows).
 * Returns status for run-log.
 */
export function ensureModsLink(instanceId: string): {
  status: ModsLinkStatus
  detail: string | null
} {
  const instanceRoot = getInstancePath(instanceId)
  const userDir = join(instanceRoot, 'userdata')
  const modsSource = join(instanceRoot, 'mods')
  mkdirSync(userDir, { recursive: true })
  mkdirSync(modsSource, { recursive: true })
  const dest = join(userDir, 'Mods')

  try {
    const st = lstatSync(dest)
    if (st.isSymbolicLink()) {
      try {
        const target = normalizePath(realpathSync(dest))
        if (target === normalizePath(modsSource)) {
          return { status: 'ok', detail: null }
        }
        // Wrong target — remove and recreate
        rmSync(dest, { recursive: true, force: true })
      } catch {
        rmSync(dest, { recursive: true, force: true })
      }
    } else if (st.isDirectory()) {
      if (readdirSync(dest).length === 0) {
        rmSync(dest, { recursive: true, force: true })
      } else {
        const msg =
          'userdata/Mods is a real folder with files — Spire could not replace it with a link to instance/mods'
        logWarn('isolation', msg)
        return { status: 'warning', detail: msg }
      }
    } else {
      rmSync(dest, { force: true })
    }
  } catch {
    // missing — create link below
  }

  try {
    symlinkSync(modsSource, dest, process.platform === 'win32' ? 'junction' : 'dir')
    return { status: 'repaired', detail: 'Created Mods → instance/mods link' }
  } catch (err) {
    const msg = `Could not link Mods into user-dir: ${errorMessage(err)}`
    logWarn('isolation', msg)
    return { status: 'missing', detail: msg }
  }
}

export function describeIsolation(instanceId: string): IsolationDescription {
  const instanceRoot = getInstancePath(instanceId)
  const userdata = join(instanceRoot, 'userdata')
  const modsDir = join(instanceRoot, 'mods')
  let isolated = true
  try {
    assertInstanceUserDir(instanceId)
  } catch {
    isolated = false
  }

  let modsLink: ModsLinkStatus = 'missing'
  let modsLinkDetail: string | null = null
  const dest = join(userdata, 'Mods')
  try {
    const st = lstatSync(dest)
    if (st.isSymbolicLink()) {
      try {
        if (normalizePath(realpathSync(dest)) === normalizePath(modsDir)) {
          modsLink = 'ok'
        } else {
          modsLink = 'warning'
          modsLinkDetail = 'Mods link points elsewhere'
        }
      } catch {
        modsLink = 'warning'
        modsLinkDetail = 'Mods link is broken'
      }
    } else if (st.isDirectory()) {
      modsLink = 'warning'
      modsLinkDetail = 'Mods is a directory, not a link'
    }
  } catch {
    modsLink = 'missing'
    modsLinkDetail = 'Mods link not present'
  }

  return {
    instanceId,
    instanceRoot,
    userdata,
    modsDir,
    modsLink,
    modsLinkDetail,
    isolated,
    flags: [
      '--user-dir',
      '--app-dir',
      '--java-exec',
      '--auth-mode',
      'HYTALE_USER_DATA'
    ]
  }
}

/** Prepare isolation before spawn. Throws if user-dir is unsafe. */
export function prepareInstanceIsolation(instanceId: string): IsolationDescription {
  assertInstanceUserDir(instanceId)
  const link = ensureModsLink(instanceId)
  const desc = describeIsolation(instanceId)
  return {
    ...desc,
    modsLink: link.status === 'ok' ? desc.modsLink : link.status,
    modsLinkDetail: link.detail ?? desc.modsLinkDetail,
    isolated: true
  }
}
