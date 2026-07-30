import type { SpireDensity, SpireHomeLayout, SpireTheme } from '../../shared/types'
import type { CustomThemeColors } from '../../shared/customTheme'
import {
  CUSTOM_THEME_CSS_VAR_KEYS,
  DEFAULT_CUSTOM_THEME,
  buildCustomThemeCssVars,
  normalizeCustomTheme
} from '../../shared/customTheme'

export interface ThemeOption {
  id: SpireTheme
  label: string
  blurb: string
  group: 'dark' | 'light' | 'contrast' | 'custom'
}

export interface DensityOption {
  id: SpireDensity
  label: string
  blurb: string
}

export interface HomeLayoutOption {
  id: SpireHomeLayout
  label: string
  blurb: string
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'slate', label: 'Slate moss', blurb: 'Default cool slate with moss accent', group: 'dark' },
  { id: 'ember', label: 'Ember', blurb: 'Warm charcoal with amber accent', group: 'dark' },
  { id: 'ocean', label: 'Ocean', blurb: 'Deep navy with teal accent', group: 'dark' },
  { id: 'mist', label: 'Mist', blurb: 'Soft graphite with sage accent', group: 'dark' },
  { id: 'midnight', label: 'Midnight', blurb: 'Near-black with cyan accent', group: 'dark' },
  {
    id: 'graphite',
    label: 'Graphite',
    blurb: 'Plain grey gradients, neutral accent',
    group: 'dark'
  },
  {
    id: 'black',
    label: 'Black',
    blurb: 'Minimal near-black surfaces',
    group: 'dark'
  },
  {
    id: 'daybreak',
    label: 'Daybreak',
    blurb: 'Cool light surfaces with moss accent',
    group: 'light'
  },
  {
    id: 'fog',
    label: 'Fog',
    blurb: 'Soft stone light with slate-blue accent',
    group: 'light'
  },
  {
    id: 'white',
    label: 'White',
    blurb: 'Clean white with soft grey gradients',
    group: 'light'
  },
  {
    id: 'custom',
    label: 'Custom',
    blurb: 'Your saved colors (HEX / RGB)',
    group: 'custom'
  },
  {
    id: 'contrast',
    label: 'High contrast',
    blurb: 'Strong borders and ink for readability',
    group: 'contrast'
  }
]

export const DENSITY_OPTIONS: DensityOption[] = [
  { id: 'compact', label: 'Compact', blurb: 'Tighter spacing, smaller type' },
  { id: 'comfortable', label: 'Comfortable', blurb: 'Default balance' },
  { id: 'readable', label: 'Readable', blurb: 'Larger type and airier spacing' }
]

export const HOME_LAYOUT_OPTIONS: HomeLayoutOption[] = [
  { id: 'grid', label: 'Grid', blurb: 'Tile cards with a side action rail' },
  { id: 'list', label: 'List', blurb: 'Dense rows — easier to scan many instances' }
]

const THEME_IDS = new Set(THEME_OPTIONS.map((t) => t.id))
const DENSITY_IDS = new Set(DENSITY_OPTIONS.map((d) => d.id))
const LAYOUT_IDS = new Set(HOME_LAYOUT_OPTIONS.map((l) => l.id))

export function normalizeTheme(value: unknown): SpireTheme {
  const id = String(value ?? 'slate')
  return THEME_IDS.has(id as SpireTheme) ? (id as SpireTheme) : 'slate'
}

export function normalizeDensity(value: unknown): SpireDensity {
  const id = String(value ?? 'comfortable')
  return DENSITY_IDS.has(id as SpireDensity) ? (id as SpireDensity) : 'comfortable'
}

export function normalizeHomeLayout(value: unknown): SpireHomeLayout {
  const id = String(value ?? 'grid')
  return LAYOUT_IDS.has(id as SpireHomeLayout) ? (id as SpireHomeLayout) : 'grid'
}

function clearCustomThemeVars(root: HTMLElement): void {
  for (const key of CUSTOM_THEME_CSS_VAR_KEYS) {
    root.style.removeProperty(key)
  }
}

function applyCustomThemeVars(colors: CustomThemeColors): void {
  const root = document.documentElement
  const normalized = normalizeCustomTheme(colors)
  const vars = buildCustomThemeCssVars(normalized)
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
  root.setAttribute('data-custom-scheme', normalized.scheme)
}

export function applyTheme(theme: SpireTheme, customTheme?: CustomThemeColors | null): void {
  const root = document.documentElement
  const id = normalizeTheme(theme)
  root.setAttribute('data-theme', id)

  if (id === 'custom') {
    applyCustomThemeVars(customTheme ?? DEFAULT_CUSTOM_THEME)
    return
  }

  root.removeAttribute('data-custom-scheme')
  clearCustomThemeVars(root)
}

export function applyDensity(density: SpireDensity): void {
  document.documentElement.setAttribute('data-density', normalizeDensity(density))
}

export function applyHomeLayout(layout: SpireHomeLayout): void {
  document.documentElement.setAttribute('data-home-layout', normalizeHomeLayout(layout))
}

export function applyAppearance(options: {
  theme?: unknown
  density?: unknown
  homeLayout?: unknown
  customTheme?: unknown
}): void {
  if (options.theme !== undefined) {
    applyTheme(
      normalizeTheme(options.theme),
      options.customTheme !== undefined
        ? normalizeCustomTheme(options.customTheme)
        : undefined
    )
  } else if (options.customTheme !== undefined) {
    const current = normalizeTheme(document.documentElement.getAttribute('data-theme'))
    if (current === 'custom') {
      applyTheme('custom', normalizeCustomTheme(options.customTheme))
    }
  }
  if (options.density !== undefined) applyDensity(normalizeDensity(options.density))
  if (options.homeLayout !== undefined) applyHomeLayout(normalizeHomeLayout(options.homeLayout))
}
