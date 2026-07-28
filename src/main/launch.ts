import { existsSync } from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import type { InstallStatus, LaunchResult } from '../shared/types'
import { getInstance, getInstancePath, ensureInstanceLayout } from './instances'
import { resolveClientPath, resolveJavaPath } from './paths'
import { loadSettings } from './settings'

export function getInstallStatus(): InstallStatus {
  const settings = loadSettings()
  const gameInstallPath = settings.gameInstallPath
  const issues: string[] = []

  if (!gameInstallPath) {
    return {
      configured: false,
      gameInstallPath: null,
      clientPath: null,
      javaPath: null,
      valid: false,
      issues: ['Set the official Hytale install folder in Settings.']
    }
  }

  if (!existsSync(gameInstallPath)) {
    issues.push('Install path does not exist.')
  }

  const clientPath = resolveClientPath(gameInstallPath)
  const javaPath = resolveJavaPath(gameInstallPath)

  if (!clientPath) issues.push('Could not find Hytale client under that install.')

  return {
    configured: true,
    gameInstallPath,
    clientPath,
    javaPath,
    valid: issues.length === 0 && Boolean(clientPath),
    issues
  }
}

export async function launchInstance(id: string): Promise<LaunchResult> {
  const instance = getInstance(id)
  if (!instance) {
    return { ok: false, message: 'Instance not found.' }
  }

  const status = getInstallStatus()
  if (!status.valid || !status.clientPath || !status.gameInstallPath) {
    return {
      ok: false,
      message: status.issues.join(' ') || 'Hytale install is not configured.'
    }
  }

  ensureInstanceLayout(id)
  const instanceRoot = getInstancePath(id)
  const userdata = join(instanceRoot, 'userdata')
  const mods = join(instanceRoot, 'mods')

  const env = {
    ...process.env,
    HYTALE_USER_DATA: userdata,
    SPIRE_INSTANCE_ID: id,
    SPIRE_INSTANCE_ROOT: instanceRoot,
    SPIRE_MODS_DIR: mods
  }

  try {
    const child = spawnClient(status.clientPath, {
      cwd: status.gameInstallPath,
      env,
      userdata,
      mods,
      extraArgs: instance.javaArgs ?? []
    })

    return {
      ok: true,
      message: `Launching “${instance.name}”…`,
      pid: child.pid
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message }
  }
}

function spawnClient(
  clientPath: string,
  opts: {
    cwd: string
    env: NodeJS.ProcessEnv
    userdata: string
    mods: string
    extraArgs: string[]
  }
): ChildProcess {
  // Best-effort isolation flags; harmless if the client ignores unknown args.
  // We adapt these as Hypixel documents official override switches.
  const args = [
    `--user-data=${opts.userdata}`,
    `--mods-dir=${opts.mods}`,
    ...opts.extraArgs
  ]

  if (process.platform === 'darwin' && clientPath.endsWith('.app')) {
    const child = spawn('open', ['-n', clientPath, '--args', ...args], {
      cwd: opts.cwd,
      env: opts.env,
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
    return child
  }

  const child = spawn(clientPath, args, {
    cwd: opts.cwd,
    env: opts.env,
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
  return child
}
