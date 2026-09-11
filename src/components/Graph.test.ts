import { describe, it, expect } from 'vitest'
import { computeArcPositions, buildStylesheet, filterVisibleElements } from './Graph'
import { STAKE_FILTERS, ANY_STAKE } from './GraphStakeFilter'
import type { GraphElement } from '../types'

const ruleFor = (selector: string) =>
  buildStylesheet('dark').find(r => (r as { selector: string }).selector === selector)
const px = (v: unknown) => parseFloat(String(v))

// Helpers to build a minimal center→subsidiary graph.
const node = (id: string, label: string): GraphElement =>
  ({ data: { id, label, nodeType: 'entity' } }) as GraphElement
const ownsEdge = (src: string, tgt: string, stake: number | null): GraphElement =>
  ({ data: { id: `${src}__${tgt}`, source: src, target: tgt, edgeType: 'owns', stakePct: stake } }) as GraphElement

// Bottom arc places index 0 at the largest x (t = 30°, cos > 0) and later
// indices leftward, so ordering nodes by x DESC recovers the placement order.
function namesByXDesc(pos: Map<string, { x: number; y: number }>, ids: string[]): string[] {
  return ids.slice().sort((a, b) => pos.get(b)!.x - pos.get(a)!.x)
}

describe('computeArcPositions ordering (matches the panel)', () => {
  it('orders subsidiaries by stake descending', () => {
    const els = [
      node('C', 'Center'),
      node('a', 'A'), node('b', 'B'), node('c', 'C-co'),
      ownsEdge('C', 'a', 10), ownsEdge('C', 'b', 55), ownsEdge('C', 'c', 30),
    ]
    const pos = computeArcPositions(els, 'C')
    // stake desc: b(55) → c(30) → a(10)
    expect(namesByXDesc(pos, ['a', 'b', 'c'])).toEqual(['b', 'c', 'a'])
  })

  it('falls back to alphabetical when stakes are absent', () => {
    const els = [
      node('C', 'Center'),
      node('z', 'Zeta'), node('a', 'Alpha'), node('m', 'Mu'),
      ownsEdge('C', 'z', null), ownsEdge('C', 'a', null), ownsEdge('C', 'm', null),
    ]
    const pos = computeArcPositions(els, 'C')
    // alphabetical: Alpha → Mu → Zeta
    expect(namesByXDesc(pos, ['z', 'a', 'm'])).toEqual(['a', 'm', 'z'])
  })

  it('puts known stakes before unknown ones', () => {
    const els = [
      node('C', 'Center'),
      node('n', 'NoStake'), node('s', 'Staked'),
      ownsEdge('C', 'n', null), ownsEdge('C', 's', 5),
    ]
    const pos = computeArcPositions(els, 'C')
    expect(namesByXDesc(pos, ['n', 's'])).toEqual(['s', 'n'])
  })
})

describe('buildStylesheet — centered node sizing', () => {
  it('renders the centered node the largest', () => {
    const center = ruleFor('node.center')?.style as Record<string, unknown>
    const base   = ruleFor('node')?.style as Record<string, unknown>
    expect(center).toBeTruthy()
    // Bigger than the base padding (14px) and than the importance-max (34px), so the
    // focused corporation anchors the graph.
    expect(px(center.padding)).toBeGreaterThan(px(base.padding))
    expect(px(center.padding)).toBeGreaterThan(34)
    expect(px(center['font-size'])).toBeGreaterThan(px(base['font-size']))
  })

  it('gives the hub an explicit doubled width and matching wrap width', () => {
    const center = ruleFor('node.center')?.style as Record<string, unknown>
    const base   = ruleFor('node')?.style as Record<string, unknown>
    // A fixed box (not label-sized) so a short company name is still a wide hub.
    expect(center.width).toBe(240)
    // The label may use the extra room instead of wrapping at the base width.
    expect(px(center['text-max-width'])).toBeGreaterThan(px(base['text-max-width']))
  })
})


describe('filterVisibleElements + re-layout — the filtered graph closes ranks', () => {
  const gte1 = STAKE_FILTERS.find(f => f.id === 'gte1')!
  const els = [
    node('c', 'Centre Corp'), node('big', 'Big Owner'), node('tiny', 'Tiny Owner'),
    node('mid', 'Mid Owner'),
    ownsEdge('big', 'c', 8.3), ownsEdge('tiny', 'c', 0.03), ownsEdge('mid', 'c', 5.8),
  ]

  it('drops below-band edges and the nodes they orphan', () => {
    const vis = filterVisibleElements(els, gte1, 'c')
    const ids = vis.map(e => e.data.id)
    expect(ids).toContain('big')
    expect(ids).toContain('mid')
    expect(ids).not.toContain('tiny')
    expect(ids).not.toContain('tiny__c')
  })

  it('keeps everything under "any"', () => {
    expect(filterVisibleElements(els, ANY_STAKE, 'c')).toHaveLength(els.length)
  })

  it('the surviving owners are re-placed adjacently, not marooned at the old slots', () => {
    // With 3 owners the arc spans wide; with the tiny one filtered, the two
    // survivors must sit at the 2-owner arc positions — the same x-spread a
    // 2-owner graph gets natively — not at their old 3-owner extremes.
    const filtered = filterVisibleElements(els, gte1, 'c')
    const two = computeArcPositions(filtered, 'c')
    const native = computeArcPositions([
      node('c', 'Centre Corp'), node('big', 'Big Owner'), node('mid', 'Mid Owner'),
      ownsEdge('big', 'c', 8.3), ownsEdge('mid', 'c', 5.8),
    ], 'c')
    expect(two.get('big')).toEqual(native.get('big'))
    expect(two.get('mid')).toEqual(native.get('mid'))
  })

  it('the centre survives even when every edge is filtered', () => {
    const strict = STAKE_FILTERS.find(f => f.id === 'gt75')!
    const vis = filterVisibleElements(els, strict, 'c')
    expect(vis.map(e => e.data.id)).toEqual(['c'])
  })
})
