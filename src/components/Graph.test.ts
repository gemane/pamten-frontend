import { describe, it, expect } from 'vitest'
import { MIN_LABEL_PX, applyTreeRoutes, computeArcPositions, buildStylesheet, canvasAspect, classifyElements, diffElements, filterVisibleElements, fitRegion, fitViewport, layoutGraph } from './Graph'
import { ARC_GAP_X, CROWD_GAP_X, CROWD_GAP_Y } from '../utils/arcPack'
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

  it('among owners without a percentage, the share count ranks before the name — as the panel does', () => {
    const shares = (src: string, n: number | null): GraphElement =>
      ({ data: { id: `${src}__C`, source: src, target: 'C', edgeType: 'owns', stakePct: null, shares: n } }) as GraphElement
    const els = [
      node('C', 'Center'),
      node('a', 'Alpha fund'), node('m', 'Mid fund'), node('z', 'Zeta fund'), node('p', 'Pct fund'),
      shares('a', null), shares('m', 2_000_000), shares('z', 9_000_000),
      ownsEdge('p', 'C', 0.01),
    ]
    const pos = computeArcPositions(els, 'C')
    // a percentage first, then by shares descending, a share-less one last
    expect(namesByXDesc(pos, ['a', 'm', 'z', 'p'])).toEqual(['p', 'z', 'm', 'a'])
  })

  it('ranks by the owns line; a voting line does not outrank it', () => {
    const votes = (src: string, pct: number): GraphElement =>
      ({ data: { id: `${src}__votes__C`, source: src, target: 'C', edgeType: 'votes', stakePct: pct } }) as GraphElement
    const els = [
      node('C', 'Center'), node('v', 'Voter'), node('h', 'Holder'),
      ownsEdge('v', 'C', 10), votes('v', 60), ownsEdge('h', 'C', 20),
    ]
    const pos = computeArcPositions(els, 'C')
    expect(namesByXDesc(pos, ['v', 'h'])).toEqual(['h', 'v'])    // 20 % before 10 % (not 60 % of the votes)
    // whichever line is listed first
    const swapped = [node('C', 'Center'), node('v', 'Voter'), node('h', 'Holder'), votes('v', 60), ownsEdge('v', 'C', 10), ownsEdge('h', 'C', 20)]
    expect(namesByXDesc(computeArcPositions(swapped, 'C'), ['v', 'h'])).toEqual(['h', 'v'])
    // a voting line alone still places the voter after the staked holders and ranks it by its percentage
    const only = [node('C', 'Center'), node('v', 'Voter'), node('h', 'Holder'), votes('v', 60), ownsEdge('h', 'C', 20)]
    expect(namesByXDesc(computeArcPositions(only, 'C'), ['v', 'h'])).toEqual(['v', 'h'])
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

describe('buildStylesheet — labels only while they are legible', () => {
  it('drops node and edge labels under MIN_LABEL_PX device pixels, never the hub\'s', () => {
    const node = ruleFor('node')?.style as Record<string, unknown>
    const edge = ruleFor('edge')?.style as Record<string, unknown>
    const hub  = ruleFor('node.center')?.style as Record<string, unknown>
    expect(node['min-zoomed-font-size']).toBe(MIN_LABEL_PX)
    expect(edge['min-zoomed-font-size']).toBe(MIN_LABEL_PX)
    expect(hub['min-zoomed-font-size']).toBe(0)
    // Cytoscape judges at texture levels (powers of two): 4 keeps a 12 px
    // name at scale ½ (6 px) and takes it out at scale ¼ (3 px); the same
    // step for the 10 px stake labels (5 px, 2.5 px).
    expect(px(node['font-size']) / 4).toBeLessThan(MIN_LABEL_PX)
    expect(px(node['font-size']) / 2).toBeGreaterThanOrEqual(MIN_LABEL_PX)
    expect(px(edge['font-size']) / 4).toBeLessThan(MIN_LABEL_PX)
    expect(px(edge['font-size']) / 2).toBeGreaterThanOrEqual(MIN_LABEL_PX)
  })
})

describe('computeArcPositions — the boxes as drawn, kept apart', () => {
  const owners = (n: number) => {
    const els: GraphElement[] = [node('c', 'Centre')]
    for (let i = 0; i < n; i++) {
      els.push({ data: { id: `o${i}`, label: `Owner ${i}`, nodeType: 'entity', importance: i * 7 } } as GraphElement)
      els.push(ownsEdge(`o${i}`, 'c', 50 - i))
    }
    return els
  }
  // apart by at least the crowd's gaps (the handful's are wider still)
  const clear = (pos: Map<string, { x: number; y: number }>, size: (id: string) => { w: number; h: number }, ids: string[]) =>
    ids.every((a, i) => ids.slice(0, i).every(b => {
      const pa = pos.get(a)!, pb = pos.get(b)!, sa = size(a), sb = size(b)
      return Math.abs(pa.x - pb.x) >= (sa.w + sb.w) / 2 + CROWD_GAP_X - 1e-6 || Math.abs(pa.y - pb.y) >= (sa.h + sb.h) / 2 + CROWD_GAP_Y - 1e-6
    }))

  it('spaces the owners by their MEASURED boxes — wide ones further apart', () => {
    const els = owners(6)
    const ids = els.filter(e => !('source' in e.data) && e.data.id !== 'c').map(e => e.data.id)
    const narrow = (id: string) => (id === 'c' ? { w: 240, h: 110 } : { w: 120, h: 50 })
    const wide   = (id: string) => (id === 'c' ? { w: 240, h: 110 } : { w: 320, h: 50 })
    const n = computeArcPositions(els, 'c', undefined, narrow)
    const w = computeArcPositions(els, 'c', undefined, wide)
    expect(clear(n, narrow, ids)).toBe(true)
    expect(clear(w, wide, ids)).toBe(true)
    const span = (pos: Map<string, { x: number; y: number }>) =>
      Math.max(...ids.map(id => pos.get(id)!.x)) - Math.min(...ids.map(id => pos.get(id)!.x))
    expect(span(w)).toBeGreaterThan(span(n) * 1.5)
  })

  it('without a measure, the stylesheet\'s sizes in numbers keep them apart too', () => {
    const els = owners(10)
    const ids = els.filter(e => !('source' in e.data) && e.data.id !== 'c').map(e => e.data.id)
    const pos = computeArcPositions(els, 'c')
    // the estimate errs wide; the real boxes are narrower still, so these
    // bounds are the loosest a box can be: label + base padding
    expect(clear(pos, () => ({ w: 100, h: 40 }), ids)).toBe(true)
    // and the order still follows the stake, right to left
    expect(namesByXDesc(pos, ids)).toEqual(ids)
  })

  it('a crowd goes into more than one row above the centre, packed close', () => {
    const els = owners(40)
    const ids = els.filter(e => !('source' in e.data) && e.data.id !== 'c').map(e => e.data.id)
    const measured = (id: string) => (id === 'c' ? { w: 240, h: 110 } : { w: 170, h: 50 })
    const pos = computeArcPositions(els, 'c', undefined, measured)
    const depths = new Set(ids.map(id => Math.round(-pos.get(id)!.y / 50)))
    expect(depths.size).toBeGreaterThan(2)
    for (const [id, p] of pos) if (id !== 'c') expect(p.y).toBeLessThan(0)
    // the crowd's gaps, not the handful's: some neighbours are closer than ARC_GAP_X apart in x
    const xs = ids.map(id => pos.get(id)!.x).sort((a, b) => a - b)
    const closest = Math.min(...xs.slice(1).map((x, i) => x - xs[i]))
    expect(closest).toBeLessThan(170 + ARC_GAP_X)
    expect(clear(pos, measured, ids)).toBe(true)
  })

  it('a crowd\'s arc is as deep as it is wide — a fan, not a flat band at the single row\'s height', () => {
    const els = owners(94)
    const ids = els.filter(e => !('source' in e.data) && e.data.id !== 'c').map(e => e.data.id)
    const pos = computeArcPositions(els, 'c', undefined, id => (id === 'c' ? { w: 240, h: 110 } : { w: 170, h: 50 }))
    const xs = ids.map(id => pos.get(id)!.x), ys = ids.map(id => pos.get(id)!.y)
    const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys)
    // at b = 300 the ends of a 4,000 px arc are 150 px below its apex (the
    // rows add 170): under a tenth of the width; deepened with it, over
    expect(height / width).toBeGreaterThan(0.1)
  })

  it('stacks an expanded node\'s owners side by side, each as wide as it is drawn', () => {
    const els: GraphElement[] = [
      node('c', 'Centre'), node('o', 'Owner'), ownsEdge('o', 'c', 60),
      node('g1', 'Grand one'), node('g2', 'Grand two'), node('g3', 'Grand three'),
      ownsEdge('g1', 'o', 30), ownsEdge('g2', 'o', 20), ownsEdge('g3', 'o', 10),
    ]
    const widths: Record<string, number> = { g1: 100, g2: 300, g3: 100 }
    const pos = computeArcPositions(els, 'c', undefined, id => ({ w: widths[id] ?? 160, h: 50 }))
    const o = pos.get('o')!, g1 = pos.get('g1')!, g2 = pos.get('g2')!, g3 = pos.get('g3')!
    expect(g1.y).toBe(o.y - 220); expect(g2.y).toBe(g1.y); expect(g3.y).toBe(g1.y)
    expect(g2.x - g1.x).toBe(200 + ARC_GAP_X)         // half of 100 + half of 300, and the gap
    expect(g3.x - g2.x).toBe(200 + ARC_GAP_X)         // left to right, as the stacks always ran
    expect(g2.x).toBeCloseTo(o.x, 6)                   // the row centred over the node
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

  it('packs the tree towards the canvas\'s shape it is given', () => {
    const many = [n('c'), ...Array.from({ length: 60 }, (_, i) => n(`s${i}`)),
                  ...Array.from({ length: 60 }, (_, i) => e('c', `s${i}`, 'out'))]
    const width = (aspect: number) => {
      const xs = [...layoutGraph(many, 'c', undefined, aspect).positions.values()].map(p => p.x)
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(width(1.2)).toBeLessThan(width(2.6))         // a phone's canvas: fewer columns
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

describe('fitting the graph into the canvas — the whole of a phone\'s, under its buttons', () => {
  const desktop = { w: 2180, h: 1438 }
  const phone = { w: 390, h: 354 }
  const zoomRange = { min: 0.02, max: 4 }

  it('keeps 80 px clear on a desktop canvas, what the canvas can spare on a phone', () => {
    expect(fitRegion(desktop)).toEqual({ x1: 80, y1: 80, w: 2020, h: 1278 })
    // a twelfth of the shorter side (30): the buttons (12 + 32) and a gap at the top
    expect(fitRegion(phone)).toEqual({ x1: 30, y1: 56, w: 330, h: 268 })
  })

  it('packs the tree towards the region\'s shape; the default without a canvas', () => {
    expect(canvasAspect(desktop)).toBeCloseTo(2020 / 1278, 3)
    expect(canvasAspect(phone)).toBeCloseTo(330 / 268, 3)
    expect(canvasAspect({ w: 0, h: 0 })).toBe(1.7)
  })

  it('on a phone the graph fills the region below the buttons', () => {
    const bb = { x1: -600, y1: -400, w: 918, h: 835 }        // Microsoft, Direct
    const view = fitViewport(phone, bb, zoomRange)!
    expect(view.zoom).toBeCloseTo(268 / 835, 4)              // the height limits
    // the graph's top edge in canvas pixels: right under the buttons' gap
    expect(bb.y1 * view.zoom + view.pan.y).toBeCloseTo(56, 4)
    // …and centred between the side paddings
    const left = bb.x1 * view.zoom + view.pan.x, right = left + bb.w * view.zoom
    expect(left - 30).toBeCloseTo(390 - 30 - right, 4)
  })

  it('on a desktop it is cy.fit with 80 px padding', () => {
    const bb = { x1: 0, y1: 0, w: 1010, h: 1278 }
    const view = fitViewport(desktop, bb, zoomRange)!
    expect(view.zoom).toBe(1)
    expect(view.pan).toEqual({ x: 80 + (2020 - 1010) / 2, y: 80 })
  })

  it('never zooms past the range, and gives up on nothing to fit', () => {
    expect(fitViewport(phone, { x1: 0, y1: 0, w: 100000, h: 10 }, zoomRange)!.zoom).toBe(0.02)
    expect(fitViewport(phone, { x1: 0, y1: 0, w: 10, h: 10 }, zoomRange)!.zoom).toBe(4)
    expect(fitViewport(phone, { x1: 0, y1: 0, w: 0, h: 0 }, zoomRange)).toBeNull()
    expect(fitViewport({ w: 40, h: 40 }, { x1: 0, y1: 0, w: 10, h: 10 }, zoomRange)).toBeNull()
  })
})
