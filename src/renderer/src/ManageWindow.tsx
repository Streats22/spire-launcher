import { useCallback, useEffect, useState } from 'react'
import type { HytaleAuthStatus, SpireInstance, SpireSettings } from '../../shared/types'
import ProfilesView from './ProfilesView'

interface ManageWindowProps {
  instanceId: string
}

export default function ManageWindow({ instanceId }: ManageWindowProps): React.JSX.Element {
  const [settings, setSettings] = useState<SpireSettings | null>(null)
  const [instances, setInstances] = useState<SpireInstance[]>([])
  const [auth, setAuth] = useState<HytaleAuthStatus | null>(null)
  const [toast, setToast] = useState<string | null>(null)

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

  useEffect(() => {
    void refresh()
    document.title = 'Manage instance — Spire'
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  async function onSelect(id: string): Promise<void> {
    const next = await window.spire.setActiveInstance(id)
    setSettings(next)
  }

  return (
    <div className="popup-shell">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Spire</p>
          <h1>Manage instance</h1>
        </div>
        <button type="button" className="btn" onClick={() => window.close()}>
          Close
        </button>
      </header>
      <main className="popup-body">
        <ProfilesView
          instances={instances}
          activeId={instanceId || settings?.activeInstanceId || null}
          onSelect={onSelect}
          onChanged={refresh}
          onToast={setToast}
          auth={auth}
          onOpenMods={() => {
            void window.spire.focusMainView('mods')
          }}
          onOpenInstall={() => {
            void window.spire.focusMainView('versions')
          }}
        />
      </main>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
