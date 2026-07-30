/**
 * User-editable custom theme (saved in Spire settings).
 * Colors accept #RGB / #RRGGBB / rgb() / rgba() and normalize to #rrggbb.
 */

export type CustomThemeScheme = 'dark' | 'light'

export interface CustomThemeColors {
  background: string
  surface: string
  text: string
  accent: string
  scheme: CustomThemeScheme
}

export const DEFAULT_CUSTOM_THEME: CustomThemeColors = {
  background: '#12161c',
  surface: '#1c222a',
  text: '#f2f4f6',
  accent: '#5fad7f',
  scheme: 'dark'
}

export type CustomThemeColorKey = 'background' | 'surface' | 'text' | 'accent'

export const CUSTOM_THEME_FIELDS: Array<{
  key: CustomThemeColorKey
  label: string
  hint: string
}> = [
  { key: 'background', label: 'Background', hint: 'Window shell / page base' },
  { key: 'surface', label: 'Surface', hint: 'Panels, cards, menus' },
  { key: 'text', label: 'Text', hint: 'Primary ink' },
  { key: 'accent', label: 'Accent', hint: 'Buttons and highlights' }
]

interface Rgb {
  r: number
  g: number
  b: number
}

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(255, Math.round(n)))
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((n) => clampByte(n).toString(16).padStart(2, '0'))
    .join('')}`
}

function parseHex(raw: string): Rgb | null {
  const hex = raw.replace(/^#/, '').trim()
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return {
      r: Number.parseInt(hex[0]! + hex[0]!, 16),
      g: Number.parseInt(hex[1]! + hex[1]!, 16),
      b: Number.parseInt(hex[2]! + hex[2]!, 16)
    }
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16)
    }
  }
  return null
}

function parseRgbFunction(raw: string): Rgb | null {
  const match = raw
    .trim()
    .match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*[0-9.]+\s*)?\)$/i)
  if (!match) return null
  return {
    r: clampByte(Number.parseFloat(match[1]!)),
    g: clampByte(Number.parseFloat(match[2]!)),
    b: clampByte(Number.parseFloat(match[3]!))
  }
}

/** Parse a user color string into RGB, or null if invalid. */
export function parseColorInput(value: string): Rgb | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('#')) return parseHex(trimmed)
  if (/^rgba?\(/i.test(trimmed)) return parseRgbFunction(trimmed)
  if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(trimmed)) return parseHex(`#${trimmed}`)
  return null
}

/** Normalize to #rrggbb, or null if the input is not a valid color. */
export function normalizeColorInput(value: string): string | null {
  const rgb = parseColorInput(value)
  return rgb ? toHex(rgb) : null
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  }
}

function lighten(rgb: Rgb, amount: number): Rgb {
  return mix(rgb, { r: 255, g: 255, b: 255 }, amount)
}

function darken(rgb: Rgb, amount: number): Rgb {
  return mix(rgb, { r: 0, g: 0, b: 0 }, amount)
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
}

function contrastInk(bg: Rgb): Rgb {
  return relativeLuminance(bg) > 0.45
    ? { r: 16, g: 16, b: 16 }
    : { r: 248, g: 248, b: 248 }
}

