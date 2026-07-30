import type { CSSProperties } from 'react'
import type { SpireInstance } from '../../shared/types'
import {
  DEFAULT_INSTANCE_ICON_ID,
  normalizeInstanceIconId,
  type InstanceIconPresetId
} from '../../shared/instanceIcons'
import spireLogo from './assets/spire-logo.png'

interface InstanceIconProps {
  instance?: Pick<SpireInstance, 'iconId' | 'iconFile'> | null
  /** Preset id when not binding a full instance (picker preview). */
  iconId?: string | null
  /** Custom image data URL when iconFile is set. */
  customSrc?: string | null
  className?: string
  style?: CSSProperties
  alt?: string
  draggable?: boolean
}

function PresetGlyph({ id }: { id: InstanceIconPresetId }): React.JSX.Element {
  const common = {
    viewBox: '0 0 48 48',
    width: '100%',
    height: '100%',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true as const
  }

  switch (id) {
    case 'spire':
      return <img src={spireLogo} alt="" draggable={false} />
    case 'sword':
      return (
        <svg {...common}>
          <path
            d="M14 34 L30 10 L34 14 L18 38 Z"
            fill="currentColor"
            opacity="0.92"
          />
          <path d="M12 36 L16 40 L10 42 Z" fill="currentColor" opacity="0.7" />
          <path d="M22 22 L26 26" stroke="currentColor" strokeWidth="2.5" opacity="0.45" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...common}>
          <path
            d="M24 6 L38 12 V24 C38 34 30 40 24 42 C18 40 10 34 10 24 V12 Z"
            fill="currentColor"
            opacity="0.88"
          />
          <path
            d="M24 14 V34 M18 22 H30"
            stroke="var(--bg, #0f1218)"
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity="0.55"
          />
        </svg>
      )
    case 'pickaxe':
      return (
        <svg {...common}>
          <path
            d="M10 18 C16 8 32 8 38 18 L32 20 C28 14 20 14 16 20 Z"
            fill="currentColor"
            opacity="0.9"
          />
          <path
            d="M22 20 L16 40"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            opacity="0.85"
          />
        </svg>
      )
    case 'gem':
      return (
        <svg {...common}>
          <path
            d="M24 8 L36 18 L24 40 L12 18 Z"
            fill="currentColor"
            opacity="0.9"
          />
          <path
            d="M12 18 H36 M24 8 L20 18 M24 8 L28 18"
            stroke="var(--bg, #0f1218)"
            strokeWidth="1.6"
            opacity="0.4"
          />
        </svg>
      )
    case 'flame':
      return (
        <svg {...common}>
          <path
            d="M24 6 C28 14 34 16 34 26 C34 34 30 40 24 42 C18 40 14 34 14 26 C14 20 18 16 20 12 C22 16 22 18 24 6 Z"
            fill="currentColor"
            opacity="0.9"
          />
          <path
            d="M24 22 C26 26 28 28 28 32 C28 36 26 38 24 39 C22 38 20 36 20 32 C20 28 22 26 24 22 Z"
            fill="var(--bg, #0f1218)"
            opacity="0.35"
          />
        </svg>
      )
    case 'leaf':
      return (
        <svg {...common}>
          <path
            d="M12 36 C12 18 24 8 38 10 C36 28 26 38 12 36 Z"
            fill="currentColor"
            opacity="0.9"
          />
          <path
            d="M16 32 C22 26 28 20 34 14"
            stroke="var(--bg, #0f1218)"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.4"
          />
        </svg>
      )
    case 'moon':
      return (
        <svg {...common}>
          <path
            d="M28 8 C18 10 12 20 14 30 C16 38 24 42 32 40 C24 40 18 34 18 26 C18 16 24 10 28 8 Z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
      )
    case 'star':
      return (
        <svg {...common}>
          <path
            d="M24 6 L28 18 H40 L30 26 L34 38 L24 30 L14 38 L18 26 L8 18 H20 Z"
            fill="currentColor"
            opacity="0.92"
          />
        </svg>
      )
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="3" opacity="0.9" />
          <path d="M24 12 L28 24 L24 36 L20 24 Z" fill="currentColor" opacity="0.88" />
          <circle cx="24" cy="24" r="2.5" fill="var(--bg, #0f1218)" opacity="0.5" />
        </svg>
      )
    case 'portal':
      return (
        <svg {...common}>
          <ellipse
            cx="24"
            cy="24"
            rx="12"
            ry="18"
            stroke="currentColor"
            strokeWidth="3"
            opacity="0.9"
          />
          <ellipse
            cx="24"
            cy="24"
            rx="5"
            ry="12"
            fill="currentColor"
            opacity="0.35"
          />
        </svg>
      )
    case 'tower':
      return (
        <svg {...common}>
          <path
            d="M18 40 V18 L24 10 L30 18 V40 Z"
            fill="currentColor"
            opacity="0.9"
          />
          <path d="M14 40 H34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <rect x="21" y="22" width="6" height="6" fill="var(--bg, #0f1218)" opacity="0.4" />
        </svg>
      )
    default:
      return <img src={spireLogo} alt="" draggable={false} />
  }
}

export default function InstanceIcon({
  instance,
  iconId,
  customSrc,
  className = 'instance-icon',
  style,
  alt = '',
  draggable = false
}: InstanceIconProps): React.JSX.Element {
  const file = instance?.iconFile
  if (file && customSrc) {
    return (
      <img
        className={className}
        style={style}
        src={customSrc}
        alt={alt}
        draggable={draggable}
      />
    )
  }

  const preset = normalizeInstanceIconId(iconId ?? instance?.iconId ?? DEFAULT_INSTANCE_ICON_ID)
  if (preset === 'spire') {
    return (
      <img
        className={className}
        style={style}
        src={spireLogo}
        alt={alt}
        draggable={draggable}
      />
    )
  }

  return (
    <span className={`${className} instance-icon-preset`} style={style} aria-hidden={alt ? undefined : true}>
      <PresetGlyph id={preset} />
    </span>
  )
}
