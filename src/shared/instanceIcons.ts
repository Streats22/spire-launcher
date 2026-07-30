/** Built-in instance icon ids (custom images use iconFile on the instance). */
export const DEFAULT_INSTANCE_ICON_ID = 'spire'

export const INSTANCE_ICON_PRESETS = [
  { id: 'spire', label: 'Spire' },
  { id: 'sword', label: 'Sword' },
  { id: 'shield', label: 'Shield' },
  { id: 'pickaxe', label: 'Pickaxe' },
  { id: 'gem', label: 'Gem' },
  { id: 'flame', label: 'Flame' },
  { id: 'leaf', label: 'Leaf' },
  { id: 'moon', label: 'Moon' },
  { id: 'star', label: 'Star' },
  { id: 'compass', label: 'Compass' },
  { id: 'portal', label: 'Portal' },
  { id: 'tower', label: 'Tower' }
] as const

export type InstanceIconPresetId = (typeof INSTANCE_ICON_PRESETS)[number]['id']

const PRESET_IDS = new Set<string>(INSTANCE_ICON_PRESETS.map((p) => p.id))

export function isInstanceIconPresetId(id: string | null | undefined): id is InstanceIconPresetId {
  return typeof id === 'string' && PRESET_IDS.has(id)
}

export function normalizeInstanceIconId(id: string | null | undefined): InstanceIconPresetId {
  return isInstanceIconPresetId(id) ? id : DEFAULT_INSTANCE_ICON_ID
}
