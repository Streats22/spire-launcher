import type {
  ModDetails,
  ModFileInfo,
  ModListing,
  ModSearchOptions,
  ModSearchResult
} from '../../shared/types'
import {
  MODTALE_API_BASE,
  MODTALE_BROWSE_URL,
  MODTALE_CDN_BASE,
  SPIRE_USER_AGENT
} from './constants'

class ModtaleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModtaleError'
  }
}

interface MtProject {
  id: string
  title?: string
  description?: string
  about?: string
  author?: string
  imageUrl?: string
  bannerUrl?: string
  classification?: string
  tags?: string[]
  downloadCount?: number
  favoriteCount?: number
  updatedAt?: string
  createdAt?: string
  status?: string
}

interface MtVersion {
  id: string
  versionNumber: string
  channel?: string
  downloadCount?: number
  fileUrl?: string
  gameVersions?: string[]
  releaseDate?: string
}

async function mtFetch<T>(path: string, apiKey?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': SPIRE_USER_AGENT
  }
  const key = apiKey?.trim()
  if (key) headers['X-MODTALE-KEY'] = key

  const res = await fetch(`${MODTALE_API_BASE}${path}`, { headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ModtaleError(`Modtale ${res.status}: ${body || res.statusText || 'request failed'}`)
  }
  return (await res.json()) as T
}

function sortParam(sort?: string): string {
  switch (sort) {
    case 'name':
      return 'relevance'
    case 'updated':
      return 'updated'
    case 'relevance':
      return 'relevance'
    case 'downloads':
    default:
      return 'downloads'
  }
}

function mapProject(p: MtProject): ModListing {
  return {
    source: 'modtale',
    id: p.id,
    slug: p.id,
    name: p.title?.trim() || `Mod ${p.id}`,
    summary: p.description ?? '',
    author: p.author ?? 'Unknown',
    downloads: Math.round(p.downloadCount ?? 0),
    logoUrl: p.imageUrl ?? null,
    pageUrl: `${MODTALE_BROWSE_URL}/mod/${p.id}`,
    updatedAt: p.updatedAt ?? null,
    categories: [
      ...(p.classification ? [p.classification] : []),
      ...(p.tags ?? [])
    ]
  }
}

function fileNameFromUrl(fileUrl: string, versionNumber: string): string {
  const base = fileUrl.split('/').pop() || `mod-${versionNumber}.jar`
  return base.includes('.') ? base : `${base}.jar`
}

function cdnFileUrl(fileUrl: string): string {
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl
  return `${MODTALE_CDN_BASE}/${fileUrl.replace(/^\//, '')}`
}

export async function searchModtale(
  options: ModSearchOptions = {},
  apiKey?: string | null
): Promise<ModSearchResult> {
  const limit = options.limit ?? 40
  const offset = options.offset ?? 0
  const page = Math.floor(offset / limit)
  const params = new URLSearchParams({
    page: String(page),
    size: String(limit),
    sort: sortParam(options.sort)
  })
  const q = options.query?.trim()
  if (q) params.set('search', q)

  const json = await mtFetch<{
    content?: MtProject[]
    page?: { totalElements?: number; totalPages?: number; number?: number; size?: number }
    totalElements?: number
  }>(`/projects?${params}`, apiKey)

  const mods = (json.content ?? []).map(mapProject)
  const total =
    json.page?.totalElements ??
    json.totalElements ??
    (page === 0 && mods.length < limit ? mods.length : offset + mods.length + (mods.length >= limit ? 1 : 0))

  return {
    mods,
    total,
    hasMore: mods.length >= limit || offset + mods.length < total
  }
}

export async function listModtaleVersions(
  projectId: string,
  apiKey?: string | null
): Promise<ModFileInfo[]> {
  const json = await mtFetch<{ versions?: MtVersion[] }>(
    `/projects/${encodeURIComponent(projectId)}/versions`,
    apiKey
  )
  return (json.versions ?? []).map((v, index) => ({
    source: 'modtale' as const,
    modId: projectId,
    fileId: v.versionNumber || v.id,
    fileName: fileNameFromUrl(v.fileUrl || '', v.versionNumber || v.id),
    displayName: v.versionNumber || v.id,
    fileDate: v.releaseDate ?? '',
    fileLength: 0,
    downloadUrl: v.fileUrl ? cdnFileUrl(v.fileUrl) : null,
    primary: index === 0,
    gameVersions: v.gameVersions,
    releaseType: v.channel?.toLowerCase()
  }))
}

export async function getModtaleDetails(
  projectId: string,
  apiKey?: string | null
): Promise<ModDetails> {
  const [project, versions] = await Promise.all([
    mtFetch<MtProject>(`/projects/${encodeURIComponent(projectId)}`, apiKey),
    listModtaleVersions(projectId, apiKey)
  ])
  const listing = mapProject(project)
  return {
    listing,
    description: project.about || project.description || listing.summary,
    categories: listing.categories ?? [],
    createdAt: project.createdAt ?? null,
    versions,
    images: project.bannerUrl
      ? [{ url: project.bannerUrl, thumbnailUrl: project.imageUrl ?? project.bannerUrl }]
      : project.imageUrl
        ? [{ url: project.imageUrl, thumbnailUrl: project.imageUrl }]
        : [],
    quickDownloadAvailable: versions.some((v) => Boolean(v.downloadUrl))
  }
}

export async function getModtaleDownloadUrl(
  projectId: string,
  version: string,
  apiKey?: string | null
): Promise<{ url: string; fileName: string }> {
  const versions = await listModtaleVersions(projectId, apiKey)
  const file =
    versions.find((v) => v.fileId === version) ??
    versions.find((v) => v.primary) ??
    versions[0]
  if (!file?.downloadUrl) {
    throw new ModtaleError('No download URL from Modtale for this version.')
  }
  return { url: file.downloadUrl, fileName: file.fileName }
}
