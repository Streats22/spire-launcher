import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { safeStorage } from 'electron'
import { getSpireRoot } from '../paths'
import { DOWNLOADER_CLIENT_ID } from './constants'

export interface StoredOAuthTokens {
  accessToken: string
  refreshToken: string | null
  tokenType: string
  scope: string | null
  /** Epoch ms when access token expires */
  expiresAt: number | null
  clientId: string
  obtainedAt: string
}

export interface StoredAccountMeta {
  selectedProfileUuid: string | null
  displayName: string | null
  profiles: Array<{ uuid: string; name: string; entitlements: string[] }>
  refreshedAt: string | null
}

export interface StoredHytaleAccount {
  id: string
  addedAt: string
  meta: StoredAccountMeta
}

interface AccountsIndex {
  v: 2
  activeAccountId: string | null
  accounts: StoredHytaleAccount[]
}

interface EncryptedBlob {
  v: 1
  enc: boolean
  payload: string
}

function authDir(): string {
  return join(getSpireRoot(), 'auth')
}

function accountsDir(): string {
  return join(authDir(), 'accounts')
}

function indexPath(): string {
  return join(authDir(), 'accounts-index.json')
}

/** Legacy single-session paths (migrated on first load). */
function legacyTokensPath(): string {
  return join(authDir(), 'hytale-tokens.bin')
}

function legacyMetaPath(): string {
  return join(authDir(), 'hytale-account.json')
}

function tokensPathFor(accountId: string): string {
  return join(accountsDir(), `${accountId}.tokens.bin`)
}

function encodePayload(json: string): EncryptedBlob {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      v: 1,
      enc: true,
      payload: safeStorage.encryptString(json).toString('base64')
    }
  }
  return { v: 1, enc: false, payload: Buffer.from(json, 'utf8').toString('base64') }
}

function decodePayload(blob: EncryptedBlob): string {
  const buf = Buffer.from(blob.payload, 'base64')
  if (blob.enc) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encrypted Hytale session present but OS secure storage is unavailable.')
    }
    return safeStorage.decryptString(buf)
  }
  return buf.toString('utf8')
}

function emptyIndex(): AccountsIndex {
  return { v: 2, activeAccountId: null, accounts: [] }
}

function emptyMeta(): StoredAccountMeta {
  return {
    selectedProfileUuid: null,
    displayName: null,
    profiles: [],
    refreshedAt: null
  }
}

function readIndexRaw(): AccountsIndex {
  const path = indexPath()
  if (!existsSync(path)) return emptyIndex()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as AccountsIndex
    return {
      v: 2,
      activeAccountId: parsed.activeAccountId ?? null,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : []
    }
  } catch {
    return emptyIndex()
  }
}

function writeIndex(index: AccountsIndex): void {
  mkdirSync(authDir(), { recursive: true })
  writeFileSync(indexPath(), JSON.stringify(index, null, 2), { mode: 0o600 })
}

function readTokensFile(path: string): StoredOAuthTokens | null {
  if (!existsSync(path)) return null
  try {
    const blob = JSON.parse(readFileSync(path, 'utf8')) as EncryptedBlob
    const raw = decodePayload(blob)
    const parsed = JSON.parse(raw) as StoredOAuthTokens
    if (!parsed.accessToken) return null
    return {
      ...parsed,
      clientId: parsed.clientId || DOWNLOADER_CLIENT_ID
    }
  } catch {
    return null
  }
}

function writeTokensFile(path: string, tokens: StoredOAuthTokens): void {
  mkdirSync(accountsDir(), { recursive: true })
  const blob = encodePayload(JSON.stringify(tokens))
  writeFileSync(path, JSON.stringify(blob), { mode: 0o600 })
}

/** One-time migrate legacy single-account files into multi-account store. */
function migrateLegacyIfNeeded(): void {
  const index = readIndexRaw()
  if (index.accounts.length > 0) return
  if (!existsSync(legacyTokensPath())) return

  const tokens = readTokensFile(legacyTokensPath())
  if (!tokens) return

  let meta = emptyMeta()
  if (existsSync(legacyMetaPath())) {
    try {
      meta = { ...emptyMeta(), ...JSON.parse(readFileSync(legacyMetaPath(), 'utf8')) }
    } catch {
      // ignore
    }
  }

  const id = randomUUID()
  writeTokensFile(tokensPathFor(id), tokens)
  writeIndex({
    v: 2,
    activeAccountId: id,
    accounts: [
      {
        id,
        addedAt: tokens.obtainedAt || new Date().toISOString(),
        meta
      }
    ]
  })

  try {
    unlinkSync(legacyTokensPath())
  } catch {
    // ignore
  }
  try {
    if (existsSync(legacyMetaPath())) unlinkSync(legacyMetaPath())
  } catch {
    // ignore
  }
}

