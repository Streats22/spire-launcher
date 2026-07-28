import type {
  ModDetails,
  ModFileInfo,
  ModImage,
  ModListing,
  ModSearchOptions,
  ModSearchResult
} from '../../shared/types'
import { NEXUS_API_BASE, NEXUS_GAME_DOMAIN, NEXUS_GRAPHQL, NEXUS_HYTALE_BROWSE_URL, SPIRE_USER_AGENT } from './constants'

export class NexusError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NexusError'
  }
}

export interface ParsedNxmLink {
  domain: string
  modId: number
  fileId: number
  key?: string
  expires?: number
}

/** nxm://hytale/mods/123/files/456?key=…&expires=… */
export function parseNxmLink(raw: string): ParsedNxmLink {
  const trimmed = raw.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new NexusError('Invalid nxm link.')
  }
  if (url.protocol !== 'nxm:') {
    throw new NexusError('Link must start with nxm://')
  }

  const domain = url.hostname
  const parts = url.pathname.replace(/^\/+/, '').split('/')
  if (parts[0] !== 'mods' || parts[2] !== 'files') {
    throw new NexusError('Unrecognized nxm link format.')
  }
  const modId = Number(parts[1])
  const fileId = Number(parts[3])
  if (!Number.isFinite(modId) || !Number.isFinite(fileId)) {
    throw new NexusError('nxm link is missing mod/file ids.')
  }

  const key = url.searchParams.get('key') || undefined
  const expiresRaw = url.searchParams.get('expires')
  const expires = expiresRaw ? Number(expiresRaw) : undefined

  return { domain, modId, fileId, key, expires }
}

function nexusHeaders(apiKey?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Application-Name': 'Spire',
    'Application-Version': '0.1.0',
    'User-Agent': SPIRE_USER_AGENT
  }
  if (apiKey?.trim()) headers.apikey = apiKey.trim()
  return headers
}

