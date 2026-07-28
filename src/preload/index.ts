import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateInstanceOptions,
  HytaleDownloadProgress,
  HytalePatchline,
  InstancePatch,
  ModSearchOptions,
  ModSource,
  ServerEntry,
  SpireApi,
  SpireSettings
} from '../shared/types'

const api: SpireApi = {
  getPlatform: () => ipcRenderer.invoke('spire:getPlatform'),
  getAppVersion: () => ipcRenderer.invoke('spire:getAppVersion'),
  getSettings: () => ipcRenderer.invoke('spire:getSettings'),
  updateSettings: (patch: Partial<SpireSettings>) =>
    ipcRenderer.invoke('spire:updateSettings', patch),
  setGameInstallPath: (path) => ipcRenderer.invoke('spire:setGameInstallPath', path),
  pickGameInstallPath: () => ipcRenderer.invoke('spire:pickGameInstallPath'),
  getInstallStatus: () => ipcRenderer.invoke('spire:getInstallStatus'),
  getLocalDataInfo: () => ipcRenderer.invoke('spire:getLocalDataInfo'),
  openSpireDataFolder: () => ipcRenderer.invoke('spire:openSpireDataFolder'),
  openLogsFolder: () => ipcRenderer.invoke('spire:openLogsFolder'),
  getRecentLogs: (limit) => ipcRenderer.invoke('spire:getRecentLogs', limit),
  openManageWindow: (instanceId, tab) =>
    ipcRenderer.invoke('spire:openManageWindow', instanceId, tab),
  openRunWindow: (instanceId) => ipcRenderer.invoke('spire:openRunWindow', instanceId),
  focusMainView: (view) => ipcRenderer.invoke('spire:focusMainView', view),
  clearLocalCredentials: () => ipcRenderer.invoke('spire:clearLocalCredentials'),
  listInstances: () => ipcRenderer.invoke('spire:listInstances'),
  createInstance: (options: CreateInstanceOptions | string) =>
    ipcRenderer.invoke('spire:createInstance', options),
  updateInstance: (id, patch: InstancePatch) =>
    ipcRenderer.invoke('spire:updateInstance', id, patch),
  duplicateInstance: (id, newName) =>
    ipcRenderer.invoke('spire:duplicateInstance', id, newName),
  deleteInstance: (id) => ipcRenderer.invoke('spire:deleteInstance', id),
  setActiveInstance: (id) => ipcRenderer.invoke('spire:setActiveInstance', id),
  openInstanceFolder: (id) => ipcRenderer.invoke('spire:openInstanceFolder', id),
  launchInstance: (id) => ipcRenderer.invoke('spire:launchInstance', id),
  searchMods: (source, options?: ModSearchOptions) =>
    ipcRenderer.invoke('spire:searchMods', source, options ?? {}),
  getModDetails: (source, modId) => ipcRenderer.invoke('spire:getModDetails', source, modId),
  getModFiles: (source, modId) => ipcRenderer.invoke('spire:getModFiles', source, modId),
  installMod: (instanceId, source, modId, fileId, mode, modName, kind) =>
    ipcRenderer.invoke(
      'spire:installMod',
      instanceId,
      source,
      modId,
      fileId,
      mode,
      modName,
      kind
    ),
  installFromNxm: (instanceId, nxmUrl) =>
    ipcRenderer.invoke('spire:installFromNxm', instanceId, nxmUrl),
  importLocalMod: (instanceId) => ipcRenderer.invoke('spire:importLocalMod', instanceId),
  listInstalledMods: (instanceId) => ipcRenderer.invoke('spire:listInstalledMods', instanceId),
  listContentCategories: (kind) => ipcRenderer.invoke('spire:listContentCategories', kind),
  removeInstalledMod: (instanceId, source, modId) =>
    ipcRenderer.invoke('spire:removeInstalledMod', instanceId, source, modId),
  setModEnabled: (instanceId, source, modId, enabled) =>
    ipcRenderer.invoke('spire:setModEnabled', instanceId, source, modId, enabled),
  getDownloadWatchStatus: () => ipcRenderer.invoke('spire:getDownloadWatchStatus'),
  stopDownloadWatch: () => ipcRenderer.invoke('spire:stopDownloadWatch'),
  onDownloadWatchStatus: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: import('../shared/types').DownloadWatchStatus
    ): void => {
      handler(status)
    }
    ipcRenderer.on('spire:downloadWatchStatus', listener)
    return () => ipcRenderer.removeListener('spire:downloadWatchStatus', listener)
  },
  onModAutoImported: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      result: import('../shared/types').ModInstallResult
    ): void => {
      handler(result)
    }
    ipcRenderer.on('spire:modAutoImported', listener)
    return () => ipcRenderer.removeListener('spire:modAutoImported', listener)
  },
  listWorlds: (instanceId) => ipcRenderer.invoke('spire:listWorlds', instanceId),
  createWorld: (instanceId, name) => ipcRenderer.invoke('spire:createWorld', instanceId, name),
  renameWorld: (instanceId, worldId, name) =>
    ipcRenderer.invoke('spire:renameWorld', instanceId, worldId, name),
  duplicateWorld: (instanceId, worldId, newName) =>
    ipcRenderer.invoke('spire:duplicateWorld', instanceId, worldId, newName),
  deleteWorld: (instanceId, worldId) =>
    ipcRenderer.invoke('spire:deleteWorld', instanceId, worldId),
  openWorldFolder: (instanceId, worldId) =>
    ipcRenderer.invoke('spire:openWorldFolder', instanceId, worldId),
  listServers: (instanceId) => ipcRenderer.invoke('spire:listServers', instanceId),
  upsertServer: (instanceId, server: Partial<ServerEntry> & { name: string; address: string }) =>
    ipcRenderer.invoke('spire:upsertServer', instanceId, server),
  deleteServer: (instanceId, serverId) =>
    ipcRenderer.invoke('spire:deleteServer', instanceId, serverId),
  getInstanceRunLog: (instanceId, limit) =>
    ipcRenderer.invoke('spire:getInstanceRunLog', instanceId, limit),
  clearInstanceRunLog: (instanceId) =>
    ipcRenderer.invoke('spire:clearInstanceRunLog', instanceId),
  checkForUpdate: () => ipcRenderer.invoke('spire:checkForUpdate'),
  openExternal: (url) => ipcRenderer.invoke('spire:openExternal', url),
  onNxmReceived: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, url: string): void => {
      handler(url)
    }
    ipcRenderer.on('spire:nxm', listener)
    return () => ipcRenderer.removeListener('spire:nxm', listener)
  },
  getHytaleAuthStatus: () => ipcRenderer.invoke('spire:getHytaleAuthStatus'),
  startHytaleLogin: () => ipcRenderer.invoke('spire:startHytaleLogin'),
  cancelHytaleLogin: () => ipcRenderer.invoke('spire:cancelHytaleLogin'),
  waitHytaleLogin: () => ipcRenderer.invoke('spire:waitHytaleLogin'),
  signOutHytale: (accountId) => ipcRenderer.invoke('spire:signOutHytale', accountId),
  signOutAllHytale: () => ipcRenderer.invoke('spire:signOutAllHytale'),
  selectHytaleAccount: (accountId) => ipcRenderer.invoke('spire:selectHytaleAccount', accountId),
  selectHytaleProfile: (uuid) => ipcRenderer.invoke('spire:selectHytaleProfile', uuid),
  listHytaleChannels: () => ipcRenderer.invoke('spire:listHytaleChannels'),
  listGameVersions: (channel: HytalePatchline) =>
    ipcRenderer.invoke('spire:listGameVersions', channel),
  downloadHytaleChannel: (channel: HytalePatchline) =>
    ipcRenderer.invoke('spire:downloadHytaleChannel', channel),
  repairHytaleChannel: (channel: HytalePatchline) =>
    ipcRenderer.invoke('spire:repairHytaleChannel', channel),
  downloadHytaleAssetsZip: (channel: HytalePatchline) =>
    ipcRenderer.invoke('spire:downloadHytaleAssetsZip', channel),
  getInstanceRuntimeStatus: (instanceId) =>
    ipcRenderer.invoke('spire:getInstanceRuntimeStatus', instanceId),
  getHytaleDownloadProgress: () => ipcRenderer.invoke('spire:getHytaleDownloadProgress'),
  openOfficialHytaleDownload: () => ipcRenderer.invoke('spire:openOfficialHytaleDownload'),
  onHytaleDownloadProgress: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: HytaleDownloadProgress
    ): void => {
      handler(progress)
    }
    ipcRenderer.on('spire:hytaleDownloadProgress', listener)
    return () => ipcRenderer.removeListener('spire:hytaleDownloadProgress', listener)
  },
  onLogLine: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      entry: import('../shared/types').SpireLogEntry
    ): void => {
      handler(entry)
    }
    ipcRenderer.on('spire:logLine', listener)
    return () => ipcRenderer.removeListener('spire:logLine', listener)
  },
  onRunLog: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      event: import('../shared/types').RunLogEvent
    ): void => {
      handler(event)
    }
    ipcRenderer.on('spire:runLog', listener)
    return () => ipcRenderer.removeListener('spire:runLog', listener)
  },
  onNavigate: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, view: string): void => {
      handler(view)
    }
    ipcRenderer.on('spire:navigate', listener)
    return () => ipcRenderer.removeListener('spire:navigate', listener)
  },
  onManageNavigate: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { tab?: string }
    ): void => {
      if (payload?.tab) handler(payload.tab)
    }
    ipcRenderer.on('spire:manageNavigate', listener)
    return () => ipcRenderer.removeListener('spire:manageNavigate', listener)
  },
  onSettingsChanged: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      settings: SpireSettings
    ): void => {
      handler(settings)
    }
    ipcRenderer.on('spire:settingsChanged', listener)
    return () => ipcRenderer.removeListener('spire:settingsChanged', listener)
  }
}

contextBridge.exposeInMainWorld('spire', api)
