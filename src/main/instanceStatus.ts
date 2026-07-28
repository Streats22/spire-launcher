import type { InstanceRuntimeStatus } from '../shared/types'
import { resolveChannelInstall } from './game/assets'
import { getChannelInstallStatus } from './game/install'
import { getInstance } from './instances'
import { listInstalledMods } from './mods/manifest'
import { resolveClientPath, resolveJavaPath } from './paths'
import { listServers } from './servers'
import { listWorlds } from './worlds'

export function getInstanceRuntimeStatus(instanceId: string): InstanceRuntimeStatus {
  const instance = getInstance(instanceId)
  if (!instance) {
    throw new Error('Instance not found.')
  }

  const channelStatus = getChannelInstallStatus(instance.channel)
  const channelRoot = resolveChannelInstall(instance.channel, instance.gameVersion)
  const installRoot = channelRoot ?? channelStatus.installRoot
  const clientPath =
    (installRoot && resolveClientPath(installRoot)) || channelStatus.clientPath
  const javaPath =
    (installRoot && resolveJavaPath(installRoot)) || channelStatus.javaPath

  let modsCount = 0
  let worldsCount = 0
  let serversCount = 0
  try {
    modsCount = listInstalledMods(instanceId).length
  } catch {
    modsCount = 0
  }
  try {
    worldsCount = listWorlds(instanceId).length
  } catch {
    worldsCount = 0
  }
  try {
    serversCount = listServers(instanceId).length
  } catch {
    serversCount = 0
  }

  return {
    instanceId,
    channel: instance.channel,
    gameVersion: instance.gameVersion ?? null,
    installRoot: installRoot && clientPath ? installRoot : channelStatus.ready ? channelStatus.installRoot : null,
    clientReady: Boolean(clientPath),
    javaReady: Boolean(javaPath),
    build: channelStatus.build || null,
    installedVersion: channelStatus.version,
    modsCount,
    worldsCount,
    serversCount
  }
}
