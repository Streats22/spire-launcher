import type { ReactNode } from 'react'

interface SettingsCardProps {
  title: string
  children?: ReactNode
  actions?: ReactNode
  stacked?: boolean
}

/** Path / status card used across Settings sections. */
export default function SettingsCard({
  title,
  children,
  actions,
  stacked = false
}: SettingsCardProps): React.JSX.Element {
  return (
    <div className={`settings-card${stacked ? ' settings-card-stack' : ''}`}>
      <div className="settings-card-copy">
        <strong>{title}</strong>
        {children}
      </div>
      {actions}
    </div>
  )
}
