import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  HytaleAuthStatus,
  InstallStatus,
  LocalDataInfo,
  SpireInstance,
  SpireSettings,
  UpdateCheckResult
} from '../../shared/types'
import CreateInstanceDialog from './CreateInstanceDialog'
import ModsBrowser from './ModsBrowser'
import VersionsView from './VersionsView'
import spireLogo from './assets/spire-logo.png'

type View = 'home' | 'mods' | 'settings' | 'versions'

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
    void window.spire.checkForUpdate().then(setUpdate)
  }, [])

  useEffect(() => {
    return window.spire.onNavigate((next) => {
      if (next === 'mods' || next === 'versions' || next === 'settings' || next === 'home') {
        setView(next)
      }
    })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  const active = useMemo(
    () => instances.find((i) => i.id === settings?.activeInstanceId) ?? instances[0] ?? null,
    [instances, settings]
  )

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

  async function onLaunch(): Promise<void> {
    if (!active) return
    setBusy(true)
    try {
      const result = await window.spire.launchInstance(active.id)
      setToast(result.message)
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(): Promise<void> {
    if (!active) return
    if (!confirm(`Delete instance “${active.name}”?`)) return
    setBusy(true)
    try {
      await window.spire.deleteInstance(active.id)
      await refresh()
      setView('home')
      setToast('Instance deleted')
    } finally {
      setBusy(false)
    }
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

  const installOk = Boolean(status?.valid)
  const showActionBar = view === 'home' || view === 'mods'

  return (
    <div className="app">
      <header className="toolbar">
        <span className="toolbar-brand">
          <img className="toolbar-logo" src={spireLogo} alt="" />
          Spire
        </span>
        <button className="btn" type="button" disabled={busy} onClick={openCreateDialog}>
          Add Instance
        </button>
        <button
          className={`btn${view === 'versions' ? ' active' : ''}`}
          type="button"
          onClick={() => setView(view === 'versions' ? 'home' : 'versions')}
        >
          {view === 'versions' ? 'Back' : 'Install'}
        </button>
        <button
          className={`btn${view === 'settings' ? ' active' : ''}`}
          type="button"
          onClick={() => setView(view === 'settings' ? 'home' : 'settings')}
        >
          {view === 'settings' ? 'Back' : 'Settings'}
        </button>
        <div className="toolbar-spacer" />
        {active && view !== 'settings' && view !== 'versions' ? (
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
          ) : view === 'mods' && active ? (
            <ModsBrowser
              instanceId={active.id}
              instanceName={active.name}
              onToast={setToast}
              showModPhotos={settings?.showModPhotos !== false}
              onShowModPhotosChange={(show) => {
                void window.spire.updateSettings({ showModPhotos: show }).then(setSettings)
              }}
            />
          ) : (
            <div className="instance-view">
              <div className="group-label">Instances</div>
              {instances.length === 0 ? (
                <div className="empty-state">
                  <p style={{ margin: '0 0 8px', color: 'var(--ink)', fontWeight: 600 }}>
                    No instances yet
                  </p>
                  Click <strong>Add Instance</strong> to create a profile, then install the full
                  client under <strong>Install</strong> (or point Settings at an official install).
                </div>
              ) : (
                <div className="instance-grid">
                  {instances.map((instance) => (
                    <button
                      key={instance.id}
                      type="button"
                      className={`instance-card${active?.id === instance.id ? ' selected' : ''}`}
                      onClick={() => void selectInstance(instance.id)}
                      onDoubleClick={() => {
                        void selectInstance(instance.id).then(() => void onLaunch())
                      }}
                    >
                      <img className="instance-icon" src={spireLogo} alt="" />
                      <span className="instance-card-name">{instance.name}</span>
                      <span className="instance-card-meta muted">
                        {instance.channel}
                        {instance.gameVersion ? ` · ${instance.gameVersion}` : ''}
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
              className={`btn-tool${view === 'mods' ? ' active' : ''}`}
              type="button"
              disabled={!active}
              onClick={() => setView(view === 'mods' ? 'home' : 'mods')}
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
    </div>
  )
}
