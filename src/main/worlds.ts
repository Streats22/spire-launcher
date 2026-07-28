import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
  cpSync,
  type FSWatcher
} from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  ApplyModSetResult,
  CreateWorldOptions,
  WorldCreatePreset,
  WorldEntry
} from '../shared/types'
import { ensureInstanceLayout, getInstancePath } from './instances'
import { listEnabledPluginIds } from './mods/pluginId'
import { logInfo, logWarn } from './logging'
import { errorMessage } from '../shared/errors'

type SaveConfig = {
  Version?: number
  DefaultModsEnabled?: boolean
  Mods?: Record<string, { Enabled?: boolean; [key: string]: unknown }>
  Backup?: Record<string, unknown>
  [key: string]: unknown
}

type UniverseWorldConfig = Record<string, unknown>

const saveWatchers = new Map<string, FSWatcher>()

/**
 * Hytale singleplayer worlds live under `{instance}/userdata/Saves/{name}/`.
 * Spire also used `{instance}/worlds/` historically; that path is no longer the game root.
 */
export class WorldService {
  savesRoot(instanceId: string): string {
    ensureInstanceLayout(instanceId)
    const dir = join(getInstancePath(instanceId), 'userdata', 'Saves')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  list(instanceId: string): WorldEntry[] {
    const root = this.savesRoot(instanceId)
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const path = join(root, d.name)
        const st = statSync(path)
        return {
          id: d.name,
          name: d.name,
          path,
          updatedAt: st.mtime.toISOString(),
          sizeBytes: this.#dirSize(path)
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  create(instanceId: string, name: string, options?: CreateWorldOptions): WorldEntry {
    const safe = this.#safeName(name) || `World-${randomUUID().slice(0, 8)}`
    const path = join(this.savesRoot(instanceId), safe)
    if (existsSync(path)) {
      throw new Error('A world with that name already exists.')
    }
    const preset: WorldCreatePreset = options?.preset ?? 'adventure'
    const seed =
      typeof options?.seed === 'number' && Number.isFinite(options.seed)
        ? Math.trunc(options.seed)
        : Date.now()

    mkdirSync(path, { recursive: true })
    writeFileSync(
      join(path, 'client_metadata.json'),
      JSON.stringify({ CreatedWithPatchline: 'release', CreatedBy: 'Spire' }, null, 2),
      'utf8'
    )
    this.#writeConfig(path, this.#buildConfigWithMods(instanceId))
    this.#writeUniverseWorld(path, safe, preset, seed)
    logInfo(
      'worlds',
      `Created save “${safe}” (${preset}, seed ${seed}) with installed mods enabled`
    )
    return this.list(instanceId).find((w) => w.id === safe)!
  }

  rename(instanceId: string, worldId: string, name: string): WorldEntry {
    const root = this.savesRoot(instanceId)
    const from = join(root, worldId)
    const safe = this.#safeName(name)
    if (!existsSync(from)) throw new Error('World not found.')
    if (!safe) throw new Error('Name required.')
    const to = join(root, safe)
    if (from !== to && existsSync(to)) throw new Error('A world with that name already exists.')
    if (from !== to) renameSync(from, to)
    return this.list(instanceId).find((w) => w.id === safe)!
  }

  duplicate(instanceId: string, worldId: string, newName?: string): WorldEntry {
    const root = this.savesRoot(instanceId)
    const from = join(root, worldId)
    if (!existsSync(from)) throw new Error('World not found.')

    const base =
      this.#safeName(newName || `${worldId} copy`) || `World-${randomUUID().slice(0, 8)}`
    let safe = base
    let n = 2
    while (existsSync(join(root, safe))) {
      safe = `${base} ${n}`
      n += 1
    }

    cpSync(from, join(root, safe), { recursive: true })
    this.enableModsInSave(instanceId, safe)
    return this.list(instanceId).find((w) => w.id === safe)!
  }

  delete(instanceId: string, worldId: string): void {
    const path = join(this.savesRoot(instanceId), worldId)
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true })
    }
  }

  getPath(instanceId: string, worldId: string): string {
    return join(this.savesRoot(instanceId), worldId)
  }

  /**
   * Ensure saves enable Spire-installed mods.
   * Pass worldIds to target a subset; omit for every save.
   */
  applyModSetToSaves(instanceId: string, worldIds?: string[]): ApplyModSetResult {
    const pluginIds = listEnabledPluginIds(instanceId)
    const all = this.list(instanceId)
    const targets =
      worldIds == null ? all : all.filter((w) => worldIds.includes(w.id))
    let updated = 0
    for (const world of targets) {
      if (this.enableModsInSave(instanceId, world.id)) updated += 1
    }
    return { saves: targets.length, updated, modCount: pluginIds.length }
  }

  enableModsOnAllSaves(instanceId: string): number {
    return this.applyModSetToSaves(instanceId).updated
  }

