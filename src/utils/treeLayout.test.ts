import { describe, it, expect } from 'vitest'
import { computeTreeLayout, computeTreePositions, labelSize, routePoints, segmentStyle, treeParents,
  nodeSize, TREE_BUS_SPACE, TREE_GUTTER, TREE_TRUNK_INSET, type Point } from './treeLayout'
import type { GraphElement } from '../types'

const node = (id: string) => ({ data: { id, label: id, nodeType: 'entity', raw: {} } }) as unknown as GraphElement
const owns = (s: string, t: string) =>
  ({ data: { id: `${s}__owns__${t}`, source: s, target: t, label: '', edgeType: 'owns', edgeDir: 'out', stakePct: null } }) as unknown as GraphElement

const tree = (edges: [string, string][]) => {
  const ids = [...new Set(edges.flat())]
  return [...ids.map(node), ...edges.map(([s, t]) => owns(s, t))]
}
const leavesOf = (p: string, n: number) => Array.from({ length: n }, (_, i) => [p, `${p}-${i}`] as [string, string])

// The size of a test company: its id is its label, no stake → the bare label's box.
const W = (id: string, centre = false) => nodeSize({ label: id }, centre)
const LEAF = W('c-0')

/** Two companies' drawn boxes overlap (sizes as Cytoscape draws them). */
const overlaps = (pos: Map<string, Point>, els?: GraphElement[], center = 'c') => {
  const size = (id: string) => {
    const d = els?.find(e => e.data.id === id)?.data as { label?: string; importance?: number } | undefined
    return nodeSize(d ?? { label: id }, id === center)
  }
  const pts = [...pos].map(([id, p]) => ({ ...p, ...size(id) }))
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      if (Math.abs(pts[i].x - pts[j].x) < (pts[i].w + pts[j].w) / 2 && Math.abs(pts[i].y - pts[j].y) < (pts[i].h + pts[j].h) / 2) return true
  return false
}

/** Every routed line as straight pieces, and the proper crossings among them:
 *  a horizontal and a vertical of DIFFERENT parents, strictly inside each other. */
const crossings = (els: GraphElement[], center: string) => {
  const { positions, routes } = computeTreeLayout(els, center)
  const segs: { a: Point; b: Point; from: string }[] = []
  for (const [id, route] of routes) {
    const [s, t] = id.split('__owns__')
    const pts = [positions.get(s)!, ...routePoints(positions.get(s)!, positions.get(t)!, route), positions.get(t)!]
    for (let i = 0; i + 1 < pts.length; i++) segs.push({ a: pts[i], b: pts[i + 1], from: s })
  }
  const H = segs.filter(g => g.a.y === g.b.y), V = segs.filter(g => g.a.x === g.b.x && g.a.y !== g.b.y)
  const crossed = H.flatMap(h => V.filter(v => v.from !== h.from
    && v.a.x > Math.min(h.a.x, h.b.x) && v.a.x < Math.max(h.a.x, h.b.x)
    && h.a.y > Math.min(v.a.y, v.b.y) && h.a.y < Math.max(v.a.y, v.b.y)))
  // a line through a company that is not one of its ends (sizes looked up once:
  // per segment and company it made this helper cubic, and two tests took 3 s)
  const sizes = new Map(els.filter(e => !('source' in e.data))
    .map(e => [e.data.id, nodeSize(e.data as { label: string }, e.data.id === center)]))
  const through = segs.flatMap(g => [...positions].filter(([id, p]) => {
    const [x0, x1, y0, y1] = [Math.min(g.a.x, g.b.x), Math.max(g.a.x, g.b.x), Math.min(g.a.y, g.b.y), Math.max(g.a.y, g.b.y)]
    const { w, h } = sizes.get(id)!
    return positions.get(g.from) !== p && !(g.a === p || g.b === p)
      && p.x + w / 2 > x0 && p.x - w / 2 < x1 && p.y + h / 2 > y0 && p.y - h / 2 < y1 && id !== g.from
  }))
  const slanted = segs.filter(g => g.a.x !== g.b.x && g.a.y !== g.b.y)
  // two parents' trunks on top of each other: one line to the eye, two in fact
  const overlaid = V.flatMap((v, i) => V.slice(i + 1).filter(u => u.from !== v.from && u.a.x === v.a.x
    && Math.max(u.a.y, u.b.y) > Math.min(v.a.y, v.b.y) && Math.min(u.a.y, u.b.y) < Math.max(v.a.y, v.b.y)))
  return { crossed: crossed.length, through: through.length, slanted: slanted.length, overlaid: overlaid.length }
}
const extent = (pos: Map<string, Point>) => {
  const xs = [...pos.values()].map(p => p.x), ys = [...pos.values()].map(p => p.y)
  return { w: Math.max(...xs) - Math.min(...xs) + LEAF.w, h: Math.max(...ys) - Math.min(...ys) + LEAF.h }
}

