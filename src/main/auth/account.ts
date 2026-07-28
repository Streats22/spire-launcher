import type {
  HytaleAccountSummary,
  HytaleAuthStatus,
  HytaleDeviceLogin,
  HytaleProfile
} from '../../shared/types'
import { errorMessage } from '../../shared/errors'
import { ACCOUNT_DATA, SESSIONS, USER_AGENT } from './constants'
import { decodeJwtPayload, usernameFromToken } from './claims'
import {
  getValidAccessToken,
  getValidAccessTokenOrNull,
  hasLauncherAccess,
  withAuthRetry
} from './oauth'
import { cancelPkceLogin, startPkceLogin, waitPkceLogin } from './pkce'
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
  type StoredAccountMeta,
  type StoredOAuthTokens
} from './store'
import { logWarn } from '../logging'

let loginAbort: AbortController | null = null

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

function asUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return null
  }
  return trimmed
}

function normalizeProfiles(raw: Array<Record<string, unknown>>): HytaleProfile[] {
  const out: HytaleProfile[] = []
  for (const p of raw) {
    const uuid =
      asUuid(p.uuid) ||
      asUuid(p.id) ||
      asUuid(p.profileUuid) ||
      asUuid(p.profile_uuid) ||
      asUuid(p.playerUuid) ||
      asUuid(p.player_uuid)
    if (!uuid) continue
    const nameRaw =
      (typeof p.username === 'string' && p.username.trim()) ||
      (typeof p.name === 'string' && p.name.trim()) ||
      (typeof p.displayName === 'string' && p.displayName.trim()) ||
      uuid
    const entitlements = Array.isArray(p.entitlements)
      ? p.entitlements.filter((e): e is string => typeof e === 'string')
      : []
    out.push({ uuid, name: nameRaw, entitlements })
  }
  return out
}

function profilesFromUnknown(data: unknown): HytaleProfile[] {
  if (!data || typeof data !== 'object') return []
  const obj = data as Record<string, unknown>
  if (Array.isArray(obj.profiles)) {
    return normalizeProfiles(obj.profiles as Array<Record<string, unknown>>)
  }
  if (Array.isArray(data)) {
    return normalizeProfiles(data as Array<Record<string, unknown>>)
  }
  const nested = obj.profile
  if (nested && typeof nested === 'object') {
    return normalizeProfiles([nested as Record<string, unknown>])
  }
  const single = normalizeProfiles([obj])
  return single
}

function displayNameFromTokens(tokens: StoredOAuthTokens | null | undefined): string | null {
  if (!tokens) return null
  return usernameFromToken(tokens.idToken) || usernameFromToken(tokens.accessToken)
}

/**
 * Prefer the selected Hytale *game profile* name (in-game identity) over the
 * OAuth account username (e.g. email local-part / Hypixel login).
 */
function resolveAccountDisplayName(
  meta: StoredAccountMeta,
  tokens?: StoredOAuthTokens | null
): string | null {
  const selected =
    meta.profiles.find((p) => p.uuid === meta.selectedProfileUuid) || meta.profiles[0] || null
  const profileName = selected?.name?.trim() || null
  if (profileName && !asUuid(profileName)) return profileName

  if (meta.displayName && !asUuid(meta.displayName)) {
    // Keep stored name only if it matches a known profile (avoid sticky OAuth login)
    const matchesProfile = meta.profiles.some((p) => p.name === meta.displayName)
    if (matchesProfile || meta.profiles.length === 0) return meta.displayName
  }

  return displayNameFromTokens(tokens) || profileName || meta.displayName || null
}

function platformOsArch(): { os: string; arch: string } {
  const os =
    process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  return { os, arch }
}

