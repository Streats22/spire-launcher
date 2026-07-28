import type { SpireTheme } from '../../shared/types'

export interface ThemeOption {
  id: SpireTheme
  label: string
  blurb: string
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'slate', label: 'Slate moss', blurb: 'Default cool slate with moss accent' },
  { id: 'ember', label: 'Ember', blurb: 'Warm charcoal with amber accent' },
  { id: 'ocean', label: 'Ocean', blurb: 'Deep navy with teal accent' },
  { id: 'mist', label: 'Mist', blurb: 'Soft graphite with sage accent' },
  { id: 'midnight', label: 'Midnight', blurb: 'Near-black with cyan accent' }
]

export function normalizeTheme(value: unknown): SpireTheme {
  const id = String(value ?? 'slate')
  return THEME_OPTIONS.some((t) => t.id === id) ? (id as SpireTheme) : 'slate'
}

export function applyTheme(theme: SpireTheme): void {
  document.documentElement.setAttribute('data-theme', normalizeTheme(theme))
}
