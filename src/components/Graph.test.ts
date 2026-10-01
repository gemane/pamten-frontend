import { describe, it, expect } from 'vitest'
import { applyTreeRoutes, computeArcPositions, buildStylesheet, diffElements, filterVisibleElements, layoutGraph } from './Graph'
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

  it('a role edge keeps its company on screen under the strictest band', () => {
    // The Jassy shape: a 0.02% holding (hidden at ≥1%) AND a role at the same
    // company. Before role edges existed, Amazon was dropped as an orphan and
    // the person stood alone although the panel listed four roles.
    const strict = STAKE_FILTERS.find(f => f.id === 'gt75')!
    const jassy: GraphElement[] = [
      { data: { id: 'p', label: 'Andy Jassy', nodeType: 'person' } } as GraphElement,
      node('amzn', 'Amazon'),
      ownsEdge('p', 'amzn', 0.0209),
      { data: { id: 'p__role__amzn', source: 'p', target: 'amzn', label: 'CEO · Chairman',
                edgeType: 'role', stakePct: null } } as GraphElement,
    ]
    const vis = filterVisibleElements(jassy, strict, 'p').map(e => e.data.id)
    expect(vis).toContain('amzn')
    expect(vis).toContain('p__role__amzn')
    expect(vis).not.toContain('p__amzn')            // the tiny stake is still hidden
  })

  it('a role edge sorts like an undisclosed stake in the arc, never crashing on null', () => {
    const els2: GraphElement[] = [
      { data: { id: 'p', label: 'P', nodeType: 'person' } } as GraphElement,
      node('a', 'Alpha'), node('z', 'Zeta'),
      { data: { id: 'p__role__z', source: 'p', target: 'z', label: 'CEO', edgeType: 'role', stakePct: null } } as GraphElement,
      ownsEdge('p', 'a', 12),
    ]
    const pos = computeArcPositions(els2, 'p')
    expect(pos.get('z')).toBeTruthy()
    expect(namesByXDesc(pos, ['a', 'z'])).toEqual(['a', 'z'])   // staked first, role-only after
  })
})

describe('layoutGraph — owners on their arc, the subsidiaries as a tree', () => {
  const n = (id: string) => ({ data: { id, label: id, nodeType: 'entity', raw: {} } }) as unknown as GraphElement
  const e = (s: string, t: string, dir: 'in' | 'out') =>
    ({ data: { id: `${s}__owns__${t}`, source: s, target: t, label: '', edgeType: 'owns', edgeDir: dir, stakePct: null } }) as unknown as GraphElement
  const els = [n('c'), n('owner'), n('a'), n('b'), n('a1'), n('a2'),
               e('owner', 'c', 'in'), e('c', 'a', 'out'), e('c', 'b', 'out'), e('a', 'a1', 'out'), e('a', 'a2', 'out')]

  it('the subsidiaries form a tree below the centre, the owners keep their arc above', () => {
    const arc = computeArcPositions(els, 'c')
    const { positions: pos, tree } = layoutGraph(els, 'c')
    expect(tree.routes.size).toBe(4)                    // one placing line per subsidiary
    expect(pos.get('owner')).toEqual(arc.get('owner'))
    expect(pos.get('c')).toEqual({ x: 0, y: 0 })
    expect(pos.get('a1')!.y).toBeGreaterThan(pos.get('a')!.y)
    expect(pos.get('a')!.y).toBe(pos.get('b')!.y)
    expect(pos.get('a1')!.x).not.toBe(pos.get('a2')!.x)
  })
})

describe('diffElements — the canvas follows the list both ways', () => {
  const n = (id: string) => ({ data: { id, label: id, nodeType: 'entity', raw: {} } }) as unknown as GraphElement

  it('adds what is new and removes what is gone', () => {
    const d = diffElements(new Set(['c', 'a', 'deep', 'a__owns__deep']), [n('c'), n('a'), n('b')], false)
    expect(d.isReset).toBe(false)
    expect(d.toAdd.map(e => e.data.id)).toEqual(['b'])
    expect(d.toRemove.sort()).toEqual(['a__owns__deep', 'deep'])
  })

  it('a shrinking list with nothing new still removes — "all levels" switched off', () => {
    const d = diffElements(new Set(['c', 'a', 'deep']), [n('c'), n('a')], false)
    expect(d.toAdd).toEqual([])
    expect(d.toRemove).toEqual(['deep'])
  })

  it('an unchanged list changes nothing', () => {
    const d = diffElements(new Set(['c', 'a']), [n('c'), n('a')], false)
    expect(d.toAdd).toEqual([])
    expect(d.toRemove).toEqual([])
  })

  it('a new centre, or nothing in common, is a full reset', () => {
    expect(diffElements(new Set(['c', 'a']), [n('c'), n('a')], true).isReset).toBe(true)
    expect(diffElements(new Set(['x']), [n('c')], false).isReset).toBe(true)
  })
})

describe('applyTreeRoutes — right-angled tree lines, implied lines hidden', () => {
  const n = (id: string) => ({ data: { id, label: id, nodeType: 'entity', raw: {} } }) as unknown as GraphElement
  const e = (s: string, t: string) =>
    ({ data: { id: `${s}__owns__${t}`, source: s, target: t, label: '', edgeType: 'owns', edgeDir: 'out', stakePct: null } }) as unknown as GraphElement
  const els = [n('ms'), n('act'), n('king'), n('linkedin'), e('ms', 'act'), e('ms', 'king'), e('ms', 'linkedin'), e('act', 'king')]

  it('routes the placing lines, marks the implied one, and follows the elements when they change', async () => {
    const cytoscape = (await import('cytoscape')).default
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: els as never, style: buildStylesheet('light') as never })
    const { positions, tree } = layoutGraph(els, 'ms')
    for (const [id, p] of positions) cy.$id(id).position(p)
    applyTreeRoutes(cy, tree)
    expect(cy.$id('ms__owns__act').style('curve-style')).toBe('segments')
    expect(cy.$id('ms__owns__act').scratch('_route')).toMatchObject({ kind: 'top' })
    expect(cy.$id('ms__owns__king').hasClass('implied')).toBe(true)
    expect(cy.$id('ms__owns__king').style('display')).toBe('none')
    expect(cy.$id('act__owns__king').hasClass('implied')).toBe(false)
    expect(cy.edges('.coholder').length).toBe(0)

    // Activision's line to King gone (the filter hid it): Microsoft's own line places King again
    const fewer = els.filter(el => el.data.id !== 'act__owns__king')
    applyTreeRoutes(cy, layoutGraph(fewer, 'ms').tree)
    expect(cy.$id('ms__owns__king').hasClass('implied')).toBe(false)
    expect(cy.$id('ms__owns__king').style('display')).toBe('element')
    expect(cy.$id('ms__owns__king').scratch('_route')).not.toBeNull()
    // …and a line the new tree does not route goes back to the stylesheet's
    expect(cy.$id('act__owns__king').scratch('_route')).toBeNull()
    expect(cy.$id('act__owns__king').style('curve-style')).toBe('bezier')
  })
})
