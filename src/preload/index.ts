import { contextBridge, ipcRenderer } from 'electron'
import type {
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
  clearLocalCredentials: () => ipcRenderer.invoke('spire:clearLocalCredentials'),
  listInstances: () => ipcRenderer.invoke('spire:listInstances'),
  createInstance: (name) => ipcRenderer.invoke('spire:createInstance', name),
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
  installMod: (instanceId, source, modId, fileId) =>
    ipcRenderer.invoke('spire:installMod', instanceId, source, modId, fileId),
  installFromNxm: (instanceId, nxmUrl) =>
    ipcRenderer.invoke('spire:installFromNxm', instanceId, nxmUrl),
  importLocalMod: (instanceId) => ipcRenderer.invoke('spire:importLocalMod', instanceId),
  listInstalledMods: (instanceId) => ipcRenderer.invoke('spire:listInstalledMods', instanceId),
  removeInstalledMod: (instanceId, source, modId) =>
    ipcRenderer.invoke('spire:removeInstalledMod', instanceId, source, modId),
  listWorlds: (instanceId) => ipcRenderer.invoke('spire:listWorlds', instanceId),
  createWorld: (instanceId, name) => ipcRenderer.invoke('spire:createWorld', instanceId, name),
  renameWorld: (instanceId, worldId, name) =>
    ipcRenderer.invoke('spire:renameWorld', instanceId, worldId, name),
  deleteWorld: (instanceId, worldId) =>
    ipcRenderer.invoke('spire:deleteWorld', instanceId, worldId),
  openWorldFolder: (instanceId, worldId) =>
    ipcRenderer.invoke('spire:openWorldFolder', instanceId, worldId),
  listServers: (instanceId) => ipcRenderer.invoke('spire:listServers', instanceId),
  upsertServer: (instanceId, server: Partial<ServerEntry> & { name: string; address: string }) =>
    ipcRenderer.invoke('spire:upsertServer', instanceId, server),
  deleteServer: (instanceId, serverId) =>
    ipcRenderer.invoke('spire:deleteServer', instanceId, serverId),
  checkForUpdate: () => ipcRenderer.invoke('spire:checkForUpdate'),
  openExternal: (url) => ipcRenderer.invoke('spire:openExternal', url),
  onNxmReceived: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, url: string): void => {
      handler(url)
    }
    ipcRenderer.on('spire:nxm', listener)
    return () => ipcRenderer.removeListener('spire:nxm', listener)
  }
}

contextBridge.exposeInMainWorld('spire', api)
