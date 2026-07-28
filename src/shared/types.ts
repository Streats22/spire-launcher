export type Platform = 'darwin' | 'win32' | 'linux' | string

export type ModSource =
  | 'curseforge'
  | 'nexus'
  | 'modrinth'
  | 'modtale'
  | 'modifold'
  | 'thunderstore'

/** CurseForge Hytale project classes — also Spire install targets. */
export type ContentKind = 'mods' | 'prefabs' | 'worlds' | 'bootstrap' | 'translations'

export type ModSort = 'downloads' | 'updated' | 'name' | 'relevance'

export type InstanceChannel = 'release' | 'pre-release'

/** Color themes — dark palette ids plus light / high-contrast options. */
export type SpireTheme =
  | 'slate'
  | 'ember'
  | 'ocean'
  | 'mist'
  | 'midnight'
  | 'daybreak'
  | 'fog'
  | 'contrast'

/** UI scale & spacing for readability. */
export type SpireDensity = 'compact' | 'comfortable' | 'readable'

/** Home instance browser arrangement. */
export type SpireHomeLayout = 'grid' | 'list'

/** Named folder of instances on the home screen. */
export interface InstanceGroup {
  id: string
  name: string
  sortIndex: number
}

/**
 * All settings live only on the user's machine.
 * Spire has no user accounts, analytics, or cloud sync.
 */
export interface SpireSettings {
  gameInstallPath: string | null
  activeInstanceId: string | null
  /** Optional — Spire may ship an embedded CF key; users need not paste one. */
  curseForgeApiKey: string | null
  /** Optional — browse/install can use browser Slow Download + nxm / Import. */
  nexusApiKey: string | null
  checkForUpdates: boolean
  /** Pop out the run/log window when launching. Default false. */
  openRunWindowOnLaunch: boolean
  /** Minimize the main window after a successful launch. Default false. */
  minimizeOnLaunch: boolean
  /** Persist gallery visibility on mod detail. Default true. */
  showModPhotos: boolean
  /** App color theme (main + manage windows). Default slate. */
  theme: SpireTheme
  /** Text size & spacing. Default comfortable. */
  density: SpireDensity
  /** Home instances: tile grid or dense list. Default grid. */
  homeLayout: SpireHomeLayout
  /** Home screen instance folders (order = sortIndex). */
  instanceGroups: InstanceGroup[]
}

/** How to install from the mod detail panel. */
export type ModInstallMode = 'slow' | 'quick'

export interface SpireInstance {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  notes?: string
  javaArgs?: string[]
  channel: InstanceChannel
  /**
   * Official build id (e.g. `2026.01.24-6e2d4fc36`) when pinned.
   * Null/undefined = use channel tip / Settings install path (legacy instances).
   */
  gameVersion?: string | null
  /** Home folder id; null/undefined = Ungrouped. */
  groupId?: string | null
  /** Order within the group (then name as tiebreaker). */
  sortIndex?: number
}

export interface CreateInstanceOptions {
  name: string
  channel?: InstanceChannel
  gameVersion?: string | null
  notes?: string
  groupId?: string | null
}

export interface InstancePatch {
  name?: string
  notes?: string
  channel?: InstanceChannel
  gameVersion?: string | null
  javaArgs?: string[]
  groupId?: string | null
  sortIndex?: number
}

export interface InstanceOrganizationItem {
  id: string
  groupId: string | null
  sortIndex: number
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
  /** CurseForge class / Spire content kind. Defaults to mods. */
  kind?: ContentKind
  /** Optional CurseForge category id within the class. */
  categoryId?: number | null
}

export interface ContentCategory {
  id: number
  name: string
  slug: string
  kind: ContentKind
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
  /** Store-declared dependencies (CurseForge / Thunderstore when known). */
  dependencies?: ModDependencyRef[]
}

/** A required/related mod referenced by a file version. */
export interface ModDependencyRef {
  source: ModSource
  modId: string
  /** required = must install; optional is listed but not auto-downloaded */
  relation: 'required' | 'optional' | 'embedded' | 'include' | 'tool' | 'incompatible'
}

export interface ModImage {
  url: string
  thumbnailUrl?: string | null
  title?: string | null
}

