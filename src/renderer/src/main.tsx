import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ManageWindow from './ManageWindow'
import RunWindow from './RunWindow'
import './styles.css'

function parseHash():
  | { kind: 'main' }
  | { kind: 'manage'; instanceId: string; tab?: string }
  | { kind: 'run'; instanceId: string } {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const parts = raw.split('/').filter(Boolean)
  const [mode, id, tab] = parts
  if (mode === 'manage' && id) {
    return {
      kind: 'manage',
      instanceId: decodeURIComponent(id),
      tab: tab ? decodeURIComponent(tab) : undefined
    }
  }
  if (mode === 'run' && id) return { kind: 'run', instanceId: decodeURIComponent(id) }
  return { kind: 'main' }
}

const route = parseHash()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {route.kind === 'manage' ? (
      <ManageWindow instanceId={route.instanceId} initialTab={route.tab} />
    ) : route.kind === 'run' ? (
      <RunWindow instanceId={route.instanceId} />
    ) : (
      <App />
    )}
  </StrictMode>
)
