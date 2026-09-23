import { describe, it, expect } from 'vitest'
import cytoscape from 'cytoscape'
import { applyNodeFocus, buildStylesheet, FOCUS_SCALE } from './Graph'

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