describe('computeTreePositions', () => {
  it('puts the centre at the origin and every company below its parent', () => {
    const edges: [string, string][] = [['c', 'a'], ['c', 'b'], ['a', 'a1'], ['a', 'a2'], ['a1', 'deep']]
    const pos = computeTreePositions(tree(edges), 'c')
    expect(pos.get('c')).toEqual({ x: 0, y: 0 })
    for (const [p, k] of edges) expect(pos.get(k)!.y).toBeGreaterThan(pos.get(p)!.y)
    expect(overlaps(pos)).toBe(false)
  })

  it('keeps sibling branches apart', () => {
    const els = tree([['c', 'l'], ['c', 'r'], ...leavesOf('l', 3), ...leavesOf('r', 3)])
    const pos = computeTreePositions(els, 'c')
    const xs = (p: string) => [0, 1, 2].map(i => pos.get(`${p}-${i}`)!.x)
    expect(Math.max(...xs('l'))).toBeLessThan(Math.min(...xs('r')))
    expect(overlaps(pos)).toBe(false)
  })

  it('packs many leaves under one parent into columns of about the screen\'s shape', () => {
    const els = tree([['c', 'uspi'], ['c', 'other'], ...leavesOf('uspi', 772)])
    const pos = computeTreePositions(els, 'c')
    const { w, h } = extent(pos)
    expect(w / h).toBeGreaterThan(1)
    expect(w / h).toBeLessThan(3)
    expect(overlaps(pos)).toBe(false)
  })

  it('keeps a deep tree near the screen\'s shape instead of one wide strip', () => {
    // ten levels, a few leaves and two sub-branches at each: spread level by level this is a strip
    const edges: [string, string][] = []
    const grow = (id: string, depth: number) => {
      edges.push(...leavesOf(id, 4))
      if (depth < 9) for (const k of ['x', 'y']) { edges.push([id, `${id}${k}`]); grow(`${id}${k}`, depth + (k === 'x' ? 1 : 4)) }
    }
    grow('c', 0)
    const els = tree(edges)
    const { w, h } = extent(computeTreePositions(els, 'c'))
    expect(w / h).toBeGreaterThan(0.8)
    expect(w / h).toBeLessThan(3.5)
    expect(crossings(els, 'c')).toEqual({ crossed: 0, through: 0, slanted: 0, overlaid: 0 })
    expect(overlaps(computeTreePositions(els, 'c'))).toBe(false)
  })

  it('places a co-held company once', () => {
    const els = tree([['c', 'a'], ['c', 'b'], ['a', 'shared'], ['b', 'shared']])
    const pos = computeTreePositions(els, 'c')
    expect(pos.size).toBe(4)
    expect(pos.get('shared')!.y).toBeGreaterThan(pos.get('a')!.y)
  })

  it('survives a cycle and ignores owners above the centre', () => {
    const els = [...tree([['c', 'a'], ['a', 'c']]), node('owner'), owns('owner', 'c')]
    const pos = computeTreePositions(els, 'c')
    expect([...pos.keys()].sort()).toEqual(['a', 'c'])
  })

  it('returns nothing when the centre has no subsidiaries', () => {
    expect(computeTreePositions([node('c')], 'c').size).toBe(0)
    expect(computeTreePositions([], null).size).toBe(0)
  })
})

