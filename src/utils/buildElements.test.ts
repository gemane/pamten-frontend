import { describe, it, expect } from 'vitest'
import {
  buildElements,
  buildElementsUpward,
  buildElementsDownward,
  buildPersonElements,
  buildPersonProfileElements,
} from './buildElements'
import type {
  Entity, Person, FullProfile, PersonProfile, OwnerEntry, SubsidiaryEntry, ExecutiveEntry, OwnsRelationship,
} from '../types'

// ── fixtures ────────────────────────────────────────────────────────────────

function entity(id: string, name = id): Entity {
  return { id, name, type: 'company', verified: false }
}

function person(id: string, full = id): Person {
  return { id, first_name: full, last_name: 'X', full_name: full, verified: false }
}

function makeProfile(
  center: Entity,
  opts: { owners?: OwnerEntry[]; subsidiaries?: SubsidiaryEntry[]; executives?: ExecutiveEntry[] } = {},
): FullProfile {
  return {
    entity: center,
    headquarters: null,
    operations: [],
    owners: opts.owners ?? [],
    subsidiaries: opts.subsidiaries ?? [],
    executives: opts.executives ?? [],
  }
}

const rel = (r: OwnsRelationship): OwnsRelationship => r

const ids = (els: { data: { id: string } }[]) => els.map(e => e.data.id)
const edges = (els: { data: { id: string } }[]) => els.filter(e => 'source' in e.data)
const nodes = (els: { data: { id: string } }[]) => els.filter(e => !('source' in e.data))

// ── buildElements ─────────────────────────────────────────────────────────────

describe('buildElements', () => {
  it('emits the center, subsidiaries (out edges) and owners (in edges)', () => {
    const profile = makeProfile(entity('acme'), {
      subsidiaries: [{ entity: entity('sub'), relationship: rel({ stake_percent: 60 }) }],
      owners: [{ owner: entity('owner'), relationship: rel({ stake_percent: 40 }) }],
    })
    const els = buildElements(profile, new Set())

    expect(nodes(els).map(e => e.data.id).sort()).toEqual(['acme', 'owner', 'sub'])
    expect(ids(edges(els)).sort()).toEqual(['acme__owns__sub', 'owner__owns__acme'])
  })

  it('emits a separate votes edge only when voting power differs from stake', () => {
    const withDiff = buildElements(makeProfile(entity('acme'), {
      owners: [{ owner: entity('o'), relationship: rel({ stake_percent: 30, voting_power_pct: 55 }) }],
    }), new Set())
    expect(ids(withDiff)).toContain('o__votes__acme')

    const equal = buildElements(makeProfile(entity('acme'), {
      owners: [{ owner: entity('o'), relationship: rel({ stake_percent: 30, voting_power_pct: 30 }) }],
    }), new Set())
    expect(ids(equal)).not.toContain('o__votes__acme')

    const noVote = buildElements(makeProfile(entity('acme'), {
      owners: [{ owner: entity('o'), relationship: rel({ stake_percent: 30 }) }],
    }), new Set())
    expect(ids(noVote)).not.toContain('o__votes__acme')
  })

  it('dedupes against loadedIds: a repeat build with the same set emits nothing', () => {
    const profile = makeProfile(entity('acme'), {
      subsidiaries: [{ entity: entity('sub'), relationship: rel({ stake_percent: 60 }) }],
    })
    const seen = new Set<string>()
    const first = buildElements(profile, seen)
    expect(first.length).toBeGreaterThan(0)
    const second = buildElements(profile, seen)
    expect(second).toEqual([])
  })

  it('still emits edges when only the nodes were previously loaded', () => {
    // guards the incremental-expand behaviour: pre-marking nodes must not
    // swallow the edges between them
    const profile = makeProfile(entity('acme'), {
      subsidiaries: [{ entity: entity('sub'), relationship: rel({ stake_percent: 60 }) }],
    })
    const seen = new Set<string>(['acme', 'sub'])  // nodes known, edge not
    const els = buildElements(profile, seen)
    expect(nodes(els)).toEqual([])
    expect(ids(edges(els))).toEqual(['acme__owns__sub'])
  })

  it('marks a person owner with nodeType person', () => {
    const els = buildElements(makeProfile(entity('acme'), {
      owners: [{ owner: person('p1', 'Jane Doe'), relationship: rel({ stake_percent: 10 }) }],
    }), new Set())
    const p = nodes(els).find(e => e.data.id === 'p1')!
    expect((p.data as unknown as { nodeType: string }).nodeType).toBe('person')
  })

  it('does not add executives (non-owners) to the graph — ownership only', () => {
    const els = buildElements(makeProfile(entity('acme'), {
      owners: [{ owner: person('own', 'Owner'), relationship: rel({ stake_percent: 10 }) }],
      executives: [{ person: person('ceo', 'Chief'), role: { role: 'CEO' } }],
    }), new Set())
    expect(nodes(els).map(e => e.data.id).sort()).toEqual(['acme', 'own'])   // no 'ceo'
    expect(ids(edges(els))).toEqual(['own__owns__acme'])                     // no role edge
  })
})

