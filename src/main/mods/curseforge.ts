import type {
  ContentCategory,
  ContentKind,
  ModDependencyRef,
  ModDetails,
  ModFileInfo,
  ModImage,
  ModListing,
  ModSearchOptions,
  ModSearchResult
} from '../../shared/types'
import {
  CURSEFORGE_API_BASE,
  CURSEFORGE_CLASS_IDS,
  CURSEFORGE_CLASS_SLUGS,
  CURSEFORGE_HYTALE_BROWSE_URL,
  CURSEFORGE_HYTALE_GAME_ID,
  SPIRE_USER_AGENT
} from './constants'
import { curseForgeClassId, normalizeContentKind } from './contentKinds'

class CurseForgeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CurseForgeError'
  }
}

async function cfFetch<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${CURSEFORGE_API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'x-api-key': apiKey,
      'User-Agent': SPIRE_USER_AGENT
    }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new CurseForgeError(
      `CurseForge ${res.status}: ${body || res.statusText || 'request failed'}`
    )
  }
  return (await res.json()) as T
}

interface CfScreenshot {
  id?: number
  title?: string
  description?: string
  thumbnailUrl?: string
  url?: string
}

interface CfMod {
  id: number
  name: string
  slug: string
  summary?: string
  downloadCount?: number
  dateCreated?: string
  dateModified?: string
  classId?: number
  authors?: { name: string }[]
  logo?: { thumbnailUrl?: string; url?: string } | null
  links?: { websiteUrl?: string }
  categories?: { name: string }[]
  screenshots?: CfScreenshot[]
  latestFilesIndexes?: { fileId: number; filename: string }[]
}

interface CfFile {
  id: number
  modId: number
  displayName: string
  fileName: string
  fileDate: string
  fileLength: number
  downloadUrl: string | null
  isAvailable: boolean
  releaseType?: number
  gameVersions?: string[]
  dependencies?: { modId?: number; relationType?: number }[]
}

/** CurseForge relationType → Spire relation. Auto-install required + embedded + include. */
function mapCfRelation(relationType: number | undefined): ModDependencyRef['relation'] | null {
  switch (relationType) {
    case 1:
      return 'embedded'
    case 2:
      return 'optional'
    case 3:
      return 'required'
    case 4:
      return 'tool'
    case 5:
      return 'incompatible'
    case 6:
      return 'include'
    default:
      return null
  }
}

function mapCfDependencies(file: CfFile): ModDependencyRef[] {
  const out: ModDependencyRef[] = []
  for (const dep of file.dependencies ?? []) {
    if (dep.modId == null) continue
    const relation = mapCfRelation(dep.relationType)
    if (!relation) continue
    out.push({
      source: 'curseforge',
      modId: String(dep.modId),
      relation
    })
  }
  return out
}

export function isAutoInstallDependency(relation: ModDependencyRef['relation']): boolean {
  return relation === 'required' || relation === 'embedded' || relation === 'include'
}

function browseSlugForClassId(classId?: number): string {
  if (classId == null) return CURSEFORGE_CLASS_SLUGS.mods
  for (const [kind, id] of Object.entries(CURSEFORGE_CLASS_IDS)) {
    if (id === classId) {
      return CURSEFORGE_CLASS_SLUGS[kind as keyof typeof CURSEFORGE_CLASS_SLUGS]
    }
  }
  return CURSEFORGE_CLASS_SLUGS.mods
}

function mapMod(mod: CfMod): ModListing {
  const classSlug = browseSlugForClassId(mod.classId)
  return {
    source: 'curseforge',
    id: String(mod.id),
    slug: mod.slug,
    name: mod.name,
    summary: mod.summary ?? '',
    author: mod.authors?.[0]?.name ?? 'Unknown',
    downloads: Math.round(mod.downloadCount ?? 0),
    logoUrl: mod.logo?.thumbnailUrl ?? mod.logo?.url ?? null,
    pageUrl:
      mod.links?.websiteUrl ?? `https://www.curseforge.com/hytale/${classSlug}/${mod.slug}`,
    updatedAt: mod.dateModified ?? null,
    categories: (mod.categories ?? []).map((c) => c.name)
  }
}

