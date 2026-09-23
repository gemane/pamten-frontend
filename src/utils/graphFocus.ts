/**
 * Which panel row the graph should emphasise.
 *
 * The node panel's owner and subsidiary rows carry the graph id of the node they
 * describe (`data-graph-focus`). On desktop the row under the mouse is the one in
 * focus; on a phone there is no hover, so it is the row the panel's centre line
 * runs through as the list scrolls. The graph grows that node a little — a way of
 * seeing which dot a line of text is about without clicking it.
 */

import { useEffect, type RefObject } from 'react'

export const FOCUS_ATTR = 'data-graph-focus'

export interface RowBox {
  id: string
  top: number
  bottom: number
}

/**
 * The row the centre line of a viewport `[viewTop, viewBottom]` passes through.
 *
 * The line usually falls in the few pixels between two rows, so the nearest row
 * counts too — but only within one row height of the line. Beyond that the
 * centre is over some other section (executives, a heading, the address), and
 * the effect should stop rather than hold on to an owner row near the top edge.
 * Rows outside the viewport never count.
 */
export function pickCenterRow(rows: RowBox[], viewTop: number, viewBottom: number): string | null {
  const mid = (viewTop + viewBottom) / 2
  let best: RowBox | null = null
  let bestDist = Infinity
  for (const r of rows) {
    if (r.bottom <= viewTop || r.top >= viewBottom) continue
    const dist = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0
    if (dist > r.bottom - r.top) continue
    if (dist < bestDist) {
      best = r
      bestDist = dist
    }
  }
  return best ? best.id : null
}

/** The focusable rows inside `scope`, measured in viewport coordinates. */
export function focusRows(scope: HTMLElement): RowBox[] {
  const out: RowBox[] = []
  scope.querySelectorAll<HTMLElement>(`[${FOCUS_ATTR}]`).forEach(el => {
    const id = el.getAttribute(FOCUS_ATTR)
    if (!id) return
    const r = el.getBoundingClientRect()
    out.push({ id, top: r.top, bottom: r.bottom })
  })
  return out
}

/** The graph id of the focusable row an event target sits in, if any. */
export function focusIdAt(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target.closest(`[${FOCUS_ATTR}]`) : null
  return el ? el.getAttribute(FOCUS_ATTR) : null
}

/** The panel that scrolls around `el` — the one the sticky tab bar pins to. */
export function scrollingPanel(el: HTMLElement): HTMLElement | null {
  const known = el.closest<HTMLElement>('.left-panel__detail, .mobile-panel, .mobile-full-panel')
  if (known) return known
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return null
}

/** Class on the row(s) of the graph node under the mouse. */
export const GRAPH_HOVER_CLASS = 'rel-item--graph-hover'

/**
 * Light up the owner/subsidiary row(s) of the graph node under the mouse.
 *
 * A class toggle on the marked rows rather than a prop threaded through every
 * list: the rows already carry their graph id, and the lists re-render for
 * reasons of their own. `deps` are whatever re-renders the rows, so a list that
 * loads after the hover still gets marked. A node can appear twice (an owner that
 * is also a subsidiary); both rows light up.
 */
export function useGraphHoverHighlight(
  scopeRef: RefObject<HTMLElement | null>,
  hoverId: string | null,
  deps: readonly unknown[],
): void {
  useEffect(() => {
    const scope = scopeRef.current
    if (!scope || !hoverId) return
    const lit: HTMLElement[] = []
    scope.querySelectorAll<HTMLElement>(`[${FOCUS_ATTR}]`).forEach(el => {
      if (el.getAttribute(FOCUS_ATTR) === hoverId) {
        el.classList.add(GRAPH_HOVER_CLASS)
        lit.push(el)
      }
    })
    return () => lit.forEach(el => el.classList.remove(GRAPH_HOVER_CLASS))
  }, [hoverId, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
}
