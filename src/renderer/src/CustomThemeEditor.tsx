import { useEffect, useState } from 'react'
import type { CustomThemeColors, CustomThemeColorKey } from '../../shared/customTheme'
import {
  CUSTOM_THEME_FIELDS,
  normalizeColorInput,
  normalizeCustomTheme
} from '../../shared/customTheme'

interface CustomThemeEditorProps {
  value: CustomThemeColors
  onChange: (next: CustomThemeColors) => void
}

function ColorField({
  label,
  hint,
  value,
  onCommit
}: {
  label: string
  hint: string
  value: string
  onCommit: (hex: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  function commit(raw: string): void {
    const normalized = normalizeColorInput(raw)
    if (!normalized) {
      setDraft(value)
      return
    }
    setDraft(normalized)
    if (normalized !== value) onCommit(normalized)
  }

  return (
    <label className="custom-theme-field">
      <span className="custom-theme-field-label">
        <strong>{label}</strong>
        <span className="muted">{hint}</span>
      </span>
      <span className="custom-theme-field-controls">
        <input
          className="custom-theme-swatch"
          type="color"
          value={value}
          aria-label={`${label} color picker`}
          onChange={(e) => {
            const next = normalizeColorInput(e.target.value)
            if (!next) return
            setDraft(next)
            onCommit(next)
          }}
        />
        <input
          className="custom-theme-hex"
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={draft}
          placeholder="#RRGGBB or rgb(r, g, b)"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(draft)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </span>
    </label>
  )
}

export default function CustomThemeEditor({
  value,
  onChange
}: CustomThemeEditorProps): React.JSX.Element {
  const colors = normalizeCustomTheme(value)

  function patchColor(key: CustomThemeColorKey, hex: string): void {
    onChange({ ...colors, [key]: hex })
  }

  return (
    <div className="custom-theme-editor">
      <div className="custom-theme-scheme">
        <span className="muted">Base scheme</span>
        <div className="row">
          <button
            type="button"
            className={`btn${colors.scheme === 'dark' ? ' btn-primary' : ''}`}
            onClick={() => onChange({ ...colors, scheme: 'dark' })}
          >
            Dark
          </button>
          <button
            type="button"
            className={`btn${colors.scheme === 'light' ? ' btn-primary' : ''}`}
            onClick={() => onChange({ ...colors, scheme: 'light' })}
          >
            Light
          </button>
        </div>
      </div>

      {CUSTOM_THEME_FIELDS.map((field) => (
        <ColorField
          key={field.key}
          label={field.label}
          hint={field.hint}
          value={colors[field.key]}
          onCommit={(hex) => patchColor(field.key, hex)}
        />
      ))}

      <p className="muted settings-footnote">
        Enter HEX (<code>#5fad7f</code>) or RGB (<code>rgb(95, 173, 127)</code>). Changes save
        locally with your Spire settings.
      </p>
    </div>
  )
}
