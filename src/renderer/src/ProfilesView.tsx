import { useCallback, useEffect, useState } from 'react'
import type {
  GameVersionInfo,
  HytaleAuthStatus,
  HytaleDownloadProgress,
  InstanceChannel,
  InstanceRuntimeStatus,
  SpireInstance
} from '../../shared/types'

interface ProfilesViewProps {
  instances: SpireInstance[]
  activeId: string | null
  onSelect: (id: string) => Promise<void>
  onChanged: () => Promise<void>
  onToast: (message: string) => void
  auth: HytaleAuthStatus | null
  onOpenMods?: () => void
  onOpenInstall?: () => void
}

export default function ProfilesView({
  instances,
  activeId,
  onSelect,
  onChanged,
  onToast,
  auth,
  onOpenMods,
  onOpenInstall
}: ProfilesViewProps): React.JSX.Element {
  const active = instances.find((i) => i.id === activeId) ?? instances[0] ?? null
  const [name, setName] = useState(active?.name ?? '')
  const [notes, setNotes] = useState(active?.notes ?? '')
  const [channel, setChannel] = useState<InstanceChannel>(active?.channel ?? 'release')
  const [gameVersion, setGameVersion] = useState(active?.gameVersion ?? '')
  const [versions, setVersions] = useState<GameVersionInfo[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [busy, setBusy] = useState(false)
  const [runtime, setRuntime] = useState<InstanceRuntimeStatus | null>(null)
  const [progress, setProgress] = useState<HytaleDownloadProgress | null>(null)

  useEffect(() => {
    setName(active?.name ?? '')
    setNotes(active?.notes ?? '')
    setChannel(active?.channel ?? 'release')
    setGameVersion(active?.gameVersion ?? '')
  }, [active?.id, active?.name, active?.notes, active?.channel, active?.gameVersion])

  const refreshRuntime = useCallback(async () => {
    if (!active) {
      setRuntime(null)
      return
    }
    try {
      setRuntime(await window.spire.getInstanceRuntimeStatus(active.id))
    } catch {
      setRuntime(null)
    }
  }, [active])

  useEffect(() => {
    void refreshRuntime()
  }, [refreshRuntime])

  useEffect(() => {
    return window.spire.onHytaleDownloadProgress((p) => {
      setProgress(p)
      if (p.phase === 'done' || p.phase === 'error') {
        void refreshRuntime()
      }
    })
  }, [refreshRuntime])

  useEffect(() => {
    let cancelled = false
    setLoadingVersions(true)
    void window.spire
      .listGameVersions(channel)
      .then((list) => {
        if (!cancelled) setVersions(list)
      })
      .catch(() => {
        if (!cancelled) setVersions([])
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false)
      })
    return () => {
      cancelled = true
    }
  }, [channel, auth?.signedIn, auth?.sessionValid, runtime?.clientReady])

  async function save(): Promise<void> {
    if (!active) return
    setBusy(true)
    try {
      await window.spire.updateInstance(active.id, {
        name,
        notes,
        channel,
        gameVersion: gameVersion.trim() || null
      })
      await onChanged()
      await refreshRuntime()
      onToast('Instance saved')
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function duplicate(): Promise<void> {
    if (!active) return
    setBusy(true)
    try {
      const copy = await window.spire.duplicateInstance(active.id)
      await onChanged()
      await onSelect(copy.id)
      onToast(`Copied as “${copy.name}”`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function installClient(repair = false): Promise<void> {
    if (!active) return
    if (!auth?.signedIn || !auth.sessionValid) {
      onToast('Sign in under Install first.')
      onOpenInstall?.()
      return
    }
    setBusy(true)
    try {
      const result = repair
        ? await window.spire.repairHytaleChannel(channel)
        : await window.spire.downloadHytaleChannel(channel)
      onToast(result.message)
      if (result.ok && result.version) {
        await window.spire.updateInstance(active.id, {
          channel,
          gameVersion: result.version
        })
        setGameVersion(result.version)
        await onChanged()
      }
      await refreshRuntime()
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!active) {
    return (
      <div className="page">
        <h1 className="page-title">Edit instance</h1>
        <p className="page-sub">Select an instance first.</p>
      </div>
    )
  }

  const signedIn = Boolean(auth?.signedIn && auth.sessionValid)
  const installing =
    busy ||
    progress?.phase === 'downloading' ||
    progress?.phase === 'extracting' ||
    progress?.phase === 'resolving'

  return (
    <div className="page">
      <h1 className="page-title">Manage instance</h1>
      <p className="page-sub">{active.name}</p>

      <div className="panel">
        <h2>Status</h2>
        <div className="status-grid">
          <div>
            <span className="muted">Client</span>
            <div>
              {runtime?.clientReady ? (
                <strong className="ok-text">Ready</strong>
              ) : (
                <strong className="warn-text">Not installed</strong>
              )}
            </div>
          </div>
          <div>
            <span className="muted">JRE</span>
            <div>{runtime?.javaReady ? 'Ready' : 'Missing'}</div>
          </div>
          <div>
            <span className="muted">Build</span>
            <div>
              {runtime?.installedVersion ||
                (runtime?.build ? `build-${runtime.build}` : '—')}
            </div>
          </div>
          <div>
            <span className="muted">Content</span>
            <div>
              {runtime?.modsCount ?? 0} mods · {runtime?.worldsCount ?? 0} worlds ·{' '}
              {runtime?.serversCount ?? 0} servers
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="btn btn-primary"
            disabled={installing}
            onClick={() => void installClient(false)}
          >
            {runtime?.clientReady ? 'Update client' : 'Install full client'}
          </button>
          {runtime?.clientReady ? (
            <button className="btn" disabled={installing} onClick={() => void installClient(true)}>
              Repair
            </button>
          ) : null}
          <button className="btn" disabled={busy} onClick={() => onOpenMods?.()}>
            Mods
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void window.spire.openInstanceFolder(active.id)}
          >
            Folder
          </button>
        </div>
        {!signedIn ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Sign in under Install to download the official client + patches.
          </p>
        ) : null}
        {progress && progress.phase !== 'idle' && progress.phase !== 'done' ? (
          <div className="download-progress" style={{ marginTop: 12 }}>
            <div className="muted">{progress.message}</div>
            {progress.bytesTotal > 0 && progress.phase === 'downloading' ? (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.floor((progress.bytesReceived / progress.bytesTotal) * 100)
                    )}%`
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="panel">
        <h2>Profile</h2>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Channel</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value as InstanceChannel)}>
            <option value="release">Release</option>
            <option value="pre-release">Pre-release</option>
          </select>
        </label>
        <label className="field">
          <span>Game version</span>
          <select
            value={gameVersion}
            disabled={loadingVersions}
            onChange={(e) => setGameVersion(e.target.value)}
          >
            <option value="">Unpinned (Settings install / channel tip)</option>
            {gameVersion && !versions.some((v) => v.version === gameVersion) ? (
              <option value={gameVersion}>{gameVersion} (saved)</option>
            ) : null}
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                {v.version}
                {v.latest ? ' (current)' : ''}
                {v.clientReady ? ' · playable' : v.installedLocally ? ' · package' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ marginTop: 0 }}>
          Install uses official Wharf patches (Client + JRE). The API lists only the current tip per
          channel.
          {loadingVersions ? ' Loading…' : ''}
        </p>
        <label className="field">
          <span>Notes</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes (local only)"
          />
        </label>
        <div className="row">
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            Save
          </button>
          <button className="btn" disabled={busy} onClick={() => void duplicate()}>
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}