async function nexusFetch<T>(path: string, apiKey?: string | null): Promise<T> {
  const res = await fetch(`${NEXUS_API_BASE}${path}`, {
    headers: nexusHeaders(apiKey)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new NexusError(`Nexus ${res.status}: ${body || res.statusText || 'request failed'}`)
  }
  return (await res.json()) as T
}

interface NexusMod {
  mod_id: number
  name: string
  summary?: string
  description?: string
  picture_url?: string
  author?: string
  uploaded_by?: string
  domain_name?: string
  mod_downloads?: number
  uid?: number
  updated_timestamp?: number
  created_timestamp?: number
}

interface NexusFile {
  file_id: number
  file_name: string
  name: string
  uploaded_timestamp?: number
  size_in_bytes?: number
  size_kb?: number
  category_name?: string
  is_primary?: boolean
}

function mapMod(mod: NexusMod): ModListing {
  return {
    source: 'nexus',
    id: String(mod.mod_id),
    slug: String(mod.mod_id),
    name: mod.name?.trim() || `Mod #${mod.mod_id}`,
    summary: mod.summary ?? '',
    author: mod.author || mod.uploaded_by || 'Unknown',
    downloads: Math.round(mod.mod_downloads ?? 0),
    logoUrl: mod.picture_url ?? null,
    pageUrl: `https://www.nexusmods.com/${NEXUS_GAME_DOMAIN}/mods/${mod.mod_id}`,
    updatedAt: mod.updated_timestamp
      ? new Date(mod.updated_timestamp * 1000).toISOString()
      : null
  }
}

export function nexusFilesPageUrl(modId: string | number, fileId?: string): string {
  const base = `https://www.nexusmods.com/${NEXUS_GAME_DOMAIN}/mods/${modId}?tab=files`
  return fileId ? `${base}&file_id=${fileId}` : base
}

export function nexusSlowDownloadHintUrl(modId: string | number, fileId?: string): string {
  // Site free-tier path: Files tab → Slow download / Manual download
  return nexusFilesPageUrl(modId, fileId)
}

export async function searchNexus(
  apiKey: string | null | undefined,
  options: ModSearchOptions = {}
): Promise<ModSearchResult> {
  const trimmed = (options.query ?? '').trim()
  const key = apiKey?.trim() || null
  const limit = options.limit ?? 24
  const offset = options.offset ?? 0

  if (trimmed && /^\d+$/.test(trimmed)) {
    try {
      const mod = await getNexusMod(Number(trimmed), key)
      return { mods: offset > 0 ? [] : [mod], total: 1, hasMore: false }
    } catch {
      return {
        mods:
          offset > 0
            ? []
            : [
                {
                  source: 'nexus',
                  id: trimmed,
                  slug: trimmed,
                  name: `Mod #${trimmed}`,
                  summary: 'Open detail or use Download to open the Nexus page.',
                  author: 'Nexus',
                  downloads: 0,
                  logoUrl: null,
                  pageUrl: `https://www.nexusmods.com/${NEXUS_GAME_DOMAIN}/mods/${trimmed}`,
                  updatedAt: null
                }
              ],
        total: 1,
        hasMore: false,
        notice: key
          ? null
          : 'Showing mod by ID without API key — open detail or Download for Slow download.'
      }
    }
  }

  // GraphQL supports offset for search and browse.
  try {
    const gql = await searchNexusGraphql(trimmed || null, key, { limit, offset, sort: options.sort })
    if (gql.mods.length || offset === 0) {
      return gql
    }
  } catch {
    // fall through to legacy endpoints
  }

  if (key && offset === 0) {
    const [trending, latest] = await Promise.all([
      nexusFetch<NexusMod[]>(`/games/${NEXUS_GAME_DOMAIN}/mods/trending.json`, key).catch(
        () => [] as NexusMod[]
      ),
      nexusFetch<NexusMod[]>(`/games/${NEXUS_GAME_DOMAIN}/mods/latest_updated.json`, key).catch(
        () => [] as NexusMod[]
      )
    ])

    const byId = new Map<number, NexusMod>()
    for (const mod of [...trending, ...latest]) {
      if (mod?.mod_id) byId.set(mod.mod_id, mod)
    }

    let mods = [...byId.values()].map(mapMod)
    if (trimmed) {
      const q = trimmed.toLowerCase()
      mods = mods.filter((m) => {
        const name = (m.name ?? '').toLowerCase()
        const summary = (m.summary ?? '').toLowerCase()
        const author = (m.author ?? '').toLowerCase()
        return name.includes(q) || summary.includes(q) || author.includes(q)
      })
    }

    const sorted = sortListings(mods, options.sort)
    return { mods: sorted, total: sorted.length, hasMore: false }
  }

  if (offset > 0) {
    return { mods: [], total: 0, hasMore: false }
  }

  return {
    mods: [],
    total: 0,
    hasMore: false,
    notice: trimmed
      ? `Couldn’t search Nexus without a key for “${trimmed}”. Open Nexus in your browser, use Slow download, then Import file — or paste nxm://. Optional Premium API key enables in-app browse & Download quickly.`
      : `Browse Nexus without a key is limited. Open ${NEXUS_HYTALE_BROWSE_URL} or add an optional Premium API key in Settings for in-app search & fast downloads.`
  }
}

function sortListings(mods: ModListing[], sort?: string): ModListing[] {
  const copy = [...mods]
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    case 'updated':
      return copy.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    case 'downloads':
    default:
      return copy.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
  }
}