export function loadAccountsIndex(): AccountsIndex {
  migrateLegacyIfNeeded()
  const index = readIndexRaw()
  // Drop accounts whose token file vanished
  const kept = index.accounts.filter((a) => existsSync(tokensPathFor(a.id)))
  if (kept.length !== index.accounts.length) {
    const active =
      (index.activeAccountId && kept.find((a) => a.id === index.activeAccountId)?.id) ||
      kept[0]?.id ||
      null
    const next = { v: 2 as const, activeAccountId: active, accounts: kept }
    writeIndex(next)
    return next
  }
  if (index.activeAccountId && !kept.find((a) => a.id === index.activeAccountId)) {
    const next = { ...index, activeAccountId: kept[0]?.id ?? null }
    writeIndex(next)
    return next
  }
  return index
}

export function getActiveAccountId(): string | null {
  return loadAccountsIndex().activeAccountId
}

export function listStoredAccounts(): StoredHytaleAccount[] {
  return loadAccountsIndex().accounts
}

export function loadTokens(accountId?: string | null): StoredOAuthTokens | null {
  const index = loadAccountsIndex()
  const id = accountId ?? index.activeAccountId
  if (!id) return null
  return readTokensFile(tokensPathFor(id))
}

export function saveTokens(tokens: StoredOAuthTokens, accountId?: string | null): void {
  const index = loadAccountsIndex()
  const id = accountId ?? index.activeAccountId
  if (!id) {
    // No active account yet — create one (first sign-in).
    createAccountWithTokens(tokens)
    return
  }
  writeTokensFile(tokensPathFor(id), tokens)
}

/**
 * Add a new Hytale OAuth session and make it active.
 * Used when signing in an additional account.
 */
export function createAccountWithTokens(
  tokens: StoredOAuthTokens,
  meta: StoredAccountMeta = emptyMeta()
): StoredHytaleAccount {
  const index = loadAccountsIndex()
  const id = randomUUID()
  writeTokensFile(tokensPathFor(id), tokens)
  const account: StoredHytaleAccount = {
    id,
    addedAt: new Date().toISOString(),
    meta
  }
  const next: AccountsIndex = {
    v: 2,
    activeAccountId: id,
    accounts: [...index.accounts, account]
  }
  writeIndex(next)
  return account
}

export function setActiveAccount(accountId: string): void {
  const index = loadAccountsIndex()
  if (!index.accounts.find((a) => a.id === accountId)) {
    throw new Error('Account not found.')
  }
  writeIndex({ ...index, activeAccountId: accountId })
}

export function removeAccount(accountId: string): void {
  const index = loadAccountsIndex()
  const accounts = index.accounts.filter((a) => a.id !== accountId)
  const active =
    index.activeAccountId === accountId
      ? accounts[0]?.id ?? null
      : index.activeAccountId
  writeIndex({ v: 2, activeAccountId: active, accounts })
  const path = tokensPathFor(accountId)
  if (existsSync(path)) {
    try {
      unlinkSync(path)
    } catch {
      // ignore
    }
  }
}

export function clearAllAccounts(): void {
  const index = loadAccountsIndex()
  for (const a of index.accounts) {
    const path = tokensPathFor(a.id)
    if (existsSync(path)) {
      try {
        unlinkSync(path)
      } catch {
        // ignore
      }
    }
  }
  writeIndex(emptyIndex())
  // Clean legacy leftovers
  for (const p of [legacyTokensPath(), legacyMetaPath()]) {
    if (existsSync(p)) {
      try {
        unlinkSync(p)
      } catch {
        // ignore
      }
    }
  }
  // Remove orphan token files
  if (existsSync(accountsDir())) {
    try {
      for (const name of readdirSync(accountsDir())) {
        if (name.endsWith('.tokens.bin')) {
          try {
            unlinkSync(join(accountsDir(), name))
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }
}

/** @deprecated Prefer clearAllAccounts / removeAccount */
export function clearTokens(): void {
  clearAllAccounts()
}

export function loadAccountMeta(accountId?: string | null): StoredAccountMeta {
  const index = loadAccountsIndex()
  const id = accountId ?? index.activeAccountId
  if (!id) return emptyMeta()
  const account = index.accounts.find((a) => a.id === id)
  return account?.meta ? { ...emptyMeta(), ...account.meta } : emptyMeta()
}

export function saveAccountMeta(meta: StoredAccountMeta, accountId?: string | null): void {
  const index = loadAccountsIndex()
  const id = accountId ?? index.activeAccountId
  if (!id) return
  const accounts = index.accounts.map((a) =>
    a.id === id ? { ...a, meta: { ...emptyMeta(), ...meta } } : a
  )
  writeIndex({ ...index, accounts })
}
