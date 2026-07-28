import { createWriteStream, mkdirSync } from 'fs'
import { dirname } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { SPIRE_USER_AGENT } from './constants'
import { emitContentBytes } from './contentProgress'

/** Fetch a URL to disk with byte progress callbacks (shared by mods + worlds). */
export async function downloadFileWithProgress(
  url: string,
  destPath: string,
  headers: Record<string, string> = {},
  onBytes?: (received: number, total: number) => void
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })
  const res = await fetch(url, {
    headers: {
      'User-Agent': SPIRE_USER_AGENT,
      ...headers
    },
    redirect: 'follow'
  })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status})`)
  }

  const total = Number(res.headers.get('content-length') || 0)
  let received = 0
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  nodeStream.on('data', (chunk: Buffer | string) => {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    received += buf.length
    onBytes?.(received, total)
    emitContentBytes(received, total)
  })

  await pipeline(nodeStream, createWriteStream(destPath))
}
