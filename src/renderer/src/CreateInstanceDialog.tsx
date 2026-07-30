import { useCallback, useEffect, useState } from 'react'
import type {
  CreateInstanceOptions,
  GameVersionInfo,
  HytaleAuthStatus,
  HytaleDownloadProgress,
  InstanceChannel
} from '../../shared/types'
import {
  DEFAULT_INSTANCE_ICON_ID,
  INSTANCE_ICON_PRESETS,
  normalizeInstanceIconId
} from '../../shared/instanceIcons'
import DownloadProgressPanel from './DownloadProgressPanel'
import InstanceIcon from './InstanceIcon'

interface CreateInstanceDialogProps {
  open: boolean
  busy: boolean
  auth: HytaleAuthStatus | null
  onClose: () => void
  onCreated: (created: { id: string; name: string }, downloaded: boolean) => void
  onOpenInstall: () => void
  onToast: (message: string) => void
  onAuthChanged: (status: HytaleAuthStatus) => void
}

type WizardStep = 1 | 2

export default function CreateInstanceDialog({
  open,
  busy,
  auth,
  onClose,
  onCreated,
  onOpenInstall,
  onToast,
  onAuthChanged
}: CreateInstanceDialogProps): React.JSX.Element | null {
  const [step, setStep] = useState<WizardStep>(1)
  const [name, setName] = useState('New Instance')
  const [channel, setChannel] = useState<InstanceChannel>('release')
  const [notes, setNotes] = useState('')
  const [gameVersion, setGameVersion] = useState<string>('')
  const [versions, setVersions] = useState<GameVersionInfo[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [downloadAfter, setDownloadAfter] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)
  const [progress, setProgress] = useState<HytaleDownloadProgress | null>(null)
  const [iconId, setIconId] = useState(DEFAULT_INSTANCE_ICON_ID)

  const signedIn = Boolean(auth?.signedIn && auth.sessionValid)

  const refreshVersions = useCallback(async (ch: InstanceChannel) => {
    setLoadingVersions(true)
    setVersionsError(null)
    try {
      const list = await window.spire.listGameVersions(ch)
      setVersions(list)
      const tip = list.find((v) => v.latest) ?? list[0]
      setGameVersion((prev) => {
        if (prev && list.some((v) => v.version === prev)) return prev
        return tip?.version ?? ''
      })
    } catch (err) {
      setVersions([])
      setVersionsError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingVersions(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setStep(1)
    setName('New Instance')
    setChannel('release')
    setNotes('')
    setGameVersion('')
    setVersions([])
    setVersionsError(null)
    setDownloadAfter(false)
    setProgress(null)
    setIconId(DEFAULT_INSTANCE_ICON_ID)
    void refreshVersions('release')
  }, [open, refreshVersions])

  useEffect(() => {
    if (!open) return
    void refreshVersions(channel)
  }, [channel, open, refreshVersions])

  useEffect(() => {
    if (!open) return
    void window.spire.getHytaleDownloadProgress().then(setProgress)
    return window.spire.onHytaleDownloadProgress(setProgress)
  }, [open])

  if (!open) return null

  const selected = versions.find((v) => v.version === gameVersion) ?? null
  const creating = busy || localBusy
  const hasRemoteTip = versions.some((v) => v.latest)
  const onlyLocal = versions.length > 0 && !hasRemoteTip

  async function goNext(): Promise<void> {
    if (!name.trim()) {
      onToast('Enter an instance name.')
      return
    }
    setStep(2)
  }

  async function onCreate(): Promise<void> {
    setLocalBusy(true)
    try {
      const options: CreateInstanceOptions = {
        name: name.trim() || 'New Instance',
        channel,
        gameVersion: gameVersion.trim() || null,
        notes: notes.trim(),
        iconId: normalizeInstanceIconId(iconId)
      }
      const created = await window.spire.createInstance(options)

      let downloaded = false
      if (downloadAfter && signedIn) {
        const result = await window.spire.downloadHytaleChannel(channel)
        onToast(result.message)
        downloaded = result.ok
        if (result.ok && result.version && result.version !== created.gameVersion) {
          await window.spire.updateInstance(created.id, { gameVersion: result.version })
        }
      }

      onCreated(created, downloaded)
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
    } finally {
      setLocalBusy(false)
    }
  }

  async function onSignIn(): Promise<void> {
    setLocalBusy(true)
    try {
      const device = await window.spire.startHytaleLogin()
      const uri = device.verificationUriComplete || device.verificationUri
      await window.spire.openExternal(uri)
      const status = await window.spire.waitHytaleLogin()
      onAuthChanged(status)
      onToast(status.signedIn ? 'Signed in with Hytale' : 'Sign-in ended')
      if (status.signedIn) await refreshVersions(channel)
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
    } finally {
      setLocalBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!creating) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !creating) onClose()
      }}
    >
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-instance-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-instance-title">Create Instance</h2>
        <p className="modal-step muted">
          Step {step} of 2 — {step === 1 ? 'Name & channel' : 'Game version'}
        </p>

        {step === 1 ? (
          <>
            <label className="field">
              <span>Name</span>
              <input
                autoFocus
                value={name}
                disabled={creating}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void goNext()
                  if (e.key === 'Escape' && !creating) onClose()
                }}
              />
            </label>
            <label className="field">
              <span>Channel</span>
              <select
                value={channel}
                disabled={creating}
                onChange={(e) => setChannel(e.target.value as InstanceChannel)}
              >
                <option value="release">Release</option>
                <option value="pre-release">Pre-release</option>
              </select>
            </label>
            <div className="field">
              <span>Icon</span>
              <div className="instance-icon-grid instance-icon-grid-compact" role="listbox" aria-label="Instance icon">
                {INSTANCE_ICON_PRESETS.map((preset) => {
                  const active = iconId === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`instance-icon-option${active ? ' is-active' : ''}`}
                      disabled={creating}
                      title={preset.label}
                      onClick={() => setIconId(preset.id)}
                    >
                      <InstanceIcon iconId={preset.id} className="instance-icon-option-img" />
                      <span>{preset.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                You can set a custom image later in Manage → Profile.
              </p>
            </div>
            <label className="field">
              <span>Notes (optional)</span>
              <textarea
                rows={2}
                value={notes}
                disabled={creating}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Local only"
              />
            </label>
            <div className="row modal-actions">
              <button
                className="btn btn-primary"
                type="button"
                disabled={creating}
                onClick={() => void goNext()}
              >
                Next
              </button>
              <button className="btn" type="button" disabled={creating} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {!signedIn ? (
              <div className="wizard-callout">
                <p>
                  Sign in with your official Hytale account (browser launcher login) to list the
                  current <code>{channel}</code> build and install the full Client + JRE. You can
                  still create this profile and download later under Accounts.
                </p>
                <div className="row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={creating}
                    onClick={() => void onSignIn()}
                  >
                    Sign in with Hytale
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={creating}
                    onClick={() => {
                      onClose()
                      onOpenInstall()
                    }}
                  >
                    Open Accounts
                  </button>
                </div>
              </div>
            ) : auth?.canInstallClient === false ? (
              <div className="wizard-callout">
                <p>
                  This saved login is downloader-only and cannot install the playable Client + JRE.
                  Open Accounts, remove the account, and sign in again.
                </p>
                <div className="row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={creating}
                    onClick={() => {
                      onClose()
                      onOpenInstall()
                    }}
                  >
                    Open Accounts
                  </button>
                </div>
              </div>
            ) : null}

            <label className="field">
              <span>Version</span>
              <select
                value={gameVersion}
                disabled={creating || loadingVersions || versions.length === 0}
                onChange={(e) => setGameVersion(e.target.value)}
              >
                {versions.length === 0 ? (
                  <option value="">
                    {loadingVersions
                      ? 'Loading…'
                      : signedIn
                        ? 'No versions listed yet'
                        : 'Sign in for official tip — or create unpinned'}
                  </option>
                ) : (
                  versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      {v.version}
                      {v.latest ? ' (current)' : ''}
                      {v.installedLocally ? ' · installed' : ''}
                    </option>
                  ))
                )}
              </select>
            </label>

            {loadingVersions ? <p className="muted">Loading versions…</p> : null}
            {versionsError ? <p className="muted">{versionsError}</p> : null}

            {signedIn && hasRemoteTip ? (
              <p className="muted wizard-note">
                Official API only returns the <strong>current</strong> build per channel — there is
                no public catalog of older historical versions. Locally downloaded builds still
                appear here if you already have them.
              </p>
            ) : null}
            {onlyLocal ? (
              <p className="muted wizard-note">
                Showing Spire-cached installs only. Sign in to refresh the current channel tip.
              </p>
            ) : null}
            {!signedIn && versions.length === 0 ? (
              <p className="muted wizard-note">
                Creating without a pinned version uses your Settings install path until you download
                a channel package.
              </p>
            ) : null}

            {selected?.downloadable && !selected.clientReady ? (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={downloadAfter}
                  disabled={creating || !signedIn || auth?.canInstallClient === false}
                  onChange={(e) => setDownloadAfter(e.target.checked)}
                />
                <span>Install full client (Wharf patches + JRE) after creating</span>
              </label>
            ) : null}

            <DownloadProgressPanel progress={progress} />

            <div className="row modal-actions">
              <button
                className="btn"
                type="button"
                disabled={creating}
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={creating}
                onClick={() => void onCreate()}
              >
                {creating && downloadAfter
                  ? 'Installing…'
                  : downloadAfter
                    ? 'Create & install'
                    : creating
                      ? 'Creating…'
                      : 'Create'}
              </button>
              <button className="btn" type="button" disabled={creating} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
