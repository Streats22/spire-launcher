import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  HytaleAuthStatus,
  InstallStatus,
  LocalDataInfo,
  SpireInstance,
  SpireSettings,
  UpdateCheckResult
} from '../../shared/types'
import ContextMenu, { useContextMenu } from './ContextMenu'
import CreateInstanceDialog from './CreateInstanceDialog'
import VersionsView from './VersionsView'
import spireLogo from './assets/spire-logo.png'
import {
  DENSITY_OPTIONS,
  HOME_LAYOUT_OPTIONS,
  THEME_OPTIONS,
  applyAppearance,
  normalizeDensity,
  normalizeHomeLayout,
  normalizeTheme
} from './theme'
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
      applyAppearance({
        theme: next.theme,
        density: next.density,
        homeLayout: next.homeLayout
      })
    })
  }, [])

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

  async function onPickInstall(): Promise<void> {
    const path = await window.spire.pickGameInstallPath()
    if (!path) return
    const next = await window.spire.setGameInstallPath(path)
    setSettings(next)
    setStatus(await window.spire.getInstallStatus())
    setToast('Install path updated')
  }

  async function onSaveCredentials(): Promise<void> {
    const next = await window.spire.updateSettings({
      curseForgeApiKey: cfKey.trim() || null,
      nexusApiKey: nexusKey.trim() || null
    })
    setSettings(next)
    setToast('Saved locally')
  }

  async function onClearCredentials(): Promise<void> {
    if (!confirm('Clear CurseForge/Nexus keys and Hytale session tokens?')) return
    const next = await window.spire.clearLocalCredentials()
    setSettings(next)
    setCfKey('')
    setNexusKey('')
    setHytaleAuth(await window.spire.getHytaleAuthStatus())
    setToast('Keys and Hytale session cleared')
  }

  async function onToggleUpdates(enabled: boolean): Promise<void> {
    const next = await window.spire.updateSettings({ checkForUpdates: enabled })
    setSettings(next)
    setUpdate(await window.spire.checkForUpdate())
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
          <span className="toolbar-chip" title="Active Hytale account">
            {hytaleAuth.displayName || 'Hytale'}
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
            <span aria-hidden>⚙</span>
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
          {view === 'settings' ? (
            <div className="page">
              <h1 className="page-title">Settings</h1>
              <p className="page-sub">
                Local only — no Spire accounts or cloud sync. Optional update check is one public
                GET. Hytale session tokens stay on this machine.
              </p>

              <div className="panel">
                <h2>Hytale accounts</h2>
                <p>
                  {hytaleAuth?.signedIn
                    ? `Active: ${hytaleAuth.displayName || 'signed in'}${
                        (hytaleAuth.accounts?.length ?? 0) > 1
                          ? ` · ${hytaleAuth.accounts.length} accounts saved`
                          : ''
                      }. Manage under Install.`
                    : (hytaleAuth?.accounts?.length ?? 0) > 0
                      ? `${hytaleAuth!.accounts.length} saved account(s) — pick one under Install.`
                      : 'Not signed in. Use Install to add an official Hytale account (you can save several).'}
                </p>
                <div className="row">
                  <button className="btn" type="button" onClick={() => setView('versions')}>
                    Open Install / accounts
                  </button>
                  {(hytaleAuth?.accounts?.length ?? 0) > 0 ? (
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => {
                        if (!confirm('Remove all saved Hytale accounts?')) return
                        void window.spire.signOutAllHytale().then((status) => {
                          setHytaleAuth(status)
                          setToast('All Hytale accounts removed')
                        })
                      }}
                    >
                      Remove all accounts
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="panel">
                <h2>Hytale install</h2>
                <div className="path-row">
                  <code title={settings?.gameInstallPath ?? undefined}>
                    {settings?.gameInstallPath ?? 'Not set'}
                  </code>
                  <button className="btn" type="button" onClick={() => void onPickInstall()}>
                    Browse
                  </button>
                </div>
                <p style={{ marginTop: 8 }}>
                  {status?.issues?.length ? status.issues.join(' ') : 'Install looks valid.'}
                </p>
              </div>

              <div className="panel">
                <h2>Mod store keys (optional)</h2>
                <p className="page-sub" style={{ marginTop: 0 }}>
                  CurseForge can also ship an embedded key in{' '}
                  <code>src/main/mods/constants.ts</code> (
                  <code>SPIRE_EMBEDDED_CURSEFORGE_API_KEY</code>) so everyone who builds Spire gets
                  API browse / Download quickly without pasting. Settings override that embedded key.
                  Nexus free Slow downloads still use the browser; Spire auto-imports from Downloads
                  (or use Mod Manager / nxm). Premium Nexus keys unlock Download quickly.
                </p>
                <label className="field">
                  <span>CurseForge API key (optional — overrides embedded key)</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={cfKey}
                    onChange={(e) => setCfKey(e.target.value)}
                    placeholder="Leave empty to use Spire’s embedded key if set"
                  />
                </label>
                <label className="field">
                  <span>Nexus Mods API key (optional — Premium for Download quickly)</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={nexusKey}
                    onChange={(e) => setNexusKey(e.target.value)}
                    placeholder="Premium accounts: enables CDN one-click"
                  />
                </label>
                <div className="row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void onSaveCredentials()}
                  >
                    Save
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => void onClearCredentials()}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="panel">
                <h2>Updates</h2>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={settings?.checkForUpdates ?? true}
                    onChange={(e) => void onToggleUpdates(e.target.checked)}
                  />
                  <span>Check for updates on launch</span>
                </label>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void window.spire.checkForUpdate().then(setUpdate)}
                  >
                    Check now
                  </button>
                  <span className="muted">v{appVersion || '…'}</span>
                </div>
              </div>

              <div className="panel">
                <h2>Appearance</h2>
                <p className="muted">Applies to the main window, manage sidebar, and run log.</p>

                <div className="appearance-section">
                  <h3>Color theme</h3>
                  <span className="muted">Dark, light, and high-contrast palettes.</span>
                  <div className="theme-grid">
                    {THEME_OPTIONS.map((opt) => {
                      const selected = normalizeTheme(settings?.theme) === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`theme-card theme-preview-${opt.id}${selected ? ' selected' : ''}`}
                          onClick={() => void onThemeChange(opt.id)}
                        >
                          <span className="theme-swatches" aria-hidden>
                            <span className="swatch swatch-bg" />
                            <span className="swatch swatch-nav" />
                            <span className="swatch swatch-accent" />
                          </span>
                          <strong>{opt.label}</strong>
                          <span className="muted">{opt.blurb}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="appearance-section">
                  <h3>Readability</h3>
                  <span className="muted">Type size and spacing across the app.</span>
                  <div className="option-grid">
                    {DENSITY_OPTIONS.map((opt) => {
                      const selected = normalizeDensity(settings?.density) === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`option-card${selected ? ' selected' : ''}`}
                          onClick={() => void onDensityChange(opt.id)}
                        >
                          <strong>{opt.label}</strong>
                          <span className="muted">{opt.blurb}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="appearance-section">
                  <h3>Home layout</h3>
                  <span className="muted">How instances are arranged on the home screen.</span>
                  <div className="option-grid">
                    {HOME_LAYOUT_OPTIONS.map((opt) => {
                      const selected = normalizeHomeLayout(settings?.homeLayout) === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`option-card${selected ? ' selected' : ''}`}
                          onClick={() => void onHomeLayoutChange(opt.id)}
                        >
                          <strong>{opt.label}</strong>
                          <span className="muted">{opt.blurb}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="panel">
                <h2>Data folder</h2>
                <div className="path-row">
                  <code title={dataInfo?.spireRoot}>{dataInfo?.spireRoot ?? '…'}</code>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void window.spire.openSpireDataFolder()}
                  >
                    Open
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void window.spire.openLogsFolder()}
                  >
                    Logs
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 8 }}>
                  Errors and failed downloads: <code>logs/spire-YYYY-MM-DD.log</code>. Play output:{' '}
                  <code>logs/runs/</code>.
                </p>
                {dataInfo?.gameRoot ? (
                  <p className="muted" style={{ marginTop: 8 }}>
                    Game packages: <code>{dataInfo.gameRoot}</code>
                  </p>
                ) : null}
              </div>
            </div>
          ) : view === 'versions' ? (
            <VersionsView
              onToast={setToast}
              onInstallChanged={() => {
                void refresh()
                void window.spire.getHytaleAuthStatus().then(setHytaleAuth)
              }}
            />
          ) : (
            <div className="instance-view">
              <div className="group-header">
                <div className="group-label">Instances</div>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={openCreateDialog}
                >
                  Add Instance
                </button>
              </div>
              {instances.length === 0 ? (
                <div className="empty-state">
                  <p style={{ margin: '0 0 8px', color: 'var(--ink)', fontWeight: 600 }}>
                    No instances yet
                  </p>
                  <p style={{ margin: '0 0 14px' }}>
                    Create a profile, then install the full client under Install (or point Settings
                    at an official install).
                  </p>
                  <div className="row">
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={busy}
                      onClick={openCreateDialog}
                    >
                      Add Instance
                    </button>
                    <button className="btn" type="button" onClick={() => setView('versions')}>
                      Install
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`instance-grid${
                    normalizeHomeLayout(settings?.homeLayout) === 'list' ? ' layout-list' : ''
                  }`}
                >
                  {instances.map((instance) => (
                    <button
                      key={instance.id}
                      type="button"
                      className={`instance-card${active?.id === instance.id ? ' selected' : ''}`}
                      onClick={() => void selectInstance(instance.id)}
                      onDoubleClick={() => {
                        void selectInstance(instance.id).then(() => void onLaunch(instance.id))
                      }}
                      onContextMenu={(e) => openInstanceMenu(e, instance)}
                    >
                      <img className="instance-icon" src={spireLogo} alt="" />
                      <span className="instance-card-body">
                        <span className="instance-card-name">{instance.name}</span>
                        <span className="instance-card-meta muted">
                          {instance.channel}
                          {instance.gameVersion ? ` · ${instance.gameVersion}` : ''}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              <span className="icon">▶</span>
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
              <span className="icon">✎</span>
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
              <span className="icon">▣</span>
              Mods
            </button>
            <button
              className="btn-tool"
              type="button"
              disabled={!active}
              onClick={() => active && void window.spire.openInstanceFolder(active.id)}
            >
              <span className="icon">📁</span>
              Folder
            </button>
            <button
              className="btn-tool"
              type="button"
              disabled={!active || busy}
              onClick={() => void onDelete()}
            >
              <span className="icon">✕</span>
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
