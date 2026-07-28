import { existsSync, readdirSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { app, BrowserWindow } from 'electron'
import type { ContentKind, ModInstallResult, ModSource } from '../../shared/types'
import { errorMessage } from '../../shared/errors'
import { normalizeContentKind } from './contentKinds'
import { installLocalContent } from './installContent'

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
  kind: ContentKind
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
  return score
}

async function importArchive(
  instanceId: string,
  source: ModSource,
  modId: string,
  modName: string,
  sourcePath: string,
  kind: ContentKind
): Promise<ModInstallResult> {
  const fileName = basename(sourcePath).replace(/[\\/:*?"<>|]/g, '_')
  try {
    const installed = await installLocalContent({
      instanceId,
      kind,
      source,
      modId,
      fileId: 'watched',
      name: modName || fileName.replace(/\.(zip|jar|7z|rar|pak)$/i, ''),
      pageUrl: '',
      localPath: sourcePath,
      fileName
    })
    return {
      ok: true,
      message: `Auto-imported “${fileName}” from Downloads`,
      installed
    }
  } catch (err) {
    return {
      ok: false,
      message: `Auto-import failed: ${errorMessage(err)}`
    }
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
 * finished archive and import it into the correct folder for `kind`.
 */
export function startDownloadWatch(opts: {
  instanceId: string
  source: ModSource
  modId: string
  modName: string
  fileNameHint?: string | null
  kind?: ContentKind
  timeoutMs?: number
}): DownloadWatchStatus {
  stopDownloadWatch('')

  const dir = downloadsDir()
  const kind = normalizeContentKind(opts.kind)
  const startedAt = Date.now()
  const seenAtStart = snapshotArchives(dir)
  const pending = new Map<string, { size: number; stable: number }>()

  const timer = setInterval(() => {
    if (!session) return
    const now = snapshotArchives(dir)
    let best: { name: string; score: number } | null = null

    for (const [name, size] of now) {
      const was = seenAtStart.get(name)
      if (was === undefined || size > was) {
        const prev = pending.get(name)
        if (!prev || prev.size !== size) {
          pending.set(name, { size, stable: 1 })
        } else {
          pending.set(name, { size, stable: prev.stable + 1 })
        }
        const entry = pending.get(name)!
        if (entry.stable >= 2) {
          const score = scoreCandidate(name, session.fileNameHint, session.modName)
          if (!best || score > best.score) best = { name, score }
        }
      }
    }

    if (!best) return
    if (
      session.fileNameHint &&
      best.score < 20 &&
      session.modName.length > 2 &&
      best.score < 8
    ) {
      const newOnes = [...now.keys()].filter((n) => {
        const was = seenAtStart.get(n)
        return was === undefined || (now.get(n) ?? 0) > was
      })
      if (newOnes.length !== 1) return
    }

    const path = join(dir, best.name)
    const current = session
    void importArchive(
      current.instanceId,
      current.source,
      current.modId,
      current.modName,
      path,
      current.kind
    ).then((result) => {
      stopDownloadWatch(result.message)
      emitImported(result)
    })
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
    kind,
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
