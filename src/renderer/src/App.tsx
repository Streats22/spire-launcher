import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  InstallStatus,
  LocalDataInfo,
  SpireInstance,
  SpireSettings,
  UpdateCheckResult
} from '../../shared/types'
import ModsBrowser from './ModsBrowser'
import ProfilesView from './ProfilesView'
import spireLogo from './assets/spire-logo.png'

type View = 'home' | 'profiles' | 'mods' | 'settings'

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
  }, [refresh])

  useEffect(() => {
    void window.spire.checkForUpdate().then(setUpdate)
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
    if (view !== 'home' && view !== 'settings') {
      // keep current detail view in sync with selection
    }
  }

  async function onCreate(): Promise<void> {
    const name = prompt('New instance name', 'New Instance')
    if (name === null) return
    setBusy(true)
    try {
      const created = await window.spire.createInstance(name.trim() || 'New Instance')
      await refresh()
      await selectInstance(created.id)
      setView('home')
      setToast(`Created “${created.name}”`)
    } finally {
      setBusy(false)
    }
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
    if (!confirm('Clear CurseForge and Nexus keys?')) return
    const next = await window.spire.clearLocalCredentials()
    setSettings(next)
    setCfKey('')
    setNexusKey('')
    setToast('Keys cleared')
  }

  async function onToggleUpdates(enabled: boolean): Promise<void> {
    const next = await window.spire.updateSettings({ checkForUpdates: enabled })
    setSettings(next)
    setUpdate(await window.spire.checkForUpdate())
  }

  const installOk = Boolean(status?.valid)
  const showActionBar = view === 'home' || view === 'profiles' || view === 'mods'

  return (
    <div className="app">
      <header className="toolbar">
        <span className="toolbar-brand">
          <img className="toolbar-logo" src={spireLogo} alt="" />
          Spire
        </span>
        <button className="btn" type="button" disabled={busy} onClick={() => void onCreate()}>
          Add Instance
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => setView(view === 'settings' ? 'home' : 'settings')}
        >
          {view === 'settings' ? 'Back' : 'Settings'}
        </button>
        <div className="toolbar-spacer" />
        {active && view !== 'settings' ? (
          <span className="muted">{active.name}</span>
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
                GET.
              </p>

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
                <h2>Mod store keys</h2>
                <label className="field">
                  <span>CurseForge API key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={cfKey}
                    onChange={(e) => setCfKey(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Nexus Mods API key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={nexusKey}
                    onChange={(e) => setNexusKey(e.target.value)}
                  />
                </label>
                <div className="row">
                  <button className="btn btn-primary" type="button" onClick={() => void onSaveCredentials()}>
                    Save
                  </button>
                  <button className="btn btn-danger" type="button" onClick={() => void onClearCredentials()}>
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
                </div>
              </div>
            </div>
          ) : view === 'profiles' && active ? (
            <ProfilesView
              instances={instances}
              activeId={active.id}
              onSelect={selectInstance}
              onChanged={refresh}
              onToast={setToast}
            />
          ) : view === 'mods' && active ? (
            <ModsBrowser
              instanceId={active.id}
              instanceName={active.name}
              onToast={setToast}
            />
          ) : (
            <div className="instance-view">
              <div className="group-label">Instances</div>
              {instances.length === 0 ? (
                <div className="empty-state">
                  No instances yet. Click <strong>Add Instance</strong> to create one. Point Spire at
                  your official Hytale install in Settings before launching.
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
              disabled={!active || busy || !installOk}
              onClick={() => void onLaunch()}
              title="Launch"
            >
              <span className="icon">▶</span>
              Launch
            </button>
            <button
              className="btn-tool"
              type="button"
              disabled={!active}
              onClick={() => setView(view === 'profiles' ? 'home' : 'profiles')}
            >
              <span className="icon">✎</span>
              Edit
            </button>
            <button
              className="btn-tool"
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
          {installOk ? 'Ready' : 'Set Hytale install in Settings'}
        </span>
        <span>
          {active ? active.name : 'No instance selected'}
          {appVersion ? ` · ${appVersion}` : ''}
        </span>
      </footer>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
