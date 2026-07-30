import { useEffect, useState } from 'react'
import type { SpireInstance } from '../../shared/types'
import {
  INSTANCE_ICON_PRESETS,
  normalizeInstanceIconId
} from '../../shared/instanceIcons'
import InstanceIcon from './InstanceIcon'

interface InstanceIconPickerProps {
  instance: SpireInstance
  customSrc: string | null
  disabled?: boolean
  onChanged: (next: SpireInstance, customSrc?: string | null) => void
  onToast: (message: string) => void
}

export default function InstanceIconPicker({
  instance,
  customSrc,
  disabled = false,
  onChanged,
  onToast
}: InstanceIconPickerProps): React.JSX.Element {
  const selectedId = normalizeInstanceIconId(instance.iconId)
  const hasCustom = Boolean(instance.iconFile && customSrc)

  async function onPickPreset(iconId: string): Promise<void> {
    if (disabled) return
    try {
      let next = instance
      if (instance.iconFile) {
        next = await window.spire.clearInstanceCustomIcon(instance.id)
      }
      if (normalizeInstanceIconId(next.iconId) !== iconId) {
        next = await window.spire.updateInstance(instance.id, { iconId })
      }
      onChanged(next, null)
      onToast('Icon updated')
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function onPickCustom(): Promise<void> {
    if (disabled) return
    try {
      const next = await window.spire.pickInstanceIcon(instance.id)
      if (!next) return
      const src = await window.spire.getInstanceIconDataUrl(instance.id)
      onChanged(next, src)
      onToast('Custom icon set')
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function onClearCustom(): Promise<void> {
    if (disabled || !instance.iconFile) return
    try {
      const next = await window.spire.clearInstanceCustomIcon(instance.id)
      onChanged(next, null)
      onToast('Using preset icon')
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="instance-icon-picker">
      <div className="instance-icon-picker-preview">
        <InstanceIcon instance={instance} customSrc={customSrc} className="instance-icon-picker-preview-img" />
        <div>
          <strong>{hasCustom ? 'Custom image' : INSTANCE_ICON_PRESETS.find((p) => p.id === selectedId)?.label ?? 'Spire'}</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Pick a preset or use your own image (PNG, JPG, WebP, GIF).
          </p>
        </div>
      </div>

      <div className="instance-icon-grid" role="listbox" aria-label="Instance icon presets">
        {INSTANCE_ICON_PRESETS.map((preset) => {
          const active = !hasCustom && selectedId === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={active}
              className={`instance-icon-option${active ? ' is-active' : ''}`}
              disabled={disabled}
              title={preset.label}
              onClick={() => void onPickPreset(preset.id)}
            >
              <InstanceIcon iconId={preset.id} className="instance-icon-option-img" />
              <span>{preset.label}</span>
            </button>
          )
        })}
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" type="button" disabled={disabled} onClick={() => void onPickCustom()}>
          Choose image…
        </button>
        {hasCustom ? (
          <button className="btn" type="button" disabled={disabled} onClick={() => void onClearCustom()}>
            Remove custom
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Loads custom icon data URLs for instances that have iconFile. */
export function useInstanceCustomIcons(
  instances: SpireInstance[]
): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    const needed = instances.filter((i) => i.iconFile)
    if (needed.length === 0) {
      setMap({})
      return
    }

    void (async () => {
      const next: Record<string, string> = {}
      await Promise.all(
        needed.map(async (inst) => {
          try {
            const src = await window.spire.getInstanceIconDataUrl(inst.id)
            if (src) next[inst.id] = src
          } catch {
            // Skip broken icons
          }
        })
      )
      if (!cancelled) setMap(next)
    })()

    return () => {
      cancelled = true
    }
  }, [
    instances
      .map((i) => `${i.id}:${i.iconFile ?? ''}:${i.updatedAt}`)
      .sort()
      .join('|')
  ])

  return map
}