function mapImages(mod: CfMod): ModImage[] {
  const shots = (mod.screenshots ?? [])
    .map((s) => ({
      url: s.url || s.thumbnailUrl || '',
      thumbnailUrl: s.thumbnailUrl ?? s.url ?? null,
      title: s.title ?? s.description ?? null
    }))
    .filter((s) => s.url)
  if (shots.length) return shots
  const logo = mod.logo?.url || mod.logo?.thumbnailUrl
  return logo ? [{ url: logo, thumbnailUrl: mod.logo?.thumbnailUrl ?? logo, title: 'Logo' }] : []
}

function sortField(sort: ModSearchOptions['sort']): string {
  switch (sort) {
    case 'downloads':
      return '6'
    case 'updated':
      return '3'
    case 'name':
      return '4'
    default:
      return '2'
  }
}

export function curseForgeFilesPageUrl(listing: ModListing, fileId?: string): string {
  const base = listing.pageUrl || `${CURSEFORGE_HYTALE_BROWSE_URL}/${listing.slug}`
  if (fileId) return `${base}/files/${fileId}`
  return `${base}/files`
}

export async function searchCurseForge(
  apiKey: string,
  options: ModSearchOptions = {}
): Promise<ModSearchResult> {
  const kind = normalizeContentKind(options.kind)
  const params = new URLSearchParams({
    gameId: String(CURSEFORGE_HYTALE_GAME_ID),
    classId: String(curseForgeClassId(kind)),
    pageSize: String(options.limit ?? 40),
    index: String(options.offset ?? 0),
    sortField: sortField(options.sort),
    sortOrder: options.sort === 'name' ? 'asc' : 'desc'
  })
  const trimmed = options.query?.trim()
  if (trimmed) params.set('searchFilter', trimmed)
  if (options.categoryId != null && options.categoryId > 0) {
    params.set('categoryId', String(options.categoryId))
  }

  const json = await cfFetch<{ data: CfMod[]; pagination?: { totalCount?: number } }>(
    apiKey,
    `/mods/search?${params}`
  )

  const mods = (json.data ?? []).map(mapMod)
  const offset = options.offset ?? 0
  const limit = options.limit ?? 40
  const total = json.pagination?.totalCount ?? offset + mods.length

  return {
    mods,
    total,
    hasMore:
      json.pagination?.totalCount != null
        ? offset + mods.length < json.pagination.totalCount
        : mods.length >= limit
  }
}

/** Keyless fallback: point the user at the public catalog (no scraping). */
export function keylessCurseForgeSearch(options: ModSearchOptions = {}): ModSearchResult {
  const kind = normalizeContentKind(options.kind)
  const q = options.query?.trim()
  return {
    mods: [],
    total: 0,
    notice: q
      ? `No embedded CurseForge key — opened search in your browser, or use Import file after downloading.`
      : `No embedded CurseForge key — browse ${kind} on CurseForge in your browser, then Import file. Optional key in Settings enables in-app search & fast download.`
  }
}