  enableModsInSave(instanceId: string, worldId: string): boolean {
    const path = this.getPath(instanceId, worldId)
    if (!existsSync(path)) return false
    const configPath = join(path, 'config.json')
    const config = existsSync(configPath) ? this.#readConfig(configPath) : {}
    const next = this.#mergeEnabledMods(config, listEnabledPluginIds(instanceId))
    if (!this.#configsDiffer(config, next)) return false
    this.#writeConfig(path, next)
    return true
  }

  /** Watch Saves while the game runs so newly created worlds get mods enabled. */
  startSaveWatch(instanceId: string): void {
    this.stopSaveWatch(instanceId)
    const root = this.savesRoot(instanceId)
    let timer: ReturnType<typeof setTimeout> | null = null
    let pass2: ReturnType<typeof setTimeout> | null = null
    let pass3: ReturnType<typeof setTimeout> | null = null

    const runSync = (label: string): void => {
      try {
        const n = this.enableModsOnAllSaves(instanceId)
        if (n > 0) {
          logInfo('worlds', `${label}: enabled installed mods on ${n} save(s)`)
        }
      } catch (err) {
        logWarn('worlds', `Save mod sync failed: ${errorMessage(err)}`)
      }
    }

    const schedule = (): void => {
      if (timer) clearTimeout(timer)
      if (pass2) clearTimeout(pass2)
      if (pass3) clearTimeout(pass3)
      // Hytale often writes config with Enabled:false during Create World, then
      // rewrites again — re-apply a few times so the final file stays enabled.
      timer = setTimeout(() => runSync('save-watch'), 400)
      pass2 = setTimeout(() => runSync('save-watch-retry'), 1600)
      pass3 = setTimeout(() => runSync('save-watch-final'), 3500)
    }

    try {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) {
          schedule()
          return
        }
        const name = String(filename).replace(/\\/g, '/')
        if (
          name.endsWith('config.json') ||
          name.endsWith('config.json.bak') ||
          !name.includes('/')
        ) {
          schedule()
        }
      })
      watcher.on('error', (err) => {
        logWarn('worlds', `Save watcher error: ${errorMessage(err)}`)
        this.stopSaveWatch(instanceId)
      })
      saveWatchers.set(instanceId, watcher)
      schedule()
    } catch (err) {
      logWarn('worlds', `Could not watch Saves: ${errorMessage(err)}`)
    }
  }

  stopSaveWatch(instanceId: string): void {
    const watcher = saveWatchers.get(instanceId)
    if (!watcher) return
    try {
      watcher.close()
    } catch {
      // ignore
    }
    saveWatchers.delete(instanceId)
  }

  #safeName(name: string | undefined): string {
    return (name ?? '').trim().replace(/[\\/:*?"<>|]/g, '_')
  }

  #dirSize(path: string): number {
    try {
      const st = statSync(path)
      if (st.isFile()) return st.size
      if (!st.isDirectory()) return 0
      return readdirSync(path).reduce((sum, name) => sum + this.#dirSize(join(path, name)), 0)
    } catch {
      return 0
    }
  }

  #buildConfigWithMods(instanceId: string): SaveConfig {
    return this.#mergeEnabledMods(
      {
        Version: 4,
        DefaultModsEnabled: true,
        Backup: {
          Enabled: true,
          FrequencyMinutes: 30,
          Directory: 'backup',
          MaxCount: 5,
          ArchiveMaxCount: 5
        },
        Mods: {}
      },
      listEnabledPluginIds(instanceId)
    )
  }

  #mergeEnabledMods(config: SaveConfig, pluginIds: string[]): SaveConfig {
    const mods: Record<string, { Enabled?: boolean; [key: string]: unknown }> = {
      ...(config.Mods && typeof config.Mods === 'object' ? { ...config.Mods } : {})
    }
    for (const id of pluginIds) {
      const existing = mods[id]
      // Always force on — Create World in Hytale defaults new entries to false.
      mods[id] = existing ? { ...existing, Enabled: true } : { Enabled: true }
    }
    return {
      ...config,
      Version: typeof config.Version === 'number' ? config.Version : 4,
      DefaultModsEnabled: true,
      Mods: mods
    }
  }

  #configsDiffer(a: SaveConfig, b: SaveConfig): boolean {
    return JSON.stringify(a) !== JSON.stringify(b)
  }

  #readConfig(configPath: string): SaveConfig {
    try {
      return JSON.parse(readFileSync(configPath, 'utf8')) as SaveConfig
    } catch {
      return {}
    }
  }

  #writeConfig(savePath: string, config: SaveConfig): void {
    mkdirSync(savePath, { recursive: true })
    writeFileSync(join(savePath, 'config.json'), JSON.stringify(config, null, 2), 'utf8')
  }

  /** Seed `universe/worlds/default` so Hytale picks up type / mode / seed on first open. */
  #writeUniverseWorld(
    savePath: string,
    displayName: string,
    preset: WorldCreatePreset,
    seed: number
  ): void {
    const worldDir = join(savePath, 'universe', 'worlds', 'default')
    mkdirSync(worldDir, { recursive: true })
    writeFileSync(
      join(worldDir, 'config.json'),
      JSON.stringify(this.#universeWorldConfig(displayName, preset, seed), null, 2),
      'utf8'
    )
  }

  #uuidBinary(): { $binary: string; $type: '04' } {
    const hex = randomUUID().replace(/-/g, '')
    return {
      $binary: Buffer.from(hex, 'hex').toString('base64'),
      $type: '04'
    }
  }

  #universeWorldConfig(
    displayName: string,
    preset: WorldCreatePreset,
    seed: number
  ): UniverseWorldConfig {
    const base: UniverseWorldConfig = {
      Version: 4,
      UUID: this.#uuidBinary(),
      DisplayName: displayName,
      Seed: seed,
      WorldMap: { Type: 'WorldGen' },
      ChunkStorage: { Type: 'Hytale' },
      ChunkConfig: {},
      IsTicking: true,
      IsBlockTicking: true,
      IsPvpEnabled: false,
      IsGameTimePaused: false,
      GameTime: '0001-01-01T06:00:00Z',
      ClientEffects: {
        SunHeightPercent: 100,
        SunAngleDegrees: 0,
        BloomIntensity: 0.3,
        BloomPower: 8,
        SunIntensity: 0.25,
        SunshaftIntensity: 0.3,
        SunshaftScaleFactor: 4
      },
      RequiredPlugins: {},
      IsSpawnMarkersEnabled: true,
      IsAllNPCFrozen: false,
      GameplayConfig: 'Default',
      IsCompassUpdating: true,
      IsSavingPlayers: true,
      IsSavingChunks: true,
      SaveNewChunks: true,
      IsUnloadingChunks: true,
      IsObjectiveMarkersEnabled: true,
      DeleteOnUniverseStart: false,
      DeleteOnRemove: false,
      DisabledFluidTickers: [],
      ResourceStorage: { Type: 'Hytale' },
      Plugin: {}
    }

    if (preset === 'flat') {
      return {
        ...base,
        SpawnProvider: {
          Id: 'Global',
          SpawnPoint: {
            X: 0.5,
            Y: 80,
            Z: 0.5,
            Pitch: 0,
            Yaw: 180,
            Roll: 0
          }
        },
        WorldGen: {
          Type: 'HytaleGenerator',
          WorldStructure: 'Default_Flat'
        },
        IsFallDamageEnabled: true,
        GameMode: 'Creative',
        IsSpawningNPC: false
      }
    }

    if (preset === 'creative') {
      return {
        ...base,
        WorldGen: {
          Type: 'Hytale',
          Name: 'Default',
          Version: '0.0.0'
        },
        IsFallDamageEnabled: false,
        GameMode: 'Creative',
        IsSpawningNPC: false,
        Plugin: {
          CreativeHub: {
            StartupInstance: 'Defaults/CreativeHub'
          }
        }
      }
    }

    return {
      ...base,
      WorldGen: {
        Type: 'Hytale',
        Name: 'Default',
        Version: '0.0.0'
      },
      IsFallDamageEnabled: true,
      GameMode: 'Adventure',
      IsSpawningNPC: true,
      IsBlockSpawnersEnabled: true,
      Death: {
        RespawnController: { Type: 'HomeOrSpawnPoint' },
        ItemsLossMode: 'Configured',
        ItemsAmountLossPercentage: 50,
        ItemsDurabilityLossPercentage: 10
      },
      DaytimeDurationSeconds: 1728,
      NighttimeDurationSeconds: 1152
    }
  }
}

