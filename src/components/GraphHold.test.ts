import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import cytoscape from 'cytoscape'
import { bindHoldToMove, buildStylesheet, HOLD_TO_MOVE_MS } from './Graph'

// A headless graph; the gesture is replayed as the grab / drag / free events
// Cytoscape raises, each with the pointer's rendered position.
function graph() {
  const cy = cytoscape({
    headless: true, styleEnabled: true, style: buildStylesheet('dark'),
    elements: [{ data: { id: 'a', label: 'A', nodeType: 'entity' }, position: { x: 100, y: 100 } },
               { data: { id: 'b', label: 'B', nodeType: 'entity' }, position: { x: 300, y: 100 } }],
  })
  // headless: positions given on the elements are not applied, so set them
  cy.getElementById('a').position({ x: 100, y: 100 })
  cy.getElementById('b').position({ x: 300, y: 100 })
  bindHoldToMove(cy)
  return cy
}
const at = (x: number, y: number) => ({ x, y })
const grab = (cy: cytoscape.Core, id: string, p: { x: number; y: number }) =>
  cy.getElementById(id).emit({ type: 'grab', renderedPosition: p } as never)
// Cytoscape has moved the node to the pointer before it raises `drag`
const drag = (cy: cytoscape.Core, id: string, p: { x: number; y: number }) => {
  cy.getElementById(id).position(p)
  cy.getElementById(id).emit({ type: 'drag', renderedPosition: p } as never)
}
const free = (cy: cytoscape.Core, id: string) => cy.getElementById(id).emit('free')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('bindHoldToMove — a box moves only after a hold', () => {
  it('a quick drag leaves the box where it was and pans the picture by the pointer\'s path', () => {
    const cy = graph()
    const pan0 = { ...cy.pan() }
    grab(cy, 'a', at(100, 100))
    drag(cy, 'a', at(130, 110))
    drag(cy, 'a', at(150, 130))
    free(cy, 'a')
    expect(cy.getElementById('a').position()).toEqual({ x: 100, y: 100 })
    expect(cy.pan()).toEqual({ x: pan0.x + 50, y: pan0.y + 30 })
    expect(cy.getElementById('a').hasClass('movable')).toBe(false)
  })

  it('held for the hold time, the box shows a halo and then follows the drag; the picture stays', () => {
    const cy = graph()
    const pan0 = { ...cy.pan() }
    grab(cy, 'a', at(100, 100))
    vi.advanceTimersByTime(HOLD_TO_MOVE_MS)
    expect(cy.getElementById('a').hasClass('movable')).toBe(true)
    drag(cy, 'a', at(160, 140))
    expect(cy.getElementById('a').position()).toEqual({ x: 160, y: 140 })
    expect(cy.pan()).toEqual(pan0)
    free(cy, 'a')
    expect(cy.getElementById('a').hasClass('movable')).toBe(false)
  })

  it('a move before the hold is up makes the whole gesture a pan — holding still afterwards does not arm it', () => {
    const cy = graph()
    grab(cy, 'a', at(100, 100))
    vi.advanceTimersByTime(HOLD_TO_MOVE_MS / 2)
    drag(cy, 'a', at(120, 100))
    vi.advanceTimersByTime(HOLD_TO_MOVE_MS * 2)
    expect(cy.getElementById('a').hasClass('movable')).toBe(false)
    drag(cy, 'a', at(140, 100))
    expect(cy.getElementById('a').position()).toEqual({ x: 100, y: 100 })
    free(cy, 'a')
  })

  it('letting go before the hold is up arms nothing later', () => {
    const cy = graph()
    grab(cy, 'a', at(100, 100))
    free(cy, 'a')
    vi.advanceTimersByTime(HOLD_TO_MOVE_MS * 2)
    expect(cy.getElementById('a').hasClass('movable')).toBe(false)
  })

  it('a drag of another box does not borrow the held one\'s state', () => {
    const cy = graph()
    grab(cy, 'a', at(100, 100))
    vi.advanceTimersByTime(HOLD_TO_MOVE_MS)
    grab(cy, 'b', at(300, 100))                 // a new gesture: not armed
    drag(cy, 'b', at(320, 100))
    expect(cy.getElementById('b').position()).toEqual({ x: 300, y: 100 })
    free(cy, 'b')
  })
})
