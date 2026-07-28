import type {
  HytaleAccountSummary,
  HytaleAuthStatus,
  HytaleDeviceLogin,
  HytaleProfile
} from '../../shared/types'
import {
  ACCOUNT_DATA,
  ACCOUNTS_DEVICE_PAGE,
  DOWNLOADER_CLIENT_ID,
  SESSIONS,
  USER_AGENT
} from './constants'
import {
  getValidAccessToken,
  getValidAccessTokenOrNull,
  pollDeviceToken,
  requestDeviceCode,
  withAuthRetry
} from './oauth'
import {
  clearAllAccounts,
  createAccountWithTokens,
  getActiveAccountId,
  listStoredAccounts,
  loadAccountMeta,
  loadTokens,
  removeAccount,
  saveAccountMeta,
  setActiveAccount,
  type StoredAccountMeta
} from './store'

let loginAbort: AbortController | null = null
let pendingDevice: { deviceCode: string; interval: number } | null = null

export interface GameSessionTokens {
  sessionToken: string
  identityToken: string
  expiresAt: string | null
}

let cachedSession: GameSessionTokens | null = null

async function authGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${ACCOUNT_DATA}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    }
  })
  const text = await res.text()
  if (res.status === 401 || text === 'invalid token') {
    throw new Error('unauthorized')
  }
  if (!res.ok) {
    throw new Error(`Account API ${res.status}: ${text.slice(0, 180)}`)
  }
  return JSON.parse(text) as T
}

interface ProfilesResponse {
  profiles?: Array<{
    uuid?: string
    username?: string
    name?: string
    entitlements?: string[]
  }>
}

interface LauncherDataResponse {
  profiles?: Array<{
    uuid?: string
    name?: string
    entitlements?: string[]
  }>
  patchlines?: Record<string, unknown>
}

function normalizeProfiles(
  raw: Array<{ uuid?: string; username?: string; name?: string; entitlements?: string[] }>
): HytaleProfile[] {
  return raw
    .filter((p) => p.uuid)
    .map((p) => ({
      uuid: p.uuid!,
      name: p.name || p.username || p.uuid!,
      entitlements: p.entitlements ?? []
    }))
}

export async function refreshAccountInfo(
  accountId?: string | null
): Promise<StoredAccountMeta> {
  const id = accountId ?? getActiveAccountId()
  return withAuthRetry(async (accessToken) => {
    let profiles: HytaleProfile[] = []

    try {
      const data = await authGet<ProfilesResponse>('/my-account/get-profiles', accessToken)
      profiles = normalizeProfiles(data.profiles ?? [])
    } catch {
      // Downloader scope may not expose get-profiles; try launcher-data.
    }

    if (profiles.length === 0) {
      try {
        const os =
          process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'
        const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
        const data = await authGet<LauncherDataResponse>(
          `/launcher-data?os=${encodeURIComponent(os)}&arch=${encodeURIComponent(arch)}`,
          accessToken
        )
        profiles = normalizeProfiles(data.profiles ?? [])
      } catch {
        // Profile endpoints optional for download-only sessions.
      }
    }

    const prev = loadAccountMeta(id)
    const selected =
      (prev.selectedProfileUuid && profiles.find((p) => p.uuid === prev.selectedProfileUuid)?.uuid) ||
      profiles[0]?.uuid ||
      null
    const displayName =
      profiles.find((p) => p.uuid === selected)?.name ??
      prev.displayName ??
      (profiles[0]?.name ?? null)

    const meta: StoredAccountMeta = {
      selectedProfileUuid: selected,
      displayName,
      profiles,
      refreshedAt: new Date().toISOString()
    }
    saveAccountMeta(meta, id)
    return meta
  })
}

export async function createGameSession(): Promise<GameSessionTokens | null> {
  const meta = loadAccountMeta()
  const uuid = meta.selectedProfileUuid || meta.profiles[0]?.uuid
  if (!uuid) return null

  return withAuthRetry(async (accessToken) => {
    const res = await fetch(`${SESSIONS}/game-session/new`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': USER_AGENT
      },
      body: JSON.stringify({ uuid })
    })
    const text = await res.text()
    if (res.status === 401) throw new Error('unauthorized')
    if (!res.ok) {
      return null
    }
    const json = JSON.parse(text) as {
      sessionToken?: string
      identityToken?: string
      session_token?: string
      identity_token?: string
      expiresAt?: string
      expires_at?: string
    }
    const session: GameSessionTokens = {
      sessionToken: json.sessionToken || json.session_token || '',
      identityToken: json.identityToken || json.identity_token || '',
      expiresAt: json.expiresAt || json.expires_at || null
    }
    if (!session.sessionToken || !session.identityToken) return null
    cachedSession = session
    return session
  })
}

