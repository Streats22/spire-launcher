import { useCallback, useEffect, useState } from 'react'
import type {
  HytaleAuthStatus,
  HytaleChannelInfo,
  HytaleDeviceLogin,
  HytaleDownloadProgress,
  HytalePatchline
} from '../../shared/types'
import { gameProfileLabel } from '../../shared/hytaleDisplay'
import DownloadProgressPanel from './DownloadProgressPanel'

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
  const hasAccounts = Boolean(auth?.signedIn || (auth?.accounts?.length ?? 0) > 0)

  return (
    <div className="page page-install">
      <header className="install-header">
        <div>
          <h1 className="page-title">Install</h1>
          <p className="page-sub">
            Official Hytale account, Client, and JRE — tokens stay on this machine.
          </p>
        </div>
      </header>

      <div className="install-grid">
        <section className="panel install-panel">
          <div className="install-panel-head">
            <h2>Account</h2>
            {auth?.signedIn && auth.sessionValid ? (
              <span className="install-pill install-pill-ok">Signed in</span>
            ) : hasAccounts ? (
              <span className="install-pill">Needs sign-in</span>
            ) : null}
          </div>

          {hasAccounts ? (
            <>
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
                        {gameProfileLabel(a, 'Hytale account')}
                        {a.id === auth?.activeAccountId ? ' (active)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {auth?.signedIn ? (
                <p className="install-status-line">
                  {auth.sessionValid ? (
                    <>
                      Playing as{' '}
                      <strong>{gameProfileLabel(auth, 'signed-in account')}</strong>
                    </>
                  ) : (
                    <span className="muted">
                      Session expired for{' '}
                      <strong>{gameProfileLabel(auth, 'this account')}</strong> — sign in again.
                    </span>
                  )}
                </p>
              ) : (
                <p className="muted install-status-line">No active account — add one below.</p>
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
                <DeviceLoginCard device={device} onCancel={() => void onCancelLogin()} />
              ) : (
                <div className="row install-actions">
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
                      Remove
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
                </div>
              )}

              {auth?.signedIn && auth.canInstallClient === false ? (
                <p className="wizard-callout" style={{ marginTop: 12 }}>
                  This login can’t install Client + JRE. Remove it and sign in again with the
                  official launcher login.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="install-status-line">
                Sign in with the official Hytale launcher login to download the playable Client and
                JRE.
              </p>
              {device ? (
                <DeviceLoginCard device={device} onCancel={() => void onCancelLogin()} />
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
        </section>

        <section className="panel install-panel install-channels">
          <div className="install-panel-head">
            <h2>Channels</h2>
            <button
              className="btn btn-ghost btn-compact"
              type="button"
              disabled={busy || loadingChannels || !auth?.signedIn}
              onClick={() => void refreshChannels()}
            >
              Refresh
            </button>
          </div>
          <p className="muted install-channels-hint">
            Current release and pre-release builds from Hypixel. Install pulls the full Client + JRE.
          </p>

          {!auth?.signedIn ? (
            <div className="install-empty">
              <p className="muted">Sign in to see available builds.</p>
            </div>
          ) : loadingChannels ? (
            <div className="install-empty">
              <p className="muted">Loading channels…</p>
            </div>
          ) : channels.length === 0 ? (
            <div className="install-empty">
              <p className="muted">No channels listed yet.</p>
            </div>
          ) : (
            <div className="channel-cards">
              {channels.map((ch) => (
                <ChannelCard
                  key={ch.channel}
                  channel={ch}
                  busy={busy || downloading || auth?.canInstallClient === false}
                  onDownload={() => void onDownload(ch.channel)}
                />
              ))}
            </div>
          )}

          <DownloadProgressPanel progress={progress} hideTerminal={false} />
        </section>
      </div>

      <aside className="install-footer">
        <div>
          <strong>Official launcher</strong>
          <p className="muted">
            Prefer Spire’s install above. You can still open Hypixel’s download or point Settings at
            an existing install.
          </p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => void window.spire.openOfficialHytaleDownload()}
        >
          Open official download
        </button>
      </aside>
    </div>
  )
}

function DeviceLoginCard({
  device,
  onCancel
}: {
  device: HytaleDeviceLogin
  onCancel: () => void
}): React.JSX.Element {
  const isPkce = device.flow === 'pkce' || !device.userCode
  return (
    <div className="device-login">
      <p>
        {isPkce ? (
          <>
            Finish signing in in your browser. If nothing opened,{' '}
            <button
              className="linkish"
              type="button"
              onClick={() => void window.spire.openExternal(device.verificationUri)}
            >
              open the sign-in page
            </button>
            .
          </>
        ) : (
          <>
            Enter code <strong className="user-code">{device.userCode}</strong> at the page that
            opened, or visit{' '}
            <button
              className="linkish"
              type="button"
              onClick={() => void window.spire.openExternal(device.verificationUri)}
            >
              {device.verificationUri}
            </button>
          </>
        )}
      </p>
      <div className="row">
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
        <span className="muted">Waiting for approval…</span>
      </div>
    </div>
  )
}

function ChannelCard({
  channel,
  busy,
  onDownload
}: {
  channel: HytaleChannelInfo
  busy: boolean
  onDownload: () => void
}): React.JSX.Element {
  const ready = Boolean(channel.clientReady)
  const available = Boolean(channel.available)

  return (
    <article className={`channel-card${ready ? ' channel-card-ready' : ''}`}>
      <div className="channel-card-body">
        <div className="channel-card-title">
          <strong>{channel.channel}</strong>
          {ready ? <span className="install-pill install-pill-ok">Ready</span> : null}
          {!available ? <span className="install-pill">Unavailable</span> : null}
        </div>
        <div className="channel-card-meta muted">
          {available
            ? `${channel.version ?? '—'}${
                ready
                  ? ''
                  : channel.installedBuild
                    ? ` · build ${channel.installedBuild}`
                    : ' · Client not installed'
              }`
            : channel.error || 'Unavailable for this account'}
        </div>
        {!ready && available ? (
          <p className="channel-card-hint muted">
            Full Client + JRE via official Wharf patches.
          </p>
        ) : null}
      </div>
      <button
        className="btn btn-primary"
        type="button"
        disabled={busy || !available}
        onClick={onDownload}
      >
        {ready ? 'Update' : 'Install full client'}
      </button>
    </article>
  )
}
