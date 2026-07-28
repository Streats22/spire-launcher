import { useState } from 'react'
import type {
  HytaleAuthStatus,
  InstallStatus,
  LocalDataInfo,
  SpireDensity,
  SpireHomeLayout,
  SpireSettings,
  SpireTheme,
  UpdateCheckResult
} from '../../shared/types'
import { gameProfileLabel } from '../../shared/hytaleDisplay'
import {
  DENSITY_OPTIONS,
  HOME_LAYOUT_OPTIONS,
  THEME_OPTIONS,
  normalizeDensity,
  normalizeHomeLayout,
  normalizeTheme
} from './theme'
import SettingToggle from './ui/SettingToggle'
import SettingsCard from './ui/SettingsCard'

type SettingsSection = 'general' | 'game' | 'launch' | 'appearance' | 'mods' | 'data'

const SECTIONS: Array<{ id: SettingsSection; label: string; hint: string }> = [
  { id: 'general', label: 'General', hint: 'Updates & version' },
  { id: 'game', label: 'Game', hint: 'Install & accounts' },
  { id: 'launch', label: 'Launch', hint: 'Play behavior' },
  { id: 'appearance', label: 'Appearance', hint: 'Theme & layout' },
  { id: 'mods', label: 'Mods & keys', hint: 'Stores & gallery' },
  { id: 'data', label: 'Data', hint: 'Folders & privacy' }
]

interface SettingsViewProps {
  settings: SpireSettings
  status: InstallStatus | null
  dataInfo: LocalDataInfo | null
  hytaleAuth: HytaleAuthStatus | null
  appVersion: string
  update: UpdateCheckResult | null
  cfKey: string
  nexusKey: string
  onCfKeyChange: (value: string) => void
  onNexusKeyChange: (value: string) => void
  onSettings: (next: SpireSettings) => void
  onStatus: (next: InstallStatus) => void
  onHytaleAuth: (next: HytaleAuthStatus) => void
  onUpdate: (next: UpdateCheckResult | null) => void
  onToast: (message: string) => void
  onOpenInstall: () => void
  onThemeChange: (theme: SpireTheme) => Promise<void>
  onDensityChange: (density: SpireDensity) => Promise<void>
  onHomeLayoutChange: (layout: SpireHomeLayout) => Promise<void>
}

