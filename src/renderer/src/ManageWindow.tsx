import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  HytaleAuthStatus,
  ServerEntry,
  SpireInstance,
  SpireSettings,
  WorldEntry
} from '../../shared/types'
import ContextMenu, { useContextMenu } from './ContextMenu'
import ModsBrowser from './ModsBrowser'
import ProfilesView from './ProfilesView'
import { applyAppearance } from './theme'

type Tab = 'profile' | 'mods' | 'worlds' | 'prefabs' | 'bootstrap' | 'translations' | 'servers' | 'logs'

interface ManageWindowProps {
  instanceId: string
  initialTab?: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function parseTab(value?: string): Tab {
  if (
    value === 'mods' ||
    value === 'worlds' ||
    value === 'prefabs' ||
    value === 'bootstrap' ||
    value === 'translations' ||
    value === 'servers' ||
    value === 'logs'
  ) {
    return value
  }
  return 'profile'
}

export default function ManageWindow({
  instanceId,
  initialTab
}: ManageWindowProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(() => parseTab(initialTab))
  const [settings, setSettings] = useState<SpireSettings | null>(null)
  const [instances, setInstances] = useState<SpireInstance[]>([])
  const [auth, setAuth] = useState<HytaleAuthStatus | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [modsCount, setModsCount] = useState(0)
  const [worlds, setWorlds] = useState<WorldEntry[]>([])
  const [servers, setServers] = useState<ServerEntry[]>([])
  const [logLines, setLogLines] = useState<string[]>([])
  const [newWorldName, setNewWorldName] = useState('')
  const [serverDraft, setServerDraft] = useState({
    id: '' as string | undefined,
    name: '',
    address: '',
    port: '5520',
    notes: ''
  })
  const [worldsView, setWorldsView] = useState<'local' | 'download'>('local')
  const [busy, setBusy] = useState(false)
  const { menu, openMenu, closeMenu } = useContextMenu()

  const activeId = instanceId || settings?.activeInstanceId || null
  const instance = useMemo(
    () => instances.find((i) => i.id === activeId) ?? null,
    [instances, activeId]
  )

  const refresh = useCallback(async () => {
    const [nextSettings, nextInstances, nextAuth] = await Promise.all([
      window.spire.getSettings(),
      window.spire.listInstances(),
      window.spire.getHytaleAuthStatus()
    ])
    setSettings(nextSettings)
    setInstances(nextInstances)
    setAuth(nextAuth)
  }, [])

  const refreshContent = useCallback(async () => {
    if (!activeId) return
    const [nextMods, nextWorlds, nextServers] = await Promise.all([
      window.spire.listInstalledMods(activeId),
      window.spire.listWorlds(activeId),
      window.spire.listServers(activeId)
    ])
    setModsCount(nextMods.length)
    setWorlds(nextWorlds)
    setServers(nextServers)
  }, [activeId])

  const refreshLogs = useCallback(async () => {
    if (!activeId) return
    setLogLines(await window.spire.getInstanceRunLog(activeId, 800))
  }, [activeId])

  useEffect(() => {
    void refresh()
    document.title = 'Manage instance — Spire'
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
    void refreshContent()
  }, [refreshContent])

  useEffect(() => {
    if (tab === 'logs') void refreshLogs()
  }, [tab, refreshLogs])

  useEffect(() => {
    if (tab !== 'worlds') setWorldsView('local')
  }, [tab])

  useEffect(() => {
    return window.spire.onManageNavigate((next) => setTab(parseTab(next)))
  }, [])

  useEffect(() => {
    if (!activeId) return
    return window.spire.onRunLog((event) => {
      if (event.instanceId !== activeId) return
      setLogLines((prev) => {
        const next = [...prev, `[${event.stream}] ${event.line}`]
        return next.length > 1200 ? next.slice(-800) : next
      })
    })
  }, [activeId])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  async function onSelect(id: string): Promise<void> {
    const next = await window.spire.setActiveInstance(id)
    setSettings(next)
  }

  async function createWorld(): Promise<void> {
    if (!activeId || !newWorldName.trim()) return
    setBusy(true)
    try {
      await window.spire.createWorld(activeId, newWorldName.trim())
      setNewWorldName('')
      await refreshContent()
      setToast('World created')
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function renameWorld(world: WorldEntry): Promise<void> {
    if (!activeId) return
    const name = prompt('Rename world', world.name)?.trim()
    if (!name || name === world.name) return
    setBusy(true)
    try {
      await window.spire.renameWorld(activeId, world.id, name)
      await refreshContent()
      setToast('World renamed')
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function duplicateWorld(world: WorldEntry): Promise<void> {
    if (!activeId) return
    setBusy(true)
    try {
      const copy = await window.spire.duplicateWorld(activeId, world.id)
      await refreshContent()
      setToast(`Duplicated as “${copy.name}”`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function deleteWorld(world: WorldEntry): Promise<void> {
    if (!activeId) return
    if (!confirm(`Delete world “${world.name}”? This cannot be undone.`)) return
    setBusy(true)
    try {
      await window.spire.deleteWorld(activeId, world.id)
      await refreshContent()
      setToast('World deleted')
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function editServer(server: ServerEntry): void {
    setServerDraft({
      id: server.id,
      name: server.name,
      address: server.address,
      port: String(server.port),
      notes: server.notes
    })
  }

  async function saveServer(): Promise<void> {
    if (!activeId || !serverDraft.name.trim() || !serverDraft.address.trim()) return
    setBusy(true)
    try {
      await window.spire.upsertServer(activeId, {
        id: serverDraft.id || undefined,
        name: serverDraft.name.trim(),
        address: serverDraft.address.trim(),
        port: Number(serverDraft.port) || 5520,
        notes: serverDraft.notes
      })
      setServerDraft({ id: undefined, name: '', address: '', port: '5520', notes: '' })
      await refreshContent()
      setToast(serverDraft.id ? 'Server updated' : 'Server added')
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function deleteServer(server: ServerEntry): Promise<void> {
    if (!activeId) return
    if (!confirm(`Remove server “${server.name}”?`)) return
    setBusy(true)
    try {
      await window.spire.deleteServer(activeId, server.id)
      if (serverDraft.id === server.id) {
        setServerDraft({ id: undefined, name: '', address: '', port: '5520', notes: '' })
      }
      await refreshContent()
      setToast('Server removed')
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const tabs: Array<{ id: Tab; label: string; hint: string }> = [
    { id: 'profile', label: 'Profile', hint: 'Name, channel, client' },
    { id: 'mods', label: 'Mods', hint: `${modsCount} installed` },
    { id: 'worlds', label: 'Worlds', hint: `${worlds.length} saved` },
    { id: 'prefabs', label: 'Prefabs', hint: 'Structures' },
    { id: 'bootstrap', label: 'Bootstraps', hint: 'Early plugins' },
    { id: 'translations', label: 'Translations', hint: 'Language packs' },
    { id: 'servers', label: 'Servers', hint: `${servers.length} saved` },
    { id: 'logs', label: 'Logs', hint: 'Run output' }
  ]

  return (
    <div className="popup-shell manage-shell">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Spire</p>
          <h1>{instance?.name ?? 'Manage instance'}</h1>
        </div>
        <div className="popup-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void window.spire.openInstanceFolder(activeId!)}
            disabled={!activeId}
          >
            Folder
          </button>
          <button type="button" className="btn" onClick={() => window.close()}>
            Close
          </button>
        </div>
      </header>

      <div className="manage-layout">
        <nav className="manage-nav" aria-label="Manage sections">
          <p className="manage-nav-label">Manage</p>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`manage-nav-item${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="manage-nav-title">{t.label}</span>
              <span className="manage-nav-hint">{t.hint}</span>
            </button>
          ))}
        </nav>

        <main className="popup-body">
          {tab === 'profile' && activeId ? (
          <ProfilesView
            instances={instances}
            activeId={activeId}
            onSelect={onSelect}
            onChanged={async () => {
              await refresh()
              await refreshContent()
            }}
            onToast={setToast}
            auth={auth}
            compact
            onOpenMods={() => setTab('mods')}
            onOpenInstall={() => {
              void window.spire.focusMainView('versions')
            }}
          />
        ) : null}

        {tab === 'mods' && activeId && instance ? (
          <div className="page manage-mods-page">
            <ModsBrowser
              instanceId={activeId}
              instanceName={instance.name}
              kind="mods"
              onToast={(message) => {
                setToast(message)
                void refreshContent()
              }}
              showModPhotos={settings?.showModPhotos !== false}
              onShowModPhotosChange={(show) => {
                void window.spire.updateSettings({ showModPhotos: show }).then(setSettings)
              }}
            />
          </div>
        ) : null}

        {tab === 'prefabs' && activeId && instance ? (
          <div className="page manage-mods-page">
            <ModsBrowser
              instanceId={activeId}
              instanceName={instance.name}
              kind="prefabs"
              onToast={(message) => {
                setToast(message)
                void refreshContent()
              }}
              showModPhotos={settings?.showModPhotos !== false}
              onShowModPhotosChange={(show) => {
                void window.spire.updateSettings({ showModPhotos: show }).then(setSettings)
              }}
            />
          </div>
        ) : null}

        {tab === 'bootstrap' && activeId && instance ? (
          <div className="page manage-mods-page">
            <ModsBrowser
              instanceId={activeId}
              instanceName={instance.name}
              kind="bootstrap"
              onToast={(message) => {
                setToast(message)
                void refreshContent()
              }}
              showModPhotos={settings?.showModPhotos !== false}
              onShowModPhotosChange={(show) => {
                void window.spire.updateSettings({ showModPhotos: show }).then(setSettings)
              }}
            />
          </div>
        ) : null}

        {tab === 'translations' && activeId && instance ? (
          <div className="page manage-mods-page">
            <ModsBrowser
              instanceId={activeId}
              instanceName={instance.name}
              kind="translations"
              onToast={(message) => {
                setToast(message)
                void refreshContent()
              }}
              showModPhotos={settings?.showModPhotos !== false}
              onShowModPhotosChange={(show) => {
                void window.spire.updateSettings({ showModPhotos: show }).then(setSettings)
              }}
            />
          </div>
        ) : null}

        {tab === 'worlds' ? (
          <div className="page">
            {worldsView === 'download' && activeId && instance ? (
              <div className="manage-mods-page" style={{ paddingTop: 0 }}>
                <ModsBrowser
                  instanceId={activeId}
                  instanceName={instance.name}
                  kind="worlds"
                  initialView="download"
                  onToast={(message) => {
                    setToast(message)
                    void refreshContent()
                    setWorldsView('local')
                  }}
                  showModPhotos={settings?.showModPhotos !== false}
                  onShowModPhotosChange={(show) => {
                    void window.spire.updateSettings({ showModPhotos: show }).then(setSettings)
                  }}
                />
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn" type="button" onClick={() => setWorldsView('local')}>
                    ← Back to worlds
                  </button>
                </div>
              </div>
            ) : (
              <>
            <div className="group-header">
              <div>
                <h1 className="page-title">Worlds</h1>
                <p className="page-sub">Create, rename, duplicate, delete, or download world packs.</p>
              </div>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setWorldsView('download')}
              >
                Download
              </button>
            </div>
            <div className="row" style={{ marginBottom: 12 }}>
              <input
                value={newWorldName}
                onChange={(e) => setNewWorldName(e.target.value)}
                placeholder="New world name"
                style={{ flex: 1, minWidth: 160 }}
              />
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !newWorldName.trim()}
                onClick={() => void createWorld()}
              >
                Create
              </button>
            </div>
            {worlds.length === 0 ? (
              <div className="empty-state">No worlds yet.</div>
            ) : (
              <div className="manage-list">
                {worlds.map((world) => (
                  <div
                    key={world.id}
                    className="manage-row"
                    onContextMenu={(e) =>
                      openMenu(e, [
                        {
                          id: 'rename',
                          label: 'Rename',
                          disabled: busy,
                          onSelect: () => void renameWorld(world)
                        },
                        {
                          id: 'duplicate',
                          label: 'Duplicate',
                          disabled: busy,
                          onSelect: () => void duplicateWorld(world)
                        },
                        {
                          id: 'folder',
                          label: 'Open folder',
                          disabled: !activeId,
                          onSelect: () => {
                            if (activeId) void window.spire.openWorldFolder(activeId, world.id)
                          }
                        },
                        { id: 'sep', label: '', separator: true },
                        {
                          id: 'delete',
                          label: 'Delete',
                          danger: true,
                          disabled: busy,
                          onSelect: () => void deleteWorld(world)
                        }
                      ])
                    }
                  >
                    <div className="manage-row-main">
                      <strong>{world.name}</strong>
                      <span className="muted">
                        {formatBytes(world.sizeBytes)}
                        {world.updatedAt
                          ? ` · updated ${new Date(world.updatedAt).toLocaleString()}`
                          : ''}
                      </span>
                    </div>
                    <div className="manage-row-actions">
                      <button className="btn" type="button" disabled={busy} onClick={() => void renameWorld(world)}>
                        Rename
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => void duplicateWorld(world)}
                      >
                        Duplicate
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={!activeId}
                        onClick={() =>
                          activeId && void window.spire.openWorldFolder(activeId, world.id)
                        }
                      >
                        Folder
                      </button>
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={busy}
                        onClick={() => void deleteWorld(world)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
              </>
            )}
          </div>
        ) : null}

        {tab === 'servers' ? (
          <div className="page">
            <h1 className="page-title">Servers</h1>
            <p className="page-sub">Saved server addresses for this instance.</p>
            <div className="panel">
              <h2>{serverDraft.id ? 'Edit server' : 'Add server'}</h2>
              <label className="field">
                <span>Name</span>
                <input
                  value={serverDraft.name}
                  onChange={(e) => setServerDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
              <div className="row">
                <label className="field" style={{ flex: 2 }}>
                  <span>Address</span>
                  <input
                    value={serverDraft.address}
                    onChange={(e) => setServerDraft((d) => ({ ...d, address: e.target.value }))}
                    placeholder="play.example.com"
                  />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span>Port</span>
                  <input
                    value={serverDraft.port}
                    onChange={(e) => setServerDraft((d) => ({ ...d, port: e.target.value }))}
                  />
                </label>
              </div>
              <label className="field">
                <span>Notes</span>
                <input
                  value={serverDraft.notes}
                  onChange={(e) => setServerDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </label>
              <div className="row">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy || !serverDraft.name.trim() || !serverDraft.address.trim()}
                  onClick={() => void saveServer()}
                >
                  {serverDraft.id ? 'Save' : 'Add'}
                </button>
                {serverDraft.id ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      setServerDraft({ id: undefined, name: '', address: '', port: '5520', notes: '' })
                    }
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </div>
            {servers.length === 0 ? (
              <div className="empty-state">No servers saved.</div>
            ) : (
              <div className="manage-list">
                {servers.map((server) => (
                  <div
                    key={server.id}
                    className="manage-row"
                    onContextMenu={(e) =>
                      openMenu(e, [
                        {
                          id: 'edit',
                          label: 'Edit',
                          onSelect: () => editServer(server)
                        },
                        { id: 'sep', label: '', separator: true },
                        {
                          id: 'remove',
                          label: 'Remove',
                          danger: true,
                          disabled: busy,
                          onSelect: () => void deleteServer(server)
                        }
                      ])
                    }
                  >
                    <div className="manage-row-main">
                      <strong>{server.name}</strong>
                      <span className="muted">
                        {server.address}:{server.port}
                        {server.notes ? ` · ${server.notes}` : ''}
                      </span>
                    </div>
                    <div className="manage-row-actions">
                      <button className="btn" type="button" onClick={() => editServer(server)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={busy}
                        onClick={() => void deleteServer(server)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'logs' ? (
          <div className="page">
            <h1 className="page-title">Instance logs</h1>
            <p className="page-sub">Output from launches of this instance.</p>
            <div className="row" style={{ marginBottom: 12 }}>
              <button className="btn" type="button" onClick={() => void refreshLogs()}>
                Refresh
              </button>
              <button
                className="btn"
                type="button"
                disabled={!activeId}
                onClick={() => {
                  if (!activeId) return
                  void window.spire.clearInstanceRunLog(activeId).then(() => {
                    setLogLines([])
                    setToast('Log cleared')
                  })
                }}
              >
                Clear
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => void window.spire.openLogsFolder()}
              >
                Logs folder
              </button>
              <button
                className="btn"
                type="button"
                disabled={!activeId}
                onClick={() => activeId && void window.spire.openRunWindow(activeId)}
              >
                Open run window
              </button>
            </div>
            <pre className="manage-log">
              {logLines.length === 0 ? (
                <span className="run-log-empty">No run log yet — launch the instance to capture output.</span>
              ) : (
                logLines.map((line, i) => <div key={`${i}-${line.slice(0, 24)}`}>{line}</div>)
              )}
            </pre>
          </div>
        ) : null}
        </main>
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  )
}
