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
  'https://raw.githubusercontent.com/Streats22/spire-launcher/main/updates/latest.json'

/** Compare simple semver-ish strings: 1.2.3 vs 1.2.10 */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((n) => (Number.isFinite(n) ? n : 0))

  const a = parse(latest)
  const b = parse(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return false
}
