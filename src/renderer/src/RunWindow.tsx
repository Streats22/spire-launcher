import { useEffect, useRef, useState } from 'react'
import type { RunLogEvent, SpireInstance } from '../../shared/types'
import { applyAppearance } from './theme'

interface RunWindowProps {
  instanceId: string
}

interface Line {
  at: string
  stream: RunLogEvent['stream']
  text: string
}

export default function RunWindow({ instanceId }: RunWindowProps): React.JSX.Element {
  const [instance, setInstance] = useState<SpireInstance | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const scroller = useRef<HTMLPreElement>(null)

  useEffect(() => {
    void window.spire.getSettings().then((s) =>
      applyAppearance({
        theme: s.theme,
        density: s.density,
        homeLayout: s.homeLayout
      })
    )
    return window.spire.onSettingsChanged((s) =>
      applyAppearance({
        theme: s.theme,
        density: s.density,
        homeLayout: s.homeLayout
      })
    )
  }, [])

  useEffect(() => {
    void window.spire.listInstances().then((list) => {
      const found = list.find((i) => i.id === instanceId) ?? null
      setInstance(found)
      document.title = found ? `Run — ${found.name}` : 'Run — Spire'
    })
  }, [instanceId])

  useEffect(() => {
    return window.spire.onRunLog((event) => {
      if (event.instanceId !== instanceId) return
      setLines((prev) => {
        const next = [...prev, { at: event.at, stream: event.stream, text: event.line }]
        return next.length > 4000 ? next.slice(-3000) : next
      })
    })
  }, [instanceId])

  useEffect(() => {
    if (!autoScroll || !scroller.current) return
    scroller.current.scrollTop = scroller.current.scrollHeight
  }, [lines, autoScroll])

  return (
    <div className="popup-shell run-shell">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Run log</p>
          <h1>{instance?.name ?? 'Instance'}</h1>
        </div>
        <div className="popup-actions">
          <label className="check-inline">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
          <button type="button" className="btn" onClick={() => setLines([])}>
            Clear
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void window.spire.openLogsFolder()}
          >
            Logs folder
          </button>
          <button type="button" className="btn" onClick={() => window.close()}>
            Close
          </button>
        </div>
      </header>
      <pre className="run-log" ref={scroller}>
        {lines.length === 0 ? (
          <span className="run-log-empty">Waiting for process output…</span>
        ) : (
          lines.map((line, i) => (
            <div key={`${line.at}-${i}`} className={`run-line run-${line.stream}`}>
              <span className="run-time">{line.at.slice(11, 19)}</span>
              <span className="run-stream">{line.stream}</span>
              <span className="run-text">{line.text}</span>
            </div>
          ))
        )}
      </pre>
    </div>
  )
}
