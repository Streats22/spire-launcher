/**
 * Spire's only first-party network call (when the user leaves update checks on).
 *
 * Expected JSON shape:
 * {
 *   "version": "0.2.0",
 *   "url": "https://github.com/…/releases/latest",
 *   "notes": "Optional short changelog"
 * }
 *
 * Main process may override with SPIRE_UPDATE_URL.
 */
export const DEFAULT_UPDATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/spire-launcher/spire-launcher/main/updates/latest.json'