export interface ModDetails {
  listing: ModListing
  /** Author/HTML body when available; may fall back to summary. */
  description: string
  categories: string[]
  createdAt: string | null
  versions: ModFileInfo[]
  images?: ModImage[]
  /** True when the store has no Hytale catalog (e.g. Modrinth today) */
  unavailableForHytale?: boolean
  notice?: string | null
  /** Whether API one-click (“Download quickly”) is likely available. */
  quickDownloadAvailable?: boolean
}

export interface InstalledMod {
  source: ModSource
  modId: string
  fileId: string
  name: string
  fileName: string
  installedAt: string
  pageUrl: string
  /** When false, file lives under mods/disabled/ and is not loaded at launch. Default true. */
  enabled?: boolean
  /** Content class this install belongs to. Defaults to mods. */
  kind?: ContentKind
}

export interface ModSearchResult {
  mods: ModListing[]
  total: number
  notice?: string | null
  /** True when more pages can be fetched via offset. */
  hasMore?: boolean
}

export interface ModInstallResult {
  ok: boolean
  message: string
  installed?: InstalledMod
  /** Required dependencies that were auto-installed with this request. */
  dependenciesInstalled?: InstalledMod[]
  /** @deprecated Prefer needsManualDownload */
  needsManualNxm?: boolean
  /** Opened (or should open) browser / nxm / Import — free-tier path. */
  needsManualDownload?: boolean
  pageUrl?: string
  /** Spire is watching ~/Downloads to auto-import the finished file. */
  watchingDownloads?: boolean
}

export interface DownloadWatchStatus {
  active: boolean
  instanceId: string | null
  source: ModSource | null
  modId: string | null
  modName: string | null
  message: string
  startedAt: number | null
}

export interface WorldEntry {
  id: string
  name: string
  path: string
  updatedAt: string | null
  sizeBytes: number
}

/** Result of pushing Spire’s enabled mod set into every save’s config.json. */
export interface ApplyModSetResult {
  saves: number
  updated: number
  modCount: number
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
  /** Spire-managed official game packages (downloaded via Hypixel CDN). */
  gameRoot: string
}

export type HytalePatchline = 'release' | 'pre-release'

export interface HytaleDeviceLogin {
  /** Empty for PKCE launcher login; set for legacy device-code flow. */
  userCode: string
  verificationUri: string
  verificationUriComplete: string | null
  expiresIn: number
  interval: number
  /** Official launcher browser PKCE (required for full Client + JRE). */
  flow?: 'pkce' | 'device'
}

export interface HytaleProfile {
  uuid: string
  name: string
  entitlements: string[]
}

/** One saved Hytale OAuth session (multiple can coexist locally). */
export interface HytaleAccountSummary {
  id: string
  displayName: string | null
  profileUuid: string | null
  profiles: HytaleProfile[]
  hasRefreshToken: boolean
}

export interface HytaleAuthStatus {
  signedIn: boolean
  /** Selected game profile name when known (falls back to OAuth username) */
  displayName: string | null
  profileUuid: string | null
  profiles: HytaleProfile[]
  /** Access token still usable (refreshed if needed) */
  sessionValid: boolean
  /** ISO expiry of access token if known */
  accessExpiresAt: string | null
  hasRefreshToken: boolean
  clientId: string | null
  /** True when tokens include auth:launcher (Wharf Client + JRE installs). */
  canInstallClient: boolean
  /** Active saved account id */
  activeAccountId: string | null
  /** All locally saved Hytale accounts */
  accounts: HytaleAccountSummary[]
}

export interface HytaleChannelInfo {
  channel: HytalePatchline
  version: string | null
  downloadUrl: string | null
  sha256: string | null
  /** True when this channel is available to the signed-in account */
  available: boolean
  error: string | null
  /** True when a playable Client is not yet present under Spire’s game folder */
  clientPatchPending: boolean
  /** Local Wharf build number when known */
  installedBuild?: number | null
  /** Client binary resolved under Spire-managed install */
  clientReady?: boolean
}

/**
 * Single selectable game build for instance wizards / Install UI.
 * Official API only publishes the current build per channel; older entries
 * appear when already downloaded into Spire’s local game folder.
 */
export interface GameVersionInfo {
  channel: HytalePatchline
  version: string
  /** Present when Hypixel still serves this build via game-assets */
  downloadUrl: string | null
  sha256: string | null
  /** True for the channel’s current remote tip */
  latest: boolean
  /** Already extracted under Spire’s game root */
  installedLocally: boolean
  localPath: string | null
  /** Can start a CDN download (signed-in + remote URL known) */
  downloadable: boolean
  /** Playable Client present for this package */
  clientReady?: boolean
}

