import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ManageWindow from './ManageWindow'
import RunWindow from './RunWindow'
import './styles.css'

function parseHash():
  | { kind: 'main' }
  | { kind: 'manage'; instanceId: string }
  | { kind: 'run'; instanceId: string } {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [mode, id] = raw.split('/')
  if (mode === 'manage' && id) return { kind: 'manage', instanceId: decodeURIComponent(id) }
  if (mode === 'run' && id) return { kind: 'run', instanceId: decodeURIComponent(id) }
  return { kind: 'main' }
}

const route = parseHash()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {route.kind === 'manage' ? (
      <ManageWindow instanceId={route.instanceId} />
    ) : route.kind === 'run' ? (
      <RunWindow instanceId={route.instanceId} />
    ) : (
      <App />
    )}
  </StrictMode>
)
