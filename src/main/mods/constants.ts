/** Hytale on CurseForge for Studios */
export const CURSEFORGE_HYTALE_GAME_ID = 70216
export const CURSEFORGE_API_BASE = 'https://api.curseforge.com/v1'
export const CURSEFORGE_HYTALE_BROWSE_URL = 'https://www.curseforge.com/hytale/mods'

/**
 * Optional Spire-owned CurseForge API key embedded in source so end users don’t paste one.
 * Official CF API always needs `x-api-key`. Anyone reading this repo will see the key —
 * treat it as a public client key (rate limits / revoke if abused). Overridable at runtime via
 * Settings or env `SPIRE_CURSEFORGE_API_KEY`.
 *
 * Paste your CF console key between the quotes below to ship it with Spire.
 */
export const SPIRE_EMBEDDED_CURSEFORGE_API_KEY =
  '$2a$10$9VUPWRUxaknNUx/UQzxd3uIAXszTngJKlzPEadv9wW7n0qFEUzQOy'

/** Hytale domain on Nexus Mods */
export const NEXUS_GAME_DOMAIN = 'hytale'
export const NEXUS_API_BASE = 'https://api.nexusmods.com/v1'
export const NEXUS_GRAPHQL = 'https://api.nexusmods.com/v2/graphql'
export const NEXUS_HYTALE_BROWSE_URL = `https://www.nexusmods.com/${NEXUS_GAME_DOMAIN}/mods/`

export const SPIRE_USER_AGENT = 'Spire/0.1.0 (Hytale launcher; +https://github.com/spire-launcher)'
