import type { ModDetails, ModFileInfo, ModListing, ModSearchResult } from '../../shared/types'
import { NEXUS_API_BASE, NEXUS_GAME_DOMAIN, NEXUS_GRAPHQL, SPIRE_USER_AGENT } from './constants'

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

  // hostname is the game domain (hytale)
  const domain = url.hostname
  const parts = url.pathname.replace(/^\/+/, '').split('/')
  // mods/{modId}/files/{fileId}
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

function nexusHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: 'application/json',
    apikey: apiKey,
    'Application-Name': 'Spire',
    'Application-Version': '0.1.0',
    'User-Agent': SPIRE_USER_AGENT
  }
}

async function nexusFetch<T>(apiKey: string, path: string): Promise<T> {
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
    name: mod.name,
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

export async function searchNexus(
  apiKey: string,
  options: { query?: string; sort?: string } = {}
): Promise<ModSearchResult> {
  const trimmed = (options.query ?? '').trim()
  if (trimmed && /^\d+$/.test(trimmed)) {
    const mod = await getNexusMod(apiKey, Number(trimmed))
    return { mods: [mod], total: 1 }
  }

  if (trimmed) {
    try {
      const gql = await searchNexusGraphql(apiKey, trimmed)
      if (gql.mods.length) {
        return { ...gql, mods: sortListings(gql.mods, options.sort) }
      }
    } catch {
      // fall through
    }
  }

  const [trending, latest] = await Promise.all([
    nexusFetch<NexusMod[]>(apiKey, `/games/${NEXUS_GAME_DOMAIN}/mods/trending.json`).catch(
      () => [] as NexusMod[]
    ),
    nexusFetch<NexusMod[]>(apiKey, `/games/${NEXUS_GAME_DOMAIN}/mods/latest_updated.json`).catch(
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
    mods = mods.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q) ||
        m.author.toLowerCase().includes(q)
    )
  }

  return { mods: sortListings(mods, options.sort), total: mods.length }
}

function sortListings(mods: ModListing[], sort?: string): ModListing[] {
  const copy = [...mods]
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    case 'updated':
      return copy.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    case 'downloads':
    default:
      return copy.sort((a, b) => b.downloads - a.downloads)
  }
}

async function searchNexusGraphql(apiKey: string, term: string): Promise<ModSearchResult> {
  const query = `
    query SearchHytaleMods($term: String!) {
      mods(
        filter: { filter: [{ filter: name, op: WILDCARD, value: $term }] }
        domain: "${NEXUS_GAME_DOMAIN}"
        count: 24
        sort: { field: DOWNLOADS, direction: DESC }
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
    body: JSON.stringify({ query, variables: { term: `*${term}*` } })
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
  return {
    total: json.data?.mods?.totalCount ?? nodes.length,
    mods: nodes.map((n) => ({
      source: 'nexus' as const,
      id: String(n.modId),
      slug: String(n.modId),
      name: n.name,
      summary: n.summary ?? '',
      author: n.uploader?.name ?? 'Unknown',
      downloads: Math.round(n.downloads ?? 0),
      logoUrl: n.pictureUrl ?? null,
      pageUrl: `https://www.nexusmods.com/${NEXUS_GAME_DOMAIN}/mods/${n.modId}`,
      updatedAt: n.updatedAt ?? null
    }))
  }
}

export async function getNexusMod(apiKey: string, modId: number): Promise<ModListing> {
  const mod = await nexusFetch<NexusMod>(
    apiKey,
    `/games/${NEXUS_GAME_DOMAIN}/mods/${modId}.json`
  )
  return mapMod(mod)
}

export async function listNexusFiles(apiKey: string, modId: number): Promise<ModFileInfo[]> {
  const json = await nexusFetch<{ files?: NexusFile[] }>(
    apiKey,
    `/games/${NEXUS_GAME_DOMAIN}/mods/${modId}/files.json`
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
  apiKey: string,
  modId: number,
  fileId: number
): Promise<NexusFile | null> {
  try {
    return await nexusFetch<NexusFile>(
      apiKey,
      `/games/${NEXUS_GAME_DOMAIN}/mods/${modId}/files/${fileId}.json`
    )
  } catch {
    const files = await listNexusFiles(apiKey, modId)
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
 * Premium: call without key.
 * Free: pass key + expires from an nxm:// “Mod Manager Download” link.
 */
export async function getNexusDownloadUrls(
  apiKey: string,
  modId: number,
  fileId: number,
  opts?: { key?: string; expires?: number; domain?: string }
): Promise<string[]> {
  const domain = opts?.domain || NEXUS_GAME_DOMAIN
  const params = new URLSearchParams()
  if (opts?.key) params.set('key', opts.key)
  if (opts?.expires !== undefined) params.set('expires', String(opts.expires))
  const qs = params.toString()
  const path = `/games/${domain}/mods/${modId}/files/${fileId}/download_link.json${qs ? `?${qs}` : ''}`

  try {
    const json = await nexusFetch<{ URI: string }[]>(apiKey, path)
    return (json ?? []).map((x) => x.URI).filter(Boolean)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('403') || /premium/i.test(message)) {
      throw new NexusError(
        'Nexus free accounts need a Mod Manager Download (nxm) link. Spire will open the Files tab — click “Mod Manager Download”, or paste the nxm:// link here.'
      )
    }
    throw err
  }
}

export function isPremiumRequiredError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /premium|nxm|mod manager download|403/i.test(message)
}


export async function getNexusDetails(apiKey: string, modId: string): Promise<ModDetails> {
  const listing = await getNexusMod(apiKey, Number(modId))
  const versions = await listNexusFiles(apiKey, Number(modId))
  return {
    listing,
    description: listing.summary || '',
    categories: [],
    createdAt: listing.updatedAt,
    versions
  }
}