export interface HytaleDownloadProgress {
  phase: 'idle' | 'resolving' | 'downloading' | 'verifying' | 'extracting' | 'done' | 'error'
  channel: HytalePatchline | null
  version: string | null
  bytesReceived: number
  bytesTotal: number
  message: string
  /** Local install root after success */
  installPath: string | null
}

/** Mods / worlds / prefabs install transfer (same bar UI as client downloads). */
export interface ContentDownloadProgress {
  phase: 'idle' | 'resolving' | 'downloading' | 'verifying' | 'extracting' | 'done' | 'error'
  kind: ContentKind | null
  name: string | null
  bytesReceived: number
  bytesTotal: number
  message: string
}

export interface HytaleDownloadResult {
  ok: boolean
  message: string
  channel?: HytalePatchline
  version?: string
  installPath?: string
  /** Zip/patch finished but no client binary */
  clientMissing?: boolean
}

/** Per-instance readiness for the Edit Instance surface. */
export interface InstanceRuntimeStatus {
  instanceId: string
  channel: InstanceChannel
  gameVersion: string | null
  installRoot: string | null
  clientReady: boolean
  javaReady: boolean
  build: number | null
  installedVersion: string | null
  modsCount: number
  worldsCount: number
  serversCount: number
}

export type SpireLogLevel = 'info' | 'warn' | 'error'

export interface SpireLogEntry {
  at: string
  level: SpireLogLevel
  source: string
  message: string
}

export interface RunLogEvent {
  instanceId: string
  line: string
  stream: 'stdout' | 'stderr' | 'system'
  at: string
}

export interface DetectedGameInstall {
  path: string
  label: string
  clientPath: string
  javaPath: string | null
}

export interface DetectGameInstallResult {
  applied: boolean
  path: string | null
  found: DetectedGameInstall[]
  settings: SpireSettings
}

