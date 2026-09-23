import { useEffect, useRef, type RefObject } from 'react'
import { focusIdAt, focusRows, pickCenterRow, scrollingPanel } from '../utils/graphFocus'

export type GraphFocusMode = 'hover' | 'center'

/**
 * Reports which panel row is "in focus" so the graph can emphasise its node.
 *
 * - `hover` (desktop): the row under the mouse; leaving the rows clears it.
 * - `center` (phone): the row at the panel's vertical centre, re-read on every
 *   scroll frame — there is no hover on a touch screen, and the middle of the
 *   list is where the eye is while flicking through it.
 *
 * `onFocus` is called only when the id changes, and with `null` when the scope
 * goes away (another node selected, the timeline view opened, unmount) so the
 * graph never keeps a node enlarged that the panel no longer shows. `deps` are
 * whatever re-renders the rows (the profile, the active view) — the scope
 * element may not exist until they have loaded.
 */
export function useGraphFocus(
  scopeRef: RefObject<HTMLElement | null>,
  mode: GraphFocusMode,
  onFocus: ((id: string | null) => void) | undefined,
  deps: readonly unknown[],
): void {
  const lastRef = useRef<string | null>(null)
  const onFocusRef = useRef(onFocus)
  onFocusRef.current = onFocus

  useEffect(() => {
    const scope = scopeRef.current
    if (!scope || !onFocusRef.current) return

    const emit = (id: string | null) => {
      if (id === lastRef.current) return
      lastRef.current = id
      onFocusRef.current?.(id)
    }

    if (mode === 'hover') {
      const over = (e: Event) => emit(focusIdAt(e.target))
      const leave = () => emit(null)
      scope.addEventListener('mouseover', over)
      scope.addEventListener('mouseleave', leave)
      return () => {
        scope.removeEventListener('mouseover', over)
        scope.removeEventListener('mouseleave', leave)
        emit(null)
      }
    }

    // center: measure against the scrolling panel, or the window when the panel
    // is not a scroll container of its own.
    const panel = scrollingPanel(scope)
    let frame = 0
    const measure = () => {
      frame = 0
      const view = panel
        ? panel.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight }
      emit(pickCenterRow(focusRows(scope), view.top, view.bottom))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const target: HTMLElement | Window = panel ?? window
    target.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      target.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
      emit(null)
    }
  }, [mode, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
}
