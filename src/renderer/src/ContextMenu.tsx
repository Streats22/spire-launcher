import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  id: string
  label: string
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  onSelect?: () => void
}

interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

interface ContextMenuProps {
  menu: ContextMenuState | null
  onClose: () => void
}

export function useContextMenu(): {
  menu: ContextMenuState | null
  openMenu: (event: ReactMouseEvent, items: ContextMenuItem[]) => void
  closeMenu: () => void
} {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  const closeMenu = useCallback(() => setMenu(null), [])

  const openMenu = useCallback((event: ReactMouseEvent, items: ContextMenuItem[]) => {
    event.preventDefault()
    event.stopPropagation()
    const filtered = items.filter((item) => item.separator || item.label)
    if (filtered.length === 0) return
    setMenu({ x: event.clientX, y: event.clientY, items: filtered })
  }, [])

  return { menu, openMenu, closeMenu }
}

export default function ContextMenu({ menu, onClose }: ContextMenuProps): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const pad = 8
    setPos({
      x: Math.min(menu.x, window.innerWidth - rect.width - pad),
      y: Math.min(menu.y, window.innerHeight - rect.height - pad)
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: MouseEvent): void => {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const onScroll = (): void => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [menu, onClose])

  if (!menu) return null

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: pos.x || menu.x, top: pos.y || menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, index) => {
        if (item.separator) {
          return <div key={`sep-${index}`} className="context-menu-sep" role="separator" />
        }
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`context-menu-item${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              onClose()
              item.onSelect?.()
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>,
    document.body
  )
}
