import { spawn } from 'child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync
} from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import type {
  ModDependencyRef,
  ModDetails,
  ModFileInfo,
  ModListing,
  ModSearchOptions,
  ModSearchResult
} from '../../shared/types'
import { SPIRE_USER_AGENT, THUNDERSTORE_HYTALE_API, THUNDERSTORE_HYTALE_BROWSE_URL } from './constants'
import { beginContentDownload, emitContentProgress } from './contentProgress'
import { downloadFileWithProgress } from './downloadFile'
import { modsDir } from './manifest'

class ThunderstoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThunderstoreError'
  }
}

interface TsVersion {
  name?: string
  full_name?: string
  description?: string
  icon?: string
  version_number: string
  download_url: string
  downloads?: number
  date_created?: string
  website_url?: string
  is_active?: boolean
  uuid4: string
  file_size?: number
  /** e.g. `["Serilum-Hybrid-1.7.0"]` — owner-name[-version] */
  dependencies?: string[]
}

interface TsPackage {
  name: string
  full_name: string
  owner: string
  package_url: string
  date_created?: string
  date_updated?: string
  uuid4: string
  rating_score?: number
  is_deprecated?: boolean
  categories?: string[]
  versions: TsVersion[]
}

let packageCache: { at: number; packages: TsPackage[] } | null = null
const CACHE_MS = 5 * 60_000

async function loadPackages(): Promise<TsPackage[]> {
  if (packageCache && Date.now() - packageCache.at < CACHE_MS) {
    return packageCache.packages
  }
  const res = await fetch(THUNDERSTORE_HYTALE_API, {
    headers: {
      Accept: 'application/json',
      'User-Agent': SPIRE_USER_AGENT
    }
  })
  if (!res.ok) {
    throw new ThunderstoreError(`Thunderstore ${res.status}: ${res.statusText}`)
  }
  const packages = (await res.json()) as TsPackage[]
  packageCache = { at: Date.now(), packages: packages.filter((p) => !p.is_deprecated) }
  return packageCache.packages
}

function latestVersion(pkg: TsPackage): TsVersion | null {
  return (pkg.versions ?? []).find((v) => v.is_active !== false) ?? pkg.versions?.[0] ?? null
}

function mapPackage(pkg: TsPackage): ModListing {
  const latest = latestVersion(pkg)
  const downloads = (pkg.versions ?? []).reduce((sum, v) => sum + (v.downloads ?? 0), 0)
  return {
    source: 'thunderstore',
    id: pkg.uuid4,
    slug: pkg.full_name,
    name: pkg.name,
    summary: latest?.description ?? '',
    author: pkg.owner,
    downloads,
    logoUrl: latest?.icon ?? null,
    pageUrl: pkg.package_url || `${THUNDERSTORE_HYTALE_BROWSE_URL}p/${pkg.owner}/${pkg.name}/`,
    updatedAt: pkg.date_updated ?? latest?.date_created ?? null,
    categories: pkg.categories
  }
}

function mapVersions(pkg: TsPackage): ModFileInfo[] {
  return (pkg.versions ?? [])
    .filter((v) => v.is_active !== false)
    .map((v, index) => ({
      source: 'thunderstore' as const,
      modId: pkg.uuid4,
      fileId: v.uuid4,
      fileName: `${pkg.full_name}-${v.version_number}.zip`,
      displayName: v.version_number,
      fileDate: v.date_created ?? '',
      fileLength: v.file_size ?? 0,
      downloadUrl: v.download_url,
      primary: index === 0,
      releaseType: 'release',
      dependencies: mapTsDependencies(v.dependencies)
    }))
}

function resolveThunderstoreDepPackage(
  packages: TsPackage[],
  depSpec: string
): TsPackage | null {
  const spec = depSpec.trim()
  if (!spec) return null
  const exact = packages.find((p) => p.full_name === spec)
  if (exact) return exact
  // Prefer longest full_name prefix match for `Owner-Name-1.2.3`
  const matches = packages
    .filter((p) => spec === p.full_name || spec.startsWith(`${p.full_name}-`))
    .sort((a, b) => b.full_name.length - a.full_name.length)
  return matches[0] ?? null
}

function mapTsDependencies(deps: string[] | undefined): ModDependencyRef[] {
  if (!deps?.length) return []
  // Resolution needs the package index — filled in listThunderstoreAutoDependencies.
  return deps
    .map((d) => d.trim())
    .filter(Boolean)
    .map((modId) => ({
      source: 'thunderstore' as const,
      modId,
      relation: 'required' as const
    }))
}

/** Resolve Thunderstore version dependency strings to installable package ids. */
export async function listThunderstoreAutoDependencies(
  idOrFullName: string,
  fileId?: string
): Promise<ModDependencyRef[]> {
  const packages = await loadPackages()
  const pkg = findPackage(packages, idOrFullName)
  const version =
    (fileId ? (pkg.versions ?? []).find((v) => v.uuid4 === fileId) : null) ??
    latestVersion(pkg)
  const specs = version?.dependencies ?? []
  const out: ModDependencyRef[] = []
  const seen = new Set<string>()
  for (const spec of specs) {
    const depPkg = resolveThunderstoreDepPackage(packages, spec)
    if (!depPkg) continue
    // Skip common mod managers listed as deps
    const name = depPkg.full_name.toLowerCase()
    if (name.includes('r2modman') || name.includes('thunderstore-mod-manager')) continue
    if (seen.has(depPkg.uuid4)) continue
    seen.add(depPkg.uuid4)
    out.push({
      source: 'thunderstore',
      modId: depPkg.uuid4,
      relation: 'required'
    })
  }
  return out
}

