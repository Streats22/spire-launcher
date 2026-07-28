import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  cancelLogin,
  getAuthStatus,
  selectAccount,
  selectProfile,
  signOut,
  signOutAll,
  startLogin,
  waitForLogin
} from './auth/account'
import { OFFICIAL_DOWNLOAD_PAGE } from './auth/constants'
import { downloadAssetsZip, downloadChannel, getDownloadProgress, listChannels, listGameVersions, repairChannel } from './game/assets'
import { getInstanceRuntimeStatus } from './instanceStatus'
import {
  createInstance,
  createInstanceGroup,
  deleteInstance,
  deleteInstanceGroup,
  duplicateInstance,
  getInstancePath,
  listInstances,
  organizeInstances,
  renameInstanceGroup,
  reorderInstanceGroups,
  updateInstance
} from './instances'
import { getInstallStatus, launchInstance } from './launch'
import { logError, readPersistedLogs, readInstanceRunLog, clearRunLog } from './logging'
import {
  getModDetails,
  getModFiles,
  importLocalModFile,
  installFromNxmLink,
  installMod,
  listContentCategories,
  listInstalledMods,
  removeInstalledMod,
  searchMods
} from './mods/service'
import { setModEnabled } from './mods/manifest'
import {
  getDownloadWatchStatus,
  stopDownloadWatch
} from './mods/downloadWatch'
import {
  getContentDownloadProgress
} from './mods/contentProgress'
import { getPlatform, getSpireRoot } from './paths'
import {
  clearLocalCredentials,
  detectAndApplyGameInstall,
  getLocalDataInfo,
  loadSettings,
  updateSettings
} from './settings'
import { checkForUpdate } from './updates'
import {
  applyModSetToSaves,
  createWorld,
  deleteWorld,
  duplicateWorld,
  getWorldPath,
  listWorlds,
  renameWorld
} from './worlds'
import { deleteServer, listServers, upsertServer } from './servers'
import {
  focusMainView,
  getMainWindow,
  openLogsFolder,
  openManageWindow,
  openRunWindow,
  setMainWindow
} from './windows'
import type {
  CreateInstanceOptions,
  HytalePatchline,
  InstanceOrganizationItem,
  InstancePatch,
  ModSearchOptions,
  ModSource,
  ServerEntry,
  SpireSettings
} from '../shared/types'

// Must run before ready so menus / About / process name pick up Spire.
// macOS Dock hover still needs CFBundleName on the running .app — see
// scripts/patch-dev-electron-name.mjs (wired into `npm run dev`).
app.setName('Spire')
if (process.platform === 'darwin') {
  app.setAboutPanelOptions({ applicationName: 'Spire' })
}
if (process.platform === 'linux') {
  // Helps some WMs show Spire instead of electron in taskbars.
  app.commandLine.appendSwitch('class', 'Spire')
}

function resolveAppIconPath(): string {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),
    join(__dirname, '../../resources/icon.png'),
    join(app.getAppPath(), 'resources/icon.png')
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[1]
}

/** Dock needs transparent padding; prefer the dock-optimized asset when present. */
function resolveDockIconPath(): string {
  const candidates = [
    join(process.resourcesPath, 'icon-dock.png'),
    join(__dirname, '../../resources/icon-dock.png'),
    join(app.getAppPath(), 'resources/icon-dock.png'),
    resolveAppIconPath()
  ]
  return candidates.find((p) => existsSync(p)) ?? resolveAppIconPath()
}

function applyAppIcon(): string {
  const iconPath = resolveAppIconPath()
  if (process.platform === 'darwin' && app.dock) {
    const dockPath = resolveDockIconPath()
    if (existsSync(dockPath)) {
      const image = nativeImage.createFromPath(dockPath)
      // Keep a sensible dock size so Electron doesn’t stretch a huge bitmap oddly.
      const sized = image.getSize().width > 256 ? image.resize({ width: 256, height: 256 }) : image
      app.dock.setIcon(sized)
    }
  }
  return iconPath
}

