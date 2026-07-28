/** Hytale on CurseForge for Studios */
export const CURSEFORGE_HYTALE_GAME_ID = 70216
export const CURSEFORGE_API_BASE = 'https://api.curseforge.com/v1'
export const CURSEFORGE_HYTALE_BROWSE_URL = 'https://www.curseforge.com/hytale/mods'

/** CurseForge Hytale class (project type) ids */
export const CURSEFORGE_CLASS_IDS = {
  mods: 9137,
  prefabs: 9185,
  worlds: 9184,
  bootstrap: 9281,
  translations: 10350
} as const

export const CURSEFORGE_CLASS_SLUGS = {
  mods: 'mods',
  prefabs: 'prefabs',
  worlds: 'worlds',
  bootstrap: 'bootstrap',
  translations: 'translations'
} as const

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

/** Community Hytale hosts */
export const MODTALE_API_BASE = 'https://api.modtale.net/api/v1'
export const MODTALE_CDN_BASE = 'https://cdn.modtale.net'
export const MODTALE_BROWSE_URL = 'https://modtale.net'

export const MODIFOLD_API_BASE = 'https://api.modifold.com'
export const MODIFOLD_BROWSE_URL = 'https://modifold.com'

export const THUNDERSTORE_HYTALE_API = 'https://thunderstore.io/c/hytale/api/v1/package/'
export const THUNDERSTORE_HYTALE_BROWSE_URL = 'https://thunderstore.io/c/hytale/'

export const SPIRE_USER_AGENT = 'Spire/0.1.0 (Hytale launcher; +https://github.com/spire-launcher)'
