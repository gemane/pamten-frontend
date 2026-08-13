/**
 * Building the map markers for a selected company.
 *
 * This is the code behind the reported bug: with a company selected, switching
 * Registered/Headquarters changed nothing on the map. It was inline in a
 * `useMemo` that did not list `mapBasis` among its dependencies and read
 * `hq_country || country` regardless — so no test that rendered the map with
 * fixed props could have caught it. Hence the extraction: the thing that was
 * wrong is now a function that takes the basis as an argument.
 */
import { describe, it, expect } from 'vitest'
import { buildContextCountries, type CountryCacheEntry } from './contextCountries'
import type { Entity, GraphElement, NodeData } from '../types'

const entity = (id: string, name: string, extra: Partial<Entity> = {}): Entity =>
  ({ id, name, type: 'company', verified: false, ...extra } as Entity)

// Registered on Grand Cayman, run from London — the case the switch exists for.
const cayman = entity('e1', 'BARCLAYS CAPITAL (CAYMAN) LIMITED', {
  country: 'KY', hq_country: 'GB',
  reg_lat: 19.29, reg_lng: -81.38, reg_geo_precision: 'approx',
  hq_lat: 51.5074, hq_lng: -0.0757, hq_geo_precision: 'exact',
  address: 'c/o Maples, Ugland House, Grand Cayman',
  hq_address: '1 Churchill Place, London', hq_city: 'LONDON',
})

const node = (e: Entity): NodeData =>
  ({ id: e.id, label: e.name, nodeType: 'entity', raw: e })

const graph = (parent: Entity, subs: Entity[]): GraphElement[] => [
  { data: node(parent) } as GraphElement,
  ...subs.flatMap(s => ([
    { data: node(s) } as GraphElement,
    { data: { id: `${parent.id}-${s.id}`, source: parent.id, target: s.id,
              edgeDir: 'out' } } as unknown as GraphElement,
  ])),
]

const build = (n: NodeData | null, els: GraphElement[], basis: 'hq' | 'jurisdiction',
               cache: Map<string, CountryCacheEntry> = new Map()) =>
  buildContextCountries(n, els, basis, cache)

describe('the basis decides everything', () => {
  const els = graph(cayman, [])

  it('places the company in London under headquarters', () => {
    const [c] = build(node(cayman), els, 'hq')
    expect(c.country).toBe('GB')
    expect([c.lat, c.lng]).toEqual([51.5074, -0.0757])
  })

  it('places it on Grand Cayman under registration', () => {
    const [c] = build(node(cayman), els, 'jurisdiction')
    expect(c.country).toBe('KY')
    expect([c.lat, c.lng]).toEqual([19.29, -81.38])
  })

  it('produces a genuinely different marker for each basis', () => {
    // The regression test for the report. Nothing about the node or the graph
    // changes — only the basis — and the output must differ.
    expect(build(node(cayman), els, 'hq')).not.toEqual(build(node(cayman), els, 'jurisdiction'))
  })

  it('tags the marker with the basis it was built for', () => {
    expect(build(node(cayman), els, 'jurisdiction')[0].basis).toBe('jurisdiction')
  })

  it('captions the marker with the address it stands on', () => {
    // Labelling a Cayman pin with a London street would be worse than no caption.
    expect(build(node(cayman), els, 'jurisdiction')[0].hqAddress).toMatch(/Ugland House/)
    expect(build(node(cayman), els, 'hq')[0].hqAddress).toMatch(/Churchill Place/)
  })

  it('does not carry the HQ city into the registered view', () => {
    expect(build(node(cayman), els, 'jurisdiction')[0].city).toBeUndefined()
    expect(build(node(cayman), els, 'hq')[0].city).toBe('LONDON')
  })

  it('reports precision from the matching basis', () => {
    expect(build(node(cayman), els, 'hq')[0].precise).toBe(true)
    expect(build(node(cayman), els, 'jurisdiction')[0].precise).toBe(false)
  })
})