describe('treeParents — one parent, the deepest holder', () => {
  it('moves a company from the flat list to the holder further down', () => {
    // Microsoft's flat list names King and Candy beside Activision; Activision holds King, King holds Candy.
    const els = tree([['ms', 'act'], ['ms', 'king'], ['ms', 'candy'], ['ms', 'linkedin'], ['act', 'king'], ['king', 'candy']])
    expect(Object.fromEntries(treeParents(els, 'ms'))).toEqual({ act: 'ms', linkedin: 'ms', king: 'act', candy: 'king' })
    // …and Candy follows King down: three levels below, not two
    const pos = computeTreePositions(els, 'ms')
    expect(pos.get('candy')!.y).toBeGreaterThan(pos.get('king')!.y)
    expect(pos.get('king')!.y).toBeGreaterThan(pos.get('act')!.y)
    // a later, shallower offer for Candy does not win it back
    const more = [...els, node('side'), owns('ms', 'side'), owns('side', 'candy')]
    expect(treeParents(more, 'ms').get('candy')).toBe('king')
  })

  it('keeps the first holder at a tie and never lets a cross-holding cut a branch off', () => {
    const tie = tree([['c', 'a'], ['c', 'b'], ['a', 'shared'], ['b', 'shared']])
    expect(treeParents(tie, 'c').get('shared')).toBe('a')
    const cross = tree([['c', 'a'], ['c', 'b'], ['a', 'b'], ['b', 'a']])
    const parent = treeParents(cross, 'c')
    // exactly one of the two still hangs on the centre, so both are reachable
    expect([parent.get('a'), parent.get('b')].filter(x => x === 'c')).toHaveLength(1)
  })
})

