import { BrowserWindow, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getLogsDir } from './logging'

let mainWindow: BrowserWindow | null = null
const manageWindows = new Map<string, BrowserWindow>()
const runWindows = new Map<string, BrowserWindow>()

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function resolveIconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),
    join(__dirname, '../../resources/icon.png')
  ]
  return candidates.find((p) => existsSync(p))
}

function loadRenderer(win: BrowserWindow, hash: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

function basePrefs(): Electron.BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false
  }
}

export function openManageWindow(instanceId: string, tab?: string): void {
  const existing = manageWindows.get(instanceId)
  const hashTab = tab && tab !== 'profile' ? `/${encodeURIComponent(tab)}` : ''
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    if (tab) {
      existing.webContents.send('spire:manageNavigate', { tab })
    }
    return
  }

  const win = new BrowserWindow({
    width: 1080,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: 'Manage instance — Spire',
    backgroundColor: '#1a1f1c',
    autoHideMenuBar: true,
    parent: mainWindow ?? undefined,
    modal: false,
    icon: resolveIconPath(),
    webPreferences: basePrefs()
  })

  manageWindows.set(instanceId, win)
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    manageWindows.delete(instanceId)
  })
  loadRenderer(win, `manage/${encodeURIComponent(instanceId)}${hashTab}`)
}

export function openRunWindow(instanceId: string, instanceName?: string): void {
  const existing = runWindows.get(instanceId)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    existing.webContents.send('spire:runSessionReset', { instanceId })
    return
  }

  const title = instanceName ? `Run — ${instanceName}` : 'Run — Spire'
  const win = new BrowserWindow({
    width: 780,
    height: 480,
    minWidth: 480,
    minHeight: 280,
    show: false,
    title,
    backgroundColor: '#0f1210',
    autoHideMenuBar: true,
    parent: mainWindow ?? undefined,
    modal: false,
    icon: resolveIconPath(),
    webPreferences: basePrefs()
  })

  runWindows.set(instanceId, win)
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    runWindows.delete(instanceId)
  })
  loadRenderer(win, `run/${encodeURIComponent(instanceId)}`)
}

export function broadcastRunLog(
  instanceId: string,
  payload: { line: string; stream: 'stdout' | 'stderr' | 'system'; at: string }
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('spire:runLog', { instanceId, ...payload })
    }
  }
}

export function focusMainView(view: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  mainWindow.webContents.send('spire:navigate', view)
}

export async function openLogsFolder(): Promise<void> {
  await shell.openPath(getLogsDir())
}
