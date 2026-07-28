import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  unlinkSync
} from 'fs'
import { dirname, join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { spawn } from 'child_process'
import { getSpireRoot } from '../paths'
import { butlerBrothChannel } from './platform'

const BROTH_URL = 'https://broth.itch.zone/butler/{os}-{arch}/LATEST/archive/default'

function toolsRoot(): string {
  return join(getSpireRoot(), 'tools')
}

function butlerDir(): string {
  return join(toolsRoot(), 'butler')
}

export function getButlerBinaryPath(): string {
  const name = process.platform === 'win32' ? 'butler.exe' : 'butler'
  return join(butlerDir(), name)
}

async function downloadFile(url: string, dest: string): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Butler download failed (${res.status}).`)
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  await pipeline(nodeStream, createWriteStream(dest))
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn(
            'powershell.exe',
            [
              '-NoProfile',
              '-Command',
              `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
            ],
            { stdio: 'ignore' }
          )
        : spawn('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Butler extract failed (exit ${code}).`))
    })
  })
}

async function runButler(args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const bin = getButlerBinaryPath()
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

async function butlerWorks(): Promise<boolean> {
  const bin = getButlerBinaryPath()
  if (!existsSync(bin)) return false
  // On macOS require amd64 (Rosetta) — native arm64 has caused exit-50 apply failures.
  if (process.platform === 'darwin') {
    try {
      const { execFileSync } = await import('child_process')
      const info = execFileSync('file', [bin], { encoding: 'utf8' })
      if (/arm64/.test(info) && !/x86_64/.test(info)) return false
    } catch {
      // if `file` fails, still try version
    }
  }
  try {
    const { code } = await runButler(['version'])
    return code === 0
  } catch {
    return false
  }
}

function findButlerInDir(dir: string): string | null {
  const want = process.platform === 'win32' ? 'butler.exe' : 'butler'
  const direct = join(dir, want)
  if (existsSync(direct)) return direct
  try {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        const nested = findButlerInDir(join(dir, ent.name))
        if (nested) return nested
      } else if (ent.name === want) {
        return join(dir, ent.name)
      }
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Ensure itch.io butler is available under Spire/tools/butler.
 * Used to apply official Hytale Wharf `.pwr` patches (same mechanism as the official launcher).
 */
export async function ensureButler(
  onProgress?: (message: string) => void
): Promise<string> {
  if (await butlerWorks()) {
    onProgress?.('Butler ready')
    return getButlerBinaryPath()
  }

  const dir = butlerDir()
  const cache = join(toolsRoot(), 'cache')
  mkdirSync(dir, { recursive: true })
  mkdirSync(cache, { recursive: true })

  // Prefer broth channel; on macOS always use amd64 (Rosetta) — matches HyPrism / most launchers.
  const channels = [butlerBrothChannel()]
  if (process.platform === 'darwin') {
    const hasAmd64 = channels.some((c) => c.arch === 'amd64')
    if (!hasAmd64) channels.push({ os: 'darwin', arch: 'amd64' })
  }

  let lastError: Error | null = null
  for (const ch of channels) {
    const url = BROTH_URL.replace('{os}', ch.os).replace('{arch}', ch.arch)
    const zipPath = join(cache, `butler-${ch.os}-${ch.arch}.zip`)
    try {
      onProgress?.(`Downloading butler (${ch.os}-${ch.arch})…`)
      if (existsSync(dir)) {
        try {
          rmSync(dir, { recursive: true, force: true })
        } catch {
          // ignore
        }
      }
      mkdirSync(dir, { recursive: true })
      await downloadFile(url, zipPath)
      onProgress?.('Extracting butler…')
      await extractZip(zipPath, dir)
      try {
        unlinkSync(zipPath)
      } catch {
        // ignore
      }

      const found = findButlerInDir(dir)
      const target = getButlerBinaryPath()
      if (found && found !== target) {
        const { renameSync, copyFileSync } = await import('fs')
        try {
          renameSync(found, target)
        } catch {
          copyFileSync(found, target)
        }
      }
      if (!existsSync(target)) {
        throw new Error('butler binary missing after extract.')
      }
      if (process.platform !== 'win32') {
        try {
          chmodSync(target, 0o755)
        } catch {
          // ignore
        }
      }
      if (await butlerWorks()) {
        onProgress?.('Butler ready')
        return target
      }
      throw new Error('butler version check failed.')
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError ?? new Error('Failed to install butler.')
}

function cleanStaging(targetDir: string, staging: string): void {
  for (const dir of [staging, join(targetDir, 'staging-temp'), join(targetDir, '.spire-staging')]) {
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  }
  try {
    for (const name of readdirSync(targetDir)) {
      if (name.endsWith('.tmp') || name.startsWith('sf-') || name === 'checkpoint.bwl') {
        try {
          unlinkSync(join(targetDir, name))
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}

function summarizeButlerOutput(stdout: string, stderr: string): string {
  const combined = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  // Prefer error-looking lines
  const interesting = combined.filter((l) =>
    /error|fail|invalid|mismatch|corrupt|panic|cannot|unable|denied/i.test(l)
  )
  const pick = (interesting.length ? interesting : combined).slice(-6)
  return pick.join(' · ').slice(0, 400)
}

async function runApplyOnce(
  pwrPath: string,
  targetDir: string,
  staging: string,
  signaturePath: string | null | undefined,
  onOutput?: (line: string) => void
): Promise<void> {
  cleanStaging(targetDir, staging)
  mkdirSync(staging, { recursive: true })

  const args = ['apply', `--staging-dir=${staging}`, pwrPath, targetDir]
  if (signaturePath && existsSync(signaturePath)) {
    args.push(`--signature=${signaturePath}`)
  }
  if (process.platform === 'win32') {
    args.splice(1, 0, '--save-interval=60')
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(getButlerBinaryPath(), args, {
      cwd: targetDir,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const onChunk = (buf: Buffer, isErr: boolean): void => {
      const text = buf.toString()
      if (isErr) stderr += text
      else stdout += text
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) onOutput?.(line.trim())
      }
    }
    child.stdout?.on('data', (b: Buffer) => onChunk(b, false))
    child.stderr?.on('data', (b: Buffer) => onChunk(b, true))
    child.on('error', reject)
    child.on('close', (code) => {
      cleanStaging(targetDir, staging)
      if (code === 0) {
        resolve()
        return
      }
      const detail = summarizeButlerOutput(stdout, stderr)
      reject(
        new Error(
          detail
            ? `butler apply failed (exit ${code}): ${detail}`
            : `butler apply failed (exit ${code}).`
        )
      )
    })
  })
}

/**
 * Apply a Wharf `.pwr` into targetDir (in-place).
 * Matches HyPrism: apply without signature by default; if a signature is provided
 * and apply fails, retry once without it (exit 50 is often signature verify).
 */
export async function applyPwr(
  pwrPath: string,
  targetDir: string,
  opts?: {
    signaturePath?: string | null
    onOutput?: (line: string) => void
  }
): Promise<void> {
  await ensureButler()
  mkdirSync(targetDir, { recursive: true })
  // Keep staging outside the game tree so partial patches don’t leave ghosts in Client/
  const staging = join(getSpireRoot(), 'tools', 'butler-staging')

  const sig = opts?.signaturePath && existsSync(opts.signaturePath) ? opts.signaturePath : null

  try {
    // Official HyPrism path: no --signature (most reliable for full from-0 installs)
    await runApplyOnce(pwrPath, targetDir, staging, null, opts?.onOutput)
  } catch (firstErr) {
    if (!sig) throw firstErr
    opts?.onOutput?.('Retrying patch apply without signature verification…')
    await runApplyOnce(pwrPath, targetDir, staging, null, opts?.onOutput)
  }
}
