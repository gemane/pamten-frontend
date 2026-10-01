import { describe, it, expect } from 'vitest'
import { applyTreeRoutes, computeArcPositions, buildStylesheet, classifyElements, diffElements, filterVisibleElements, layoutGraph } from './Graph'
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

describe('computeArcPositions with the tree already placed', () => {
  const n = (id: string) => ({ data: { id, label: id, nodeType: 'entity', raw: {} } }) as unknown as GraphElement
  const e = (s: string, t: string, type = 'owns') =>
    ({ data: { id: `${s}__${type}__${t}`, source: s, target: t, label: '', edgeType: type, edgeDir: 'out', stakePct: null } }) as unknown as GraphElement
  const placed = new Map([['c', { x: 0, y: 0 }], ['a', { x: -500, y: 300 }], ['b', { x: 500, y: 300 }]])

  it('takes placed nodes as they are and gives them no slot on the lower arc', () => {
    const els = [n('c'), n('a'), n('b'), n('voted'), e('c', 'a'), e('c', 'b'), e('c', 'voted', 'votes')]
    const pos = computeArcPositions(els, 'c', placed)
    expect(pos.get('a')).toEqual({ x: -500, y: 300 })
    expect(pos.get('b')).toEqual({ x: 500, y: 300 })
    // what the tree leaves over has the arc to itself: alone, it sits straight below the centre
    const alone = computeArcPositions([n('c'), n('voted'), e('c', 'voted', 'votes')], 'c')
    expect(pos.get('voted')).toEqual(alone.get('voted'))
    expect(pos.get('voted')!.x).toBeCloseTo(0)
  })

  it('stacks what hangs on a placed node from where that node really is', () => {
    // b was expanded: another owner of b, and something b points at that the tree does not place
    const els = [n('c'), n('a'), n('b'), n('co'), n('seat'), e('c', 'a'), e('c', 'b'), e('co', 'b'), e('b', 'seat', 'role')]
    const pos = computeArcPositions(els, 'c', placed)
    expect(pos.get('co')!.x).toBe(500)
    expect(pos.get('co')!.y).toBeLessThan(300)
    expect(pos.get('seat')!.x).toBe(500)
    expect(pos.get('seat')!.y).toBeGreaterThan(300)
    // without the tree's positions the same graph is the plain arc layout, unchanged
    expect(computeArcPositions(els, 'c').get('b')).not.toEqual({ x: 500, y: 300 })
  })

  it('layoutGraph hands the tree to the arc: one result, the tree\'s places in it', () => {
    const els = [n('c'), n('owner'), n('a'), n('b'), e('owner', 'c'), e('c', 'a'), e('c', 'b')]
    const { positions, tree } = layoutGraph(els, 'c')
    for (const [id, p] of tree.positions) expect(positions.get(id)).toEqual(p)
    expect(positions.get('owner')).toEqual(computeArcPositions(els, 'c').get('owner'))
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

describe('applyTreeRoutes — a centred person who owns and runs a company', () => {
  it('draws the role over the holding as one line with one label, placed above the company', async () => {
    const n = (id: string, nodeType = 'entity') => ({ data: { id, label: id, nodeType, raw: {} } }) as unknown as GraphElement
    const els = [n('p', 'person'), n('tesla'), n('solar'),
      { data: { id: 'p__role__tesla', source: 'p', target: 'tesla', label: 'CEO', edgeType: 'role', edgeDir: 'out', stakePct: null } },
      { data: { id: 'p__role__solar', source: 'p', target: 'solar', label: 'Chairman', edgeType: 'role', edgeDir: 'out', stakePct: null } },
      { data: { id: 'p__owns__tesla', source: 'p', target: 'tesla', label: '18.4%', edgeType: 'owns', edgeDir: 'out', stakePct: 18.4 } },
    ] as unknown as GraphElement[]
    const cytoscape = (await import('cytoscape')).default
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: els as never, style: buildStylesheet('light') as never })
    const { positions, tree } = layoutGraph(els, 'p')
    for (const [id, p] of positions) cy.$id(id).position(p)
    applyTreeRoutes(cy, tree)
    const role = cy.$id('p__role__tesla'), holding = cy.$id('p__owns__tesla'), alone = cy.$id('p__role__solar')
    expect(role.hasClass('dual')).toBe(true)
    expect(role.style('curve-style')).toBe('segments')
    expect(role.style('target-label')).toBe('')                 // its text is on the holding's label
    expect(holding.style('target-label')).toBe('CEO · 18.4%')
    expect(alone.hasClass('dual')).toBe(false)
    expect(alone.style('target-label')).toBe('Chairman')
    expect(alone.style('curve-style')).toBe('segments')

    // the stake filter hides the holding: the role places Tesla alone and takes its label back
    applyTreeRoutes(cy, layoutGraph(els.filter(el => el.data.id !== 'p__owns__tesla'), 'p').tree)
    expect(role.hasClass('dual')).toBe(false)
    expect(role.style('target-label')).toBe('CEO')
  })
})

describe('classifyElements — the as-of view', () => {
  const node = (id: string, raw: Record<string, unknown> = {}) =>
    ({ data: { id, label: id, nodeType: 'entity', raw } }) as unknown as GraphElement
  const owns = (source: string, target: string, tenure: Record<string, unknown> = {}) =>
    ({ data: { id: `${source}__owns__${target}`, source, target, label: '', edgeType: 'owns',
               edgeDir: 'out', stakePct: null, ...tenure } }) as unknown as GraphElement
  const ids = (els: GraphElement[]) => els.map(el => el.data.id)

  const els = [
    node('c'), node('stated'), node('bound'), node('ended'), node('undated'), node('young', { founded: 2021 }),
    owns('c', 'stated',  { since: '2015-06-01' }),
    owns('c', 'bound',   { since: '2023-06-30', sinceBasis: 'first_listed' }),
    owns('c', 'ended',   { since: '2010-01-01', until: '2018-03-31' }),
    owns('c', 'undated', { sourceDate: '2025-06-30' }),
    owns('c', 'young',   { since: '2021-05-01' }),
  ]

  it('in the present it is the stake filter alone — nothing dims, nothing new hides', () => {
    const { visible, unknownEdges, unknownNodes } = classifyElements(els, ANY_STAKE, 'c', null)
    expect(visible).toEqual(filterVisibleElements(els, ANY_STAKE, 'c'))
    expect(ids(visible)).toHaveLength(els.length)
    expect(unknownEdges.size).toBe(0)
    expect(unknownNodes.size).toBe(0)
  })

  it('as of 2019: later stated starts and ended holdings go, lower bounds and undated dim', () => {
    const { visible, unknownEdges, unknownNodes } = classifyElements(els, ANY_STAKE, 'c', '2019-12-31')
    const shown = ids(visible)
    expect(shown).toContain('stated')
    expect(shown).not.toContain('ended')                 // until 2018 <= 2019
    expect(shown).not.toContain('c__owns__ended')
    expect(shown).not.toContain('young')                 // founded 2021: did not exist, nor its edge
    expect(shown).not.toContain('c__owns__young')
    expect(unknownEdges).toEqual(new Set(['c__owns__bound', 'c__owns__undated']))
    expect(unknownNodes).toEqual(new Set(['bound', 'undated']))
  })

  it('a node with one documented edge stays solid even if another is unknown', () => {
    const two = [node('c'), node('x'),
                 owns('c', 'x', { since: '2010-01-01' }),
                 ({ data: { id: 'x__votes__c', source: 'x', target: 'c', label: '', edgeType: 'votes',
                            edgeDir: 'in', stakePct: null, votingPowerPct: 60 } }) as unknown as GraphElement]
    const { unknownEdges, unknownNodes } = classifyElements(two, ANY_STAKE, 'c', '2019-12-31')
    expect(unknownEdges).toEqual(new Set(['x__votes__c']))
    expect(unknownNodes.size).toBe(0)
  })

  it('the centre is never hidden, even founded after the day', () => {
    const { visible } = classifyElements([node('c', { founded: 2030 })], ANY_STAKE, 'c', '2019-12-31')
    expect(ids(visible)).toEqual(['c'])
  })

  it('the stylesheet dims what is unknown', () => {
    const sheet = buildStylesheet('dark') as { selector: string; style: Record<string, unknown> }[]
    const edge = sheet.find(s => s.selector === 'edge.unknown')!
    const nd = sheet.find(s => s.selector === 'node.unknown')!
    expect(edge.style['line-style']).toBe('dashed')
    expect(Number(edge.style.opacity)).toBeLessThan(1)
    expect(Number(nd.style.opacity)).toBeLessThan(1)
  })
})