function findPackage(packages: TsPackage[], idOrFullName: string): TsPackage {
  const pkg =
    packages.find((p) => p.uuid4 === idOrFullName) ||
    packages.find((p) => p.full_name === idOrFullName) ||
    packages.find((p) => `${p.owner}-${p.name}` === idOrFullName)
  if (!pkg) throw new ThunderstoreError(`Thunderstore package not found: ${idOrFullName}`)
  return pkg
}

export async function searchThunderstore(options: ModSearchOptions = {}): Promise<ModSearchResult> {
  const packages = await loadPackages()
  const q = options.query?.trim().toLowerCase()
  let filtered = packages
  if (q) {
    filtered = packages.filter((p) => {
      const latest = latestVersion(p)
      const hay = `${p.name} ${p.full_name} ${p.owner} ${latest?.description ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }

  const sort = options.sort ?? 'downloads'
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'updated') {
      return (b.date_updated || '').localeCompare(a.date_updated || '')
    }
    const da = (a.versions ?? []).reduce((s, v) => s + (v.downloads ?? 0), 0)
    const db = (b.versions ?? []).reduce((s, v) => s + (v.downloads ?? 0), 0)
    return db - da
  })

  const offset = options.offset ?? 0
  const limit = options.limit ?? 40
  const slice = filtered.slice(offset, offset + limit)

  return {
    mods: slice.map(mapPackage),
    total: filtered.length,
    hasMore: offset + slice.length < filtered.length
  }
}

export async function getThunderstoreDetails(idOrFullName: string): Promise<ModDetails> {
  const packages = await loadPackages()
  const pkg = findPackage(packages, idOrFullName)
  const listing = mapPackage(pkg)
  const versions = mapVersions(pkg)
  const latest = latestVersion(pkg)
  return {
    listing,
    description: latest?.description || listing.summary,
    categories: listing.categories ?? [],
    createdAt: pkg.date_created ?? null,
    versions,
    images: latest?.icon ? [{ url: latest.icon, thumbnailUrl: latest.icon }] : [],
    quickDownloadAvailable: versions.some((v) => Boolean(v.downloadUrl)),
    notice:
      versions.length === 0
        ? null
        : 'Thunderstore packages are zip archives — Spire extracts the .jar into your mods folder.'
  }
}

export async function listThunderstoreVersions(idOrFullName: string): Promise<ModFileInfo[]> {
  const details = await getThunderstoreDetails(idOrFullName)
  return details.versions
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(destDir, { recursive: true })
    const child =
      process.platform === 'win32'
        ? spawn(
            'powershell.exe',
            [
              '-NoProfile',
              '-Command',
              `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
            ],
            { stdio: 'ignore' }
          )
        : spawn('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new ThunderstoreError(`Failed to extract Thunderstore package (exit ${code}).`))
    })
  })
}

function collectJars(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === '__MACOSX') continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) collectJars(path, out)
    else if (name.toLowerCase().endsWith('.jar')) out.push(path)
  }
  return out
}

export async function installThunderstorePackage(
  instanceId: string,
  idOrFullName: string,
  fileId?: string
): Promise<{ fileName: string; fileId: string; listing: ModListing }> {
  const packages = await loadPackages()
  const pkg = findPackage(packages, idOrFullName)
  const listing = mapPackage(pkg)
  const versions = mapVersions(pkg)
  const file =
    (fileId ? versions.find((v) => v.fileId === fileId) : null) ??
    versions.find((v) => v.primary) ??
    versions[0]
  if (!file?.downloadUrl) {
    throw new ThunderstoreError('No downloadable Thunderstore version.')
  }

  const staging = join(tmpdir(), `spire-ts-${pkg.uuid4}-${Date.now()}`)
  mkdirSync(staging, { recursive: true })
  const zipPath = join(staging, file.fileName)
  const extractDir = join(staging, 'out')

  try {
    beginContentDownload('mods', listing.name)
    emitContentProgress({
      phase: 'downloading',
      bytesReceived: 0,
      bytesTotal: 0,
      message: `Downloading “${listing.name}”…`
    })
    await downloadFileWithProgress(file.downloadUrl, zipPath)

    emitContentProgress({
      phase: 'extracting',
      message: `Extracting “${listing.name}”…`
    })
    await extractZip(zipPath, extractDir)
    const jars = collectJars(extractDir)
    const destDir = modsDir(instanceId)
    mkdirSync(destDir, { recursive: true })

    let installedName: string
    if (jars.length > 0) {
      jars.sort((a, b) => statSync(b).size - statSync(a).size)
      const jar = jars[0]
      installedName = basename(jar).replace(/[\\/:*?"<>|]/g, '_')
      const dest = join(destDir, installedName)
      if (existsSync(dest)) unlinkSync(dest)
      renameSync(jar, dest)
    } else {
      // No jar — keep the zip so Import-style archives still land in mods/
      installedName = file.fileName.replace(/[\\/:*?"<>|]/g, '_')
      const dest = join(destDir, installedName)
      if (existsSync(dest)) unlinkSync(dest)
      renameSync(zipPath, dest)
    }

    emitContentProgress({
      phase: 'done',
      message: `Installed “${listing.name}”`
    })
    return { fileName: installedName, fileId: file.fileId, listing }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitContentProgress({ phase: 'error', message })
    throw err
  } finally {
    try {
      rmSync(staging, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  }
}
