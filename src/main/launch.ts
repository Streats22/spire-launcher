import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync
} from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import { basename, dirname, join } from 'path'
import type { InstallStatus, LaunchResult, SpireInstance } from '../shared/types'
import { errorMessage } from '../shared/errors'
import { getAuthStatus, createGameSession } from './auth/account'
import { loadAccountMeta } from './auth/store'
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
import { broadcastRunLog, getMainWindow, openRunWindow } from './windows'
import {
  enableModsOnAllSaves,
  startWorldSaveWatch,
  stopWorldSaveWatch
} from './worlds'

interface LaunchRoots {
  installRoot: string
  clientPath: string
  appDir: string
  javaPath: string | null
}

interface SpawnClientOptions {
  cwd: string
  env: NodeJS.ProcessEnv
  appDir: string
  javaPath: string
  userdata: string
  uuid: string
  name: string
  identityToken: string
  sessionToken: string
  extraArgs: string[]
  onData: (stream: 'stdout' | 'stderr', chunk: string) => void
}

/**
 * Owns install validation and process spawn for Hytale instances.
 * IPC keeps thin wrappers (`launchInstance` / `getInstallStatus`) for compatibility.
 */
export class LaunchService {
  readonly #running = new Map<string, ChildProcess>()

  getInstallStatus(): InstallStatus {
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
        issues: ['Set the official Hytale install folder in Settings (Detect or Browse).']
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

  async launchInstance(id: string): Promise<LaunchResult> {
    const instance = getInstance(id)
    if (!instance) {
      logError('launch', `Instance not found: ${id}`)
      return { ok: false, message: 'Instance not found.' }
    }

    const resolved = this.#resolveLaunchRoots(instance)
    if ('error' in resolved) {
      return this.#fail(id, instance.name, resolved.error)
    }

    if (!resolved.javaPath) {
      return this.#fail(
        id,
        instance.name,
        'Java runtime not found next to the client. Use Install → Install full client, or point Settings at an official Hytale install that includes JRE.'
      )
    }

    ensureInstanceLayout(id)
    const instanceRoot = getInstancePath(id)
    const userdata = join(instanceRoot, 'userdata')
    const mods = join(instanceRoot, 'mods')
    this.#ensureUserDirMods(userdata, mods)
    try {
      const n = enableModsOnAllSaves(id)
      if (n > 0) {
        logInfo('launch', `Enabled installed mods on ${n} existing save(s)`)
      }
    } catch (err) {
      logWarn('launch', `Could not sync world mods: ${errorMessage(err)}`)
    }

    const auth = await getAuthStatus()
    if (!auth.signedIn || !auth.sessionValid) {
      return this.#fail(
        id,
        instance.name,
        'Sign in with your Hytale account under Install before playing.'
      )
    }

    let session
    try {
      session = await createGameSession()
    } catch (err) {
      const detail = errorMessage(err)
      logWarn('launch', `Game session unavailable: ${detail}`)
      return this.#fail(id, instance.name, detail)
    }

