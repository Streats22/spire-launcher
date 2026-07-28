import { copyFileSync } from 'fs'
import { basename, join } from 'path'
import type {
  ModDetails,
  ModFileInfo,
  ModInstallMode,
  ModInstallResult,
  ModListing,
  ModSearchOptions,
  ModSearchResult,
  ModSource
} from '../../shared/types'
import { getInstance } from '../instances'
import { resolveCurseForgeKey, resolveNexusKey } from '../settings'
import {
  CURSEFORGE_HYTALE_BROWSE_URL,
  NEXUS_GAME_DOMAIN,
  NEXUS_HYTALE_BROWSE_URL
} from './constants'
import {
  curseForgeFilesPageUrl,
  getCurseForgeDetails,
  getCurseForgeDownloadUrl,
  getCurseForgeMod,
  keylessCurseForgeSearch,
  listCurseForgeFiles,
  searchCurseForge
} from './curseforge'
import { startDownloadWatch } from './downloadWatch'
import {
  downloadToModsFolder,
  listInstalledMods,
  modsDir,
  removeInstalledMod,
  upsertInstalledMod
} from './manifest'
import {
  getModrinthDetails,
  getModrinthDownloadUrl,
  listModrinthVersions,
  searchModrinth
} from './modrinth'
import {
  getNexusDetails,
  getNexusDownloadUrls,
  getNexusFileInfo,
  getNexusMod,
  isPremiumRequiredError,
  listNexusFiles,
  nexusSlowDownloadHintUrl,
  parseNxmLink,
  searchNexus
} from './nexus'

function manualResult(
  message: string,
  pageUrl: string,
  watchingDownloads = false
): ModInstallResult {
  return {
    ok: false,
    needsManualDownload: true,
    needsManualNxm: true,
    pageUrl,
    message,
    watchingDownloads
  }
}

function beginWatchAfterBrowser(
  instanceId: string,
  source: ModSource,
  modId: string,
  modName: string,
  fileNameHint?: string | null
): string {
  const st = startDownloadWatch({
    instanceId,
    source,
    modId,
    modName,
    fileNameHint
  })
  return st.message
}

export async function searchMods(
  source: ModSource,
  options: ModSearchOptions = {}
): Promise<ModSearchResult> {
  if (source === 'curseforge') {
    const key = resolveCurseForgeKey()
    if (!key) return keylessCurseForgeSearch(options)
    return searchCurseForge(key, options)
  }
  if (source === 'modrinth') {
    return searchModrinth(options)
  }
  return searchNexus(resolveNexusKey(), options)
}

export async function getModDetails(source: ModSource, modId: string): Promise<ModDetails> {
  if (source === 'curseforge') {
    const key = resolveCurseForgeKey()
    if (!key) {
      const pageUrl = `https://www.curseforge.com/hytale/mods/${modId}`
      return {
        listing: {
          source: 'curseforge',
          id: modId,
          slug: modId,
          name: `Mod ${modId}`,
          summary: '',
          author: 'Unknown',
          downloads: 0,
          logoUrl: null,
          pageUrl,
          updatedAt: null
        },
        description:
          'No CurseForge API key available. Use Download to open the Files page in your browser, then Import file.',
        categories: [],
        createdAt: null,
        versions: [],
        images: [],
        quickDownloadAvailable: false,
        notice:
          'Optional CurseForge API key (or Spire embedded key) enables full detail, gallery, and Download quickly.'
      }
    }
    return getCurseForgeDetails(key, modId)
  }
  if (source === 'modrinth') {
    return getModrinthDetails(modId)
  }
  return getNexusDetails(modId, resolveNexusKey())
}

export async function getModFiles(source: ModSource, modId: string): Promise<ModFileInfo[]> {
  if (source === 'curseforge') {
    const key = resolveCurseForgeKey()
    if (!key) return []
    return listCurseForgeFiles(key, modId)
  }
  if (source === 'modrinth') {
    return listModrinthVersions(modId)
  }
  const key = resolveNexusKey()
  if (!key) return []
  return listNexusFiles(Number(modId), key)
}

