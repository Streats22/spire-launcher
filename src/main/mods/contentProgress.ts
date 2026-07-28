import { BrowserWindow } from 'electron'
import type { ContentDownloadProgress, ContentKind } from '../../shared/types'
import { logError, logInfo } from '../logging'

let progress: ContentDownloadProgress = {
  phase: 'idle',
  kind: null,
  name: null,
  bytesReceived: 0,
  bytesTotal: 0,
  message: ''
}

let lastEmitAt = 0

export function getContentDownloadProgress(): ContentDownloadProgress {
  return progress
}

export function emitContentProgress(next: Partial<ContentDownloadProgress>): void {
  progress = { ...progress, ...next }
  if (next.phase === 'error' && progress.message) {
    logError('content-download', progress.message)
  } else if (next.phase === 'done' && progress.message) {
    logInfo('content-download', progress.message)
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('spire:contentDownloadProgress', progress)
    }
  }
}

export function resetContentProgress(): void {
  lastEmitAt = 0
  emitContentProgress({
    phase: 'idle',
    kind: null,
    name: null,
    bytesReceived: 0,
    bytesTotal: 0,
    message: ''
  })
}

export function beginContentDownload(kind: ContentKind, name: string): void {
  lastEmitAt = 0
  emitContentProgress({
    phase: 'resolving',
    kind,
    name,
    bytesReceived: 0,
    bytesTotal: 0,
    message: `Preparing “${name}”…`
  })
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Throttled byte updates during an active download. */
export function emitContentBytes(received: number, total: number, label?: string): void {
  const now = Date.now()
  const force = total > 0 && received >= total
  if (!force && now - lastEmitAt < 80) return
  lastEmitAt = now
  const name = progress.name
  const detail =
    total > 0
      ? `${formatBytes(received)} / ${formatBytes(total)}`
      : formatBytes(received)
  emitContentProgress({
    phase: 'downloading',
    bytesReceived: received,
    bytesTotal: total,
    message: label || (name ? `Downloading “${name}”… ${detail}` : `Downloading… ${detail}`)
  })
}