// ── directional builders ────────────────────────────────────────────────────

describe('buildElementsUpward / Downward', () => {
  const profile = makeProfile(entity('acme'), {
    owners: [{ owner: entity('owner'), relationship: rel({ stake_percent: 40 }) }],
    subsidiaries: [{ entity: entity('sub'), relationship: rel({ stake_percent: 60 }) }],
  })

  it('upward emits only owners (incoming edges), ignoring subsidiaries', () => {
    const els = buildElementsUpward(profile, new Set())
    expect(nodes(els).map(e => e.data.id).sort()).toEqual(['owner'])
    expect(ids(edges(els))).toEqual(['owner__owns__acme'])
  })

  it('downward emits only subsidiaries (outgoing edges), ignoring owners', () => {
    const els = buildElementsDownward(profile, new Set())
    expect(nodes(els).map(e => e.data.id).sort()).toEqual(['sub'])
    expect(ids(edges(els))).toEqual(['acme__owns__sub'])
  })
})

// ── buildPersonElements ─────────────────────────────────────────────────────

describe('buildPersonElements', () => {
  it('emits the person and owned entities (owns edges) only — ownership graph', () => {
    const els = buildPersonElements(
      { person: person('p1', 'Jane') },
      [{ entity: entity('ownco'), relationship: { stake_percent: 25 } }],
    )
    expect(nodes(els).map(e => e.data.id).sort()).toEqual(['ownco', 'p1'])
    expect(ids(edges(els)).sort()).toEqual(['p1__owns__ownco'])
  })

  it('emits a separate votes edge only when voting power differs from stake', () => {
    const els = buildPersonElements(
      { person: person('p1') },
      [{ entity: entity('ownco'), relationship: { stake_percent: 10, voting_power_pct: 30 } as OwnsRelationship }],
    )
    expect(ids(edges(els))).toContain('p1__votes__ownco')
  })
})

// ── buildPersonProfileElements ───────────────────────────────────────────────

describe('buildPersonProfileElements', () => {
  const profile: PersonProfile = {
    person: person('musk', 'Elon Musk'),
    positions: [{ entity: entity('spacex', 'SpaceX'), role: { role: 'CEO' } }],
    holdings:  [{ entity: entity('tesla', 'Tesla'), relationship: { stake_percent: 20.5, ownership_type: 'controlling' } }],
  }

  it('maps holdings to owns edges and ignores positions — ownership graph only', () => {
    const els = buildPersonProfileElements(profile)
    // spacex is a position (role, no stake) → not in the graph
    expect(nodes(els).map(e => e.data.id).sort()).toEqual(['musk', 'tesla'])
    expect(ids(edges(els))).toEqual(['musk__owns__tesla'])
  })

  it('carries the stake % onto the owns edge', () => {
    const els = buildPersonProfileElements(profile)
    const ownsEdge = edges(els).find(e => e.data.id === 'musk__owns__tesla')
    expect((ownsEdge!.data as unknown as { label: string }).label).toBe('20.5%')
  })

  it('emits nothing but the person node when there are no holdings', () => {
    const els = buildPersonProfileElements({ person: person('solo'), positions: [], holdings: [] })
    expect(nodes(els).map(e => e.data.id)).toEqual(['solo'])
    expect(edges(els)).toHaveLength(0)
  })

  it('respects a shared loadedIds set so a person can be expanded incrementally', () => {
    const twoHoldings: PersonProfile = {
      person: person('musk', 'Elon Musk'),
      positions: [],
      holdings: [
        { entity: entity('tesla', 'Tesla'),   relationship: { stake_percent: 20.5 } },
        { entity: entity('spacex', 'SpaceX'), relationship: { stake_percent: 42 } },
      ],
    }
    // person + tesla holding already in the graph; expanding pulls in only the new bits
    const seen = new Set<string>(['musk', 'tesla', 'musk__owns__tesla'])
    const els = buildPersonProfileElements(twoHoldings, seen)
    expect(nodes(els).map(e => e.data.id)).toEqual(['spacex'])
    expect(ids(edges(els))).toEqual(['musk__owns__spacex'])
  })
})
