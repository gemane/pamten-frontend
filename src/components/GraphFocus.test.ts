import { describe, it, expect } from 'vitest'
import cytoscape from 'cytoscape'
import { applyNodeFocus, bindNodeHover, buildStylesheet, FOCUS_DARKEN, FOCUS_SCALE } from './Graph'

// A headless graph with the real stylesheet, so the base sizes the focus grows
// from are the ones the app draws: 14px padding, 12px font, and an importance-
// sized owner (padding mapped from `importance`).
function graph() {
  return cytoscape({
    headless: true,
    styleEnabled: true,
    style: buildStylesheet('dark'),
    elements: [
      { data: { id: 'hub', label: 'Hub Co', nodeType: 'entity' }, classes: 'center' },
      { data: { id: 'sub', label: 'Sub Co', nodeType: 'entity' } },
      { data: { id: 'own', label: 'Owner Co', nodeType: 'entity', importance: 30 } },
      { data: { id: 'p1', label: 'A Person', nodeType: 'person' } },
    ],
  })
}

const size = (cy: cytoscape.Core, id: string) => ({
  padding: cy.getElementById(id).numericStyle('padding'),
  font: cy.getElementById(id).numericStyle('font-size'),
  wrap: cy.getElementById(id).numericStyle('text-max-width'),
})

describe('applyNodeFocus (reduced motion: instant)', () => {
  it('grows the focused node by FOCUS_SCALE: padding, font and wrap width together', () => {
    const cy = graph()
    const before = size(cy, 'sub')
    applyNodeFocus(cy, null, 'sub', false)
    const after = size(cy, 'sub')
    expect(after.padding).toBeCloseTo(before.padding * FOCUS_SCALE)
    expect(after.font).toBeCloseTo(before.font * FOCUS_SCALE)
    // the wrap width scales with the font, so the name keeps its line breaks
    // and the whole label grows instead of re-wrapping onto more lines
    expect(before.wrap).toBe(120)
    expect(after.wrap).toBeCloseTo(before.wrap * FOCUS_SCALE)
    expect(cy.getElementById('sub').numericStyle('z-index')).toBe(10)
  })

  it('draws the focused node a shade darker, and only that one', () => {
    const cy = graph()
    const dark = (id: string) => cy.getElementById(id).numericStyle('background-blacken')
    expect(dark('sub')).toBe(0)
    applyNodeFocus(cy, null, 'sub', false)
    expect(dark('sub')).toBe(FOCUS_DARKEN)
    expect(FOCUS_DARKEN).toBeGreaterThan(0.15)           // visible…
    expect(FOCUS_DARKEN).toBeLessThan(0.4)               // …but "slightly": the label must stay readable
    expect(dark('own')).toBe(0)
    // focus moves on: the one left behind has its own colour back at once
    applyNodeFocus(cy, 'sub', 'own', false)
    expect(dark('sub')).toBe(0)
    expect(dark('own')).toBe(FOCUS_DARKEN)
    applyNodeFocus(cy, 'own', null, false)
    expect(dark('own')).toBe(0)
  })

  it('the node being released is not dark while it shrinks (animated)', () => {
    const cy = graph()
    applyNodeFocus(cy, null, 'sub', true)
    expect(cy.getElementById('sub').numericStyle('background-blacken')).toBe(FOCUS_DARKEN)
    applyNodeFocus(cy, 'sub', null, true)
    expect(cy.getElementById('sub').numericStyle('background-blacken')).toBe(0)
  })

  it('grows an importance-sized owner from ITS size, not the default', () => {
    const cy = graph()
    const before = size(cy, 'own')
    expect(before.padding).toBeGreaterThan(14)      // the importance mapping applies
    applyNodeFocus(cy, null, 'own', false)
    expect(size(cy, 'own').padding).toBeCloseTo(before.padding * FOCUS_SCALE)
  })

  it('moving focus restores the previous node to exactly its stylesheet size', () => {
    const cy = graph()
    const sub0 = size(cy, 'sub')
    applyNodeFocus(cy, null, 'sub', false)
    applyNodeFocus(cy, 'sub', 'p1', false)
    expect(size(cy, 'sub')).toEqual(sub0)
    // inline styles and the remembered base are gone: the stylesheet is in charge again
    expect(cy.getElementById('sub').scratch('_focusBase')).toBeUndefined()
    expect(size(cy, 'p1').padding).toBeGreaterThan(sub0.padding)
  })

  it('clearing focus restores the node', () => {
    const cy = graph()
    const own0 = size(cy, 'own')
    applyNodeFocus(cy, null, 'own', false)
    applyNodeFocus(cy, 'own', null, false)
    expect(size(cy, 'own')).toEqual(own0)
  })

  it('re-focusing the same node does not compound the growth', () => {
    const cy = graph()
    const sub0 = size(cy, 'sub')
    applyNodeFocus(cy, null, 'sub', false)
    applyNodeFocus(cy, 'sub', 'sub', false)
    expect(size(cy, 'sub').padding).toBeCloseTo(sub0.padding * FOCUS_SCALE)
  })

  it('leaves the hub alone and ignores ids that are not in the graph', () => {
    const cy = graph()
    const hub0 = size(cy, 'hub')
    applyNodeFocus(cy, null, 'hub', false)
    expect(size(cy, 'hub')).toEqual(hub0)
    expect(() => applyNodeFocus(cy, 'gone', 'missing', false)).not.toThrow()
  })
})

describe('bindNodeHover', () => {
  it('reports the node under the mouse, and null when it leaves', () => {
    const cy = graph()
    const seen: (string | null)[] = []
    bindNodeHover(cy, id => seen.push(id))
    cy.getElementById('sub').emit('mouseover')
    cy.getElementById('sub').emit('mouseout')
    cy.getElementById('p1').emit('mouseover')
    expect(seen).toEqual(['sub', null, 'p1'])
  })

  it('ignores edges and the background', () => {
    const cy = graph()
    cy.add({ data: { id: 'e1', source: 'own', target: 'hub' } })
    const seen: (string | null)[] = []
    bindNodeHover(cy, id => seen.push(id))
    cy.getElementById('e1').emit('mouseover')
    cy.emit('mouseover')
    expect(seen).toEqual([])
  })
})