export async function refreshAccountInfo(
  accountId?: string | null
): Promise<StoredAccountMeta> {
  const id = accountId ?? getActiveAccountId()
  return withAuthRetry(async (accessToken) => {
    let profiles: HytaleProfile[] = []
    const { os, arch } = platformOsArch()
    const attempts: Array<{ path: string; label: string }> = [
      // Launcher OAuth cannot call get-profiles (403) — prefer launcher-data first.
      {
        path: `/my-account/get-launcher-data?os=${encodeURIComponent(os)}&arch=${encodeURIComponent(arch)}`,
        label: 'get-launcher-data'
      },
      {
        path: `/launcher-data?os=${encodeURIComponent(os)}&arch=${encodeURIComponent(arch)}`,
        label: 'launcher-data'
      },
      { path: '/my-account/game-profile', label: 'game-profile' },
      { path: '/my-account/get-profiles', label: 'get-profiles' }
    ]

    for (const attempt of attempts) {
      if (profiles.length > 0) break
      try {
        const data = await authGet<unknown>(attempt.path, accessToken)
        profiles = profilesFromUnknown(data)
        if (profiles.length === 0) {
          logWarn('auth', `${attempt.label}: ok but no profiles in response`)
        }
      } catch (err) {
        logWarn('auth', `${attempt.label} failed: ${errorMessage(err)}`)
      }
    }

    // Last resort: UUID from access / id token claims (not always a game profile).
    if (profiles.length === 0) {
      const tokens = loadTokens(id)
      const claims =
        decodeJwtPayload(tokens?.accessToken) || decodeJwtPayload(tokens?.idToken ?? null)
      const claimUuid =
        asUuid(claims?.hytale_profile_uuid) ||
        asUuid(claims?.profile_uuid) ||
        asUuid(claims?.uuid) ||
        asUuid(claims?.sub)
      if (claimUuid) {
        const name =
          displayNameFromTokens(tokens) ||
          (typeof claims?.preferred_username === 'string' ? claims.preferred_username : claimUuid)
        profiles = [{ uuid: claimUuid, name: String(name), entitlements: [] }]
        logWarn('auth', `Using profile UUID from token claims (${claimUuid})`)
      }
    }

    const prev = loadAccountMeta(id)
    const selected =
      (prev.selectedProfileUuid && profiles.find((p) => p.uuid === prev.selectedProfileUuid)?.uuid) ||
      profiles[0]?.uuid ||
      null
    const profileName =
      profiles.find((p) => p.uuid === selected)?.name ?? profiles[0]?.name ?? null
    const fromToken = displayNameFromTokens(loadTokens(id))
    const displayName = profileName || fromToken || prev.displayName || null

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

export async function createGameSession(): Promise<GameSessionTokens> {
  let meta = loadAccountMeta()
  let uuid = meta.selectedProfileUuid || meta.profiles[0]?.uuid || null

  if (!uuid) {
    try {
      meta = await refreshAccountInfo()
      uuid = meta.selectedProfileUuid || meta.profiles[0]?.uuid || null
    } catch (err) {
      throw new Error(
        `Could not load Hytale profiles: ${errorMessage(err)}. Sign in again under Install.`
      )
    }
  }

  if (!uuid) {
    throw new Error(
      'No Hytale game profile on this account. Open Install, use Refresh, or sign out and sign in again.'
    )
  }

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
      throw new Error(`Game session HTTP ${res.status}: ${text.slice(0, 180)}`)
    }
    let json: {
      sessionToken?: string
      identityToken?: string
      session_token?: string
      identity_token?: string
      expiresAt?: string
      expires_at?: string
    }
    try {
      json = JSON.parse(text) as typeof json
    } catch {
      throw new Error('Game session response was not JSON.')
    }
    const session: GameSessionTokens = {
      sessionToken: json.sessionToken || json.session_token || '',
      identityToken: json.identityToken || json.identity_token || '',
      expiresAt: json.expiresAt || json.expires_at || null
    }
    if (!session.sessionToken || !session.identityToken) {
      throw new Error('Game session response missing session or identity token.')
    }
    cachedSession = session
    return session
  })
}

export function getCachedGameSession(): GameSessionTokens | null {
  return cachedSession
}

function buildAccountSummaries(): HytaleAccountSummary[] {
  return listStoredAccounts().map((a) => {
    const tokens = loadTokens(a.id)
    return {
      id: a.id,
      displayName: resolveAccountDisplayName(a.meta, tokens),
      profileUuid: a.meta.selectedProfileUuid,
      profiles: a.meta.profiles,
      hasRefreshToken: Boolean(tokens?.refreshToken)
    }
  })
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
      canInstallClient: false,
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

  let resolvedMeta = meta
  // Refresh when we lack profiles, or only have an OAuth login name (no game profile yet).
  const needsProfileRefresh =
    meta.profiles.length === 0 ||
    !meta.selectedProfileUuid ||
    !meta.profiles.some((p) => p.uuid === meta.selectedProfileUuid)
  if (sessionValid && needsProfileRefresh) {
    try {
      resolvedMeta = await refreshAccountInfo(activeAccountId)
    } catch {
      // Keep cached meta; JWT fallback below may still yield a username.
    }
  }

  const displayName = resolveAccountDisplayName(resolvedMeta, tokens)
  // Persist game profile name when it differs from a sticky OAuth username.
  if (
    displayName &&
    resolvedMeta.displayName !== displayName &&
    resolvedMeta.profiles.some((p) => p.name === displayName)
  ) {
    resolvedMeta = { ...resolvedMeta, displayName }
    saveAccountMeta(resolvedMeta, activeAccountId)
  }

  return {
    signedIn: true,
    displayName,
    profileUuid: resolvedMeta.selectedProfileUuid,
    profiles: resolvedMeta.profiles,
    sessionValid,
    accessExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
    hasRefreshToken: Boolean(tokens.refreshToken),
    clientId: tokens.clientId || null,
    canInstallClient: hasLauncherAccess(tokens),
    activeAccountId,
    accounts: buildAccountSummaries()
  }
}

export async function startLogin(): Promise<HytaleDeviceLogin> {
  cancelLogin()
  const { authUrl, expiresIn } = await startPkceLogin()
  loginAbort = new AbortController()
  return {
    userCode: '',
    verificationUri: authUrl,
    verificationUriComplete: authUrl,
    expiresIn,
    interval: 0,
    flow: 'pkce'
  }
}

export function cancelLogin(): void {
  loginAbort?.abort()
  loginAbort = null
  cancelPkceLogin()
}

/**
 * Completes PKCE launcher login and adds a new Hytale account (or the first one).
 * Does not wipe existing accounts — use removeAccount / signOut for that.
 */
export async function waitForLogin(): Promise<HytaleAuthStatus> {
  if (!loginAbort) {
    throw new Error('No sign-in in progress.')
  }
  const signal = loginAbort.signal
  try {
    const tokens = await waitPkceLogin(signal)
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
  } finally {
    loginAbort = null
  }
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

export async function requireLauncherAccess(): Promise<void> {
  await requireSignedIn()
  const tokens = loadTokens()
  if (!hasLauncherAccess(tokens)) {
    throw new Error(
      'This account signed in with the downloader-only flow, which cannot install the full Client + JRE. ' +
        'Remove the account under Install and sign in again (browser launcher login).'
    )
  }
}
