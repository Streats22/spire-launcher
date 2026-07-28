import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  HytaleAuthStatus,
  InstallStatus,
  LocalDataInfo,
  SpireInstance,
  SpireSettings,
  UpdateCheckResult
} from '../../shared/types'
import { gameProfileLabel } from '../../shared/hytaleDisplay'
import ContextMenu, { useContextMenu } from './ContextMenu'
import CreateInstanceDialog from './CreateInstanceDialog'
import InstanceBrowser from './InstanceBrowser'
import SettingsView from './SettingsView'
import VersionsView from './VersionsView'
import spireLogo from './assets/spire-logo.png'
import {
  applyAppearance,
  normalizeHomeLayout
} from './theme'
import ActionIcon from './ui/ActionIcon'
import type { SpireDensity, SpireHomeLayout, SpireTheme } from '../../shared/types'

type View = 'home' | 'settings' | 'versions'

export default function App(): React.JSX.Element {
  const [settings, setSettings] = useState<SpireSettings | null>(null)
  const [instances, setInstances] = useState<SpireInstance[]>([])
  const [status, setStatus] = useState<InstallStatus | null>(null)
  const [dataInfo, setDataInfo] = useState<LocalDataInfo | null>(null)
  const [view, setView] = useState<View>('home')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [cfKey, setCfKey] = useState('')
  const [nexusKey, setNexusKey] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null)
  const [creating, setCreating] = useState(false)
  const [hytaleAuth, setHytaleAuth] = useState<HytaleAuthStatus | null>(null)
  const { menu, openMenu, closeMenu } = useContextMenu()

  const refresh = useCallback(async () => {
    const [nextSettings, nextInstances, nextStatus, nextData] = await Promise.all([
      window.spire.getSettings(),
      window.spire.listInstances(),
      window.spire.getInstallStatus(),
      window.spire.getLocalDataInfo()
    ])
    setSettings(nextSettings)
    setInstances(nextInstances)
    setStatus(nextStatus)
    setDataInfo(nextData)
    setCfKey(nextSettings.curseForgeApiKey ?? '')
    setNexusKey(nextSettings.nexusApiKey ?? '')
  }, [])

  useEffect(() => {
    void refresh()
    void window.spire.getAppVersion().then(setAppVersion)
    void window.spire.getHytaleAuthStatus().then(setHytaleAuth)
  }, [refresh])

  useEffect(() => {
    if (!settings) return
    applyAppearance({
      theme: settings.theme,
      density: settings.density,
      homeLayout: settings.homeLayout
    })
  }, [settings?.theme, settings?.density, settings?.homeLayout])

  useEffect(() => {
    return window.spire.onSettingsChanged((next) => {
      setSettings(next)
      setCfKey(next.curseForgeApiKey ?? '')
      setNexusKey(next.nexusApiKey ?? '')
      applyAppearance({
        theme: next.theme,
        density: next.density,
        homeLayout: next.homeLayout
      })
    })
  }, [])

  useEffect(() => {
    return window.spire.onDataCleared(() => {
      void refresh()
      void window.spire.getHytaleAuthStatus().then(setHytaleAuth)
      setUpdate(null)
      setView('home')
      setCreating(false)
    })
  }, [refresh])

  useEffect(() => {
    void window.spire.checkForUpdate().then(setUpdate)
  }, [])

  const active = useMemo(
    () => instances.find((i) => i.id === settings?.activeInstanceId) ?? instances[0] ?? null,
    [instances, settings]
  )

  useEffect(() => {
    return window.spire.onNavigate((next) => {
      if (next === 'versions' || next === 'settings' || next === 'home') {
        setView(next)
      }
      if (next === 'mods') {
        const id = settings?.activeInstanceId ?? instances[0]?.id
        if (id) void window.spire.openManageWindow(id, 'mods')
      }
    })
  }, [settings?.activeInstanceId, instances])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  async function selectInstance(id: string): Promise<void> {
    const next = await window.spire.setActiveInstance(id)
    setSettings(next)
  }

  function openCreateDialog(): void {
    setCreating(true)
  }

  function closeCreateDialog(): void {
    if (busy) return
    setCreating(false)
  }

  async function onLaunch(instanceId?: string): Promise<void> {
    const id = instanceId ?? active?.id
    if (!id) return
    setBusy(true)
    try {
      if (id !== active?.id) await selectInstance(id)
      const result = await window.spire.launchInstance(id)
      setToast(result.message)
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(instanceId?: string): Promise<void> {
    const target = instances.find((i) => i.id === (instanceId ?? active?.id))
    if (!target) return
    if (!confirm(`Delete instance “${target.name}”?`)) return
    setBusy(true)
    try {
      await window.spire.deleteInstance(target.id)
      await refresh()
      setView('home')
      setToast('Instance deleted')
    } finally {
      setBusy(false)
    }
  }

  async function onExportPack(instanceId: string): Promise<void> {
    setBusy(true)
    try {
      // Omit includeWorlds so main shows: Without saves / Include saves / Cancel
      const result = await window.spire.exportSpirePack(instanceId)
      if (!result.canceled) setToast(result.message)
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onImportPack(): Promise<void> {
    setBusy(true)
    try {
      const result = await window.spire.importSpirePack()
      if (result.canceled) return
      await refresh()
      if (result.instance) {
        await selectInstance(result.instance.id)
        setToast(result.message)
      } else {
        setToast(result.message)
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function openInstanceMenu(event: React.MouseEvent, instance: SpireInstance): void {
    void selectInstance(instance.id)
    const canLaunch = Boolean(status?.valid || instance.gameVersion)
    openMenu(event, [
      {
        id: 'launch',
        label: 'Launch',
        disabled: busy || !canLaunch,
        onSelect: () => void onLaunch(instance.id)
      },
      {
        id: 'edit',
        label: 'Edit',
        onSelect: () => void window.spire.openManageWindow(instance.id)
      },
      {
        id: 'mods',
        label: 'Mods',
        onSelect: () => void window.spire.openManageWindow(instance.id, 'mods')
      },
      {
        id: 'folder',
        label: 'Open folder',
        onSelect: () => void window.spire.openInstanceFolder(instance.id)
      },
      {
        id: 'export',
        label: 'Export pack…',
        disabled: busy,
        onSelect: () => void onExportPack(instance.id)
      },
      { id: 'sep', label: '', separator: true },
      {
        id: 'delete',
        label: 'Delete',
        danger: true,
        disabled: busy,
        onSelect: () => void onDelete(instance.id)
      }
    ])
  }

  async function onThemeChange(theme: SpireTheme): Promise<void> {
    applyAppearance({ theme })
    const next = await window.spire.updateSettings({ theme })
    setSettings(next)
  }

  async function onDensityChange(density: SpireDensity): Promise<void> {
    applyAppearance({ density })
    const next = await window.spire.updateSettings({ density })
    setSettings(next)
  }

  async function onHomeLayoutChange(homeLayout: SpireHomeLayout): Promise<void> {
    applyAppearance({ homeLayout })
    const next = await window.spire.updateSettings({ homeLayout })
    setSettings(next)
  }

  const installOk = Boolean(status?.valid)
  const showActionBar = view === 'home'
  const awayFromHome = view !== 'home'

  return (
    <div className="app">
      <header className="toolbar">
        <button
          type="button"
          className="toolbar-brand"
          onClick={() => setView('home')}
          title="Home"
        >
          <img className="toolbar-logo" src={spireLogo} alt="" />
          Spire
        </button>
        {awayFromHome ? (
          <button className="btn btn-ghost" type="button" onClick={() => setView('home')}>
            ← Back
          </button>
        ) : null}
        <div className="toolbar-spacer" />
        {active && view === 'home' ? (
          <span className="toolbar-chip" title={active.name}>
            <strong>{active.name}</strong>
          </span>
        ) : null}
        {hytaleAuth?.signedIn ? (
          <span className="toolbar-chip" title="Active game profile">
            {gameProfileLabel(hytaleAuth)}
            {(hytaleAuth.accounts?.length ?? 0) > 1
              ? ` · ${hytaleAuth.accounts.length}`
              : ''}
          </span>
        ) : null}
        <div className="toolbar-actions">
          <button
            className={`btn btn-ghost${view === 'versions' ? ' active' : ''}`}
            type="button"
            onClick={() => setView(view === 'versions' ? 'home' : 'versions')}
            title="Install game client & accounts"
          >
            Install
          </button>
          <button
            className={`btn btn-icon${view === 'settings' ? ' active' : ''}`}
            type="button"
            onClick={() => setView(view === 'settings' ? 'home' : 'settings')}
            title="Settings"
            aria-label="Settings"
          >
            <ActionIcon name="settings" />
          </button>
        </div>
      </header>

      {update?.updateAvailable ? (
        <div className="update-banner">
          <span>
            Update available: {update.latestVersion}
            {update.notes ? ` — ${update.notes}` : ''}
          </span>
          {update.releaseUrl ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void window.spire.openExternal(update.releaseUrl!)}
            >
              Download
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`workspace${showActionBar ? '' : ' full'}`}>
        <main className="content">
          {view === 'settings' && settings ? (
            <SettingsView
              settings={settings}
              status={status}
              dataInfo={dataInfo}
              hytaleAuth={hytaleAuth}
              appVersion={appVersion}
              update={update}
              cfKey={cfKey}
              nexusKey={nexusKey}
              onCfKeyChange={setCfKey}
              onNexusKeyChange={setNexusKey}
              onSettings={setSettings}
              onStatus={setStatus}
              onHytaleAuth={setHytaleAuth}
              onUpdate={setUpdate}
              onToast={setToast}
              onOpenInstall={() => setView('versions')}
              onThemeChange={onThemeChange}
              onDensityChange={onDensityChange}
              onHomeLayoutChange={onHomeLayoutChange}
            />
          ) : view === 'versions' ? (
            <VersionsView
              onToast={setToast}
              onInstallChanged={() => {
                void refresh()
                void window.spire.getHytaleAuthStatus().then(setHytaleAuth)
              }}
            />
          ) : (
            <InstanceBrowser
              instances={instances}
              groups={settings?.instanceGroups ?? []}
              activeId={active?.id ?? null}
              homeLayout={normalizeHomeLayout(settings?.homeLayout)}
              busy={busy}
              onSelect={(id) => void selectInstance(id)}
              onLaunch={(id) => void onLaunch(id)}
              onContextMenu={openInstanceMenu}
              onCreateInstance={openCreateDialog}
              onImportPack={() => void onImportPack()}
              onChanged={refresh}
              onToast={setToast}
              onOpenInstall={() => setView('versions')}
            />
          )}
        </main>

        {showActionBar ? (
          <aside className="action-bar">
            <button
              className="btn-tool launch"
              type="button"
              disabled={!active || busy || (!installOk && !active.gameVersion)}
              onClick={() => void onLaunch()}
              title={
                installOk || active?.gameVersion
                  ? 'Launch'
                  : 'Set install path or pin a downloaded version'
              }
            >
              <span className="icon">
                <ActionIcon name="launch" />
              </span>
              Launch
            </button>
            <button
              className="btn-tool"
              type="button"
              disabled={!active}
              onClick={() => {
                if (!active) return
                void window.spire.openManageWindow(active.id)
              }}
            >
              <span className="icon">
                <ActionIcon name="edit" />
              </span>
              Edit
            </button>
            <button
              className="btn-tool"
              type="button"
              disabled={!active}
              onClick={() => {
                if (!active) return
                void window.spire.openManageWindow(active.id, 'mods')
              }}
            >
              <span className="icon">
                <ActionIcon name="mods" />
              </span>
              Mods
            </button>
            <button
              className="btn-tool"
              type="button"
              disabled={!active}
              onClick={() => active && void window.spire.openInstanceFolder(active.id)}
            >
              <span className="icon">
                <ActionIcon name="folder" />
              </span>
              Folder
            </button>
            <button
              className="btn-tool"
              type="button"
              disabled={!active || busy}
              onClick={() => void onDelete()}
            >
              <span className="icon">
                <ActionIcon name="delete" />
              </span>
              Delete
            </button>
          </aside>
        ) : null}
      </div>

      <footer className="status-bar">
        <span className="status-pill">
          <span className={`dot ${installOk ? 'ok' : 'bad'}`} />
          {installOk
            ? 'Ready'
            : hytaleAuth?.signedIn
              ? 'Signed in — set install or download under Install'
              : 'Set Hytale install or sign in under Install'}
        </span>
        <span>
          {active
            ? `${active.name}${active.gameVersion ? ` · ${active.gameVersion}` : ''}`
            : 'No instance selected'}
          {appVersion ? ` · ${appVersion}` : ''}
        </span>
      </footer>

      <CreateInstanceDialog
        open={creating}
        busy={busy}
        auth={hytaleAuth}
        onClose={closeCreateDialog}
        onOpenInstall={() => setView('versions')}
        onToast={setToast}
        onAuthChanged={setHytaleAuth}
        onCreated={(created) => {
          setCreating(false)
          void (async () => {
            await refresh()
            await selectInstance(created.id)
            setView('home')
            setToast(`Created “${created.name}”`)
          })()
        }}
      />

      {toast ? <div className="toast">{toast}</div> : null}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  )
}