function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${clampByte(rgb.r)}, ${clampByte(rgb.g)}, ${clampByte(rgb.b)}, ${a})`
}

export function normalizeCustomTheme(raw: unknown): CustomThemeColors {
  const base = { ...DEFAULT_CUSTOM_THEME }
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Partial<CustomThemeColors>
  for (const key of ['background', 'surface', 'text', 'accent'] as const) {
    const normalized = typeof obj[key] === 'string' ? normalizeColorInput(obj[key]) : null
    if (normalized) base[key] = normalized
  }
  if (obj.scheme === 'light' || obj.scheme === 'dark') base.scheme = obj.scheme
  return base
}

/** CSS custom properties derived from the four user colors. */
export function buildCustomThemeCssVars(colors: CustomThemeColors): Record<string, string> {
  const c = normalizeCustomTheme(colors)
  const bg = parseHex(c.background) ?? { r: 18, g: 22, b: 28 }
  const surface = parseHex(c.surface) ?? { r: 28, g: 34, b: 42 }
  const text = parseHex(c.text) ?? { r: 242, g: 244, b: 246 }
  const accent = parseHex(c.accent) ?? { r: 95, g: 173, b: 127 }
  const dark = c.scheme === 'dark'

  const shellTop = toHex(dark ? lighten(bg, 0.08) : darken(bg, 0.02))
  const shellMid = toHex(bg)
  const shellBottom = toHex(dark ? darken(bg, 0.12) : darken(bg, 0.08))
  const raised = toHex(surface)
  const sunken = toHex(dark ? darken(bg, 0.18) : darken(bg, 0.06))
  const hover = toHex(dark ? lighten(surface, 0.1) : darken(surface, 0.04))
  const muted = toHex(mix(text, bg, 0.45))
  const secondary = toHex(mix(text, bg, 0.22))
  const accentHover = toHex(lighten(accent, 0.14))
  const accentPressed = toHex(darken(accent, 0.14))
  const accentInk = toHex(contrastInk(accent))
  const line = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
  const lineSoft = dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.14)'

  return {
    '--bg': shellMid,
    '--bg-raised': withAlpha(raised, 0.94),
    '--bg-sunken': withAlpha(sunken, 0.92),
    '--bg-hover': withAlpha(hover, 0.95),
    '--bg-selected': withAlpha(toHex(accent), 0.28),
    '--bg-selected-hover': withAlpha(toHex(accent), 0.38),
    '--inset': dark ? 'rgba(0, 0, 0, 0.32)' : 'rgba(0, 0, 0, 0.05)',
    '--inset-strong': dark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.09)',
    '--shell-top': shellTop,
    '--shell-mid': shellMid,
    '--shell-bottom': shellBottom,
    '--line': line,
    '--line-soft': lineSoft,
    '--ink': toHex(text),
    '--ink-secondary': secondary,
    '--muted': muted,
    '--accent': toHex(accent),
    '--accent-hover': accentHover,
    '--accent-pressed': accentPressed,
    '--accent-ink': accentInk,
    '--accent-soft': withAlpha(toHex(accent), 0.16),
    '--danger': '#e07070',
    '--danger-soft': 'rgba(224, 112, 112, 0.2)',
    '--warn': '#d4a84b',
    '--ok': toHex(accent),
    '--focus': accentHover,
    '--nav-bg': withAlpha(raised, 0.96),
    '--nav-item-hover': dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    '--nav-item-active': withAlpha(toHex(accent), 0.18),
    '--nav-border': line,
    '--log-bg': sunken,
    '--log-ink': toHex(text),
    '--log-muted': muted,
    '--log-info': secondary,
    '--log-warn': '#e08a7a',
    '--log-debug': secondary,
    '--log-trace': muted,
    '--swatch-border': lineSoft,
    '--shadow-sm': dark ? '0 1px 2px rgba(0, 0, 0, 0.35)' : '0 1px 2px rgba(0, 0, 0, 0.08)',
    '--shadow-md': dark
      ? '0 12px 40px rgba(0, 0, 0, 0.45)'
      : '0 12px 36px rgba(0, 0, 0, 0.12)',
    '--action-bar-bg': withAlpha(raised, 0.9),
    '--menu-bg': withAlpha(raised, 0.97),
    '--menu-shadow': dark
      ? '0 12px 32px rgba(0, 0, 0, 0.5)'
      : '0 12px 32px rgba(0, 0, 0, 0.14)',
    '--surface-soft': dark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
    '--surface-hover': dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'
  }
}

export const CUSTOM_THEME_CSS_VAR_KEYS = Object.keys(
  buildCustomThemeCssVars(DEFAULT_CUSTOM_THEME)
)