describe('no fallback between the two', () => {
  it('omits a company the basis cannot place at all', () => {
    // Previously `hq_country || country` would have shown this under KY in the
    // headquarters view — a guess presented as a fact.
    const regOnly = entity('e1', 'Offshore Ltd', { country: 'KY' })
    expect(build(node(regOnly), graph(regOnly, []), 'hq')).toEqual([])
    expect(build(node(regOnly), graph(regOnly, []), 'jurisdiction')).toHaveLength(1)
  })

  it('keeps the country but drops the pin when only coordinates are missing', () => {
    // The country still shades; there is simply nothing precise to stand on.
    const noCoords = entity('e1', 'Somewhere Ltd', { country: 'KY', hq_country: 'GB' })
    const [c] = build(node(noCoords), graph(noCoords, []), 'jurisdiction')
    expect(c.country).toBe('KY')
    expect(c.lat).toBeUndefined()
  })
})

describe('subsidiaries', () => {
  const sub = entity('s1', 'Sub One', { country: 'DE', hq_country: 'DE',
                                        hq_lat: 52.5, hq_lng: 13.4,
                                        reg_lat: 50.1, reg_lng: 8.6 })

  it('marks direct subsidiaries alongside the parent', () => {
    const out = build(node(cayman), graph(cayman, [sub]), 'hq')
    expect(out.map(c => c.role)).toEqual(['primary', 'subsidiary'])
  })

  it('ignores companies that are not owned by the selected one', () => {
    const stranger = entity('x1', 'Unrelated AG', { hq_country: 'CH', hq_lat: 47, hq_lng: 8 })
    const els = [...graph(cayman, [sub]), { data: node(stranger) } as GraphElement]
    expect(build(node(cayman), els, 'hq').map(c => c.label)).not.toContain('Unrelated AG')
  })

  it('shows one marker per role and country, not one per company', () => {
    // A parent with forty Cayman subsidiaries must not stack forty pins on one spot.
    const twins = [entity('s1', 'Sub One', { hq_country: 'DE', hq_lat: 52.5, hq_lng: 13.4 }),
                   entity('s2', 'Sub Two', { hq_country: 'DE', hq_lat: 48.1, hq_lng: 11.6 })]
    expect(build(node(cayman), graph(cayman, twins), 'hq')
      .filter(c => c.role === 'subsidiary')).toHaveLength(1)
  })

  it('keeps a subsidiary in the same country as the parent, since the roles differ', () => {
    const british = entity('s1', 'British Sub', { hq_country: 'GB', hq_lat: 53.4, hq_lng: -2.9 })
    const out = build(node(cayman), graph(cayman, [british]), 'hq')
    expect(out.map(c => `${c.role}:${c.country}`)).toEqual(['primary:GB', 'subsidiary:GB'])
  })
})

describe('the cache', () => {
  it('remembers a place so a subsidiary opened on its own still has one', () => {
    const cache = new Map<string, CountryCacheEntry>()
    build(node(cayman), graph(cayman, []), 'hq', cache)
    expect(cache.get('e1')).toEqual({ country: 'GB', lat: 51.5074, lng: -0.0757 })
  })

  it('fills in from the cache when the entity itself has no country', () => {
    const cache = new Map<string, CountryCacheEntry>([['e1', { country: 'GB', lat: 51.5, lng: -0.1 }]])
    const bare = entity('e1', 'Sparse Co')
    expect(build(node(bare), graph(bare, []), 'hq', cache)[0].country).toBe('GB')
  })
})

describe('nothing to show', () => {
  it('returns nothing without a selection', () => {
    expect(build(null, [], 'hq')).toEqual([])
  })

  it('returns nothing for a person — people are not placed on the map', () => {
    const person = { id: 'p1', label: 'Someone', nodeType: 'person' as const, raw: {} as Entity }
    expect(build(person, [], 'hq')).toEqual([])
  })
})
