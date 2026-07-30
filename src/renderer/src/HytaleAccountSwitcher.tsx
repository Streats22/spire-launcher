import type { HytaleAuthStatus } from '../../shared/types'
import { gameProfileLabel } from '../../shared/hytaleDisplay'

interface HytaleAccountSwitcherProps {
  auth: HytaleAuthStatus | null
  onAuth: (next: HytaleAuthStatus) => void
  onToast?: (message: string) => void
  /** Opens full account management (Accounts & install). */
  onManage?: () => void
  /** Compact toolbar control (no field labels). */
  compact?: boolean
  disabled?: boolean
}

export default function HytaleAccountSwitcher({
  auth,
  onAuth,
  onToast,
  onManage,
  compact = false,
  disabled = false
}: HytaleAccountSwitcherProps): React.JSX.Element | null {
  const accounts = auth?.accounts ?? []
  if (accounts.length === 0 && !auth?.signedIn) return null

  const profiles = auth?.profiles ?? []
  const busy = disabled

  async function onSelectAccount(accountId: string): Promise<void> {
    if (!accountId || accountId === auth?.activeAccountId) return
    try {
      const next = await window.spire.selectHytaleAccount(accountId)
      onAuth(next)
      onToast?.(`Switched to ${gameProfileLabel(next, 'Hytale account')}`)
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err))
    }
  }

  async function onSelectProfile(uuid: string): Promise<void> {
    if (!uuid || uuid === auth?.profileUuid) return
    try {
      const next = await window.spire.selectHytaleProfile(uuid)
      onAuth(next)
      onToast?.(`Playing as ${gameProfileLabel(next)}`)
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err))
    }
  }

  if (compact) {
    return (
      <div className="account-switcher account-switcher-compact" title="Hytale account">
        {accounts.length > 0 ? (
          <label className="account-switcher-chip">
            <span className="account-switcher-chip-label">Account</span>
            <select
              className="account-switcher-select"
              value={auth?.activeAccountId ?? ''}
              disabled={busy || accounts.length < 1}
              aria-label="Active Hytale account"
              onChange={(e) => void onSelectAccount(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {gameProfileLabel(a, 'Hytale account')}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="toolbar-chip">{gameProfileLabel(auth!, 'Hytale')}</span>
        )}

        {profiles.length > 1 ? (
          <label className="account-switcher-chip">
            <span className="account-switcher-chip-label">Profile</span>
            <select
              className="account-switcher-select"
              value={auth?.profileUuid ?? ''}
              disabled={busy || !auth?.signedIn}
              aria-label="Active game profile"
              onChange={(e) => void onSelectProfile(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.uuid} value={p.uuid}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    )
  }

  return (
    <div className="account-switcher account-switcher-panel">
      {accounts.length > 0 ? (
        <label className="field">
          <span>Active account</span>
          <select
            value={auth?.activeAccountId ?? ''}
            disabled={busy}
            onChange={(e) => void onSelectAccount(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {gameProfileLabel(a, 'Hytale account')}
                {a.id === auth?.activeAccountId ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {profiles.length > 0 ? (
        <label className="field">
          <span>Game profile</span>
          <select
            value={auth?.profileUuid ?? ''}
            disabled={busy || !auth?.signedIn}
            onChange={(e) => void onSelectProfile(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.uuid} value={p.uuid}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {onManage ? (
        <div className="row" style={{ marginTop: 4 }}>
          <button className="btn btn-primary" type="button" onClick={onManage}>
            Manage accounts
          </button>
        </div>
      ) : null}
    </div>
  )
}
