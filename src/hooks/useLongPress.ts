import { useRef, useCallback } from 'react'

/**
 * Long-press *and* right-click, as one gesture: "open the menu for this thing".
 *
 * Pointer events rather than touch events, so a phone and a mouse take the same
 * path and there is no `useMobile` branch deciding which handlers to attach —
 * a device with both would otherwise get it wrong.
 *
 * A press that moves is a scroll, not a press. The panel these rows live in
 * scrolls vertically, so without the movement cancel every drag past a row
 * would pop a menu.
 */

export const LONG_PRESS_MS = 500
/** Movement beyond this (px, in either axis) is a scroll. Roughly a fingertip's
 *  worth of drift, matching the tolerance native long-press uses. */
export const LONG_PRESS_SLOP = 10

export interface LongPressHandlers {
  onContextMenu: (e: React.MouseEvent) => void
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
}

/** Whether a press that has moved this far should still count. Exported so the
 *  rule can be tested without simulating pointer timing in jsdom. */
export function withinSlop(dx: number, dy: number, slop = LONG_PRESS_SLOP): boolean {
  return Math.abs(dx) <= slop && Math.abs(dy) <= slop
}

export function useLongPress(open: (at: { x: number; y: number }) => void): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    start.current = null
  }, [])

  return {
    onContextMenu: (e) => {
      e.preventDefault()          // ours, not the browser's
      open({ x: e.clientX, y: e.clientY })
    },
    onPointerDown: (e) => {
      // Right-click already arrives as onContextMenu; a mouse press must not
      // also start a timer, or the menu opens twice on a slow click.
      if (e.pointerType === 'mouse') return
      start.current = { x: e.clientX, y: e.clientY }
      const at = { x: e.clientX, y: e.clientY }
      timer.current = setTimeout(() => { timer.current = null; open(at) }, LONG_PRESS_MS)
    },
    onPointerMove: (e) => {
      if (!start.current) return
      if (!withinSlop(e.clientX - start.current.x, e.clientY - start.current.y)) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  }
}
