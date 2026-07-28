/** Official Hypixel / Hytale OAuth + package hosts (same as official tools). */
export const OAUTH_DEVICE_AUTH = 'https://oauth.accounts.hytale.com/oauth2/device/auth'
export const OAUTH_TOKEN = 'https://oauth.accounts.hytale.com/oauth2/token'
export const ACCOUNT_DATA = 'https://account-data.hytale.com'
export const SESSIONS = 'https://sessions.hytale.com'
export const OFFICIAL_DOWNLOAD_PAGE = 'https://accounts.hytale.com/download'
export const ACCOUNTS_DEVICE_PAGE = 'https://accounts.hytale.com/device'

/**
 * Public OAuth client used by the official Hytale Downloader CLI.
 * Device Authorization (RFC 8628) — documented by Hypixel for game-assets.
 */
export const DOWNLOADER_CLIENT_ID = 'hytale-downloader'
export const DOWNLOADER_SCOPE = 'offline auth:downloader'

/** Official launcher client (browser PKCE). Reserved for future client-patch work. */
export const LAUNCHER_CLIENT_ID = 'hytale-launcher'
export const LAUNCHER_SCOPE = 'openid offline auth:launcher'

export const USER_AGENT = 'SpireLauncher/0.1 (legitimate third-party; official Hytale APIs only)'