    const profileUuid =
      loadAccountMeta().selectedProfileUuid ||
      auth.profileUuid ||
      null
    if (!profileUuid) {
      return this.#fail(
        id,
        instance.name,
        'No Hytale game profile selected. Open Install and refresh your account.'
      )
    }

    const playerName = auth.displayName?.trim() || 'Player'
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HYTALE_USER_DATA: userdata,
      SPIRE_INSTANCE_ID: id,
      SPIRE_INSTANCE_ROOT: instanceRoot,
      SPIRE_MODS_DIR: mods,
      SPIRE_CHANNEL: instance.channel,
      HYTALE_SESSION_TOKEN: session.sessionToken,
      HYTALE_SERVER_SESSION_TOKEN: session.sessionToken,
      HYTALE_IDENTITY_TOKEN: session.identityToken,
      HYTALE_SERVER_IDENTITY_TOKEN: session.identityToken,
      HYTALE_PROFILE_UUID: profileUuid
    }

    if (instance.gameVersion) {
      env['SPIRE_GAME_VERSION'] = instance.gameVersion
    }

    clearRunLog(id)
    this.#maybeOpenRunWindow(id, instance.name)
    this.#emitRunLine(id, 'system', `Launching “${instance.name}” (${instance.channel})…`)
    this.#emitRunLine(id, 'system', `Client: ${resolved.clientPath}`)
    this.#emitRunLine(id, 'system', `App dir: ${resolved.appDir}`)
    this.#emitRunLine(id, 'system', `Java: ${resolved.javaPath}`)
    this.#emitRunLine(id, 'system', `User dir: ${userdata}`)
    this.#emitRunLine(id, 'system', `Profile: ${playerName} (${profileUuid})`)

    try {
      const prev = this.#running.get(id)
      if (prev && !prev.killed) {
        try {
          prev.kill()
        } catch {
          // ignore
        }
      }

      const child = this.#spawnClient(resolved.clientPath, {
        cwd: resolved.appDir,
        env,
        appDir: resolved.appDir,
        javaPath: resolved.javaPath,
        userdata,
        uuid: profileUuid,
        name: playerName,
        identityToken: session.identityToken,
        sessionToken: session.sessionToken,
        extraArgs: instance.javaArgs ?? [],
        onData: (stream, chunk) => this.#emitRunLine(id, stream, chunk)
      })

      this.#running.set(id, child)
      startWorldSaveWatch(id)
      child.on('exit', (code, signal) => {
        if (this.#running.get(id) === child) {
          stopWorldSaveWatch(id)
          this.#running.delete(id)
        }
        const msg =
          signal != null
            ? `Process ended (signal ${signal})`
            : `Process exited (code ${code ?? '?'})`
        this.#emitRunLine(id, 'system', msg)
        if (code && code !== 0) {
          logError('launch', `${instance.name}: ${msg}`)
        } else {
          logInfo('launch', `${instance.name}: ${msg}`)
        }
      })
      child.on('error', (err) => {
        if (this.#running.get(id) === child) {
          stopWorldSaveWatch(id)
          this.#running.delete(id)
        }
        this.#emitRunLine(id, 'system', `Process error: ${err.message}`)
        logError('launch', `${instance.name}: ${err.message}`)
      })

      const versionLabel = instance.gameVersion ? ` (${instance.gameVersion})` : ''
      logInfo('launch', `Started “${instance.name}”${versionLabel} pid=${child.pid ?? '?'}`)

      if (loadSettings().minimizeOnLaunch) {
        const main = getMainWindow()
        if (main && !main.isDestroyed()) main.minimize()
      }

      return {
        ok: true,
        message: `Launching “${instance.name}”${versionLabel}…`,
        pid: child.pid
      }
    } catch (err) {
      const message = errorMessage(err)
      logError('launch', `${instance.name}: ${message}`)
      this.#emitRunLine(id, 'system', `Launch failed: ${message}`)
      return { ok: false, message }
    }
  }

  #fail(id: string, name: string, message: string): LaunchResult {
    logError('launch', `${name}: ${message}`)
    this.#maybeOpenRunWindow(id, name)
    this.#emitRunLine(id, 'system', `Launch failed: ${message}`)
    return { ok: false, message }
  }

  #maybeOpenRunWindow(instanceId: string, instanceName: string): void {
    if (loadSettings().openRunWindowOnLaunch) {
      openRunWindow(instanceId, instanceName)
    }
  }

  #resolveLaunchRoots(
    instance: Pick<SpireInstance, 'channel' | 'gameVersion'>
  ): LaunchRoots | { error: string } {
    const settings = loadSettings()
    const channelRoot = resolveChannelInstall(instance.channel, instance.gameVersion)
    const candidates = [channelRoot, settings.gameInstallPath].filter(
      (p): p is string => Boolean(p && existsSync(p))
    )

    for (const root of candidates) {
      const clientPath = resolveClientPath(root)
      if (clientPath) {
        return {
          installRoot: root,
          clientPath,
          appDir: this.#resolveAppDir(clientPath),
          javaPath: resolveJavaPath(root)
        }
      }
    }

    if (instance.gameVersion) {
      return {
        error: `No playable client for ${instance.channel} ${instance.gameVersion}. Download under Install, or set an official install in Settings.`
      }
    }

    const status = this.getInstallStatus()
    return {
      error: status.issues.join(' ') || 'Hytale install is not configured.'
    }
  }

  /** `--app-dir` is the package/game/latest folder (parent of Client/). */
  #resolveAppDir(clientPath: string): string {
    const clientDir = dirname(clientPath)
    if (basename(clientDir).toLowerCase() === 'client') {
      return dirname(clientDir)
    }
    if (process.platform === 'darwin' && clientPath.endsWith('.app')) {
      const maybeClient = dirname(clientPath)
      if (basename(maybeClient).toLowerCase() === 'client') {
        return dirname(maybeClient)
      }
    }
    return clientDir
  }

  /**
   * Hytale loads mods from `{user-dir}/Mods`. Spire keeps mods at `instance/mods`,
   * so link that folder in before spawn.
   */
  #ensureUserDirMods(userDir: string, modsSource: string): void {
    mkdirSync(userDir, { recursive: true })
    mkdirSync(modsSource, { recursive: true })
    const dest = join(userDir, 'Mods')

    try {
      const st = lstatSync(dest)
      if (st.isSymbolicLink()) return
      if (st.isDirectory() && readdirSync(dest).length === 0) {
        rmSync(dest, { recursive: true, force: true })
      } else {
        return
      }
    } catch {
      // missing — create link below
    }

    try {
      symlinkSync(modsSource, dest, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (err) {
      logWarn('launch', `Could not link Mods into user-dir: ${errorMessage(err)}`)
    }
  }

  #resolveSpawnTarget(clientPath: string): { command: string; argsPrefix: string[] } {
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

  #emitRunLine(
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

  #spawnClient(clientPath: string, opts: SpawnClientOptions): ChildProcess {
    const args = [
      `--app-dir=${opts.appDir}`,
      `--user-dir=${opts.userdata}`,
      `--java-exec=${opts.javaPath}`,
      '--auth-mode=authenticated',
      `--uuid=${opts.uuid}`,
      `--name=${opts.name}`,
      `--identity-token=${opts.identityToken}`,
      `--session-token=${opts.sessionToken}`,
      ...opts.extraArgs
    ]

    const target = this.#resolveSpawnTarget(clientPath)
    const usingOpen = target.command === 'open'
    const child = spawn(target.command, [...target.argsPrefix, ...args], {
      cwd: opts.cwd,
      env: opts.env,
      detached: false,
      windowsHide: true,
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
}

export const launchService = new LaunchService()

export function getInstallStatus(): InstallStatus {
  return launchService.getInstallStatus()
}

export function launchInstance(id: string): Promise<LaunchResult> {
  return launchService.launchInstance(id)
}
