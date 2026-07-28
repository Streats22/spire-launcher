import { copyFileSync } from 'fs'
import { basename, join } from 'path'
import type {
  ModDetails,
  ModFileInfo,
  ModInstallResult,
  ModSearchOptions,
  ModSearchResult,
  ModSource
} from '../../shared/types'
import { getInstance } from '../instances'
import { resolveCurseForgeKey, resolveNexusKey } from '../settings'
import {
  getCurseForgeDetails,
  getCurseForgeDownloadUrl,
  getCurseForgeMod,
  listCurseForgeFiles,
  searchCurseForge
} from './curseforge'
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
  parseNxmLink,
  searchNexus
} from './nexus'
import { NEXUS_GAME_DOMAIN } from './constants'

function requireCurseForgeKey(): string {
  const key = resolveCurseForgeKey()
  if (!key) {
    throw new Error(
      'Add a CurseForge API key in Settings (console.curseforge.com) or set SPIRE_CURSEFORGE_API_KEY.'
    )
  }
  return key
}

function requireNexusKey(): string {
  const key = resolveNexusKey()
  if (!key) {
    throw new Error(
      'Add a Nexus Mods API key in Settings (Account → API access) or set SPIRE_NEXUS_API_KEY.'
    )
  }
  return key
}

export async function searchMods(
  source: ModSource,
  options: ModSearchOptions = {}
): Promise<ModSearchResult> {
  if (source === 'curseforge') {
    return searchCurseForge(requireCurseForgeKey(), options)
  }
  if (source === 'modrinth') {
    return searchModrinth(options)
  }
  return searchNexus(requireNexusKey(), options)
}

export async function getModDetails(source: ModSource, modId: string): Promise<ModDetails> {
  if (source === 'curseforge') {
    return getCurseForgeDetails(requireCurseForgeKey(), modId)
  }
  if (source === 'modrinth') {
    return getModrinthDetails(modId)
  }
  return getNexusDetails(requireNexusKey(), modId)
}

export async function getModFiles(source: ModSource, modId: string): Promise<ModFileInfo[]> {
  if (source === 'curseforge') {
    return listCurseForgeFiles(requireCurseForgeKey(), modId)
  }
  if (source === 'modrinth') {
    return listModrinthVersions(modId)
  }
  return listNexusFiles(requireNexusKey(), Number(modId))
}

export async function installMod(
  instanceId: string,
  source: ModSource,
  modId: string,
  fileId?: string
): Promise<ModInstallResult> {
  if (!getInstance(instanceId)) {
    return { ok: false, message: 'Instance not found.' }
  }

  try {
    if (source === 'curseforge') {
      return await installFromCurseForge(instanceId, modId, fileId)
    }
    if (source === 'modrinth') {
      return await installFromModrinth(instanceId, modId, fileId)
    }
    return await installFromNexus(instanceId, modId, fileId)
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
  fileId?: string
): Promise<ModInstallResult> {
  const apiKey = requireCurseForgeKey()
  const listing = await getCurseForgeMod(apiKey, modId)
  const files = await listCurseForgeFiles(apiKey, modId)
  const file = fileId
    ? files.find((f) => f.fileId === fileId)
    : files.find((f) => f.primary) ?? files[0]

  if (!file) {
    return { ok: false, message: 'No downloadable files found for this mod.' }
  }

  const url =
    file.downloadUrl || (await getCurseForgeDownloadUrl(apiKey, modId, file.fileId))

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
  const { url, fileName } = await getModrinthDownloadUrl(modId, fileId || details.versions[0]?.fileId)
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
  fileId?: string
): Promise<ModInstallResult> {
  const apiKey = requireNexusKey()
  const listing = await getNexusMod(apiKey, Number(modId))
  const files = await listNexusFiles(apiKey, Number(modId))
  const file = fileId
    ? files.find((f) => f.fileId === fileId)
    : files.find((f) => f.primary) ?? files[0]

  if (!file) {
    return { ok: false, message: 'No downloadable files found for this mod.' }
  }

  try {
    const urls = await getNexusDownloadUrls(apiKey, Number(modId), Number(file.fileId))
    const url = urls[0]
    if (!url) {
      return {
        ok: false,
        message: 'Nexus returned no download URL.',
        needsManualNxm: true,
        pageUrl: `${listing.pageUrl}?tab=files`
      }
    }

    await downloadToModsFolder(instanceId, url, file.fileName, {
      apikey: apiKey
    })

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
      return {
        ok: false,
        needsManualNxm: true,
        pageUrl: `${listing.pageUrl}?tab=files`,
        message:
          'Free Nexus accounts can’t API-download. Opened the Files tab — click “Mod Manager Download”, or paste the nxm:// link below.'
      }
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
    const apiKey = requireNexusKey()
    const listing = await getNexusMod(apiKey, parsed.modId)
    const fileMeta = await getNexusFileInfo(apiKey, parsed.modId, parsed.fileId)
    const fileName = fileMeta?.file_name || `nexus-${parsed.modId}-${parsed.fileId}.zip`

    const urls = await getNexusDownloadUrls(apiKey, parsed.modId, parsed.fileId, {
      key: parsed.key,
      expires: parsed.expires,
      domain: parsed.domain || NEXUS_GAME_DOMAIN
    })
    const url = urls[0]
    if (!url) {
      return { ok: false, message: 'Could not resolve download URL from nxm link.' }
    }

    await downloadToModsFolder(instanceId, url, fileName, { apikey: apiKey })

    const installed = upsertInstalledMod(instanceId, {
      source: 'nexus',
      modId: String(parsed.modId),
      fileId: String(parsed.fileId),
      name: listing.name,
      fileName: fileName.replace(/[\\/:*?"<>|]/g, '_'),
      installedAt: new Date().toISOString(),
      pageUrl: listing.pageUrl
    })

    return { ok: true, message: `Installed “${listing.name}” via nxm`, installed }
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

export { listInstalledMods, removeInstalledMod }