async function searchNexusGraphql(
  term: string | null,
  apiKey: string | null | undefined,
  page: { limit: number; offset: number; sort?: string }
): Promise<ModSearchResult> {
  const sortField =
    page.sort === 'name'
      ? 'NAME'
      : page.sort === 'updated'
        ? 'UPDATED_AT'
        : 'DOWNLOADS'
  const filterBlock = term
    ? `filter: { filter: [{ filter: name, op: WILDCARD, value: $term }] }`
    : ''
  const query = `
    query SearchHytaleMods($term: String, $count: Int!, $offset: Int!) {
      mods(
        ${filterBlock}
        domain: "${NEXUS_GAME_DOMAIN}"
        count: $count
        offset: $offset
        sort: { field: ${sortField}, direction: DESC }
      ) {
        nodes {
          modId
          name
          summary
          downloads
          pictureUrl
          uploader { name }
          updatedAt
        }
        totalCount
      }
    }
  `

  const res = await fetch(NEXUS_GRAPHQL, {
    method: 'POST',
    headers: {
      ...nexusHeaders(apiKey),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      variables: {
        term: term ? `*${term}*` : null,
        count: page.limit,
        offset: page.offset
      }
    })
  })

  if (!res.ok) {
    throw new NexusError(`Nexus GraphQL ${res.status}`)
  }

  const json = (await res.json()) as {
    data?: {
      mods?: {
        totalCount?: number
        nodes?: {
          modId: number
          name: string
          summary?: string
          downloads?: number
          pictureUrl?: string
          uploader?: { name?: string }
          updatedAt?: string
        }[]
      }
    }
    errors?: { message: string }[]
  }

  if (json.errors?.length) {
    throw new NexusError(json.errors[0].message)
  }

  const nodes = json.data?.mods?.nodes ?? []
  const total = json.data?.mods?.totalCount ?? nodes.length
  const mods = nodes
    .filter((n) => n && n.modId != null)
    .map((n) => ({
      source: 'nexus' as const,
      id: String(n.modId),
      slug: String(n.modId),
      name: n.name?.trim() || `Mod #${n.modId}`,
      summary: n.summary ?? '',
      author: n.uploader?.name ?? 'Unknown',
      downloads: Math.round(n.downloads ?? 0),
      logoUrl: n.pictureUrl ?? null,
      pageUrl: `https://www.nexusmods.com/${NEXUS_GAME_DOMAIN}/mods/${n.modId}`,
      updatedAt: n.updatedAt ?? null
    }))

  return {
    total,
    mods,
    hasMore:
      json.data?.mods?.totalCount != null
        ? page.offset + mods.length < total
        : mods.length >= page.limit
  }
}

export async function getNexusMod(
  modId: number,
  apiKey?: string | null
): Promise<ModListing> {
  const mod = await nexusFetch<NexusMod>(
    `/games/${NEXUS_GAME_DOMAIN}/mods/${modId}.json`,
    apiKey
  )
  return mapMod(mod)
}

export async function listNexusFiles(
  modId: number,
  apiKey?: string | null
): Promise<ModFileInfo[]> {
  const json = await nexusFetch<{ files?: NexusFile[] }>(
    `/games/${NEXUS_GAME_DOMAIN}/mods/${modId}/files.json`,
    apiKey
  )
  const files = json.files ?? []
  return files.map((f) => ({
    source: 'nexus' as const,
    modId: String(modId),
    fileId: String(f.file_id),
    fileName: f.file_name,
    displayName: f.name || f.file_name,
    fileDate: f.uploaded_timestamp
      ? new Date(f.uploaded_timestamp * 1000).toISOString()
      : '',
    fileLength: f.size_in_bytes ?? (f.size_kb ? f.size_kb * 1024 : 0),
    downloadUrl: null,
    primary: Boolean(f.is_primary) || f.category_name === 'MAIN'
  }))
}

export async function getNexusFileInfo(
  modId: number,
  fileId: number,
  apiKey?: string | null
): Promise<NexusFile | null> {
  try {
    return await nexusFetch<NexusFile>(
      `/games/${NEXUS_GAME_DOMAIN}/mods/${modId}/files/${fileId}.json`,
      apiKey
    )
  } catch {
    if (!apiKey) return null
    const files = await listNexusFiles(modId, apiKey)
    const match = files.find((f) => f.fileId === String(fileId))
    if (!match) return null
    return {
      file_id: Number(match.fileId),
      file_name: match.fileName,
      name: match.displayName
    }
  }
}

/**
 * Premium: call without nxm key → CDN links.
 * Free: pass key + expires from an nxm:// “Mod Manager Download” link.
 */
export async function getNexusDownloadUrls(
  modId: number,
  fileId: number,
  opts?: { apiKey?: string | null; key?: string; expires?: number; domain?: string }
): Promise<string[]> {
  const domain = opts?.domain || NEXUS_GAME_DOMAIN
  const params = new URLSearchParams()
  if (opts?.key) params.set('key', opts.key)
  if (opts?.expires !== undefined) params.set('expires', String(opts.expires))
  const qs = params.toString()
  const path = `/games/${domain}/mods/${modId}/files/${fileId}/download_link.json${qs ? `?${qs}` : ''}`

  try {
    const json = await nexusFetch<{ URI: string }[]>(path, opts?.apiKey)
    return (json ?? []).map((x) => x.URI).filter(Boolean)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('403') || /premium/i.test(message)) {
      throw new NexusError(
        'Nexus free accounts need Slow download in the browser, or a Mod Manager (nxm) link. Optional Premium API key enables Download quickly.'
      )
    }
    throw err
  }
}