export async function installMod(
  instanceId: string,
  source: ModSource,
  modId: string,
  fileId?: string,
  mode: ModInstallMode = 'slow',
  modName?: string
): Promise<ModInstallResult> {
  if (!getInstance(instanceId)) {
    return { ok: false, message: 'Instance not found.' }
  }

  try {
    if (source === 'curseforge') {
      return await installFromCurseForge(instanceId, modId, fileId, mode, modName)
    }
    if (source === 'modrinth') {
      return await installFromModrinth(instanceId, modId, fileId)
    }
    return await installFromNexus(instanceId, modId, fileId, mode, modName)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

async function installFromCurseForge(
  instanceId: string,
  modId: string,
  fileId: string | undefined,
  mode: ModInstallMode,
  modName?: string
): Promise<ModInstallResult> {
  const apiKey = resolveCurseForgeKey()

  let listing: ModListing
  if (apiKey) {
    listing = await getCurseForgeMod(apiKey, modId)
  } else {
    listing = {
      source: 'curseforge',
      id: modId,
      slug: modId,
      name: modName?.trim() || `Mod ${modId}`,
      summary: '',
      author: 'Unknown',
      downloads: 0,
      logoUrl: null,
      pageUrl: `https://www.curseforge.com/hytale/mods/${modId}`,
      updatedAt: null
    }
  }

  const filesPage = curseForgeFilesPageUrl(listing, fileId)

  // Slow / free path: browser Files; Spire watches Downloads and auto-imports
  if (mode === 'slow' || !apiKey) {
    beginWatchAfterBrowser(instanceId, 'curseforge', modId, listing.name)
    return manualResult(
      apiKey
        ? 'Opened CurseForge Files. Finish the download in your browser — Spire will auto-import from Downloads. Or use Download quickly for in-app install.'
        : 'Opened CurseForge Files. Finish the download in your browser — Spire will auto-import from Downloads. Add a CF API key (Settings or embedded in code) for Download quickly.',
      filesPage,
      true
    )
  }

  const files = await listCurseForgeFiles(apiKey, modId)
  const file = fileId
    ? files.find((f) => f.fileId === fileId)
    : files.find((f) => f.primary) ?? files[0]

  if (!file) {
    return manualResult('No downloadable files via API — opened Files page.', filesPage)
  }

  const url = file.downloadUrl || (await getCurseForgeDownloadUrl(apiKey, modId, file.fileId))

  await downloadToModsFolder(instanceId, url, file.fileName, {
    'x-api-key': apiKey
  })

  const installed = upsertInstalledMod(instanceId, {
    source: 'curseforge',
    modId,
    fileId: file.fileId,
    name: listing.name,
    fileName: file.fileName.replace(/[\\/:*?"<>|]/g, '_'),
    installedAt: new Date().toISOString(),
    pageUrl: listing.pageUrl
  })

  return { ok: true, message: `Installed “${listing.name}”`, installed }
}

async function installFromModrinth(
  instanceId: string,
  modId: string,
  fileId?: string
): Promise<ModInstallResult> {
  const details = await getModrinthDetails(modId)
  if (details.unavailableForHytale) {
    return {
      ok: false,
      message: details.notice || 'Modrinth does not host Hytale mods yet.'
    }
  }
  const { url, fileName } = await getModrinthDownloadUrl(
    modId,
    fileId || details.versions[0]?.fileId
  )
  await downloadToModsFolder(instanceId, url, fileName)
  const installed = upsertInstalledMod(instanceId, {
    source: 'modrinth',
    modId,
    fileId: fileId || details.versions[0]?.fileId || '',
    name: details.listing.name,
    fileName: fileName.replace(/[\\/:*?"<>|]/g, '_'),
    installedAt: new Date().toISOString(),
    pageUrl: details.listing.pageUrl
  })
  return { ok: true, message: `Installed “${details.listing.name}”`, installed }
}

async function installFromNexus(
  instanceId: string,
  modId: string,
  fileId: string | undefined,
  mode: ModInstallMode,
  modName?: string
): Promise<ModInstallResult> {
  const apiKey = resolveNexusKey()
  const slowUrl = nexusSlowDownloadHintUrl(modId, fileId)
  let displayName = modName?.trim() || `Nexus mod ${modId}`
  if (apiKey) {
    try {
      displayName = (await getNexusMod(Number(modId), apiKey)).name
    } catch {
      // keep hint name
    }
  }

  // Free / slow path: browser Slow download; watch Downloads for auto-import.
  // Fully in-app without Premium: use Nexus “Mod Manager Download” (nxm://) instead.
  if (mode === 'slow' || !apiKey) {
    beginWatchAfterBrowser(instanceId, 'nexus', modId, displayName)
    return manualResult(
      apiKey
        ? 'Opened Nexus Files. Prefer “Mod Manager Download” (comes straight into Spire via nxm). Or use Slow download — Spire watches Downloads and auto-imports when it finishes. Download quickly uses Premium CDN.'
        : 'Opened Nexus Files. Prefer “Mod Manager Download” (comes straight into Spire via nxm). Or use Slow download — Spire watches Downloads and auto-imports when it finishes. Optional Premium API key enables Download quickly.',
      slowUrl,
      true
    )
  }

  // Quick path: Premium API CDN
  try {
    const listing = await getNexusMod(Number(modId), apiKey)
    const files = await listNexusFiles(Number(modId), apiKey)
    const file = fileId
      ? files.find((f) => f.fileId === fileId)
      : files.find((f) => f.primary) ?? files[0]

    if (!file) {
      return manualResult('No files listed via API — opened Files tab.', slowUrl)
    }

    const urls = await getNexusDownloadUrls(Number(modId), Number(file.fileId), { apiKey })
    const url = urls[0]
    if (!url) {
      return manualResult(
        'Nexus returned no CDN URL (Premium may be required). Opened Files for Slow download / nxm.',
        slowUrl
      )
    }

    await downloadToModsFolder(instanceId, url, file.fileName, { apikey: apiKey })

    const installed = upsertInstalledMod(instanceId, {
      source: 'nexus',
      modId,
      fileId: file.fileId,
      name: listing.name,
      fileName: file.fileName.replace(/[\\/:*?"<>|]/g, '_'),
      installedAt: new Date().toISOString(),
      pageUrl: listing.pageUrl
    })

    return { ok: true, message: `Installed “${listing.name}”`, installed }
  } catch (err) {
    if (isPremiumRequiredError(err)) {
      return manualResult(
        'Premium API download unavailable — opened Files for Slow download or nxm Mod Manager Download.',
        slowUrl
      )
    }
    throw err
  }
}

export async function installFromNxmLink(
  instanceId: string,
  nxmUrl: string
): Promise<ModInstallResult> {
  if (!getInstance(instanceId)) {
    return { ok: false, message: 'Instance not found.' }
  }

  try {
    const parsed = parseNxmLink(nxmUrl)
    const apiKey = resolveNexusKey()
    let name = `Nexus mod ${parsed.modId}`
    let pageUrl = `https://www.nexusmods.com/${parsed.domain || NEXUS_GAME_DOMAIN}/mods/${parsed.modId}`
    let fileName = `nexus-${parsed.modId}-${parsed.fileId}.zip`

    if (apiKey) {
      try {
        const listing = await getNexusMod(parsed.modId, apiKey)
        name = listing.name
        pageUrl = listing.pageUrl
      } catch {
        // continue with stubs
      }
      const fileMeta = await getNexusFileInfo(parsed.modId, parsed.fileId, apiKey)
      if (fileMeta?.file_name) fileName = fileMeta.file_name
    }

    const urls = await getNexusDownloadUrls(parsed.modId, parsed.fileId, {
      apiKey,
      key: parsed.key,
      expires: parsed.expires,
      domain: parsed.domain || NEXUS_GAME_DOMAIN
    })
    const url = urls[0]
    if (!url) {
      return manualResult(
        'Could not resolve download URL from nxm link — opened Files tab.',
        nexusSlowDownloadHintUrl(parsed.modId, String(parsed.fileId))
      )
    }

    await downloadToModsFolder(instanceId, url, fileName, apiKey ? { apikey: apiKey } : undefined)

    const installed = upsertInstalledMod(instanceId, {
      source: 'nexus',
      modId: String(parsed.modId),
      fileId: String(parsed.fileId),
      name,
      fileName: fileName.replace(/[\\/:*?"<>|]/g, '_'),
      installedAt: new Date().toISOString(),
      pageUrl
    })

    return { ok: true, message: `Installed “${name}” via nxm`, installed }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function importLocalModFile(
  instanceId: string,
  sourcePath: string
): Promise<ModInstallResult> {
  if (!getInstance(instanceId)) {
    return { ok: false, message: 'Instance not found.' }
  }

  try {
    const fileName = basename(sourcePath).replace(/[\\/:*?"<>|]/g, '_')
    const dest = join(modsDir(instanceId), fileName)
    copyFileSync(sourcePath, dest)

    const installed = upsertInstalledMod(instanceId, {
      source: 'nexus',
      modId: 'local',
      fileId: '0',
      name: fileName.replace(/\.(zip|jar|7z|rar)$/i, ''),
      fileName,
      installedAt: new Date().toISOString(),
      pageUrl: ''
    })

    return { ok: true, message: `Imported “${fileName}”`, installed }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

export function browseFallbackUrl(source: ModSource, query?: string): string {
  if (source === 'curseforge') {
    const q = query?.trim()
    return q
      ? `${CURSEFORGE_HYTALE_BROWSE_URL}?search=${encodeURIComponent(q)}`
      : CURSEFORGE_HYTALE_BROWSE_URL
  }
  if (source === 'nexus') {
    return NEXUS_HYTALE_BROWSE_URL
  }
  return 'https://modrinth.com/mods'
}

export { listInstalledMods, removeInstalledMod }