export default function SettingsView({
  settings,
  status,
  dataInfo,
  hytaleAuth,
  appVersion,
  update,
  cfKey,
  nexusKey,
  onCfKeyChange,
  onNexusKeyChange,
  onSettings,
  onStatus,
  onHytaleAuth,
  onUpdate,
  onToast,
  onOpenInstall,
  onThemeChange,
  onDensityChange,
  onHomeLayoutChange
}: SettingsViewProps): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection>('general')

  async function patch(partial: Partial<SpireSettings>): Promise<SpireSettings> {
    const next = await window.spire.updateSettings(partial)
    onSettings(next)
    return next
  }

  async function onPickInstall(): Promise<void> {
    const path = await window.spire.pickGameInstallPath()
    if (!path) return
    const next = await window.spire.setGameInstallPath(path)
    onSettings(next)
    onStatus(await window.spire.getInstallStatus())
    onToast('Install path updated')
  }

  async function onDetectInstall(): Promise<void> {
    const result = await window.spire.detectGameInstall()
    onSettings(result.settings)
    onStatus(await window.spire.getInstallStatus())
    if (!result.found.length) {
      onToast('No Hytale install found in the usual places.')
      return
    }
    if (result.applied) {
      onToast(`Detected ${result.found[0]?.label ?? 'install'}: ${result.path}`)
      return
    }
    onToast(`Already using detected install (${result.found.length} found).`)
  }

  async function onSaveCredentials(): Promise<void> {
    await patch({
      curseForgeApiKey: cfKey.trim() || null,
      nexusApiKey: nexusKey.trim() || null
    })
    onToast('API keys saved locally')
  }

  async function onClearCredentials(): Promise<void> {
    if (!confirm('Clear CurseForge/Nexus keys and Hytale session tokens?')) return
    const next = await window.spire.clearLocalCredentials()
    onSettings(next)
    onCfKeyChange('')
    onNexusKeyChange('')
    onHytaleAuth(await window.spire.getHytaleAuthStatus())
    onToast('Keys and Hytale session cleared')
  }

  const accountSummary = hytaleAuth?.signedIn
    ? `Active: ${gameProfileLabel(hytaleAuth, 'signed in')}${
        (hytaleAuth.accounts?.length ?? 0) > 1
          ? ` · ${hytaleAuth.accounts.length} saved`
          : ''
      }`
    : (hytaleAuth?.accounts?.length ?? 0) > 0
      ? `${hytaleAuth!.accounts.length} saved — pick one under Install`
      : 'Not signed in'

  return (
    <div className="page page-settings">
      <header className="settings-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Everything stays on this machine — no Spire account or cloud sync.
          </p>
        </div>
        <div className="settings-version muted">
          Spire <strong>v{appVersion || '…'}</strong>
          {update?.updateAvailable ? (
            <span className="settings-update-badge">Update available</span>
          ) : null}
        </div>
      </header>

      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`settings-nav-item${section === s.id ? ' active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <span className="settings-nav-label">{s.label}</span>
              <span className="settings-nav-hint">{s.hint}</span>
            </button>
          ))}
        </nav>

        <div className="settings-main">
          {section === 'general' ? (
            <section className="panel settings-panel">
              <h2>General</h2>
              <p className="settings-lead muted">
                App updates and basic Spire behavior. Checks use one public GET when enabled.
              </p>

              <SettingToggle
                title="Check for updates on launch"
                description="Look for a newer Spire release when the app starts."
                checked={settings.checkForUpdates}
                onChange={(enabled) => {
                  void patch({ checkForUpdates: enabled }).then(async () => {
                    onUpdate(await window.spire.checkForUpdate())
                  })
                }}
              />

              <SettingsCard
                title="Current version"
                actions={
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void window.spire.checkForUpdate().then(onUpdate)}
                  >
                    Check now
                  </button>
                }
              >
                <span className="muted">
                  {update?.updateAvailable
                    ? `v${appVersion} — newer build available`
                    : update?.error
                      ? `v${appVersion} — ${update.error}`
                      : `v${appVersion || '…'} — up to date (or check skipped)`}
                </span>
              </SettingsCard>

              {update?.updateAvailable && update.releaseUrl ? (
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void window.spire.openExternal(update.releaseUrl!)}
                  >
                    Open download page
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {section === 'game' ? (
            <section className="panel settings-panel">
              <h2>Game</h2>
              <p className="settings-lead muted">
                Official install path used as a fallback when Spire’s own client download isn’t set
                for an instance.
              </p>

              <SettingsCard
                title="Hytale install folder"
                stacked
                actions={
                  <div className="row">
                    <button className="btn" type="button" onClick={() => void onDetectInstall()}>
                      Detect
                    </button>
                    <button className="btn" type="button" onClick={() => void onPickInstall()}>
                      Browse…
                    </button>
                  </div>
                }
              >
                <code className="settings-path" title={settings.gameInstallPath ?? undefined}>
                  {settings.gameInstallPath ?? 'Not set'}
                </code>
                <span className={status?.valid ? 'ok-text' : 'warn-text'}>
                  {status?.issues?.length
                    ? status.issues.join(' ')
                    : status?.valid
                      ? 'Install looks valid'
                      : 'Not configured'}
                </span>
              </SettingsCard>

              <SettingsCard
                title="Hytale accounts"
                actions={
                  <div className="row">
                    <button className="btn btn-primary" type="button" onClick={onOpenInstall}>
                      Open Install
                    </button>
                    {(hytaleAuth?.accounts?.length ?? 0) > 0 ? (
                      <button
                        className="btn btn-danger"
                        type="button"
                        onClick={() => {
                          if (!confirm('Remove all saved Hytale accounts?')) return
                          void window.spire.signOutAllHytale().then((next) => {
                            onHytaleAuth(next)
                            onToast('All Hytale accounts removed')
                          })
                        }}
                      >
                        Remove all
                      </button>
                    ) : null}
                  </div>
                }
              >
                <span className="muted">{accountSummary}</span>
              </SettingsCard>
            </section>
          ) : null}

          {section === 'launch' ? (
            <section className="panel settings-panel">
              <h2>Launch</h2>
              <p className="settings-lead muted">
                What Spire does when you hit Play. Logs are always saved under the data folder.
              </p>

              <SettingToggle
                title="Open run log window"
                description="Pop out live game output when launching. You can still open logs from Manage → Logs."
                checked={settings.openRunWindowOnLaunch}
                onChange={(enabled) => void patch({ openRunWindowOnLaunch: enabled })}
              />

              <SettingToggle
                title="Minimize Spire on launch"
                description="Send the main window to the taskbar after the game process starts."
                checked={settings.minimizeOnLaunch}
                onChange={(enabled) => void patch({ minimizeOnLaunch: enabled })}
              />
            </section>
          ) : null}

          {section === 'appearance' ? (
            <section className="panel settings-panel">
              <h2>Appearance</h2>
              <p className="settings-lead muted">
                Applies to the main window, manage sidebar, and run log.
              </p>

              <div className="appearance-section">
                <h3>Color theme</h3>
                <span className="muted">Dark, light, and high-contrast palettes.</span>
                <div className="theme-grid">
                  {THEME_OPTIONS.map((opt) => {
                    const selected = normalizeTheme(settings.theme) === opt.id
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
                    const selected = normalizeDensity(settings.density) === opt.id
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
                    const selected = normalizeHomeLayout(settings.homeLayout) === opt.id
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
            </section>
          ) : null}

          {section === 'mods' ? (
            <section className="panel settings-panel">
              <h2>Mods & keys</h2>
              <p className="settings-lead muted">
                Optional store keys for faster installs. Browse still works without them for many
                sources.
              </p>

              <SettingToggle
                title="Show mod photos"
                description="Display image galleries on mod detail pages in Manage."
                checked={settings.showModPhotos}
                onChange={(enabled) => void patch({ showModPhotos: enabled })}
              />

              <label className="field">
                <span>CurseForge API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={cfKey}
                  onChange={(e) => onCfKeyChange(e.target.value)}
                  placeholder="Optional — overrides Spire’s embedded key if set"
                />
              </label>
              <label className="field">
                <span>Nexus Mods API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={nexusKey}
                  onChange={(e) => onNexusKeyChange(e.target.value)}
                  placeholder="Optional — Premium unlocks Download quickly"
                />
              </label>
              <p className="muted settings-footnote">
                Nexus free Slow downloads use the browser; Spire can auto-import from Downloads.
                Settings keys override env / embedded defaults.
              </p>
              <div className="row">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => void onSaveCredentials()}
                >
                  Save keys
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => void onClearCredentials()}
                >
                  Clear keys & sessions
                </button>
              </div>
            </section>
          ) : null}

          {section === 'data' ? (
            <section className="panel settings-panel">
              <h2>Data</h2>
              <p className="settings-lead muted">
                Instances, logs, and downloaded game packages live under your Spire data folder.
              </p>

              <SettingsCard
                title="Spire data"
                stacked
                actions={
                  <div className="row">
                    <button
                      className="btn"
                      type="button"
                      onClick={() => void window.spire.openSpireDataFolder()}
                    >
                      Open folder
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => void window.spire.openLogsFolder()}
                    >
                      Open logs
                    </button>
                  </div>
                }
              >
                <code className="settings-path" title={dataInfo?.spireRoot}>
                  {dataInfo?.spireRoot ?? '…'}
                </code>
              </SettingsCard>

              {dataInfo?.gameRoot ? (
                <SettingsCard title="Game packages" stacked>
                  <code className="settings-path">{dataInfo.gameRoot}</code>
                  <span className="muted">Wharf Client + JRE downloads managed by Spire.</span>
                </SettingsCard>
              ) : null}

              {dataInfo?.instancesRoot ? (
                <SettingsCard title="Instances" stacked>
                  <code className="settings-path">{dataInfo.instancesRoot}</code>
                  <span className="muted">
                    Per-profile userdata, mods, worlds. Errors:{' '}
                    <code>logs/spire-YYYY-MM-DD.log</code> · Play output: <code>logs/runs/</code>
                  </span>
                </SettingsCard>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
