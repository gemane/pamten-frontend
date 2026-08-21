import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * A small menu, in two shapes.
 *
 * **Anchored** — pass a `trigger` and it hangs under it. That is the ⋮ beside a
 * company or person name.
 *
 * **At a point** — pass `position` and it opens there, with no trigger of its
 * own. That is the context menu on a relationship row, which appears where the
 * pointer was.
 *
 * Dismissal follows `GraphLegend`: `mousedown` *and* `touchstart` on the
 * document, plus Escape. The touch listener is not optional — this replaces
 * controls that were reachable on a phone, and a menu that will not close by
 * tapping away is worse than no menu.
 */

/**
 * Where a free-positioned menu actually goes.
 *
 * The pointer is the preferred corner, but a menu opened near an edge would hang
 * off the screen — a right-click on a relationship row at the right of the panel
 * is the common case — so it is pulled back inside. A menu wider than the
 * viewport gives up and sits at the margin.
 */
export function clampToViewport(
  at: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
): { left: number; top: number } {
  return {
    left: Math.max(margin, Math.min(at.x, viewport.width - size.width - margin)),
    top: Math.max(margin, Math.min(at.y, viewport.height - size.height - margin)),
  }
}

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
}

interface ActionMenuProps {
  items: MenuItem[]
  /** Context shown above the items — not a menu item, so not focusable and not
   *  clickable. The relationship menu uses it to name where the fact came from
   *  before offering to open or dispute it. */
  header?: ReactNode
  /** The button that opens it. Omit when opening at a point. */
  trigger?: ReactNode
  triggerLabel?: string
  /** Viewport coordinates. Present ⇒ the menu is open and free-positioned. */
  position?: { x: number; y: number } | null
  onClose?: () => void
  className?: string
}

export default function ActionMenu({
  items, header, trigger, triggerLabel, position, onClose, className = '',
}: ActionMenuProps) {
  const anchored = position === undefined
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null)

  const showing = anchored ? open : position !== null
  const close = () => { setOpen(false); onClose?.() }

  useEffect(() => {
    if (!showing) return
    const outside = (e: MouseEvent | TouchEvent) => {
      const target = e instanceof TouchEvent ? e.touches[0]?.target : (e as MouseEvent).target
      if (ref.current && !ref.current.contains(target as Node)) close()
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('touchstart', outside)
      document.removeEventListener('keydown', escape)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing])

  // Measured after the menu exists but before it is painted, so it never appears
  // at the pointer and then jumps.
  const px = position?.x
  const py = position?.y
  useLayoutEffect(() => {
    if (anchored || px == null || py == null || !listRef.current) { setPlaced(null); return }
    const box = listRef.current.getBoundingClientRect()
    setPlaced(clampToViewport(
      { x: px, y: py },
      { width: box.width, height: box.height },
      { width: window.innerWidth, height: window.innerHeight },
    ))
  }, [anchored, px, py])

  if (items.length === 0 && !header) return null

  const menu = showing && (
    <div className="action-menu__list" role="menu" ref={listRef}
         // Free-positioned menus are fixed to the viewport: a row lives inside a
         // scrolling panel, and an absolutely-positioned menu would scroll away
         // from the pointer that opened it.
         //
         // `right: auto` is not decoration. The class anchors the menu under a ⋮
         // with `right: 0`; leaving that in place while setting `left` stretches
         // the box between the two, so the menu ran from the pointer all the way
         // to the right edge of the screen.
         style={anchored ? undefined : {
           position: 'fixed', right: 'auto',
           top: placed?.top ?? position!.y,
           left: placed?.left ?? position!.x,
         }}>
      {header && <div className="action-menu__header">{header}</div>}
      {items.map(item => (
        <button key={item.key} role="menuitem" onClick={() => { close(); item.onSelect() }}>
          {item.icon}{item.label}
        </button>
      ))}
    </div>
  )

  if (!anchored) {
    return showing ? <div className={`action-menu ${className}`} ref={ref}>{menu}</div> : null
  }

  return (
    <div className={`action-menu ${className}`} ref={ref}>
      <button className="action-menu__btn" aria-label={triggerLabel} title={triggerLabel}
              aria-haspopup="menu" aria-expanded={open}
              onClick={() => setOpen(v => !v)}>
        {trigger}
      </button>
      {menu}
    </div>
  )
}