export function getCachedGameSession(): GameSessionTokens | null {
  return cachedSession
}

function buildAccountSummaries(): HytaleAccountSummary[] {
  return listStoredAccounts().map((a) => ({
    id: a.id,
    displayName: a.meta.displayName,
    profileUuid: a.meta.selectedProfileUuid,
    profiles: a.meta.profiles,
    hasRefreshToken: Boolean(loadTokens(a.id)?.refreshToken)
  }))
}

export async function getAuthStatus(): Promise<HytaleAuthStatus> {
  const accounts = buildAccountSummaries()
  const activeAccountId = getActiveAccountId()
  const tokens = loadTokens()
  const meta = loadAccountMeta()

  if (!tokens || !activeAccountId) {
    return {
      signedIn: false,
      displayName: null,
      profileUuid: null,
      profiles: [],
      sessionValid: false,
      accessExpiresAt: null,
      hasRefreshToken: false,
      clientId: null,
      activeAccountId: null,
      accounts
    }
  }

  let sessionValid = true
  try {
    await getValidAccessToken()
  } catch {
    sessionValid = false
  }

  return {
    signedIn: true,
    displayName: meta.displayName,
    profileUuid: meta.selectedProfileUuid,
    profiles: meta.profiles,
    sessionValid,
    accessExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
    hasRefreshToken: Boolean(tokens.refreshToken),
    clientId: tokens.clientId || DOWNLOADER_CLIENT_ID,
    activeAccountId,
    accounts
  }
}

export async function startLogin(): Promise<HytaleDeviceLogin> {
  cancelLogin()
  const device = await requestDeviceCode()
  loginAbort = new AbortController()
  pendingDevice = { deviceCode: device.device_code, interval: device.interval }
  return {
    userCode: device.user_code,
    verificationUri: device.verification_uri || ACCOUNTS_DEVICE_PAGE,
    verificationUriComplete: device.verification_uri_complete ?? null,
    expiresIn: device.expires_in,
    interval: device.interval
  }
}

export function cancelLogin(): void {
  loginAbort?.abort()
  loginAbort = null
  pendingDevice = null
}

/**
 * Completes device login and adds a new Hytale account (or the first one).
 * Does not wipe existing accounts — use removeAccount / signOut for that.
 */
export async function waitForLogin(): Promise<HytaleAuthStatus> {
  if (!pendingDevice || !loginAbort) {
    throw new Error('No sign-in in progress.')
  }
  const { deviceCode, interval } = pendingDevice
  const signal = loginAbort.signal
  const tokens = await pollDeviceToken(deviceCode, interval, signal)
  pendingDevice = null
  loginAbort = null

  createAccountWithTokens(tokens)
  cachedSession = null

  try {
    await refreshAccountInfo()
  } catch {
    // Signed in for downloads even if profile APIs reject the scope.
  }
  try {
    await createGameSession()
  } catch {
    // Optional
  }
  return getAuthStatus()
}

/** Remove the active account (or all if none specified). */
export async function signOut(accountId?: string | null): Promise<HytaleAuthStatus> {
  cancelLogin()
  cachedSession = null
  const id = accountId ?? getActiveAccountId()
  if (id) removeAccount(id)
  else clearAllAccounts()
  return getAuthStatus()
}

export async function signOutAll(): Promise<HytaleAuthStatus> {
  cancelLogin()
  cachedSession = null
  clearAllAccounts()
  return getAuthStatus()
}

export async function selectAccount(accountId: string): Promise<HytaleAuthStatus> {
  setActiveAccount(accountId)
  cachedSession = null
  try {
    await getValidAccessToken()
  } catch {
    // Session may be expired — still switch; UI shows invalid.
  }
  try {
    await createGameSession()
  } catch {
    // optional
  }
  return getAuthStatus()
}

export async function selectProfile(uuid: string): Promise<HytaleAuthStatus> {
  const meta = loadAccountMeta()
  const profile = meta.profiles.find((p) => p.uuid === uuid)
  if (!profile) throw new Error('Profile not found.')
  saveAccountMeta({
    ...meta,
    selectedProfileUuid: uuid,
    displayName: profile.name
  })
  cachedSession = null
  try {
    await createGameSession()
  } catch {
    // optional
  }
  return getAuthStatus()
}

export async function requireSignedIn(): Promise<void> {
  const token = await getValidAccessTokenOrNull()
  if (!token) {
    throw new Error('Sign in with your official Hytale account before downloading.')
  }
}
