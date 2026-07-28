import { useCallback, useEffect, useState } from 'react'
import type {
  HytaleAuthStatus,
  HytaleChannelInfo,
  HytaleDeviceLogin,
  HytaleDownloadProgress,
  HytalePatchline
} from '../../shared/types'

interface VersionsViewProps {
  onToast: (message: string) => void
  onInstallChanged: () => void
}

export default function VersionsView({
  onToast,
  onInstallChanged
}: VersionsViewProps): React.JSX.Element {
  const [auth, setAuth] = useState<HytaleAuthStatus | null>(null)
  const [device, setDevice] = useState<HytaleDeviceLogin | null>(null)
  const [channels, setChannels] = useState<HytaleChannelInfo[]>([])
  const [progress, setProgress] = useState<HytaleDownloadProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingChannels, setLoadingChannels] = useState(false)

  const refreshAuth = useCallback(async () => {
    setAuth(await window.spire.getHytaleAuthStatus())
  }, [])

  const refreshChannels = useCallback(async () => {
    const status = await window.spire.getHytaleAuthStatus()
    setAuth(status)
    if (!status.signedIn || !status.sessionValid) {
      setChannels([])
      return
    }
    setLoadingChannels(true)
    try {
      setChannels(await window.spire.listHytaleChannels())
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
      setChannels([])
    } finally {
      setLoadingChannels(false)
    }
  }, [onToast])

  useEffect(() => {
    void refreshAuth()
    void window.spire.getHytaleDownloadProgress().then(setProgress)
  }, [refreshAuth])

  useEffect(() => {
    if (auth?.signedIn && auth.sessionValid) {
      void refreshChannels()
    }
  }, [auth?.signedIn, auth?.sessionValid, refreshChannels])

  useEffect(() => {
    return window.spire.onHytaleDownloadProgress(setProgress)
  }, [])

  async function onSignIn(): Promise<void> {
    setBusy(true)
    try {
      const next = await window.spire.startHytaleLogin()
      setDevice(next)
      const uri = next.verificationUriComplete || next.verificationUri
      await window.spire.openExternal(uri)
      const status = await window.spire.waitHytaleLogin()
      setDevice(null)
      setAuth(status)
      onToast(status.signedIn ? 'Signed in with Hytale' : 'Sign-in ended')
      onInstallChanged()
      if (status.signedIn) await refreshChannels()
    } catch (err) {
      setDevice(null)
      onToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onCancelLogin(): Promise<void> {
    await window.spire.cancelHytaleLogin()
    setDevice(null)
    setBusy(false)
    onToast('Sign-in cancelled')
  }

  async function onSignOut(): Promise<void> {
    if (!confirm('Remove this Hytale account from Spire? Other saved accounts stay.')) return
    setAuth(await window.spire.signOutHytale(auth?.activeAccountId))
    setChannels([])
    onInstallChanged()
    onToast('Account removed')
  }

  async function onSignOutAll(): Promise<void> {
    if (!confirm('Remove all saved Hytale accounts from this machine?')) return
    setAuth(await window.spire.signOutAllHytale())
    setChannels([])
    onInstallChanged()
    onToast('All Hytale accounts removed')
  }

  async function onAddAccount(): Promise<void> {
    setBusy(true)
    try {
      const next = await window.spire.startHytaleLogin()
      setDevice(next)
      const uri = next.verificationUriComplete || next.verificationUri
      await window.spire.openExternal(uri)
      const status = await window.spire.waitHytaleLogin()
      setDevice(null)
      setAuth(status)
      onToast(status.signedIn ? 'Account added' : 'Sign-in ended')
      onInstallChanged()
      if (status.signedIn) await refreshChannels()
    } catch (err) {
      setDevice(null)
      onToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDownload(channel: HytalePatchline): Promise<void> {
    setBusy(true)
    try {
      const result = await window.spire.downloadHytaleChannel(channel)
      onToast(result.message)
      if (result.ok) onInstallChanged()
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const downloading = progress?.phase === 'downloading' || progress?.phase === 'extracting'

  return (
    <div className="page">
      <h1 className="page-title">Install / Versions</h1>
      <p className="page-sub">
        Sign in with your official Hytale account. Spire talks only to Hypixel OAuth + CDN — no game
        mirrors, no Spire cloud. Tokens stay on this machine.
      </p>

      <div className="panel">
        <h2>Hytale accounts</h2>
        {auth?.signedIn || (auth?.accounts?.length ?? 0) > 0 ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Save multiple official Hytale logins on this machine and switch which one Spire uses for
              downloads and launch.
            </p>
            {(auth?.accounts?.length ?? 0) > 0 ? (
              <label className="field">
                <span>Active account</span>
                <select
                  value={auth?.activeAccountId ?? ''}
                  disabled={busy}
                  onChange={(e) => {
                    void window.spire.selectHytaleAccount(e.target.value).then(async (status) => {
                      setAuth(status)
                      onInstallChanged()
                      if (status.signedIn && status.sessionValid) await refreshChannels()
                    })
                  }}
                >
                  {(auth?.accounts ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName || a.profileUuid || a.id.slice(0, 8)}
                      {a.id === auth?.activeAccountId ? ' (active)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {auth?.signedIn ? (
              <p>
                Using{' '}
                <strong>{auth.displayName || 'signed-in account'}</strong>
                {auth.sessionValid ? null : (
                  <span className="muted"> — session expired; sign in again for this account.</span>
                )}
              </p>
            ) : (
              <p className="muted">No active account — add one below.</p>
            )}
            {auth?.profiles && auth.profiles.length > 0 ? (
              <label className="field">
                <span>Game profile</span>
                <select
                  value={auth.profileUuid ?? ''}
                  disabled={busy || !auth.signedIn}
                  onChange={(e) => {
                    void window.spire.selectHytaleProfile(e.target.value).then(setAuth)
                  }}
                >
                  {auth.profiles.map((p) => (
                    <option key={p.uuid} value={p.uuid}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {device ? (
              <div className="device-login">
                <p>
                  Enter code <strong className="user-code">{device.userCode}</strong> at the page that
                  opened, or visit{' '}
                  <button
                    className="linkish"
                    type="button"
                    onClick={() => void window.spire.openExternal(device.verificationUri)}
                  >
                    {device.verificationUri}
                  </button>
                </p>
                <div className="row">
                  <button className="btn" type="button" onClick={() => void onCancelLogin()}>
                    Cancel
                  </button>
                  <span className="muted">Waiting for approval…</span>
                </div>
              </div>
            ) : (
              <div className="row">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void onAddAccount()}
                >
                  Add account
                </button>
                {auth?.activeAccountId ? (
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={busy}
                    onClick={() => void onSignOut()}
                  >
                    Remove active
                  </button>
                ) : null}
                {(auth?.accounts?.length ?? 0) > 1 ? (
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={busy}
                    onClick={() => void onSignOutAll()}
                  >
                    Remove all
                  </button>
                ) : null}
                <button
                  className="btn"
                  type="button"
                  disabled={busy || loadingChannels || !auth?.signedIn}
                  onClick={() => void refreshChannels()}
                >
                  Refresh versions
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p>
              Uses the same OAuth device flow as the official Hytale Downloader (
              <code>hytale-downloader</code>
              ). You’ll approve in the browser, then Spire stores tokens locally. You can add more
              accounts later and switch between them.
            </p>
            {device ? (
              <div className="device-login">
                <p>
                  Enter code <strong className="user-code">{device.userCode}</strong> at the page that
                  opened, or visit{' '}
                  <button
                    className="linkish"
                    type="button"
                    onClick={() => void window.spire.openExternal(device.verificationUri)}
                  >
                    {device.verificationUri}
                  </button>
                </p>
                <div className="row">
                  <button className="btn" type="button" onClick={() => void onCancelLogin()}>
                    Cancel
                  </button>
                  <span className="muted">Waiting for approval…</span>
                </div>
              </div>
            ) : (
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() => void onSignIn()}
              >
                Sign in with Hytale
              </button>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <h2>Channels</h2>
        <p className="page-sub" style={{ marginTop: 0 }}>
          Lists current <code>release</code> / <code>pre-release</code> builds from{' '}
          <code>account-data.hytale.com/game-assets</code>. Download requires a valid license
          session. Older builds: no public list API — only current per channel.
        </p>
        {!auth?.signedIn ? (
          <p className="muted">Sign in to list official versions.</p>
        ) : loadingChannels ? (
          <p className="muted">Loading channels…</p>
        ) : (
          <div className="channel-list">
            {channels.map((ch) => (
              <div key={ch.channel} className="channel-row">
                <div>
                  <strong>{ch.channel}</strong>
                  <div className="muted">
                    {ch.available
                      ? `${ch.version ?? '—'}${ch.clientReady ? ' · client ready' : ch.installedBuild ? ` · build ${ch.installedBuild}` : ''}`
                      : ch.error || 'Unavailable'}
                  </div>
                  {!ch.clientReady && ch.available ? (
                    <div className="muted" style={{ marginTop: 4 }}>
                      Installs the full Client + JRE via official Wharf patches (same pipeline as the
                      Hytale launcher).
                    </div>
                  ) : null}
                </div>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy || downloading || !ch.available}
                  onClick={() => void onDownload(ch.channel)}
                >
                  {ch.clientReady ? 'Update' : 'Install full client'}
                </button>
              </div>
            ))}
          </div>
        )}
        {progress && progress.phase !== 'idle' ? (
          <div className="download-progress">
            <div className="muted">{progress.message}</div>
            {progress.bytesTotal > 0 && progress.phase === 'downloading' ? (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, Math.floor((progress.bytesReceived / progress.bytesTotal) * 100))}%`
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="panel">
        <h2>Official launcher</h2>
        <p>
          Prefer Spire’s full client install above. You can still open Hypixel’s launcher or point
          Settings at an existing official install.
        </p>
        <div className="row">
          <button
            className="btn"
            type="button"
            onClick={() => void window.spire.openOfficialHytaleDownload()}
          >
            Open official download
          </button>
        </div>
      </div>
    </div>
  )
}
