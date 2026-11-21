import { describe, it, expect } from 'vitest'
import { addressNode, addressNodeId, buildAddressElements, isAddressNode } from './addressElements'
import { computeArcPositions } from '../components/Graph'
import type { Entity, GraphElement, RegisteredAddress } from '../types'

const CSC = 'C/O Corporation Service Company, 251 Little Falls Drive, Wilmington, 19808, US'
const KEY = 'c o corporation service company 251 little falls drive wilmington 19808 us'
const co = (id: string, name: string): Entity => ({ id, name, type: 'company' } as Entity)
const section = (entities: Entity[], count = entities.length): RegisteredAddress =>
  ({ key: KEY, address: CSC, count, entities })

const nodes = (els: GraphElement[]) => els.filter(e => !('source' in e.data)).map(e => e.data.id)
const edges = (els: GraphElement[]) =>
  els.filter(e => 'source' in e.data).map(e => { const d = e.data as { source: string; target: string }; return `${d.source}>${d.target}` })

describe('buildAddressElements', () => {
  it('draws the door as a hub between the company and the others there', () => {
    const els = buildAddressElements('A', section([co('B', 'Beta'), co('C', 'Charlie')]), new Set(['A']))
    const hub = addressNodeId(KEY)
    expect(nodes(els)).toEqual([hub, 'B', 'C'])
    expect(edges(els)).toEqual([`A>${hub}`, `${hub}>B`, `${hub}>C`])
    const hubData = els[0].data as { nodeType: string; label: string; addressKey: string }
    expect(hubData.nodeType).toBe('address')
    expect(hubData.label).toBe(CSC)
    expect(hubData.addressKey).toBe(KEY)
  })

  it('states no stake and no ownership on its lines', () => {
    const els = buildAddressElements('A', section([co('B', 'Beta')]), new Set(['A']))
    for (const e of els.filter(x => 'source' in x.data)) {
      const d = e.data as { edgeType: string; stakePct: number | null; ownershipType?: string }
      expect(d.edgeType).toBe('registered_at')
      expect(d.stakePct).toBeNull()
      expect(d.ownershipType).toBeUndefined()
    }
  })

  it('adds only what the graph does not show yet', () => {
    const loaded = new Set(['A', 'B'])
    const first = buildAddressElements('A', section([co('B', 'Beta'), co('C', 'Charlie')]), loaded)
    expect(nodes(first)).toEqual([addressNodeId(KEY), 'C'])           // B is drawn already
    expect(buildAddressElements('A', section([co('B', 'Beta'), co('C', 'Charlie')]), loaded)).toEqual([])
  })

  it('never lists the company itself twice', () => {
    const els = buildAddressElements('A', section([co('A', 'Alpha'), co('B', 'Beta')]), new Set(['A']))
    expect(edges(els)).not.toContain(`${addressNodeId(KEY)}>A`)
  })

  it('labels the hub with the key when no readable address came', () => {
    expect(addressNode({ key: KEY, address: null, count: 1 }).label).toBe(KEY)
    expect(isAddressNode(addressNode({ key: KEY, address: CSC, count: 1 }))).toBe(true)
    expect(isAddressNode({ nodeType: 'entity' })).toBe(false)
  })
})

describe('the hub in the arc layout', () => {
  it('sits below the centre after its subsidiaries, the others below it', () => {
    const els: GraphElement[] = [
      { data: { id: 'A', label: 'Alpha', nodeType: 'entity', raw: co('A', 'Alpha') } },
      { data: { id: 'S', label: 'Sub', nodeType: 'entity', raw: co('S', 'Sub') } },
      { data: { id: 'A__owns__S', source: 'A', target: 'S', label: '100%', edgeType: 'owns', stakePct: 100 } },
      ...buildAddressElements('A', section([co('B', 'Beta')]), new Set(['A', 'S', 'A__owns__S'])),
    ]
    const pos = computeArcPositions(els, 'A')
    const hub = pos.get(addressNodeId(KEY))!
    expect(hub.y).toBeGreaterThan(pos.get('S')!.y)            // below the graph, not on the subsidiaries' arc
    expect(hub.x).toBe(pos.get('A')!.x)                       // centred under the centre
    expect(pos.get('B')!.y).toBeGreaterThan(hub.y)            // the others below the hub
  })
})

describe('the stake filter and a shared address', () => {
  it('does not count the address lines as holdings', async () => {
    const { stakeCoverageOf } = await import('../components/Graph')
    const els: GraphElement[] = [
      { data: { id: 'A__owns__S', source: 'A', target: 'S', label: '100%', edgeType: 'owns', stakePct: 100 } },
      ...buildAddressElements('A', section([co('B', 'Beta'), co('C', 'Charlie')]), new Set(['A'])),
    ]
    expect(stakeCoverageOf(els)).toEqual({ stated: 1, total: 1 })
  })
})