const worlds = new WorldService()

export function listWorlds(instanceId: string): WorldEntry[] {
  return worlds.list(instanceId)
}

export function createWorld(
  instanceId: string,
  name: string,
  options?: CreateWorldOptions
): WorldEntry {
  return worlds.create(instanceId, name, options)
}

export function renameWorld(instanceId: string, worldId: string, name: string): WorldEntry {
  return worlds.rename(instanceId, worldId, name)
}

export function duplicateWorld(
  instanceId: string,
  worldId: string,
  newName?: string
): WorldEntry {
  return worlds.duplicate(instanceId, worldId, newName)
}

export function deleteWorld(instanceId: string, worldId: string): void {
  worlds.delete(instanceId, worldId)
}

export function getWorldPath(instanceId: string, worldId: string): string {
  return worlds.getPath(instanceId, worldId)
}

export function enableModsOnAllSaves(instanceId: string): number {
  return worlds.enableModsOnAllSaves(instanceId)
}

export function applyModSetToSaves(
  instanceId: string,
  worldIds?: string[]
): ApplyModSetResult {
  return worlds.applyModSetToSaves(instanceId, worldIds)
}

export function enableModsInWorldSave(instanceId: string, worldId: string): boolean {
  return worlds.enableModsInSave(instanceId, worldId)
}

export function startWorldSaveWatch(instanceId: string): void {
  worlds.startSaveWatch(instanceId)
}

export function stopWorldSaveWatch(instanceId: string): void {
  worlds.stopSaveWatch(instanceId)
}