describe('computeTreeLayout — lines that do not cross', () => {
  const flat = tree([['ms', 'act'], ['ms', 'king'], ['ms', 'linkedin'], ['act', 'king']])

  it('places a company under its deepest holder and drops the line that implies', () => {
    const { positions, routes, implied } = computeTreeLayout(flat, 'ms')
    expect(positions.get('king')!.y).toBeGreaterThan(positions.get('act')!.y)
    expect([...implied]).toEqual(['ms__owns__king'])
    expect([...routes.keys()].sort()).toEqual(['act__owns__king', 'ms__owns__act', 'ms__owns__linkedin'])
  })

  it('keeps a co-holder from another branch: neither a tree line nor implied', () => {
    const els = tree([['c', 'a'], ['c', 'b'], ['a', 'shared'], ['b', 'shared']])
    const { routes, implied } = computeTreeLayout(els, 'c')
    expect(routes.has('a__owns__shared')).toBe(true)
    expect(routes.has('b__owns__shared')).toBe(false)
    expect(implied.size).toBe(0)
    expect([...computeTreeLayout(els, 'c').coHolders]).toEqual(['b__owns__shared'])
  })

  it('the larger stake places a company even when a small holder sits deeper', () => {
    // Chubb: 99.9 % held by a holding company, 0.1 % by an affiliate three levels further down
    const els = tree([['c', 'big'], ['c', 'x'], ['x', 'y'], ['y', 'small'], ['big', 'co'], ['small', 'co']])
    const stake = (id: string, pct: number) => { (els.find(e => e.data.id === id)!.data as { stakePct: number }).stakePct = pct }
    stake('big__owns__co', 99.9)
    stake('small__owns__co', 0.1)
    const { routes, coHolders, implied } = computeTreeLayout(els, 'c')
    expect(treeParents(els, 'c').get('co')).toBe('big')
    expect(routes.has('big__owns__co')).toBe(true)
    expect([...coHolders]).toEqual(['small__owns__co'])
    expect(implied.size).toBe(0)
  })

  it('a line from further up the branch that states its own stake is a holding, not a repetition', () => {
    const els = tree([['c', 'a'], ['a', 'b'], ['c', 'b']])
    const stake = (id: string, pct: number) => { (els.find(e => e.data.id === id)!.data as { stakePct: number }).stakePct = pct }
    stake('a__owns__b', 90)
    stake('c__owns__b', 10)
    const { implied, coHolders } = computeTreeLayout(els, 'c')
    expect(implied.size).toBe(0)
    expect([...coHolders]).toEqual(['c__owns__b'])
  })

  it('at the same depth the larger stake places the company; the smaller is the co-holder', () => {
    const els = tree([['c', 'a'], ['c', 'b'], ['a', 'shared'], ['b', 'shared']])
    const stake = (id: string, pct: number) => { (els.find(e => e.data.id === id)!.data as { stakePct: number }).stakePct = pct }
    stake('a__owns__shared', 10.9)
    stake('b__owns__shared', 79.7)
    const { routes, coHolders } = computeTreeLayout(els, 'c')
    expect(treeParents(els, 'c').get('shared')).toBe('b')
    expect(routes.has('b__owns__shared')).toBe(true)
    expect([...coHolders]).toEqual(['a__owns__shared'])
  })

  it('routes one row of children from above and several rows down the gutter', () => {
    const few = computeTreeLayout(tree([['c', 'a'], ['c', 'b']]), 'c')
    expect([...few.routes.values()].map(r => r.kind)).toEqual(['top', 'top'])
    const many = computeTreeLayout(tree(leavesOf('c', 40)), 'c')
    const top = Math.min(...leavesOf('c', 40).map(([, l]) => many.positions.get(l)!.y))
    for (const [id, r] of many.routes) {
      // the first of each column from above, the ones under it from the gutter:
      // just inside the left edge of the company's cell
      const first = many.positions.get(id.split('__owns__')[1])!.y === top
      expect(r.kind).toBe(first ? 'top' : 'side')
      if (r.kind === 'side') expect(r.dx).toBeCloseTo(TREE_GUTTER + W(id.split('__owns__')[1]).w / 2 - TREE_TRUNK_INSET)
    }
    // the bus: half way between the parent's bottom edge and its children
    const [first] = many.routes.values()
    expect(first.drop).toBeCloseTo((top - LEAF.h / 2) - TREE_BUS_SPACE / 2)
    expect(first.drop).toBeCloseTo(W('c', true).h / 2 + TREE_BUS_SPACE / 2)
  })

  it('a branch entered from the side has its company at the left end, right beside the gutter', () => {
    // c's children are in columns of several rows; `wide` is a branch far wider than one cell
    // twelve wide branches: they stack several to a column
    const branches = Array.from({ length: 12 }, (_, i) => `b${i}`)
    const els = tree([...branches.map(b => ['c', b] as [string, string]), ...branches.flatMap(b => leavesOf(b, 40))])
    const { positions, routes } = computeTreeLayout(els, 'c')
    const side = branches.filter(b => routes.get(`c__owns__${b}`)!.kind === 'side')
    expect(side.length).toBeGreaterThan(0)
    for (const b of side) {
      const r = routes.get(`c__owns__${b}`)!
      // the stub from the gutter to the company is short, not half the branch's width
      expect(r.kind === 'side' && r.dx).toBeLessThanOrEqual(TREE_GUTTER + W(b).w)
      const lefts = leavesOf(b, 40).map(([, l]) => positions.get(l)!.x - W(l).w / 2)
      expect(positions.get(b)!.x - W(b).w / 2).toBeLessThanOrEqual(Math.min(...lefts) + 0.01)
    }
    expect(crossings(els, 'c')).toEqual({ crossed: 0, through: 0, slanted: 0, overlaid: 0 })
  })

  it('a branch at the left end keeps its own first child right under it, not centred far away', () => {
    // b* stack several to a column (entered from the side); each has one wide child w*
    const branches = Array.from({ length: 12 }, (_, i) => `b${i}`)
    const els = tree([...branches.map(b => ['c', b] as [string, string]),
      ...branches.flatMap((b, i) => [[b, `w${i}`] as [string, string], ...leavesOf(`w${i}`, 40)])])
    const { positions, routes } = computeTreeLayout(els, 'c')
    const side = branches.filter(b => routes.get(`c__owns__${b}`)!.kind === 'side')
    expect(side.length).toBeGreaterThan(0)
    for (const b of side) {
      const w = `w${b.slice(1)}`
      expect(Math.abs(positions.get(w)!.x - positions.get(b)!.x)).toBeLessThan(W(b).w)
    }
    expect(crossings(els, 'c')).toEqual({ crossed: 0, through: 0, slanted: 0, overlaid: 0 })
    expect(overlaps(positions, els)).toBe(false)
  })

  it('a parent sits over the middle of the children its bus reaches, not of its whole box', () => {
    // one small child and one very wide sub-branch: the box is wide, the two heads are close together
    const els = tree([['c', 'p'], ['c', 'q'], ['p', 'small'], ['p', 'wide'], ...leavesOf('wide', 200)])
    const pos = computeTreePositions(els, 'c')
    const heads = ['small', 'wide'].map(k => pos.get(k)!.x)
    expect(pos.get('p')!.x).toBeGreaterThanOrEqual(Math.min(...heads) - 1)
    expect(pos.get('p')!.x).toBeLessThanOrEqual(Math.max(...heads) + 1)
    expect(crossings(els, 'c')).toEqual({ crossed: 0, through: 0, slanted: 0, overlaid: 0 })
    expect(overlaps(pos, els)).toBe(false)
  })

  it('with measured sizes, the left edges of a column line up exactly', () => {
    const els = tree(leavesOf('c', 30))
    // every company a different real width, all narrower than the estimate
    const real = (id: string) => ({ w: 60 + (id.length * 37 + Number(id.split('-')[1] ?? 0) * 13) % 70, h: 50 })
    const { positions, routes } = computeTreeLayout(els, 'c', real)
    const lefts = new Map<number, number[]>()            // by trunk → left edges of the companies on it
    for (const [id, r] of routes) {
      const child = id.split('__owns__')[1], p = positions.get(child)!
      if (r.kind !== 'side') continue
      const trunk = Math.round(p.x - r.dx)
      lefts.set(trunk, [...(lefts.get(trunk) ?? []), p.x - real(child).w / 2])
    }
    expect(lefts.size).toBeGreaterThan(1)
    for (const [trunk, edges] of lefts) {
      expect(Math.max(...edges) - Math.min(...edges)).toBeLessThan(0.01)
      expect(edges[0] - trunk).toBeCloseTo(TREE_GUTTER - TREE_TRUNK_INSET, 0)   // the stub: the same for all
    }
    // an unmeasurable company (0 × 0: not rendered yet) falls back to the estimate
    expect(computeTreeLayout(els, 'c', () => ({ w: 0, h: 0 })).positions).toEqual(computeTreeLayout(els, 'c').positions)
  })

  it('places narrow children before a wide sub-branch, so they stay beside their parent', () => {
    const els = tree([['c', 'p'], ['c', 'other'], ['p', 'wide'], ...leavesOf('wide', 60), ['p', 'small'], ['small', 's1']])
    const pos = computeTreePositions(els, 'c')
    const lefts = leavesOf('wide', 60).map(([, l]) => pos.get(l)!.x)
    expect(pos.get('small')!.x).toBeLessThan(Math.min(...lefts))
    expect(crossings(els, 'c')).toEqual({ crossed: 0, through: 0, slanted: 0, overlaid: 0 })
  })

  it('gives every company the room it is drawn at: a long name, a 100 % holding', () => {
    const els = tree(leavesOf('c', 30))
    const d = els.find(e => e.data.id === 'c-0')!.data as { label: string; importance?: number }
    const plain = nodeSize(d)
    d.label = 'MICROSOFT POLAND OPERATIONS SPOLKA Z OGRANICZONA ODPOWIEDZIALNOSCIA'
    expect(nodeSize(d).h).toBeGreaterThan(plain.h + 40)          // five lines, not one
    expect(overlaps(computeTreePositions(els, 'c'), els)).toBe(false)
    // Cytoscape pads a company by the stake held in it: +20 px a side at 60 % and above
    expect(nodeSize({ label: 'x', importance: 100 }).h - nodeSize({ label: 'x' }).h).toBe(40)
    expect(nodeSize({ label: 'x', importance: 100 })).toEqual(nodeSize({ label: 'x', importance: 60 }))
    d.importance = 100
    expect(overlaps(computeTreePositions(els, 'c'), els)).toBe(false)
    expect(crossings(els, 'c')).toEqual({ crossed: 0, through: 0, slanted: 0, overlaid: 0 })
  })

  it('nodeSize matches what Cytoscape draws (measured: Chubb, 100 % holdings)', () => {
    // outerWidth × outerHeight read from the running graph
    for (const [label, w, h] of [['ACE Life Insurance Company', 184, 94], ['Chubb Reinsurance (Switzerland) Limited', 187, 106],
                                 ['Chubb Asset Management Inc.', 168, 94], ['Oasis Insurance Services Ltd.', 167, 94],
                                 ['AFIA Finance Corp. Chile Limitada', 185, 94]] as const) {
      const s = nodeSize({ label, importance: 100 })
      expect(s.w).toBeGreaterThanOrEqual(w - 2)       // never smaller than drawn…
      expect(s.w).toBeLessThan(w + 30)                // …nor wastefully larger
      expect(s.h).toBeGreaterThanOrEqual(h - 2)       // the same for the height: a line too many
      expect(s.h).toBeLessThan(h + 16)                // is allowed, a line too few is not
    }
    expect(nodeSize({ label: 'CHUBB LIMITED' }, true).w).toBe(320)   // the hub: 318 drawn
  })

  it('draws a planar tree: no routed line crosses another or runs through a company', () => {
    const els = tree([['c', 'a'], ['c', 'b'], ['a', 'a1'], ...leavesOf('c', 30), ...leavesOf('a', 25), ...leavesOf('a1', 3), ...leavesOf('b', 7)])
    expect(crossings(els, 'c')).toEqual({ crossed: 0, through: 0, slanted: 0, overlaid: 0 })
    expect(overlaps(computeTreePositions(els, 'c'))).toBe(false)
  })
})