function createWindow(): void {
  const iconPath = applyAppIcon()
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 600,
    show: false,
    title: 'Spire',
    backgroundColor: '#2b2b2b',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    setMainWindow(null)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('spire:getPlatform', () => getPlatform())
  ipcMain.handle('spire:getAppVersion', () => app.getVersion())
  ipcMain.handle('spire:getSettings', () => loadSettings())
  ipcMain.handle('spire:updateSettings', (_e, patch: Partial<SpireSettings>) =>
    updateSettings(patch)
  )
  ipcMain.handle('spire:setGameInstallPath', (_e, path: string) =>
    updateSettings({ gameInstallPath: path })
  )
  ipcMain.handle('spire:pickGameInstallPath', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select official Hytale install folder',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })
  ipcMain.handle('spire:detectGameInstall', () => {
    const result = detectAndApplyGameInstall(true)
    return {
      applied: result.applied,
      path: result.path,
      found: result.detections.map((d) => ({
        path: d.path,
        label: d.label,
        clientPath: d.clientPath,
        javaPath: d.javaPath
      })),
      settings: result.settings
    }
  })
  ipcMain.handle('spire:getInstallStatus', () => getInstallStatus())
  ipcMain.handle('spire:getLocalDataInfo', () => getLocalDataInfo())
  ipcMain.handle('spire:openSpireDataFolder', async () => {
    await shell.openPath(getSpireRoot())
  })
  ipcMain.handle('spire:openLogsFolder', () => openLogsFolder())
  ipcMain.handle('spire:getRecentLogs', (_e, limit?: number) => readPersistedLogs(limit ?? 200))
  ipcMain.handle('spire:openManageWindow', (_e, instanceId: string, tab?: string) => {
    openManageWindow(instanceId, tab)
  })
  ipcMain.handle('spire:openRunWindow', (_e, instanceId: string) => {
    openRunWindow(instanceId)
  })
  ipcMain.handle('spire:focusMainView', (_e, view: string) => {
    focusMainView(view)
  })
  ipcMain.handle('spire:clearLocalCredentials', () => clearLocalCredentials())

  ipcMain.handle('spire:listInstances', () => listInstances())
  ipcMain.handle('spire:createInstance', (_e, options: CreateInstanceOptions | string) =>
    createInstance(options)
  )
  ipcMain.handle('spire:updateInstance', (_e, id: string, patch: InstancePatch) =>
    updateInstance(id, patch)
  )
  ipcMain.handle('spire:organizeInstances', (_e, items: InstanceOrganizationItem[]) =>
    organizeInstances(items)
  )
  ipcMain.handle('spire:createInstanceGroup', (_e, name: string) => createInstanceGroup(name))
  ipcMain.handle('spire:renameInstanceGroup', (_e, id: string, name: string) =>
    renameInstanceGroup(id, name)
  )
  ipcMain.handle('spire:deleteInstanceGroup', (_e, id: string) => deleteInstanceGroup(id))
  ipcMain.handle('spire:reorderInstanceGroups', (_e, ids: string[]) => reorderInstanceGroups(ids))
  ipcMain.handle('spire:duplicateInstance', (_e, id: string, newName?: string) =>
    duplicateInstance(id, newName)
  )
  ipcMain.handle('spire:deleteInstance', (_e, id: string) => {
    deleteInstance(id)
  })
  ipcMain.handle('spire:setActiveInstance', (_e, id: string) =>
    updateSettings({ activeInstanceId: id })
  )
  ipcMain.handle('spire:openInstanceFolder', async (_e, id: string) => {
    await shell.openPath(getInstancePath(id))
  })
  ipcMain.handle('spire:launchInstance', (_e, id: string) => launchInstance(id))

  ipcMain.handle('spire:searchMods', (_e, source: ModSource, options: ModSearchOptions = {}) =>
    searchMods(source, options)
  )
  ipcMain.handle(
    'spire:listContentCategories',
    (_e, kind: import('../shared/types').ContentKind) => listContentCategories(kind)
  )
  ipcMain.handle('spire:getModDetails', (_e, source: ModSource, modId: string) =>
    getModDetails(source, modId)
  )
  ipcMain.handle('spire:getModFiles', (_e, source: ModSource, modId: string) =>
    getModFiles(source, modId)
  )
  ipcMain.handle(
    'spire:installMod',
    async (
      _e,
      instanceId: string,
      source: ModSource,
      modId: string,
      fileId?: string,
      mode?: 'slow' | 'quick',
      modName?: string,
      kind?: import('../shared/types').ContentKind
    ) => {
      const result = await installMod(
        instanceId,
        source,
        modId,
        fileId,
        mode ?? 'slow',
        modName,
        kind ?? 'mods'
      )
      if ((result.needsManualDownload || result.needsManualNxm) && result.pageUrl) {
        await shell.openExternal(result.pageUrl)
      }
      return result
    }
  )
  ipcMain.handle('spire:installFromNxm', (_e, instanceId: string, nxmUrl: string) =>
    installFromNxmLink(instanceId, nxmUrl)
  )
  ipcMain.handle('spire:importLocalMod', async (_e, instanceId: string) => {
    const result = await dialog.showOpenDialog({
      title: 'Import mod file',
      properties: ['openFile'],
      filters: [
        { name: 'Mods', extensions: ['zip', 'jar', '7z', 'rar'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return importLocalModFile(instanceId, result.filePaths[0])
  })
  ipcMain.handle('spire:listInstalledMods', (_e, instanceId: string) =>
    listInstalledMods(instanceId)
  )
  ipcMain.handle('spire:getDownloadWatchStatus', () => getDownloadWatchStatus())
  ipcMain.handle('spire:stopDownloadWatch', () => {
    stopDownloadWatch('Stopped watching Downloads.')
  })
  ipcMain.handle(
    'spire:removeInstalledMod',
    (_e, instanceId: string, source: ModSource, modId: string) => {
      removeInstalledMod(instanceId, source, modId)
    }
  )
  ipcMain.handle(
    'spire:setModEnabled',
    (_e, instanceId: string, source: ModSource, modId: string, enabled: boolean) =>
      setModEnabled(instanceId, source, modId, enabled)
  )

  ipcMain.handle('spire:listWorlds', (_e, instanceId: string) => listWorlds(instanceId))
  ipcMain.handle('spire:createWorld', (_e, instanceId: string, name: string) =>
    createWorld(instanceId, name)
  )
  ipcMain.handle(
    'spire:renameWorld',
    (_e, instanceId: string, worldId: string, name: string) =>
      renameWorld(instanceId, worldId, name)
  )
  ipcMain.handle(
    'spire:duplicateWorld',
    (_e, instanceId: string, worldId: string, newName?: string) =>
      duplicateWorld(instanceId, worldId, newName)
  )
  ipcMain.handle('spire:deleteWorld', (_e, instanceId: string, worldId: string) => {
    deleteWorld(instanceId, worldId)
  })
  ipcMain.handle('spire:openWorldFolder', async (_e, instanceId: string, worldId: string) => {
    await shell.openPath(getWorldPath(instanceId, worldId))
  })
  ipcMain.handle('spire:applyModSetToSaves', (_e, instanceId: string) =>
    applyModSetToSaves(instanceId)
  )
  ipcMain.handle('spire:listServers', (_e, instanceId: string) => listServers(instanceId))
  ipcMain.handle(
    'spire:upsertServer',
    (
      _e,
      instanceId: string,
      server: Partial<ServerEntry> & { name: string; address: string }
    ) => upsertServer(instanceId, server)
  )
  ipcMain.handle('spire:deleteServer', (_e, instanceId: string, serverId: string) => {
    deleteServer(instanceId, serverId)
  })
  ipcMain.handle('spire:getInstanceRunLog', (_e, instanceId: string, limit?: number) =>
    readInstanceRunLog(instanceId, limit ?? 500)
  )
  ipcMain.handle('spire:clearInstanceRunLog', (_e, instanceId: string) => {
    clearRunLog(instanceId)
  })

  ipcMain.handle('spire:checkForUpdate', () => checkForUpdate())
  ipcMain.handle('spire:openExternal', async (_e, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('spire:getHytaleAuthStatus', () => getAuthStatus())
  ipcMain.handle('spire:startHytaleLogin', () => startLogin())
  ipcMain.handle('spire:cancelHytaleLogin', () => {
    cancelLogin()
  })
  ipcMain.handle('spire:waitHytaleLogin', () => waitForLogin())
  ipcMain.handle('spire:signOutHytale', (_e, accountId?: string | null) => signOut(accountId))
  ipcMain.handle('spire:signOutAllHytale', () => signOutAll())
  ipcMain.handle('spire:selectHytaleAccount', (_e, accountId: string) => selectAccount(accountId))
  ipcMain.handle('spire:selectHytaleProfile', (_e, uuid: string) => selectProfile(uuid))
  ipcMain.handle('spire:listHytaleChannels', () => listChannels())
  ipcMain.handle('spire:listGameVersions', (_e, channel: HytalePatchline) =>
    listGameVersions(channel)
  )
  ipcMain.handle('spire:downloadHytaleChannel', async (_e, channel: HytalePatchline) => {
    const result = await downloadChannel(channel)
    if (!result.ok) logError('download', result.message)
    return result
  })
  ipcMain.handle('spire:repairHytaleChannel', async (_e, channel: HytalePatchline) => {
    const result = await repairChannel(channel)
    if (!result.ok) logError('download', result.message)
    return result
  })
  ipcMain.handle('spire:downloadHytaleAssetsZip', async (_e, channel: HytalePatchline) => {
    const result = await downloadAssetsZip(channel)
    if (!result.ok) logError('download', result.message)
    return result
  })
  ipcMain.handle('spire:getInstanceRuntimeStatus', (_e, instanceId: string) =>
    getInstanceRuntimeStatus(instanceId)
  )
  ipcMain.handle('spire:getHytaleDownloadProgress', () => getDownloadProgress())
  ipcMain.handle('spire:getContentDownloadProgress', () => getContentDownloadProgress())
  ipcMain.handle('spire:openOfficialHytaleDownload', async () => {
    await shell.openExternal(OFFICIAL_DOWNLOAD_PAGE)
  })
}

function emitNxm(url: string): void {
  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('spire:nxm', url)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

function registerNxmProtocol(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('nxm', process.execPath, [join(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient('nxm')
  }

  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (url.startsWith('nxm://')) emitNxm(url)
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const nxm = argv.find((a) => typeof a === 'string' && a.startsWith('nxm://'))
    if (nxm) emitNxm(nxm)
    const mainWindow = getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // Toolkit's helper uses process.execPath as the id while unpackaged, which
    // makes the Windows taskbar hover say "Electron". Force Spire afterwards.
    electronApp.setAppUserModelId('dev.spire.launcher')
    app.setAppUserModelId('dev.spire.launcher')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerNxmProtocol()
    registerIpc()
    createWindow()

    // Cold-start nxm link (Windows/Linux)
    const nxmArg = process.argv.find((a) => a.startsWith('nxm://'))
    if (nxmArg) {
      setTimeout(() => emitNxm(nxmArg), 500)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
