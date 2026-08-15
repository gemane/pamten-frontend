/**
 * The menu behind the ⋮ and the relationship context menu.
 *
 * Nearly all of it is dismissal, which is where a menu goes wrong: one that
 * cannot be closed by tapping away is worse than no menu, and this one replaces
 * controls that were reachable on a phone — so the touch path matters as much as
 * the mouse one.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActionMenu, { clampToViewport, type MenuItem } from './ActionMenu'

const items = (onSelect = vi.fn()): MenuItem[] => [
  { key: 'share', label: 'Share', onSelect },
  { key: 'report', label: 'Report', onSelect },
]

const anchored = (over: Partial<React.ComponentProps<typeof ActionMenu>> = {}) =>
  render(<ActionMenu items={items()} trigger={<span>⋮</span>} triggerLabel="Actions" {...over} />)

describe('anchored to a trigger', () => {
  it('starts closed', () => {
    anchored()
    expect(screen.queryByText('Share')).toBeNull()
  })

  it('opens on the trigger', async () => {
    anchored()
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(screen.getByText('Share')).toBeInTheDocument()
    expect(screen.getByText('Report')).toBeInTheDocument()
  })

  it('runs the item and closes', async () => {
    const onSelect = vi.fn()
    render(<ActionMenu items={items(onSelect)} trigger={<span>⋮</span>} triggerLabel="Actions" />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await userEvent.click(screen.getByText('Share'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Share')).toBeNull()
  })

  it('closes again on the trigger', async () => {
    anchored()
    const trigger = screen.getByRole('button', { name: 'Actions' })
    await userEvent.click(trigger)
    await userEvent.click(trigger)
    expect(screen.queryByText('Share')).toBeNull()
  })

  it('says whether it is open, for a screen reader', async () => {
    anchored()
    const trigger = screen.getByRole('button', { name: 'Actions' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('dismissal', () => {
  const open = async () => {
    anchored()
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(screen.getByText('Share')).toBeInTheDocument()
  }

  it('closes on a click elsewhere', async () => {
    await open()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Share')).toBeNull()
  })

  it('closes on a TAP elsewhere — the one a phone needs', async () => {
    // The reason `touchstart` is registered alongside `mousedown`: on touch there
    // is no mousedown until after the tap completes, and on some browsers not at
    // all. This is the assertion that keeps that listener honest.
    await open()
    fireEvent.touchStart(document.body, { touches: [{ target: document.body }] })
    expect(screen.queryByText('Share')).toBeNull()
  })

  it('closes on Escape', async () => {
    await open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Share')).toBeNull()
  })

  it('stays open when the click is inside it', async () => {
    await open()
    fireEvent.mouseDown(screen.getByText('Share'))
    expect(screen.getByText('Share')).toBeInTheDocument()
  })
})

/**
 * Where a menu opened at a point ends up.
 *
 * Two ways this went wrong on screen while every other test passed. The class
 * that styles the menu anchors it under a ⋮ with `right: 0`; a fixed box with
 * both `left` and `right` set stretches between them, so the relationship menu
 * ran from the pointer to the right edge of the window. And once it stops
 * stretching, a menu opened near that edge hangs off it instead.
 */
describe('staying inside the window', () => {
  const MENU = { width: 180, height: 90 }
  const VIEW = { width: 1024, height: 768 }

  it('opens at the pointer when there is room', () => {
    expect(clampToViewport({ x: 300, y: 200 }, MENU, VIEW)).toEqual({ left: 300, top: 200 })
  })

  it('pulls back from the right edge instead of hanging off it', () => {
    expect(clampToViewport({ x: 1000, y: 200 }, MENU, VIEW).left).toBe(1024 - 180 - 8)
  })

  it('pulls up from the bottom edge', () => {
    expect(clampToViewport({ x: 300, y: 760 }, MENU, VIEW).top).toBe(768 - 90 - 8)
  })

  it('never goes off the top or left, whatever it is handed', () => {
    expect(clampToViewport({ x: -50, y: -50 }, MENU, VIEW)).toEqual({ left: 8, top: 8 })
  })

  it('sits at the margin when the menu is wider than the window', () => {
    expect(clampToViewport({ x: 10, y: 10 }, { width: 2000, height: 90 }, VIEW).left).toBe(8)
  })

  it('respects a different margin', () => {
    expect(clampToViewport({ x: 1000, y: 200 }, MENU, VIEW, 20).left).toBe(1024 - 180 - 20)
  })
})

describe('positioned at a point', () => {
  const at = (position: { x: number; y: number } | null) =>
    render(<ActionMenu items={items()} position={position} onClose={vi.fn()} />)

  it('renders nothing until it has a position', () => {
    at(null)
    expect(screen.queryByText('Share')).toBeNull()
  })

  it('opens where the pointer was', () => {
    at({ x: 120, y: 340 })
    const list = screen.getByRole('menu')
    // Fixed, not absolute: the row it belongs to sits in a scrolling panel, and
    // an absolutely-positioned menu would drift away from the pointer.
    expect(list).toHaveStyle({ position: 'fixed', top: '340px', left: '120px' })
  })

  it('tells the owner when it closes, since the position lives there', async () => {
    const onClose = vi.fn()
    render(<ActionMenu items={items()} position={{ x: 1, y: 2 }} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('has no trigger button of its own', () => {
    at({ x: 1, y: 2 })
    expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull()
  })

  it('releases the right edge the anchored menu is glued to', () => {
    // `.action-menu__list` sets `right: 0` for the ⋮ menu. Left in place, a fixed
    // box with both edges set stretches across everything between them.
    // The INLINE declaration, deliberately: jsdom loads no stylesheet, so the
    // computed value is 'auto' whether or not we set it, and toHaveStyle would
    // pass against the very bug this guards.
    at({ x: 120, y: 340 })
    expect((screen.getByRole('menu') as HTMLElement).style.right).toBe('auto')
  })

  it('is pulled back inside the window near the right edge', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 180, height: 90, top: 0, left: 0, right: 0,
                         bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    try {
      at({ x: window.innerWidth - 10, y: 100 })
      expect(screen.getByRole('menu'))
        .toHaveStyle({ left: `${window.innerWidth - 180 - 8}px` })
    } finally {
      rect.mockRestore()
    }
  })
})

describe('nothing to offer', () => {
  it('renders nothing at all rather than an empty menu', () => {
    const { container } = render(
      <ActionMenu items={[]} trigger={<span>⋮</span>} triggerLabel="Actions" />)
    expect(container).toBeEmptyDOMElement()
  })
})
