import { BrowserWindow } from 'electron'
import type { HytaleDownloadProgress, HytalePatchline } from '../../shared/types'
import { logError, logInfo } from '../logging'

let progress: HytaleDownloadProgress = {
  phase: 'idle',
  channel: null,
  version: null,
  bytesReceived: 0,
  bytesTotal: 0,
  message: '',
  installPath: null
}

export function getDownloadProgress(): HytaleDownloadProgress {
  return progress
}

export function emitProgress(next: Partial<HytaleDownloadProgress>): void {
  progress = { ...progress, ...next }
  if (next.phase === 'error' && progress.message) {
    logError('download', progress.message)
  } else if (next.phase === 'done' && progress.message) {
    logInfo('download', progress.message)
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('spire:hytaleDownloadProgress', progress)
    }
  }
}

export function resetProgress(channel: HytalePatchline | null = null): void {
  emitProgress({
    phase: 'idle',
    channel,
    version: null,
    bytesReceived: 0,
    bytesTotal: 0,
    message: '',
    installPath: null
  })
}
