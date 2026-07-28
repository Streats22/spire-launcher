interface SettingToggleProps {
  title: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}

/** Labeled switch used on Settings (and anywhere else that needs the same control). */
export default function SettingToggle({
  title,
  description,
  checked,
  onChange
}: SettingToggleProps): React.JSX.Element {
  return (
    <label className="setting-toggle">
      <div className="setting-toggle-copy">
        <strong>{title}</strong>
        <span className="muted">{description}</span>
      </div>
      <input
        type="checkbox"
        className="setting-switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
