import { useCallback, useEffect, useRef, useState } from 'react'

interface UseResizableSplitOptions {
  storageKey: string
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
}

interface UseResizableSplitResult {
  width: number
  setWidth: (width: number) => void
  isDragging: boolean
  onResizeStart: (event: React.PointerEvent<HTMLElement>) => void
}

/**
 * Horizontal split: drag to set the right pane width; persists to localStorage.
 */
export function useResizableSplit({
  storageKey,
  defaultWidth,
  minWidth = 260,
  maxWidth = 720
}: UseResizableSplitOptions): UseResizableSplitResult {
  const clamp = useCallback(
    (n: number) => Math.min(maxWidth, Math.max(minWidth, n)),
    [minWidth, maxWidth]
  )

  const [width, setWidthState] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      const n = raw == null ? NaN : Number(raw)
      if (Number.isFinite(n)) return clamp(n)
    } catch {
      // ignore
    }
    return defaultWidth
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const setWidth = useCallback(
    (next: number) => {
      setWidthState(clamp(next))
    },
    [clamp]
  )

  const onResizeStart = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault()
      dragRef.current = { startX: event.clientX, startWidth: width }
      setIsDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [width]
  )

  useEffect(() => {
    if (!isDragging) return

    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      // Dragging the handle left → wider detail panel
      setWidthState(clamp(drag.startWidth + (drag.startX - event.clientX)))
    }

    const onUp = (): void => {
      dragRef.current = null
      setIsDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [isDragging, clamp])

  useEffect(() => {
    if (isDragging) return
    try {
      localStorage.setItem(storageKey, String(Math.round(width)))
    } catch {
      // ignore
    }
  }, [width, storageKey, isDragging])

  return { width, setWidth, isDragging, onResizeStart }
}
