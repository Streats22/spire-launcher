import { existsSync, readdirSync } from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import type { InstallStatus, LaunchResult } from '../shared/types'
import { getCachedGameSession, getAuthStatus, createGameSession } from './auth/account'
import { resolveChannelInstall } from './game/assets'
import { getInstance, getInstancePath, ensureInstanceLayout } from './instances'
import {
  appendRunLog,
  clearRunLog,
  logError,
  logInfo,
  logWarn
} from './logging'
import { resolveClientPath, resolveJavaPath } from './paths'
import { loadSettings } from './settings'
import { broadcastRunLog, openRunWindow } from './windows'

const running = new Map<string, ChildProcess>()

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

function resolveLaunchRoots(instance: {
  channel: 'release' | 'pre-release'
  gameVersion?: string | null
}): { installRoot: string; clientPath: string } | { error: string } {
  const settings = loadSettings()
  const channelRoot = resolveChannelInstall(instance.channel, instance.gameVersion)
  const candidates = [channelRoot, settings.gameInstallPath].filter(
    (p): p is string => Boolean(p && existsSync(p))
  )

  for (const root of candidates) {
    const clientPath = resolveClientPath(root)
    if (clientPath) {
      return { installRoot: root, clientPath }
    }
  }

  if (instance.gameVersion) {
    return {
      error: `No playable client for ${instance.channel} ${instance.gameVersion}. Download under Install, or set an official install in Settings.`
    }
  }

  const status = getInstallStatus()
  return {
    error: status.issues.join(' ') || 'Hytale install is not configured.'
  }
}

/** Prefer the real Mach-O/EXE so we can pipe stdout instead of `open -n`. */
function resolveSpawnTarget(clientPath: string): { command: string; argsPrefix: string[] } {
  if (process.platform === 'darwin' && clientPath.endsWith('.app')) {
    const macOs = join(clientPath, 'Contents', 'MacOS')
    if (existsSync(macOs)) {
      try {
        const bins = readdirSync(macOs).filter((n) => !n.startsWith('.'))
        const prefer =
          bins.find((n) => /hytale/i.test(n)) ??
          bins.find((n) => !n.endsWith('.dylib') && !n.endsWith('.so'))
        if (prefer) {
          return { command: join(macOs, prefer), argsPrefix: [] }
        }
      } catch {
        // fall through
      }
    }
    return { command: 'open', argsPrefix: ['-n', clientPath, '--args'] }
  }
  return { command: clientPath, argsPrefix: [] }
}

function emitRunLine(
  instanceId: string,
  stream: 'stdout' | 'stderr' | 'system',
  text: string
): void {
  const at = new Date().toISOString()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    appendRunLog(instanceId, `[${stream}] ${line}`)
    broadcastRunLog(instanceId, { line, stream, at })
  }
}

export async function launchInstance(id: string): Promise<LaunchResult> {
  const instance = getInstance(id)
  if (!instance) {
    logError('launch', `Instance not found: ${id}`)
    return { ok: false, message: 'Instance not found.' }
  }

  const resolved = resolveLaunchRoots(instance)
  if ('error' in resolved) {
    logError('launch', `${instance.name}: ${resolved.error}`)
    openRunWindow(id, instance.name)
    emitRunLine(id, 'system', `Launch failed: ${resolved.error}`)
    return { ok: false, message: resolved.error }
  }

  ensureInstanceLayout(id)
  const instanceRoot = getInstancePath(id)
  const userdata = join(instanceRoot, 'userdata')
  const mods = join(instanceRoot, 'mods')

  const auth = await getAuthStatus()
  let session = getCachedGameSession()
  if (auth.signedIn && auth.sessionValid && !session) {
    try {
      session = await createGameSession()
    } catch (err) {
      logWarn('launch', `Game session unavailable: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HYTALE_USER_DATA: userdata,
    SPIRE_INSTANCE_ID: id,
    SPIRE_INSTANCE_ROOT: instanceRoot,
    SPIRE_MODS_DIR: mods,
    SPIRE_CHANNEL: instance.channel
  }

  if (instance.gameVersion) {
    env['SPIRE_GAME_VERSION'] = instance.gameVersion
  }

  if (session?.sessionToken) {
    env['HYTALE_SESSION_TOKEN'] = session.sessionToken
    env['HYTALE_SERVER_SESSION_TOKEN'] = session.sessionToken
  }
  if (session?.identityToken) {
    env['HYTALE_IDENTITY_TOKEN'] = session.identityToken
    env['HYTALE_SERVER_IDENTITY_TOKEN'] = session.identityToken
  }
  if (auth.profileUuid) {
    env['HYTALE_PROFILE_UUID'] = auth.profileUuid
  }

  clearRunLog(id)
  openRunWindow(id, instance.name)
  emitRunLine(id, 'system', `Launching “${instance.name}” (${instance.channel})…`)
  emitRunLine(id, 'system', `Client: ${resolved.clientPath}`)

  try {
    const prev = running.get(id)
    if (prev && !prev.killed) {
      try {
        prev.kill()
      } catch {
        // ignore
      }
    }

    const child = spawnClient(resolved.clientPath, {
      cwd: resolved.installRoot,
      env,
      userdata,
      mods,
      extraArgs: instance.javaArgs ?? [],
      onData: (stream, chunk) => emitRunLine(id, stream, chunk)
    })

    running.set(id, child)
    child.on('exit', (code, signal) => {
      running.delete(id)
      const msg =
        signal != null
          ? `Process ended (signal ${signal})`
          : `Process exited (code ${code ?? '?'})`
      emitRunLine(id, 'system', msg)
      if (code && code !== 0) {
        logError('launch', `${instance.name}: ${msg}`)
      } else {
        logInfo('launch', `${instance.name}: ${msg}`)
      }
    })
    child.on('error', (err) => {
      running.delete(id)
      emitRunLine(id, 'system', `Process error: ${err.message}`)
      logError('launch', `${instance.name}: ${err.message}`)
    })

    const versionLabel = instance.gameVersion ? ` (${instance.gameVersion})` : ''
    logInfo('launch', `Started “${instance.name}”${versionLabel} pid=${child.pid ?? '?'}`)
    return {
      ok: true,
      message: `Launching “${instance.name}”${versionLabel}…`,
      pid: child.pid
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logError('launch', `${instance.name}: ${message}`)
    emitRunLine(id, 'system', `Launch failed: ${message}`)
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
    onData: (stream: 'stdout' | 'stderr', chunk: string) => void
  }
): ChildProcess {
  const args = [
    `--user-data=${opts.userdata}`,
    `--mods-dir=${opts.mods}`,
    ...opts.extraArgs
  ]

  const target = resolveSpawnTarget(clientPath)
  const usingOpen = target.command === 'open'
  const child = spawn(target.command, [...target.argsPrefix, ...args], {
    cwd: opts.cwd,
    env: opts.env,
    detached: false,
    stdio: usingOpen ? 'ignore' : ['ignore', 'pipe', 'pipe']
  })

  if (!usingOpen) {
    child.stdout?.on('data', (buf: Buffer) => opts.onData('stdout', buf.toString()))
    child.stderr?.on('data', (buf: Buffer) => opts.onData('stderr', buf.toString()))
  } else {
    opts.onData(
      'stdout',
      '(macOS open launcher: game stdout is not captured — spawn binary inside .app for logs)\n'
    )
  }

  return child
}
