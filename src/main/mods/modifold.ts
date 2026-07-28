import type {
  ModDetails,
  ModFileInfo,
  ModListing,
  ModSearchOptions,
  ModSearchResult
} from '../../shared/types'
import { MODIFOLD_API_BASE, MODIFOLD_BROWSE_URL, SPIRE_USER_AGENT } from './constants'

class ModifoldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModifoldError'
  }
}

interface MfOwner {
  username?: string
  slug?: string
}

interface MfVersion {
  id: string
  project_id?: string
  version_number?: string
  downloads?: number
  release_channel?: string
  file_url?: string
  download_url?: string
  file_size?: number
  created_at?: string
  game_versions?: string | string[]
  primary_file?: { url?: string; size?: number }
  files?: { url?: string; size?: number; primary?: boolean }[]
  changelog?: string
}

interface MfProject {
  id: string
  slug: string
  title?: string
  summary?: string
  description?: string
  icon_url?: string
  downloads?: number
  updated_at?: string
  created_at?: string
  tags?: string[]
  project_type?: string
  owner?: MfOwner
  gallery?: { url?: string; featured?: number }[]
  versions?: MfVersion[]
}

async function mfFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${MODIFOLD_API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': SPIRE_USER_AGENT
    }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ModifoldError(`Modifold ${res.status}: ${body || res.statusText || 'request failed'}`)
  }
  return (await res.json()) as T
}

function mapProject(p: MfProject): ModListing {
  return {
    source: 'modifold',
    id: p.id,
    slug: p.slug,
    name: p.title?.trim() || p.slug,
    summary: p.summary ?? '',
    author: p.owner?.username ?? 'Unknown',
    downloads: Math.round(p.downloads ?? 0),
    logoUrl: p.icon_url ?? null,
    pageUrl: `${MODIFOLD_BROWSE_URL}/mod/${p.slug}`,
    updatedAt: p.updated_at ?? null,
    categories: p.tags ?? []
  }
}

function gameVersions(v: MfVersion): string[] | undefined {
  if (Array.isArray(v.game_versions)) return v.game_versions
  if (typeof v.game_versions === 'string' && v.game_versions.trim()) {
    return v.game_versions.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return undefined
}

function versionDownloadUrl(v: MfVersion): string | null {
  return (
    v.download_url ||
    v.file_url ||
    v.primary_file?.url ||
    v.files?.find((f) => f.primary)?.url ||
    v.files?.[0]?.url ||
    null
  )
}

function fileNameFromVersion(v: MfVersion): string {
  const url = versionDownloadUrl(v) || ''
  const base = url.split('/').pop()?.split('?')[0]
  if (base && base.includes('.')) return base
  return `${v.version_number || v.id}.jar`
}

function mapVersions(projectId: string, versions: MfVersion[]): ModFileInfo[] {
  return versions.map((v, index) => ({
    source: 'modifold' as const,
    modId: projectId,
    fileId: v.id,
    fileName: fileNameFromVersion(v),
    displayName: v.version_number || v.id,
    fileDate: v.created_at ?? '',
    fileLength: v.file_size ?? v.primary_file?.size ?? 0,
    downloadUrl: versionDownloadUrl(v),
    primary: index === 0,
    gameVersions: gameVersions(v),
    releaseType: v.release_channel
  }))
}

export async function searchModifold(options: ModSearchOptions = {}): Promise<ModSearchResult> {
  const limit = options.limit ?? 40
  const offset = options.offset ?? 0
  const page = Math.floor(offset / limit) + 1
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page)
  })
  const q = options.query?.trim()
  if (q) params.set('search', q)

  const json = await mfFetch<{
    projects?: MfProject[]
    totalPages?: number
    currentPage?: number
  }>(`/projects?${params}`)

  let mods = (json.projects ?? []).map(mapProject)
  if (options.sort === 'name') {
    mods = [...mods].sort((a, b) => a.name.localeCompare(b.name))
  } else if (options.sort === 'updated') {
    mods = [...mods].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  } else if (options.sort === 'downloads') {
    mods = [...mods].sort((a, b) => b.downloads - a.downloads)
  }

  const totalPages = json.totalPages ?? 1
  const currentPage = json.currentPage ?? page
  const total = totalPages * limit

  return {
    mods,
    total,
    hasMore: currentPage < totalPages || mods.length >= limit
  }
}

export async function getModifoldDetails(projectIdOrSlug: string): Promise<ModDetails> {
  const project = await mfFetch<MfProject>(
    `/projects/${encodeURIComponent(projectIdOrSlug)}`
  )
  const listing = mapProject(project)
  const versions = mapVersions(project.id, project.versions ?? [])
  return {
    listing,
    description: project.description || project.summary || listing.summary,
    categories: listing.categories ?? [],
    createdAt: project.created_at ?? null,
    versions,
    images: (project.gallery ?? [])
      .map((g) => ({
        url: g.url || '',
        thumbnailUrl: g.url || null,
        title: null
      }))
      .filter((g) => g.url),
    quickDownloadAvailable: versions.some((v) => Boolean(v.downloadUrl))
  }
}

export async function listModifoldVersions(projectIdOrSlug: string): Promise<ModFileInfo[]> {
  const details = await getModifoldDetails(projectIdOrSlug)
  return details.versions
}

export async function getModifoldDownloadUrl(
  projectIdOrSlug: string,
  fileId?: string
): Promise<{ url: string; fileName: string; fileId: string; name: string; pageUrl: string }> {
  const details = await getModifoldDetails(projectIdOrSlug)
  const file =
    (fileId ? details.versions.find((v) => v.fileId === fileId) : null) ??
    details.versions.find((v) => v.primary) ??
    details.versions[0]
  if (!file?.downloadUrl) {
    throw new ModifoldError('No downloadable file on Modifold for this project.')
  }
  return {
    url: file.downloadUrl,
    fileName: file.fileName,
    fileId: file.fileId,
    name: details.listing.name,
    pageUrl: details.listing.pageUrl
  }
}
