import type {
  ModDetails,
  ModFileInfo,
  ModImage,
  ModListing,
  ModSearchOptions,
  ModSearchResult
} from '../../shared/types'
import {
  CURSEFORGE_API_BASE,
  CURSEFORGE_HYTALE_BROWSE_URL,
  CURSEFORGE_HYTALE_GAME_ID,
  SPIRE_USER_AGENT
} from './constants'

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
}

function mapMod(mod: CfMod): ModListing {
  return {
    source: 'curseforge',
    id: String(mod.id),
    slug: mod.slug,
    name: mod.name,
    summary: mod.summary ?? '',
    author: mod.authors?.[0]?.name ?? 'Unknown',
    downloads: Math.round(mod.downloadCount ?? 0),
    logoUrl: mod.logo?.thumbnailUrl ?? mod.logo?.url ?? null,
    pageUrl: mod.links?.websiteUrl ?? `https://www.curseforge.com/hytale/mods/${mod.slug}`,
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
  const params = new URLSearchParams({
    gameId: String(CURSEFORGE_HYTALE_GAME_ID),
    pageSize: String(options.limit ?? 40),
    index: String(options.offset ?? 0),
    sortField: sortField(options.sort),
    sortOrder: options.sort === 'name' ? 'asc' : 'desc'
  })
  const trimmed = options.query?.trim()
  if (trimmed) params.set('searchFilter', trimmed)

  const json = await cfFetch<{ data: CfMod[]; pagination?: { totalCount?: number } }>(
    apiKey,
    `/mods/search?${params}`
  )

  return {
    mods: (json.data ?? []).map(mapMod),
    total: json.pagination?.totalCount ?? json.data?.length ?? 0
  }
}

/** Keyless fallback: point the user at the public catalog (no scraping). */
export function keylessCurseForgeSearch(options: ModSearchOptions = {}): ModSearchResult {
  const q = options.query?.trim()
  return {
    mods: [],
    total: 0,
    notice: q
      ? `No embedded CurseForge key — opened search in your browser, or use Import file after downloading.`
      : `No embedded CurseForge key — browse CurseForge in your browser, then Import file. Optional key in Settings enables in-app search & fast download.`
  }
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
              : undefined
    }))
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
