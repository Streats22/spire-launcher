import {
  DOWNLOADER_CLIENT_ID,
  DOWNLOADER_SCOPE,
  OAUTH_DEVICE_AUTH,
  OAUTH_TOKEN,
  USER_AGENT
} from './constants'
import { loadTokens, saveTokens, type StoredOAuthTokens } from './store'

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval: number
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

function formBody(data: Record<string, string>): string {
  return new URLSearchParams(data).toString()
}

async function postForm(url: string, data: Record<string, string>): Promise<TokenResponse & DeviceCodeResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    },
    body: formBody(data)
  })
  const text = await res.text()
  let json: TokenResponse & DeviceCodeResponse
  try {
    json = JSON.parse(text) as TokenResponse & DeviceCodeResponse
  } catch {
    throw new Error(`OAuth response was not JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok && !json.error) {
    throw new Error(`OAuth HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return json
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const json = await postForm(OAUTH_DEVICE_AUTH, {
    client_id: DOWNLOADER_CLIENT_ID,
    scope: DOWNLOADER_SCOPE
  })
  if (!json.device_code || !json.user_code) {
    throw new Error(json.error_description || json.error || 'Failed to start Hytale device login.')
  }
  return {
    device_code: json.device_code,
    user_code: json.user_code,
    verification_uri: json.verification_uri,
    verification_uri_complete: json.verification_uri_complete,
    expires_in: json.expires_in ?? 600,
    interval: Math.max(3, json.interval ?? 5)
  }
}

function toStored(json: TokenResponse, previous?: StoredOAuthTokens | null): StoredOAuthTokens {
  const expiresAt =
    typeof json.expires_in === 'number' ? Date.now() + json.expires_in * 1000 : previous?.expiresAt ?? null
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? previous?.refreshToken ?? null,
    tokenType: json.token_type ?? 'Bearer',
    scope: json.scope ?? previous?.scope ?? DOWNLOADER_SCOPE,
    expiresAt,
    clientId: DOWNLOADER_CLIENT_ID,
    obtainedAt: new Date().toISOString()
  }
}

export async function pollDeviceToken(
  deviceCode: string,
  intervalSec: number,
  signal: AbortSignal
): Promise<StoredOAuthTokens> {
  let interval = intervalSec * 1000
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms)
      const onAbort = (): void => {
        clearTimeout(t)
        reject(new Error('Login cancelled.'))
      }
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })

  for (;;) {
    if (signal.aborted) throw new Error('Login cancelled.')
    await sleep(interval)

    const json = await postForm(OAUTH_TOKEN, {
      client_id: DOWNLOADER_CLIENT_ID,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode
    })

    if (json.access_token) {
      return toStored(json)
    }

    const err = json.error
    if (err === 'authorization_pending') continue
    if (err === 'slow_down') {
      interval += 2000
      continue
    }
    if (err === 'expired_token') {
      throw new Error('Device code expired. Start sign-in again.')
    }
    if (err === 'access_denied') {
      throw new Error('Sign-in was denied in the browser.')
    }
    throw new Error(json.error_description || err || 'Hytale sign-in failed.')
  }
}

export async function refreshAccessToken(tokens: StoredOAuthTokens): Promise<StoredOAuthTokens> {
  if (!tokens.refreshToken) {
    throw new Error('No refresh token — sign in again.')
  }
  const json = await postForm(OAUTH_TOKEN, {
    client_id: tokens.clientId || DOWNLOADER_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken
  })
  if (!json.access_token) {
    throw new Error(json.error_description || json.error || 'Token refresh failed.')
  }
  const stored = toStored(json, tokens)
  saveTokens(stored)
  return stored
}

/** Returns a valid access token, refreshing when within 2 minutes of expiry. */
export async function getValidAccessToken(): Promise<string> {
  let tokens = loadTokens()
  if (!tokens) throw new Error('Not signed in to Hytale. Sign in under Install / Versions or Settings.')

  const skew = 120_000
  const needsRefresh =
    tokens.expiresAt != null && tokens.expiresAt - Date.now() < skew && Boolean(tokens.refreshToken)

  if (needsRefresh) {
    tokens = await refreshAccessToken(tokens)
  }

  // If no expiry recorded, try a lightweight use; caller will 401 and we refresh then.
  return tokens.accessToken
}

export async function getValidAccessTokenOrNull(): Promise<string | null> {
  try {
    return await getValidAccessToken()
  } catch {
    return null
  }
}

export async function withAuthRetry<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {
  const token = await getValidAccessToken()
  try {
    return await fn(token)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/401|unauthorized|invalid token/i.test(message)) throw err
    const tokens = loadTokens()
    if (!tokens?.refreshToken) throw err
    const refreshed = await refreshAccessToken(tokens)
    return fn(refreshed.accessToken)
  }
}
