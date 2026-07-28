import type { HytaleProfile } from './types'

/** Prefer the selected game profile name over the OAuth account username. */
export function gameProfileLabel(
  input: {
    displayName?: string | null
    profileUuid?: string | null
    profiles?: HytaleProfile[]
  },
  fallback = 'Hytale'
): string {
  const profiles = input.profiles ?? []
  const selected =
    profiles.find((p) => p.uuid === input.profileUuid) || profiles[0] || null
  return selected?.name?.trim() || input.displayName?.trim() || fallback
}