describe('a crowded registered office', () => {
  it('stacks the companies there in rows of eight, not one row', () => {
    const many = Array.from({ length: 20 }, (_, i) => co(`N${i}`, `Nominee ${String(i).padStart(2, '0')}`))
    const els: GraphElement[] = [
      { data: { id: 'A', label: 'Alpha', nodeType: 'entity', raw: co('A', 'Alpha') } },
      ...buildAddressElements('A', section(many), new Set(['A'])),
    ]
    const pos = computeArcPositions(els, 'A')
    const ys = new Set(many.map(e => pos.get(e.id)!.y))
    expect(ys.size).toBe(3)                                   // 8 + 8 + 4
    const hub = pos.get(addressNodeId(KEY))!
    for (const e of many) expect(pos.get(e.id)!.y).toBeGreaterThan(hub.y)
  })
})

describe('a registered office beside a company with subsidiaries', () => {
  // The user, 2026-11-21: "Show in graph" laid the rows of eight across the subsidiaries.
  it('keeps every box of the address block clear of every other box', () => {
    const subs = Array.from({ length: 12 }, (_, i) => co(`S${i}`, `Subsidiary ${i}`))
    const many = Array.from({ length: 20 }, (_, i) => co(`N${i}`, `Nominee ${i}`))
    const base: GraphElement[] = [
      { data: { id: 'A', label: 'Alpha', nodeType: 'entity', raw: co('A', 'Alpha') } },
      { data: { id: 'O', label: 'Owner', nodeType: 'entity', raw: co('O', 'Owner') } },
      { data: { id: 'O__owns__A', source: 'O', target: 'A', label: '', edgeType: 'owns', stakePct: 60 } },
      ...subs.flatMap(e => [
        { data: { id: e.id, label: e.name, nodeType: 'entity', raw: e } },
        { data: { id: `A__owns__${e.id}`, source: 'A', target: e.id, label: '', edgeType: 'owns', stakePct: 100 } },
      ] as GraphElement[]),
    ]
    const loaded = new Set(base.map(el => el.data.id))
    const els = [...base, ...buildAddressElements('A', section(many), loaded)]
    const pos = computeArcPositions(els, 'A')
    const block = [addressNodeId(KEY), ...many.map(e => e.id)]
    const rest = ['A', 'O', ...subs.map(e => e.id)]
    const W = 152, H = 60                                     // the layout's default box
    for (const b of block) for (const r of rest) {
      const p = pos.get(b)!, q = pos.get(r)!
      const apart = Math.abs(p.x - q.x) >= W || Math.abs(p.y - q.y) >= H
      expect(apart, `${b} over ${r}`).toBe(true)
    }
    // and the whole block lies below the rest
    const blockTop = Math.min(...block.map(id => pos.get(id)!.y))
    expect(blockTop).toBeGreaterThan(Math.max(...rest.map(id => pos.get(id)!.y)))
  })
})

describe('taking a registered office out of the graph again', () => {
  const start = (): GraphElement[] => [
    { data: { id: 'A', label: 'Alpha', nodeType: 'entity', raw: co('A', 'Alpha') } },
    { data: { id: 'S', label: 'Sub', nodeType: 'entity', raw: co('S', 'Sub') } },
    { data: { id: 'A__owns__S', source: 'A', target: 'S', label: '100%', edgeType: 'owns', stakePct: 100 } },
  ]
  it('removes the hub, its lines and the companies only it brought', async () => {
    const { removeAddressElements, shownAddressKeys } = await import('./addressElements')
    const base = start()
    const els = [...base, ...buildAddressElements('A', section([co('B', 'Beta'), co('S', 'Sub')]), new Set(['A', 'S', 'A__owns__S']))]
    expect([...shownAddressKeys(els)]).toEqual([KEY])
    const { elements, removed } = removeAddressElements(els, KEY)
    expect(elements).toEqual(base)                            // S was there before: it stays
    expect(removed.has('B')).toBe(true)
    expect(removed.has('S')).toBe(false)
    expect(removed.has('A')).toBe(false)
    expect(shownAddressKeys(elements).size).toBe(0)
  })
  it('keeps a company the reader has expanded since, and the one they came from', async () => {
    const { removeAddressElements } = await import('./addressElements')
    const els: GraphElement[] = [
      { data: { id: 'A', label: 'Alpha', nodeType: 'entity', raw: co('A', 'Alpha') } },
      ...buildAddressElements('A', section([co('B', 'Beta'), co('C', 'Charlie')]), new Set(['A'])),
      { data: { id: 'X', label: 'X', nodeType: 'entity', raw: co('X', 'X') } },
      { data: { id: 'B__owns__X', source: 'B', target: 'X', label: '', edgeType: 'owns', stakePct: 50 } },
    ]
    const ids = removeAddressElements(els, KEY).elements.map(el => el.data.id)
    expect(ids).toEqual(['A', 'B', 'X', 'B__owns__X'])        // A has no other line and stays; C goes
  })
  it('changes nothing for an address that is not drawn, and never removes a kept node', async () => {
    const { removeAddressElements } = await import('./addressElements')
    const base = start()
    expect(removeAddressElements(base, KEY).elements).toBe(base)
    const els = [...base, ...buildAddressElements('A', section([co('B', 'Beta')]), new Set(['A', 'S', 'A__owns__S']))]
    expect(removeAddressElements(els, KEY, ['B']).removed.has('B')).toBe(false)
  })
})
