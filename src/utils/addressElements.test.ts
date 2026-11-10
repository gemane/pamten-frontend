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
    expect(hub.y).toBeGreaterThan(0)                          // below the centre
    expect(hub.x).toBeLessThan(pos.get('S')!.x)               // after the subsidiary: the arc runs right to left
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
