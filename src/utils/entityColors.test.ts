import { describe, it, expect } from 'vitest'
import { ENTITY_COLORS, NEUTRAL, colorFor, typeLabelKey } from './entityColors'
import en from '../i18n/locales/en.json'

describe('the palette', () => {
  it('covers exactly the types the legend names', () => {
    // The legend and the palette are two views of one idea; if someone adds a
    // node type to one and not the other, the graph and its key disagree.
    const legendTypes = Object.keys(en.legend).filter(k => k in ENTITY_COLORS)
    expect(new Set(Object.keys(ENTITY_COLORS))).toEqual(new Set(legendTypes))
  })

  it('gives every type a fill and a darker border', () => {
    for (const [type, c] of Object.entries(ENTITY_COLORS)) {
      expect(c.fill, type).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(c.border, type).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(c.border, type).not.toBe(c.fill)
    }
  })
})

describe('colorFor', () => {
  it('resolves each entity subtype', () => {
    expect(colorFor('entity', 'fund').fill).toBe('#B7950B')
    expect(colorFor('entity', 'holding').fill).toBe('#8E44AD')
    expect(colorFor('entity', 'government').fill).toBe('#B03A2E')
  })

  it('treats a person as a person whatever the subtype says', () => {
    // Mirrors the cytoscape rule order: the person selector comes last and wins.
    expect(colorFor('person').fill).toBe('#27AE60')
    expect(colorFor('person', 'holding').fill).toBe('#27AE60')
  })

  it('falls back to the company style for a plain entity', () => {
    expect(colorFor('entity').fill).toBe('#4A90D9')
    expect(colorFor('entity', null).fill).toBe('#4A90D9')
  })

  it('gives an entity with an unknown subtype the base entity colour', () => {
    // Matches what the graph does: an unrecognised subtype matches none of the
    // subtype selectors, so cytoscape leaves the base `node[nodeType="entity"]`
    // style in place. The marker must agree with the node it describes.
    expect(colorFor('entity', 'spaceship').fill).toBe('#4A90D9')
  })

  it('is neutral only when there is no type at all', () => {
    expect(colorFor(undefined, undefined)).toEqual(NEUTRAL)
    expect(colorFor(null, null)).toEqual(NEUTRAL)
  })
})

describe('typeLabelKey', () => {
  it('points at a legend key that exists', () => {
    const keys = [
      typeLabelKey('person'),
      typeLabelKey('entity', 'fund'),
      typeLabelKey('entity'),
      typeLabelKey('entity', 'spaceship'),
    ]
    for (const k of keys) {
      expect(en.legend).toHaveProperty(k.replace('legend.', ''))
    }
  })

  it('names the specific type when there is one', () => {
    expect(typeLabelKey('entity', 'foundation')).toBe('legend.foundation')
    expect(typeLabelKey('person', 'holding')).toBe('legend.person')
  })
})