export function isPremiumRequiredError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /premium|nxm|mod manager download|403|slow download/i.test(message)
}

async function fetchNexusGraphqlDetails(
  modId: number,
  apiKey?: string | null
): Promise<{ description: string; images: ModImage[] } | null> {
  const query = `
    query ModDetails($id: Int!) {
      legacyMod(id: $id, domain: "${NEXUS_GAME_DOMAIN}") {
        description
        pictureUrl
        gallery { imageUrl thumbnailUrl description }
      }
    }
  `
  try {
    const res = await fetch(NEXUS_GRAPHQL, {
      method: 'POST',
      headers: {
        ...nexusHeaders(apiKey),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables: { id: modId } })
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      data?: {
        legacyMod?: {
          description?: string
          pictureUrl?: string
          gallery?: { imageUrl?: string; thumbnailUrl?: string; description?: string }[]
        }
      }
    }
    const mod = json.data?.legacyMod
    if (!mod) return null
    const images: ModImage[] = (mod.gallery ?? [])
      .map((g) => ({
        url: g.imageUrl || g.thumbnailUrl || '',
        thumbnailUrl: g.thumbnailUrl ?? g.imageUrl ?? null,
        title: g.description ?? null
      }))
      .filter((i) => i.url)
    if (!images.length && mod.pictureUrl) {
      images.push({ url: mod.pictureUrl, thumbnailUrl: mod.pictureUrl, title: 'Cover' })
    }
    return { description: mod.description || '', images }
  } catch {
    return null
  }
}

export async function getNexusDetails(
  modId: string,
  apiKey?: string | null
): Promise<ModDetails> {
  const id = Number(modId)
  const key = apiKey?.trim() || null

  let listing: ModListing
  let versions: ModFileInfo[] = []
  let description = ''
  let images: ModImage[] = []
  let createdAt: string | null = null

  try {
    if (key) {
      const mod = await nexusFetch<NexusMod>(
        `/games/${NEXUS_GAME_DOMAIN}/mods/${id}.json`,
        key
      )
      listing = mapMod(mod)
      description = mod.description || mod.summary || ''
      createdAt = mod.created_timestamp
        ? new Date(mod.created_timestamp * 1000).toISOString()
        : listing.updatedAt
      if (mod.picture_url) {
        images = [{ url: mod.picture_url, thumbnailUrl: mod.picture_url, title: 'Cover' }]
      }
      versions = await listNexusFiles(id, key).catch(() => [])
    } else {
      listing = {
        source: 'nexus',
        id: String(id),
        slug: String(id),
        name: `Mod #${id}`,
        summary: '',
        author: 'Unknown',
        downloads: 0,
        logoUrl: null,
        pageUrl: `https://www.nexusmods.com/${NEXUS_GAME_DOMAIN}/mods/${id}`,
        updatedAt: null
      }
      try {
        listing = await getNexusMod(id, null)
        description = listing.summary
        if (listing.logoUrl) {
          images = [{ url: listing.logoUrl, thumbnailUrl: listing.logoUrl, title: 'Cover' }]
        }
      } catch {
        // keep stub listing
      }
    }
  } catch (err) {
    throw err
  }

  const gql = await fetchNexusGraphqlDetails(id, key)
  if (gql) {
    if (gql.description) description = gql.description
    if (gql.images.length) images = gql.images
  }

  if (!listing.name || listing.name.startsWith('Mod #')) {
    // leave as-is; UI can still open browser
  }

  return {
    listing: {
      ...listing,
      summary: listing.summary || description.slice(0, 200)
    },
    description: description || listing.summary || '',
    categories: [],
    createdAt,
    versions,
    images,
    quickDownloadAvailable: Boolean(key),
    notice: key
      ? null
      : 'Free path: use Download (Slow download in browser / nxm / Import). Add a Premium API key in Settings for Download quickly.'
  }
}