describe('routePoints and segmentStyle', () => {
  const parent = { x: 0, y: 0 }
  it('goes straight down to a child directly below', () => {
    expect(routePoints(parent, { x: 0, y: 170 }, { kind: 'top', drop: 60 })).toEqual([])
  })
  it('bends on the bus for a child to the side', () => {
    expect(routePoints(parent, { x: 300, y: 170 }, { kind: 'top', drop: 60 }))
      .toEqual([{ x: 0, y: 60 }, { x: 300, y: 60 }])
  })
  it('comes down the gutter left of the child and in from the side', () => {
    expect(routePoints(parent, { x: 300, y: 400 }, { kind: 'side', drop: 60, dx: 79 }))
      .toEqual([{ x: 0, y: 60 }, { x: 221, y: 60 }, { x: 221, y: 400 }])
  })
  it("expresses a point in Cytoscape's terms (measured: w .5, d 100 on (0,0)→(300,400) is (70,260))", () => {
    const seg = segmentStyle({ x: 0, y: 0 }, { x: 300, y: 400 }, [{ x: 70, y: 260 }, { x: -40, y: 30 }])!
    expect(seg.weights[0]).toBeCloseTo(0.5)
    expect(seg.distances[0]).toBeCloseTo(100)
    expect(seg.weights[1]).toBeCloseTo(0)
    expect(seg.distances[1]).toBeCloseTo(50)
    expect(segmentStyle({ x: 1, y: 1 }, { x: 1, y: 1 }, [{ x: 0, y: 0 }])).toBeNull()
    expect(segmentStyle({ x: 0, y: 0 }, { x: 1, y: 1 }, [])).toBeNull()
  })
})

