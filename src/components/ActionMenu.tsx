import { useState, useEffect, useRef, type ReactNode } from 'react'

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

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
}

interface ActionMenuProps {
  items: MenuItem[]
  /** The button that opens it. Omit when opening at a point. */
  trigger?: ReactNode
  triggerLabel?: string
  /** Viewport coordinates. Present ⇒ the menu is open and free-positioned. */
  position?: { x: number; y: number } | null
  onClose?: () => void
  className?: string
}

export default function ActionMenu({
  items, trigger, triggerLabel, position, onClose, className = '',
}: ActionMenuProps) {
  const anchored = position === undefined
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  if (items.length === 0) return null

  const menu = showing && (
    <div className="action-menu__list" role="menu"
         // Free-positioned menus are fixed to the viewport: a row lives inside a
         // scrolling panel, and an absolutely-positioned menu would scroll away
         // from the pointer that opened it.
         style={anchored ? undefined : { position: 'fixed', top: position!.y, left: position!.x }}>
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
