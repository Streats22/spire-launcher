/** Best-effort username extraction from Hytale OAuth JWTs (no signature verify). */

export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Prefer human usernames over account/session UUIDs.
 * Official get-profiles uses `username`; OIDC often uses `preferred_username`.
 */
export function usernameFromClaims(claims: Record<string, unknown> | null): string | null {
  if (!claims) return null

  for (const key of ['preferred_username', 'username', 'user_name', 'nickname']) {
    const value = asNonEmptyString(claims[key])
    if (value && !looksLikeUuid(value)) return value
  }

  const name = asNonEmptyString(claims.name)
  if (name && !looksLikeUuid(name)) return name

  const email = asNonEmptyString(claims.email)
  if (email) {
    const local = email.split('@')[0]?.trim()
    if (local) return local
  }

  return null
}

export function usernameFromToken(token: string | null | undefined): string | null {
  return usernameFromClaims(decodeJwtPayload(token))
}
