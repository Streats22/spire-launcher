import { mkdirSync } from 'fs'
import { join } from 'path'
import type { ContentKind } from '../../shared/types'
import { getInstancePath } from '../instances'
import { CURSEFORGE_CLASS_IDS, CURSEFORGE_CLASS_SLUGS, CURSEFORGE_HYTALE_BROWSE_URL } from './constants'

export const CONTENT_KINDS: ContentKind[] = [
  'mods',
  'prefabs',
  'worlds',
  'bootstrap',
  'translations'
]

export function normalizeContentKind(kind?: ContentKind | string | null): ContentKind {
  if (
    kind === 'prefabs' ||
    kind === 'worlds' ||
    kind === 'bootstrap' ||
    kind === 'translations'
  ) {
    return kind
  }
  return 'mods'
}

export function curseForgeClassId(kind: ContentKind): number {
  return CURSEFORGE_CLASS_IDS[kind]
}

export function curseForgeBrowseUrl(kind: ContentKind, query?: string): string {
  const slug = CURSEFORGE_CLASS_SLUGS[kind]
  const base = `https://www.curseforge.com/hytale/${slug}`
  const q = query?.trim()
  return q ? `${base}?search=${encodeURIComponent(q)}` : base
}

export function contentKindLabel(kind: ContentKind): string {
  switch (kind) {
    case 'prefabs':
      return 'Prefabs'
    case 'worlds':
      return 'Worlds'
    case 'bootstrap':
      return 'Bootstraps'
    case 'translations':
      return 'Translations'
    default:
      return 'Mods'
  }
}

/**
 * Where Spire stores downloaded content for an instance.
 * - mods / bootstrap / translations → mods/ (Hytale loads packs & plugins from Mods)
 * - prefabs → prefabs/
 * - worlds → userdata/Saves/
 */
export function contentDir(instanceId: string, kind: ContentKind): string {
  const root = getInstancePath(instanceId)
  if (kind === 'prefabs') {
    const dir = join(root, 'prefabs')
    mkdirSync(dir, { recursive: true })
    return dir
  }
  if (kind === 'worlds') {
    // Hytale loads singleplayer worlds from userdata/Saves/, not instance/worlds/.
    const dir = join(root, 'userdata', 'Saves')
    mkdirSync(dir, { recursive: true })
    return dir
  }
  const dir = join(root, 'mods')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function defaultCurseForgePageUrl(kind: ContentKind, slugOrId: string): string {
  return `${CURSEFORGE_HYTALE_BROWSE_URL.replace(/\/mods$/, `/${CURSEFORGE_CLASS_SLUGS[kind]}`)}/${slugOrId}`
}
