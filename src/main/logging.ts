import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { getSpireRoot } from './paths'

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  at: string
  level: LogLevel
  source: string
  message: string
}

const MAX_RECENT = 500
const recent: LogEntry[] = []

export function getLogsDir(): string {
  const dir = join(getSpireRoot(), 'logs')
  mkdirSync(dir, { recursive: true })
  return dir
}

function logFileForToday(): string {
  const day = new Date().toISOString().slice(0, 10)
  return join(getLogsDir(), `spire-${day}.log`)
}

export function appendLog(level: LogLevel, source: string, message: string): LogEntry {
  const entry: LogEntry = {
    at: new Date().toISOString(),
    level,
    source,
    message: message.replace(/\s+/g, ' ').trim()
  }
  recent.push(entry)
  if (recent.length > MAX_RECENT) recent.splice(0, recent.length - MAX_RECENT)

  try {
    const line = `[${entry.at}] [${level.toUpperCase()}] [${source}] ${entry.message}\n`
    appendFileSync(logFileForToday(), line, 'utf8')
  } catch {
    // ignore disk errors
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('spire:logLine', entry)
    }
  }
  return entry
}

export function logInfo(source: string, message: string): void {
  appendLog('info', source, message)
}

export function logWarn(source: string, message: string): void {
  appendLog('warn', source, message)
}

export function logError(source: string, message: string): void {
  appendLog('error', source, message)
}

export function getRecentLogs(limit = 200): LogEntry[] {
  return recent.slice(-Math.max(1, Math.min(limit, MAX_RECENT)))
}

/** Tail today's file + yesterday if recent buffer is empty (e.g. after restart). */
export function readPersistedLogs(limit = 200): LogEntry[] {
  if (recent.length > 0) return getRecentLogs(limit)
  const dir = getLogsDir()
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('spire-') && f.endsWith('.log'))
    .sort()
    .reverse()
    .slice(0, 2)
  const lines: string[] = []
  for (const file of files.reverse()) {
    try {
      const text = readFileSync(join(dir, file), 'utf8')
      lines.push(...text.split(/\r?\n/).filter(Boolean))
    } catch {
      // ignore
    }
  }
  const parsed: LogEntry[] = []
  for (const line of lines.slice(-limit)) {
    const m = line.match(/^\[([^\]]+)\] \[([A-Z]+)\] \[([^\]]+)\] (.*)$/)
    if (m) {
      parsed.push({
        at: m[1],
        level: m[2].toLowerCase() as LogLevel,
        source: m[3],
        message: m[4]
      })
    } else {
      parsed.push({ at: '', level: 'info', source: 'log', message: line })
    }
  }
  return parsed
}

export function getInstanceRunLogPath(instanceId: string): string {
  const dir = join(getLogsDir(), 'runs')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${instanceId}.log`)
}

export function readInstanceRunLog(instanceId: string, limit = 500): string[] {
  const path = getInstanceRunLogPath(instanceId)
  if (!existsSync(path)) return []
  try {
    const text = readFileSync(path, 'utf8')
    const lines = text.split(/\r?\n/).filter(Boolean)
    return lines.slice(-Math.max(1, limit))
  } catch {
    return []
  }
}

export function appendRunLog(instanceId: string, line: string): void {
  try {
    const path = getInstanceRunLogPath(instanceId)
    appendFileSync(path, `${line}\n`, 'utf8')
  } catch {
    // ignore
  }
}

export function clearRunLog(instanceId: string): void {
  try {
    writeFileSync(getInstanceRunLogPath(instanceId), '', 'utf8')
  } catch {
    // ignore
  }
}