describe('a centred person: what they run sits in the tree with what they own', () => {
  const person = () => ({ data: { id: 'p', label: 'Elon Musk', nodeType: 'person', raw: {} } }) as unknown as GraphElement
  const holds = (t: string, pct: number) =>
    ({ data: { id: `p__owns__${t}`, source: 'p', target: t, label: `${pct}%`, edgeType: 'owns', edgeDir: 'out', stakePct: pct } }) as unknown as GraphElement
  const runs = (s: string, t: string, label: string) =>
    ({ data: { id: `${s}__role__${t}`, source: s, target: t, label, edgeType: 'role', edgeDir: 'out', stakePct: null } }) as unknown as GraphElement
  // roles come first in the profile's elements; Tesla and SpaceX are owned AND run, SolarCity only run
  const els = [person(), node('solar'), node('tesla'), node('spacex'),
    runs('p', 'solar', 'Chairman'), runs('p', 'tesla', 'Board Member · CEO'), runs('p', 'spacex', 'CEO · Founder'),
    holds('tesla', 18.4), holds('spacex', 28.7)]

  it('places every company below the person, the owned ones first', () => {
    const { positions } = computeTreeLayout(els, 'p')
    for (const c of ['solar', 'tesla', 'spacex']) expect(positions.get(c)!.y).toBeGreaterThan(0)
    expect(positions.get('solar')!.x).toBeGreaterThan(Math.max(positions.get('tesla')!.x, positions.get('spacex')!.x))
    expect(overlaps(positions, els, 'p')).toBe(false)
  })

  it('runs the role line along the holding, with one label naming both', () => {
    const { routes, dual, labels } = computeTreeLayout(els, 'p')
    expect(routes.get('p__role__tesla')).toEqual(routes.get('p__owns__tesla'))
    expect(Object.fromEntries(dual)).toEqual({ p__role__tesla: 'p__owns__tesla', p__role__spacex: 'p__owns__spacex' })
    expect(labels.get('p__owns__tesla')!.text).toBe('Board Member · CEO · 18.4%')
    expect(labels.has('p__role__tesla')).toBe(false)            // one label per company, on the holding
    expect(labels.get('p__role__solar')!.text).toBe('Chairman') // run only: the role line carries it
    expect(routes.has('p__role__solar')).toBe(true)
  })

  it('keeps room above each company for its label, more for a longer one', () => {
    const bare = els.map(e => 'source' in e.data ? { data: { ...e.data, label: '' } } as unknown as GraphElement : e)
    const without = computeTreeLayout(bare, 'p').positions, withLabels = computeTreeLayout(els, 'p').positions
    expect(computeTreeLayout(bare, 'p').labels.size).toBe(0)
    for (const c of ['solar', 'tesla', 'spacex']) expect(withLabels.get(c)!.y).toBeGreaterThan(without.get(c)!.y)
    expect(labelSize('CEO · Chairman · Director · Executive Officer · Founder · 28.7416%').h).toBeGreaterThan(labelSize('100%').h)
  })

  it('in a column, each label fits between the company above and its own', () => {
    const many = [node('c'), ...Array.from({ length: 30 }, (_, i) => node(`c-${i}`)),
      ...Array.from({ length: 30 }, (_, i) => ({ data: { id: `c__owns__c-${i}`, source: 'c', target: `c-${i}`, label: '100%',
        edgeType: 'owns', edgeDir: 'out', stakePct: null } }) as unknown as GraphElement)]
    const { positions, routes } = computeTreeLayout(many, 'c')
    const columns = new Map<number, number[]>()
    for (const [id, r] of routes) {
      const p = positions.get(id.split('__owns__')[1])!
      const trunk = Math.round(p.x - (r.kind === 'side' ? r.dx : TREE_GUTTER + LEAF.w / 2 - TREE_TRUNK_INSET))
      columns.set(trunk, [...(columns.get(trunk) ?? []), p.y])
    }
    const step = Math.min(...[...columns.values()].flatMap(ys => ys.sort((a, b) => a - b).slice(1).map((y, i) => y - ys[i])))
    expect(step).toBeGreaterThanOrEqual(LEAF.h + labelSize('100%').h)
  })

  it('a holding the filter hides leaves the role to place the company alone', () => {
    const { routes, dual, labels } = computeTreeLayout(els.filter(e => e.data.id !== 'p__owns__tesla'), 'p')
    expect(routes.has('p__role__tesla')).toBe(true)
    expect(dual.has('p__role__tesla')).toBe(false)
    expect(labels.get('p__role__tesla')!.text).toBe('Board Member · CEO')
  })

  it('never continues through a role, and only the CENTRE\'s roles place a company', () => {
    // someone else runs Tesla; Tesla holds a subsidiary; the centred person also runs that subsidiary
    const more = [...els, node('other'), runs('other', 'tesla', 'CFO'), node('sub'), owns('tesla', 'sub'), runs('p', 'sub', 'Director'),
      node('far'), runs('solar', 'far', 'n/a')]
    const { positions, routes } = computeTreeLayout(more, 'p')
    expect(positions.has('other')).toBe(false)
    expect(positions.has('far')).toBe(false)                    // reached only through a non-centre role
    expect(treeParents(more, 'p').get('sub')).toBe('tesla')     // the holding places it…
    expect(routes.has('p__role__sub')).toBe(false)              // …the person's seat there is its own line
  })

  it('leaves a company-centred graph alone: its executives point AT it', () => {
    const co = [node('c'), node('a'), owns('c', 'a'), person(), runs('p', 'c', 'CEO')]
    const { positions, routes } = computeTreeLayout(co, 'c')
    expect([...positions.keys()].sort()).toEqual(['a', 'c'])
    expect([...routes.keys()]).toEqual(['c__owns__a'])
  })
})