export interface SpireApi {
  getPlatform: () => Promise<Platform>
  getAppVersion: () => Promise<string>
  getSettings: () => Promise<SpireSettings>
  updateSettings: (patch: Partial<SpireSettings>) => Promise<SpireSettings>
  setGameInstallPath: (path: string) => Promise<SpireSettings>
  pickGameInstallPath: () => Promise<string | null>
  detectGameInstall: () => Promise<DetectGameInstallResult>
  getInstallStatus: () => Promise<InstallStatus>
  getLocalDataInfo: () => Promise<LocalDataInfo>
  openSpireDataFolder: () => Promise<void>
  openLogsFolder: () => Promise<void>
  getRecentLogs: (limit?: number) => Promise<SpireLogEntry[]>
  openManageWindow: (instanceId: string, tab?: string) => Promise<void>
  openRunWindow: (instanceId: string) => Promise<void>
  focusMainView: (view: string) => Promise<void>
  clearLocalCredentials: () => Promise<SpireSettings>
  listInstances: () => Promise<SpireInstance[]>
  createInstance: (options: CreateInstanceOptions | string) => Promise<SpireInstance>
  updateInstance: (id: string, patch: InstancePatch) => Promise<SpireInstance>
  organizeInstances: (items: InstanceOrganizationItem[]) => Promise<SpireInstance[]>
  createInstanceGroup: (name: string) => Promise<SpireSettings>
  renameInstanceGroup: (id: string, name: string) => Promise<SpireSettings>
  deleteInstanceGroup: (id: string) => Promise<{ settings: SpireSettings; instances: SpireInstance[] }>
  reorderInstanceGroups: (ids: string[]) => Promise<SpireSettings>
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
    fileId?: string,
    mode?: ModInstallMode,
    modName?: string,
    kind?: ContentKind
  ) => Promise<ModInstallResult>
  installFromNxm: (instanceId: string, nxmUrl: string) => Promise<ModInstallResult>
  importLocalMod: (instanceId: string) => Promise<ModInstallResult | null>
  listInstalledMods: (instanceId: string) => Promise<InstalledMod[]>
  listContentCategories: (kind: ContentKind) => Promise<ContentCategory[]>
  removeInstalledMod: (instanceId: string, source: ModSource, modId: string) => Promise<void>
  setModEnabled: (
    instanceId: string,
    source: ModSource,
    modId: string,
    enabled: boolean
  ) => Promise<InstalledMod>
  getDownloadWatchStatus: () => Promise<DownloadWatchStatus>
  stopDownloadWatch: () => Promise<void>
  onDownloadWatchStatus: (handler: (status: DownloadWatchStatus) => void) => () => void
  onModAutoImported: (handler: (result: ModInstallResult) => void) => () => void
  listWorlds: (instanceId: string) => Promise<WorldEntry[]>
  createWorld: (instanceId: string, name: string) => Promise<WorldEntry>
  renameWorld: (instanceId: string, worldId: string, name: string) => Promise<WorldEntry>
  duplicateWorld: (instanceId: string, worldId: string, newName?: string) => Promise<WorldEntry>
  deleteWorld: (instanceId: string, worldId: string) => Promise<void>
  openWorldFolder: (instanceId: string, worldId: string) => Promise<void>
  /** Force Spire-enabled mods on in every save’s config.json. */
  applyModSetToSaves: (instanceId: string) => Promise<ApplyModSetResult>
  listServers: (instanceId: string) => Promise<ServerEntry[]>
  upsertServer: (
    instanceId: string,
    server: Partial<ServerEntry> & { name: string; address: string }
  ) => Promise<ServerEntry>
  deleteServer: (instanceId: string, serverId: string) => Promise<void>
  getInstanceRunLog: (instanceId: string, limit?: number) => Promise<string[]>
  clearInstanceRunLog: (instanceId: string) => Promise<void>
  checkForUpdate: () => Promise<UpdateCheckResult>
  openExternal: (url: string) => Promise<void>
  onNxmReceived: (handler: (nxmUrl: string) => void) => () => void
  /** Official Hytale account (OAuth device code → Hypixel hosts only). */
  getHytaleAuthStatus: () => Promise<HytaleAuthStatus>
  startHytaleLogin: () => Promise<HytaleDeviceLogin>
  cancelHytaleLogin: () => Promise<void>
  waitHytaleLogin: () => Promise<HytaleAuthStatus>
  signOutHytale: (accountId?: string | null) => Promise<HytaleAuthStatus>
  signOutAllHytale: () => Promise<HytaleAuthStatus>
  selectHytaleAccount: (accountId: string) => Promise<HytaleAuthStatus>
  selectHytaleProfile: (uuid: string) => Promise<HytaleAuthStatus>
  listHytaleChannels: () => Promise<HytaleChannelInfo[]>
  /**
   * Versions for one channel (current official tip + any locally cached builds).
   * Prefer this from Create Instance wizards — no public older-version catalog.
   */
  listGameVersions: (channel: HytalePatchline) => Promise<GameVersionInfo[]>
  /** Full Wharf client + JRE install for a channel (preferred). */
  downloadHytaleChannel: (channel: HytalePatchline) => Promise<HytaleDownloadResult>
  /** Force re-install client patches from build 0. */
  repairHytaleChannel: (channel: HytalePatchline) => Promise<HytaleDownloadResult>
  /** Optional game-assets zip (server/assets) — not required for play. */
  downloadHytaleAssetsZip: (channel: HytalePatchline) => Promise<HytaleDownloadResult>
  getInstanceRuntimeStatus: (instanceId: string) => Promise<InstanceRuntimeStatus>
  getHytaleDownloadProgress: () => Promise<HytaleDownloadProgress>
  openOfficialHytaleDownload: () => Promise<void>
  onHytaleDownloadProgress: (
    handler: (progress: HytaleDownloadProgress) => void
  ) => () => void
  getContentDownloadProgress: () => Promise<ContentDownloadProgress>
  onContentDownloadProgress: (
    handler: (progress: ContentDownloadProgress) => void
  ) => () => void
  onLogLine: (handler: (entry: SpireLogEntry) => void) => () => void
  onRunLog: (handler: (event: RunLogEvent) => void) => () => void
  onNavigate: (handler: (view: string) => void) => () => void
  onManageNavigate: (handler: (tab: string) => void) => () => void
  onSettingsChanged: (handler: (settings: SpireSettings) => void) => () => void
}

declare global {
  interface Window {
    spire: SpireApi
  }
}
