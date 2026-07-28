import { useEffect, useState } from 'react'
import type { InstanceChannel, SpireInstance } from '../../shared/types'

interface ProfilesViewProps {
  instances: SpireInstance[]
  activeId: string | null
  onSelect: (id: string) => Promise<void>
  onChanged: () => Promise<void>
  onToast: (message: string) => void
}

export default function ProfilesView({
  instances,
  activeId,
  onSelect,
  onChanged,
  onToast
}: ProfilesViewProps): React.JSX.Element {
  const active = instances.find((i) => i.id === activeId) ?? instances[0] ?? null
  const [name, setName] = useState(active?.name ?? '')
  const [notes, setNotes] = useState(active?.notes ?? '')
  const [channel, setChannel] = useState<InstanceChannel>(active?.channel ?? 'release')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(active?.name ?? '')
    setNotes(active?.notes ?? '')
    setChannel(active?.channel ?? 'release')
  }, [active?.id, active?.name, active?.notes, active?.channel])

  async function save(): Promise<void> {
    if (!active) return
    setBusy(true)
    try {
      await window.spire.updateInstance(active.id, { name, notes, channel })
      await onChanged()
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

  if (!active) {
    return (
      <div className="page">
        <h1 className="page-title">Edit instance</h1>
        <p className="page-sub">Select an instance first.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="page-title">Edit instance</h1>
      <p className="page-sub">{active.name}</p>

      <div className="panel">
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
          <button
            className="btn"
            disabled={busy}
            onClick={() => void window.spire.openInstanceFolder(active.id)}
          >
            Folder
          </button>
        </div>
      </div>
    </div>
  )
}
