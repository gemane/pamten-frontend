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
import ActionMenu, { type MenuItem } from './ActionMenu'

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
})

describe('nothing to offer', () => {
  it('renders nothing at all rather than an empty menu', () => {
    const { container } = render(
      <ActionMenu items={[]} trigger={<span>⋮</span>} triggerLabel="Actions" />)
    expect(container).toBeEmptyDOMElement()
  })
})
