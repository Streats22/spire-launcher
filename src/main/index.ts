import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  createInstance,
  deleteInstance,
  duplicateInstance,
  getInstancePath,
  listInstances,
  updateInstance
} from './instances'
import { getInstallStatus, launchInstance } from './launch'
import {
  getModDetails,
  getModFiles,
  importLocalModFile,
  installFromNxmLink,
  installMod,
  listInstalledMods,
  removeInstalledMod,
  searchMods
} from './mods/service'
import { getPlatform, getSpireRoot } from './paths'
import {
  clearLocalCredentials,
  getLocalDataInfo,
  loadSettings,
  updateSettings
} from './settings'
import { checkForUpdate } from './updates'
import {
  createWorld,
  deleteWorld,
  getWorldPath,
  listWorlds,
  renameWorld
} from './worlds'
import { deleteServer, listServers, upsertServer } from './servers'
import type {
  InstancePatch,
  ModSearchOptions,
  ModSource,
  ServerEntry,
  SpireSettings
} from '../shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  mainWindow = new BrowserWindow({
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

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
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
  ipcMain.handle('spire:getInstallStatus', () => getInstallStatus())
  ipcMain.handle('spire:getLocalDataInfo', () => getLocalDataInfo())
  ipcMain.handle('spire:openSpireDataFolder', async () => {
    await shell.openPath(getSpireRoot())
  })
  ipcMain.handle('spire:clearLocalCredentials', () => clearLocalCredentials())

  ipcMain.handle('spire:listInstances', () => listInstances())
  ipcMain.handle('spire:createInstance', (_e, name: string) => createInstance(name))
  ipcMain.handle('spire:updateInstance', (_e, id: string, patch: InstancePatch) =>
    updateInstance(id, patch)
  )
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
  ipcMain.handle('spire:getModDetails', (_e, source: ModSource, modId: string) =>
    getModDetails(source, modId)
  )
  ipcMain.handle('spire:getModFiles', (_e, source: ModSource, modId: string) =>
    getModFiles(source, modId)
  )
  ipcMain.handle(
    'spire:installMod',
    async (_e, instanceId: string, source: ModSource, modId: string, fileId?: string) => {
      const result = await installMod(instanceId, source, modId, fileId)
      if (result.needsManualNxm && result.pageUrl) {
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
  ipcMain.handle(
    'spire:removeInstalledMod',
    (_e, instanceId: string, source: ModSource, modId: string) => {
      removeInstalledMod(instanceId, source, modId)
    }
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
  ipcMain.handle('spire:deleteWorld', (_e, instanceId: string, worldId: string) => {
    deleteWorld(instanceId, worldId)
  })
  ipcMain.handle('spire:openWorldFolder', async (_e, instanceId: string, worldId: string) => {
    await shell.openPath(getWorldPath(instanceId, worldId))
  })
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

  ipcMain.handle('spire:checkForUpdate', () => checkForUpdate())
  ipcMain.handle('spire:openExternal', async (_e, url: string) => {
    await shell.openExternal(url)
  })
}

function emitNxm(url: string): void {
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
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('dev.spire.launcher')
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
