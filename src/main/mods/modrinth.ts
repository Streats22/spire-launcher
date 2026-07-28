import type {
  ModDetails,
  ModFileInfo,
  ModListing,
  ModSearchOptions,
  ModSearchResult
} from '../../shared/types'
import { SPIRE_USER_AGENT } from './constants'

const MODRINTH_API = 'https://api.modrinth.com/v2'

/**
 * Modrinth browse/download needs NO API key — only a proper User-Agent.
 * As of 2026 they do not host Hytale mods (Minecraft only). We still wire the
 * client so Spire is ready when/if that changes.
 */
export const MODRINTH_HYTALE_NOTICE =
  'Modrinth does not list Hytale mods yet (Minecraft only). No API key is required when they add support — Spire is already wired for keyless browse/download.'

class ModrinthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModrinthError'
  }
}

async function mrFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${MODRINTH_API}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': SPIRE_USER_AGENT
    }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ModrinthError(`Modrinth ${res.status}: ${body || res.statusText}`)
  }
  return (await res.json()) as T
}

interface MrHit {
  project_id: string
  slug: string
  title: string
  description: string
  author: string
  downloads: number
  icon_url?: string
  date_modified?: string
  categories?: string[]
  project_type?: string
}

interface MrProject {
  id: string
  slug: string
  title: string
  description: string
  body?: string
  downloads: number
  icon_url?: string
  updated?: string
  published?: string
  categories?: string[]
  project_type?: string
  team?: string
}

interface MrVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  date_published: string
  downloads: number
  version_type?: string
  game_versions?: string[]
  files: {
    filename: string
    url: string
    size: number
    primary: boolean
  }[]
}

function mapHit(hit: MrHit): ModListing {
  return {
    source: 'modrinth',
    id: hit.project_id,
    slug: hit.slug,
    name: hit.title,
    summary: hit.description ?? '',
    author: hit.author || 'Unknown',
    downloads: hit.downloads ?? 0,
    logoUrl: hit.icon_url ?? null,
    pageUrl: `https://modrinth.com/mod/${hit.slug}`,
    updatedAt: hit.date_modified ?? null,
    categories: hit.categories ?? []
  }
}

function sortIndex(sort: ModSearchOptions['sort']): string {
  switch (sort) {
    case 'downloads':
      return 'downloads'
    case 'updated':
      return 'updated'
    case 'name':
      return 'newest'
    default:
      return 'relevance'
  }
}

export async function searchModrinth(options: ModSearchOptions = {}): Promise<ModSearchResult> {
  // Probe for any Hytale-tagged content; today this will be empty / Minecraft false-positives.
  // We intentionally do not return Minecraft mods as Hytale results.
  const params = new URLSearchParams({
    query: options.query?.trim() || 'hytale',
    limit: String(options.limit ?? 24),
    offset: String(options.offset ?? 0),
    index: sortIndex(options.sort)
  })
  // No official Hytale facet exists — keep empty catalog with notice.
  void params

  return {
    mods: [],
    total: 0,
    hasMore: false,
    notice: MODRINTH_HYTALE_NOTICE
  }
}

export async function getModrinthDetails(projectId: string): Promise<ModDetails> {
  try {
    const project = await mrFetch<MrProject>(`/project/${encodeURIComponent(projectId)}`)
    const versions = await mrFetch<MrVersion[]>(
      `/project/${encodeURIComponent(projectId)}/version`
    )

    // If somehow a project is opened, still map it — but flag notice for Hytale launcher context
    const listing: ModListing = {
      source: 'modrinth',
      id: project.id,
      slug: project.slug,
      name: project.title,
      summary: project.description ?? '',
      author: 'Modrinth',
      downloads: project.downloads ?? 0,
      logoUrl: project.icon_url ?? null,
      pageUrl: `https://modrinth.com/mod/${project.slug}`,
      updatedAt: project.updated ?? null,
      categories: project.categories ?? []
    }

    return {
      listing,
      description: project.body || project.description || '',
      categories: project.categories ?? [],
      createdAt: project.published ?? null,
      versions: versions.flatMap((v) =>
        v.files.map((f, i) => ({
          source: 'modrinth' as const,
          modId: project.id,
          fileId: v.id,
          fileName: f.filename,
          displayName: `${v.name} (${v.version_number})`,
          fileDate: v.date_published,
          fileLength: f.size,
          downloadUrl: f.url,
          primary: f.primary || i === 0,
          gameVersions: v.game_versions,
          releaseType: v.version_type
        }))
      ),
      unavailableForHytale: true,
      notice: MODRINTH_HYTALE_NOTICE
    }
  } catch {
    return {
      listing: {
        source: 'modrinth',
        id: projectId,
        slug: projectId,
        name: 'Unavailable',
        summary: '',
        author: '',
        downloads: 0,
        logoUrl: null,
        pageUrl: 'https://modrinth.com',
        updatedAt: null
      },
      description: '',
      categories: [],
      createdAt: null,
      versions: [],
      unavailableForHytale: true,
      notice: MODRINTH_HYTALE_NOTICE
    }
  }
}

export async function listModrinthVersions(projectId: string): Promise<ModFileInfo[]> {
  const details = await getModrinthDetails(projectId)
  return details.versions
}

export async function getModrinthDownloadUrl(
  projectId: string,
  versionId: string
): Promise<{ url: string; fileName: string }> {
  const versions = await mrFetch<MrVersion[]>(`/project/${encodeURIComponent(projectId)}/version`)
  const version = versions.find((v) => v.id === versionId) ?? versions[0]
  const file = version?.files.find((f) => f.primary) ?? version?.files[0]
  if (!file) throw new ModrinthError('No downloadable file on this Modrinth version.')
  return { url: file.url, fileName: file.filename }
}

// silence unused until catalog exists
export function _modrinthSearchRaw(options: ModSearchOptions): Promise<ModSearchResult> {
  const params = new URLSearchParams({
    query: options.query?.trim() || '',
    limit: String(options.limit ?? 24),
    offset: String(options.offset ?? 0),
    index: sortIndex(options.sort)
  })
  return mrFetch<{ hits: MrHit[]; total_hits: number }>(`/search?${params}`).then((json) => ({
    mods: (json.hits ?? []).map(mapHit),
    total: json.total_hits ?? 0,
    notice: MODRINTH_HYTALE_NOTICE
  }))
}
