/**
 * Official launcher OAuth via localhost PKCE (same flow as Hytale Launcher).
 * Device-code grant is not enabled for `hytale-launcher`.
 */

import { createHash, randomBytes } from 'crypto'
import { createServer, type Server } from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import {
  LAUNCHER_CLIENT_ID,
  LAUNCHER_SCOPE,
  OAUTH_AUTH,
  OAUTH_TOKEN,
  USER_AGENT
} from './constants'
import type { StoredOAuthTokens } from './store'

interface PkcePending {
  server: Server
  state: string
  verifier: string
  redirectUri: string
  resolve: (tokens: StoredOAuthTokens) => void
  reject: (err: Error) => void
  result: Promise<StoredOAuthTokens>
}

let pending: PkcePending | null = null

function base64Url(buf: Buffer): string {
  return buf.toString('base64url')
}

function randomUrlString(bytes: number): string {
  return base64Url(randomBytes(bytes))
}

function codeChallengeS256(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier, 'utf8').digest())
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>${title}</title>
<style>
  body{font-family:Segoe UI,system-ui,sans-serif;background:#12161c;color:#f2f4f6;
  display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  main{max-width:28rem;padding:2rem;text-align:center}
  h1{font-size:1.35rem;margin:0 0 .75rem}
  p{color:#8b96a3;line-height:1.45}
  .ok{color:#5fad7f}
</style></head><body><main>${body}</main></body></html>`
}

async function exchangeCode(
  code: string,
  redirectUri: string,
  verifier: string
): Promise<StoredOAuthTokens> {
  const body = new URLSearchParams({
    client_id: LAUNCHER_CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  })
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    },
    body: body.toString()
  })
  const text = await res.text()
  let json: {
    access_token?: string
    refresh_token?: string
    id_token?: string
    token_type?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
  }
  try {
    json = JSON.parse(text) as typeof json
  } catch {
    throw new Error(`OAuth token response was not JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!json.access_token) {
    throw new Error(json.error_description || json.error || `Token exchange failed (${res.status}).`)
  }
  const expiresAt =
    typeof json.expires_in === 'number' ? Date.now() + json.expires_in * 1000 : null
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    idToken: json.id_token ?? null,
    tokenType: json.token_type ?? 'Bearer',
    scope: json.scope ?? LAUNCHER_SCOPE,
    expiresAt,
    clientId: LAUNCHER_CLIENT_ID,
    obtainedAt: new Date().toISOString()
  }
}

function sendHtml(res: ServerResponse, status: number, title: string, body: string): void {
  const html = htmlPage(title, body)
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html)
  })
  res.end(html)
}

function handleCallback(req: IncomingMessage, res: ServerResponse): void {
  const current = pending
  if (!current) {
    sendHtml(res, 400, 'No login', '<h1>No login in progress</h1><p>Return to Spire and try again.</p>')
    return
  }

  const url = new URL(req.url || '/', `http://127.0.0.1`)
  if (url.pathname !== '/callback') {
    res.writeHead(404).end()
    return
  }

  const returnedState = url.searchParams.get('state')
  if (returnedState !== current.state) {
    sendHtml(res, 400, 'Invalid state', '<h1>Invalid state</h1><p>Sign-in was rejected for safety.</p>')
    current.reject(new Error('Invalid OAuth state — try signing in again.'))
    stopPkceServer()
    return
  }

  const err = url.searchParams.get('error')
  if (err) {
    const desc = url.searchParams.get('error_description') || err
    sendHtml(res, 400, 'Denied', `<h1>Sign-in denied</h1><p>${desc}</p>`)
    current.reject(new Error(`Sign-in was denied: ${desc}`))
    stopPkceServer()
    return
  }

  const code = url.searchParams.get('code')
  if (!code) {
    sendHtml(res, 400, 'Missing code', '<h1>Missing authorization code</h1>')
    current.reject(new Error('No authorization code received.'))
    stopPkceServer()
    return
  }

  sendHtml(
    res,
    200,
    'Signed in',
    '<h1 class="ok">Signed in to Spire</h1><p>You can close this tab and return to the launcher.</p>'
  )

  const { verifier, redirectUri, resolve, reject } = current
  stopPkceServer()
  void exchangeCode(code, redirectUri, verifier).then(resolve, reject)
}

function stopPkceServer(): void {
  const current = pending
  if (!current) return
  pending = null
  try {
    current.server.close()
  } catch {
    // ignore
  }
}

export function cancelPkceLogin(): void {
  const current = pending
  if (!current) return
  current.reject(new Error('Login cancelled.'))
  stopPkceServer()
}

export function isPkceLoginPending(): boolean {
  return pending != null
}

export async function startPkceLogin(): Promise<{ authUrl: string; expiresIn: number }> {
  cancelPkceLogin()

  const state = randomUrlString(32)
  const verifier = randomUrlString(64)
  const challenge = codeChallengeS256(verifier)

  let resolve!: (tokens: StoredOAuthTokens) => void
  let reject!: (err: Error) => void
  const result = new Promise<StoredOAuthTokens>((res, rej) => {
    resolve = res
    reject = rej
  })
  // Prevent unhandled rejection if cancelled before wait()
  result.catch(() => undefined)

  const server = createServer((req, res) => {
    try {
      handleCallback(req, res)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendHtml(res, 500, 'Error', `<h1>Error</h1><p>${message}</p>`)
    }
  })

  await new Promise<void>((res, rej) => {
    server.once('error', rej)
    server.listen(0, '127.0.0.1', () => res())
  })

  const addr = server.address()
  if (!addr || typeof addr === 'string') {
    server.close()
    throw new Error('Failed to bind OAuth loopback server.')
  }

  const redirectUri = `http://127.0.0.1:${addr.port}/callback`
  pending = { server, state, verifier, redirectUri, resolve, reject, result }

  const params = new URLSearchParams({
    client_id: LAUNCHER_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: LAUNCHER_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  })

  return {
    authUrl: `${OAUTH_AUTH}?${params.toString()}`,
    expiresIn: 600
  }
}

export async function waitPkceLogin(signal?: AbortSignal): Promise<StoredOAuthTokens> {
  const current = pending
  if (!current) throw new Error('No sign-in in progress.')

  if (signal?.aborted) {
    cancelPkceLogin()
    throw new Error('Login cancelled.')
  }

  const onAbort = (): void => {
    cancelPkceLogin()
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    return await current.result
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
