export type Platform = 'darwin' | 'win32' | 'linux' | string

export type ModSource = 'curseforge' | 'nexus' | 'modrinth'

export type ModSort = 'downloads' | 'updated' | 'name' | 'relevance'

export type InstanceChannel = 'release' | 'pre-release'

/**
 * All settings live only on the user's machine.
 * Spire has no user accounts, analytics, or cloud sync.
 */
export interface SpireSettings {
  gameInstallPath: string | null
  activeInstanceId: string | null
  curseForgeApiKey: string | null
  nexusApiKey: string | null
  checkForUpdates: boolean
}

export interface SpireInstance {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  notes?: string
  javaArgs?: string[]
  channel: InstanceChannel
}

export interface InstancePatch {
  name?: string
  notes?: string
  channel?: InstanceChannel
  javaArgs?: string[]
}

export interface InstallStatus {
  configured: boolean
  gameInstallPath: string | null
  clientPath: string | null
  javaPath: string | null
  valid: boolean
  issues: string[]
}

export interface LaunchResult {
  ok: boolean
  message: string
  pid?: number
}

export interface ModListing {
  source: ModSource
  /** Numeric CF/Nexus id or Modrinth project id — always string */
  id: string
  slug: string
  name: string
  summary: string
  author: string
  downloads: number
  logoUrl: string | null
  pageUrl: string
  updatedAt: string | null
  categories?: string[]
}

export interface ModSearchOptions {
  query?: string
  sort?: ModSort
  offset?: number
  limit?: number
}

export interface ModFileInfo {
  source: ModSource
  modId: string
  fileId: string
  fileName: string
  displayName: string
  fileDate: string
  fileLength: number
  downloadUrl: string | null
  primary: boolean
  gameVersions?: string[]
  releaseType?: string
}

export interface ModDetails {
  listing: ModListing
  description: string
  categories: string[]
  createdAt: string | null
  versions: ModFileInfo[]
  /** True when the store has no Hytale catalog (e.g. Modrinth today) */
  unavailableForHytale?: boolean
  notice?: string | null
}

export interface InstalledMod {
  source: ModSource
  modId: string
  fileId: string
  name: string
  fileName: string
  installedAt: string
  pageUrl: string
}

export interface ModSearchResult {
  mods: ModListing[]
  total: number
  notice?: string | null
}

export interface ModInstallResult {
  ok: boolean
  message: string
  installed?: InstalledMod
  needsManualNxm?: boolean
  pageUrl?: string
}

export interface WorldEntry {
  id: string
  name: string
  path: string
  updatedAt: string | null
  sizeBytes: number
}

export interface ServerEntry {
  id: string
  name: string
  address: string
  port: number
  notes: string
  createdAt: string
  updatedAt: string
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  notes: string | null
  checked: boolean
  skipped: boolean
  error: string | null
}

export interface LocalDataInfo {
  spireRoot: string
  instancesRoot: string
  settingsPath: string
}

export interface SpireApi {
  getPlatform: () => Promise<Platform>
  getAppVersion: () => Promise<string>
  getSettings: () => Promise<SpireSettings>
  updateSettings: (patch: Partial<SpireSettings>) => Promise<SpireSettings>
  setGameInstallPath: (path: string) => Promise<SpireSettings>
  pickGameInstallPath: () => Promise<string | null>
  getInstallStatus: () => Promise<InstallStatus>
  getLocalDataInfo: () => Promise<LocalDataInfo>
  openSpireDataFolder: () => Promise<void>
  clearLocalCredentials: () => Promise<SpireSettings>
  listInstances: () => Promise<SpireInstance[]>
  createInstance: (name: string) => Promise<SpireInstance>
  updateInstance: (id: string, patch: InstancePatch) => Promise<SpireInstance>
  duplicateInstance: (id: string, newName?: string) => Promise<SpireInstance>
  deleteInstance: (id: string) => Promise<void>
  setActiveInstance: (id: string) => Promise<SpireSettings>
  openInstanceFolder: (id: string) => Promise<void>
  launchInstance: (id: string) => Promise<LaunchResult>
  searchMods: (
    source: ModSource,
    options?: ModSearchOptions
  ) => Promise<ModSearchResult>
  getModDetails: (source: ModSource, modId: string) => Promise<ModDetails>
  getModFiles: (source: ModSource, modId: string) => Promise<ModFileInfo[]>
  installMod: (
    instanceId: string,
    source: ModSource,
    modId: string,
    fileId?: string
  ) => Promise<ModInstallResult>
  installFromNxm: (instanceId: string, nxmUrl: string) => Promise<ModInstallResult>
  importLocalMod: (instanceId: string) => Promise<ModInstallResult | null>
  listInstalledMods: (instanceId: string) => Promise<InstalledMod[]>
  removeInstalledMod: (instanceId: string, source: ModSource, modId: string) => Promise<void>
  listWorlds: (instanceId: string) => Promise<WorldEntry[]>
  createWorld: (instanceId: string, name: string) => Promise<WorldEntry>
  renameWorld: (instanceId: string, worldId: string, name: string) => Promise<WorldEntry>
  deleteWorld: (instanceId: string, worldId: string) => Promise<void>
  openWorldFolder: (instanceId: string, worldId: string) => Promise<void>
  listServers: (instanceId: string) => Promise<ServerEntry[]>
  upsertServer: (
    instanceId: string,
    server: Partial<ServerEntry> & { name: string; address: string }
  ) => Promise<ServerEntry>
  deleteServer: (instanceId: string, serverId: string) => Promise<void>
  checkForUpdate: () => Promise<UpdateCheckResult>
  openExternal: (url: string) => Promise<void>
  onNxmReceived: (handler: (nxmUrl: string) => void) => () => void
}

declare global {
  interface Window {
    spire: SpireApi
  }
}