export async function listCurseForgeCategories(
  apiKey: string,
  kind: ContentKind
): Promise<ContentCategory[]> {
  const classId = curseForgeClassId(kind)
  const json = await cfFetch<{
    data: {
      id: number
      name: string
      slug: string
      classId?: number
      parentCategoryId?: number | null
    }[]
  }>(apiKey, `/categories?gameId=${CURSEFORGE_HYTALE_GAME_ID}`)

  return (json.data ?? [])
    .filter((c) => c.classId === classId && c.id !== classId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      kind
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listCurseForgeFiles(apiKey: string, modId: string): Promise<ModFileInfo[]> {
  const json = await cfFetch<{ data: CfFile[] }>(apiKey, `/mods/${modId}/files?pageSize=50`)
  return (json.data ?? [])
    .filter((f) => f.isAvailable !== false)
    .map((f, index) => ({
      source: 'curseforge' as const,
      modId: String(f.modId || modId),
      fileId: String(f.id),
      fileName: f.fileName,
      displayName: f.displayName || f.fileName,
      fileDate: f.fileDate,
      fileLength: f.fileLength,
      downloadUrl: f.downloadUrl,
      primary: index === 0,
      gameVersions: f.gameVersions,
      releaseType:
        f.releaseType === 1
          ? 'release'
          : f.releaseType === 2
            ? 'beta'
            : f.releaseType === 3
              ? 'alpha'
              : undefined,
      dependencies: mapCfDependencies(f)
    }))
}

/** Required / embedded / include dependency mod ids for a CurseForge file. */
export async function listCurseForgeAutoDependencies(
  apiKey: string,
  modId: string,
  fileId?: string
): Promise<ModDependencyRef[]> {
  const files = await listCurseForgeFiles(apiKey, modId)
  const file = fileId
    ? files.find((f) => f.fileId === fileId)
    : files.find((f) => f.primary) ?? files[0]
  return (file?.dependencies ?? []).filter((d) => isAutoInstallDependency(d.relation))
}

export async function getCurseForgeDownloadUrl(
  apiKey: string,
  modId: string,
  fileId: string
): Promise<string> {
  const json = await cfFetch<{ data: string }>(
    apiKey,
    `/mods/${modId}/files/${fileId}/download-url`
  )
  if (!json.data) {
    throw new CurseForgeError(
      'No download URL — the author may have disabled third-party distribution.'
    )
  }
  return json.data
}

/** ForgeCDN layout used when the files list omits `downloadUrl`. */
export function curseForgeCdnFileUrl(fileId: string | number, fileName: string): string {
  const id = Number(fileId)
  const top = Math.floor(id / 1000)
  const bottom = id % 1000
  return `https://edge.forgecdn.net/files/${top}/${bottom}/${fileName}`
}

/**
 * Resolve a direct file URL: listed URL → download-url API → ForgeCDN probe.
 * Throws when the author blocked third-party downloads (browser required).
 */
export async function resolveCurseForgeFileUrl(
  apiKey: string,
  modId: string,
  file: Pick<ModFileInfo, 'fileId' | 'fileName' | 'downloadUrl'>
): Promise<string> {
  if (file.downloadUrl?.trim()) return file.downloadUrl.trim()

  try {
    return await getCurseForgeDownloadUrl(apiKey, modId, file.fileId)
  } catch {
    // Try CDN layout before giving up — some files omit downloadUrl but still serve.
  }

  const cdn = curseForgeCdnFileUrl(file.fileId, file.fileName)
  const head = await fetch(cdn, {
    method: 'HEAD',
    headers: { 'User-Agent': SPIRE_USER_AGENT },
    redirect: 'follow'
  }).catch(() => null)
  if (head?.ok) return cdn

  const ranged = await fetch(cdn, {
    method: 'GET',
    headers: {
      'User-Agent': SPIRE_USER_AGENT,
      Range: 'bytes=0-0'
    },
    redirect: 'follow'
  }).catch(() => null)
  if (ranged && (ranged.ok || ranged.status === 206)) {
    try {
      await ranged.body?.cancel()
    } catch {
      // ignore
    }
    return cdn
  }

  throw new CurseForgeError(
    'Author disabled third-party downloads — Spire can’t pull this file in-app. Use the Files page in your browser, then Import if needed.'
  )
}

export async function getCurseForgeMod(apiKey: string, modId: string): Promise<ModListing> {
  const json = await cfFetch<{ data: CfMod }>(apiKey, `/mods/${modId}`)
  return mapMod(json.data)
}

export async function getCurseForgeDetails(apiKey: string, modId: string): Promise<ModDetails> {
  const [listing, descJson, versions, full] = await Promise.all([
    getCurseForgeMod(apiKey, modId),
    cfFetch<{ data: string }>(apiKey, `/mods/${modId}/description`).catch(() => ({
      data: ''
    })),
    listCurseForgeFiles(apiKey, modId),
    cfFetch<{ data: CfMod }>(apiKey, `/mods/${modId}`)
  ])

  const hasQuick = versions.some((v) => Boolean(v.downloadUrl)) || versions.length > 0

  return {
    listing,
    description: descJson.data || listing.summary || '',
    categories: listing.categories ?? [],
    createdAt: full.data.dateCreated ?? null,
    versions,
    images: mapImages(full.data),
    quickDownloadAvailable: hasQuick
  }
}
