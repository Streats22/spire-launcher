import { copyFileSync, existsSync, readdirSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { app, BrowserWindow } from 'electron'
import type { ModInstallResult, ModSource } from '../../shared/types'
import { modsDir, upsertInstalledMod } from './manifest'

const ARCHIVE_EXT = new Set(['.zip', '.jar', '.7z', '.rar', '.pak'])

export interface DownloadWatchStatus {
  active: boolean
  instanceId: string | null
  source: ModSource | null
  modId: string | null
  modName: string | null
  message: string
  startedAt: number | null
}

interface WatchSession {
  instanceId: string
  source: ModSource
  modId: string
  modName: string
  fileNameHint: string | null
  startedAt: number
  seenAtStart: Map<string, number>
  timer: ReturnType<typeof setInterval>
  timeout: ReturnType<typeof setTimeout>
}

let session: WatchSession | null = null
let status: DownloadWatchStatus = {
  active: false,
  instanceId: null,
  source: null,
  modId: null,
  modName: null,
  message: '',
  startedAt: null
}

function emitStatus(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('spire:downloadWatchStatus', status)
    }
  }
}

function emitImported(result: ModInstallResult): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('spire:modAutoImported', result)
    }
  }
}

function setStatus(patch: Partial<DownloadWatchStatus>): void {
  status = { ...status, ...patch }
  emitStatus()
}

function downloadsDir(): string {
  return app.getPath('downloads')
}

function snapshotArchives(dir: string): Map<string, number> {
  const map = new Map<string, number>()
  if (!existsSync(dir)) return map
  try {
    for (const name of readdirSync(dir)) {
      const ext = extname(name).toLowerCase()
      if (!ARCHIVE_EXT.has(ext)) continue
      if (name.startsWith('.') || name.endsWith('.part') || name.endsWith('.crdownload')) continue
      try {
        const st = statSync(join(dir, name))
        if (!st.isFile() || st.size < 64) continue
        map.set(name, st.size)
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return map
}

function scoreCandidate(name: string, hint: string | null, modName: string): number {
  const lower = name.toLowerCase()
  let score = 0
  if (hint) {
    const h = hint.toLowerCase()
    if (lower === h) score += 100
    if (lower.includes(basename(h, extname(h)).toLowerCase())) score += 40
  }
  const tokens = modName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
  for (const t of tokens) {
    if (lower.includes(t)) score += 8
  }
  // Prefer archives that appeared recently over random old downloads
  return score
}

function importArchive(
  instanceId: string,
  source: ModSource,
  modId: string,
  modName: string,
  sourcePath: string
): ModInstallResult {
  const fileName = basename(sourcePath).replace(/[\\/:*?"<>|]/g, '_')
  const dest = join(modsDir(instanceId), fileName)
  copyFileSync(sourcePath, dest)

  const installed = upsertInstalledMod(instanceId, {
    source,
    modId,
    fileId: 'watched',
    name: modName || fileName.replace(/\.(zip|jar|7z|rar|pak)$/i, ''),
    fileName,
    installedAt: new Date().toISOString(),
    pageUrl: ''
  })

  return {
    ok: true,
    message: `Auto-imported “${fileName}” from Downloads`,
    installed
  }
}

export function getDownloadWatchStatus(): DownloadWatchStatus {
  return status
}

export function stopDownloadWatch(message = 'Stopped watching Downloads.'): void {
  if (session) {
    clearInterval(session.timer)
    clearTimeout(session.timeout)
    session = null
  }
  setStatus({
    active: false,
    instanceId: null,
    source: null,
    modId: null,
    modName: null,
    message,
    startedAt: null
  })
}

/**
 * After opening Nexus/CF Slow download in the browser, watch ~/Downloads for a
 * finished archive and copy it into the instance mods folder automatically.
 * Cannot skip Nexus’s browser wait — only the hand-off after download completes.
 */
export function startDownloadWatch(opts: {
  instanceId: string
  source: ModSource
  modId: string
  modName: string
  fileNameHint?: string | null
  timeoutMs?: number
}): DownloadWatchStatus {
  stopDownloadWatch('')

  const dir = downloadsDir()
  const startedAt = Date.now()
  const seenAtStart = snapshotArchives(dir)
  // Stable-size tracking for new files
  const pending = new Map<string, { size: number; stable: number }>()

  const timer = setInterval(() => {
    const now = snapshotArchives(dir)
    let best: { name: string; score: number } | null = null

    for (const [name, size] of now) {
      const was = seenAtStart.get(name)
      // New file, or existing file that grew (re-download)
      if (was === undefined || size > was) {
        const prev = pending.get(name)
        if (!prev || prev.size !== size) {
          pending.set(name, { size, stable: 1 })
        } else {
          pending.set(name, { size, stable: prev.stable + 1 })
        }
        const entry = pending.get(name)!
        // ~3s stable (1.5s poll × 2)
        if (entry.stable >= 2) {
          const score = scoreCandidate(name, opts.fileNameHint ?? null, opts.modName)
          if (!best || score > best.score) best = { name, score }
        }
      }
    }

    if (!best) return
    // If we have a name hint, require some match; otherwise take newest-looking archive
    if (opts.fileNameHint && best.score < 20 && opts.modName.length > 2 && best.score < 8) {
      // still allow if only one new archive appeared
      const newOnes = [...now.keys()].filter((n) => {
        const was = seenAtStart.get(n)
        return was === undefined || (now.get(n) ?? 0) > was
      })
      if (newOnes.length !== 1) return
    }

    const path = join(dir, best.name)
    try {
      const result = importArchive(
        opts.instanceId,
        opts.source,
        opts.modId,
        opts.modName,
        path
      )
      stopDownloadWatch(result.message)
      emitImported(result)
    } catch (err) {
      setStatus({
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }, 1500)

  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000
  const timeout = setTimeout(() => {
    stopDownloadWatch('Stopped watching Downloads (timed out). Import file manually if needed.')
  }, timeoutMs)

  session = {
    instanceId: opts.instanceId,
    source: opts.source,
    modId: opts.modId,
    modName: opts.modName,
    fileNameHint: opts.fileNameHint ?? null,
    startedAt,
    seenAtStart,
    timer,
    timeout
  }

  setStatus({
    active: true,
    instanceId: opts.instanceId,
    source: opts.source,
    modId: opts.modId,
    modName: opts.modName,
    startedAt,
    message: `Watching Downloads for “${opts.modName}” — finish Slow download in the browser; Spire will import it automatically.`
  })

  return status
}
