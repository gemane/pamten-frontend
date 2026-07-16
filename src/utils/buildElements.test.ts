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

  it('emits executives as person nodes with role edges', () => {
    const els = buildElements(makeProfile(entity('acme'), {
      executives: [{ person: person('ceo', 'Jane Doe'), role: { role: 'CEO' } }],
    }), new Set())
    const p = nodes(els).find(e => e.data.id === 'ceo')!
    expect((p.data as unknown as { nodeType: string }).nodeType).toBe('person')
    const edge = edges(els).find(e => e.data.id === 'ceo__role__acme')!
    expect((edge.data as unknown as { edgeType: string; label: string }).edgeType).toBe('role')
    expect((edge.data as unknown as { label: string }).label).toBe('CEO')
  })

  it('does not duplicate a person who is both owner and executive', () => {
    const jane = person('p1', 'Jane Doe')
    const els = buildElements(makeProfile(entity('acme'), {
      owners: [{ owner: jane, relationship: rel({ stake_percent: 10 }) }],
      executives: [{ person: jane, role: { role: 'CEO' } }],
    }), new Set())
    expect(nodes(els).filter(e => e.data.id === 'p1')).toHaveLength(1)
    // both relationships still present as distinct edges
    expect(ids(edges(els)).sort()).toEqual(['p1__owns__acme', 'p1__role__acme'])
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
  it('emits the person, owned entities (owns edges) and roles (role edges)', () => {
    const els = buildPersonElements(
      { person: person('p1', 'Jane'), roles: [{ entity: entity('boardco'), role: { role: 'Director' } }] },
      [{ entity: entity('ownco'), relationship: { stake_percent: 25 } }],
    )
    expect(nodes(els).map(e => e.data.id).sort()).toEqual(['boardco', 'ownco', 'p1'])
    expect(ids(edges(els)).sort()).toEqual(['p1__owns__ownco', 'p1__role__boardco'])
  })

  it('does not duplicate an entity that is both owned and a role target', () => {
    const els = buildPersonElements(
      { person: person('p1'), roles: [{ entity: entity('shared'), role: { role: 'CEO' } }] },
      [{ entity: entity('shared'), relationship: { stake_percent: 5 } }],
    )
    expect(nodes(els).filter(e => e.data.id === 'shared')).toHaveLength(1)
  })
})

// ── buildPersonProfileElements ───────────────────────────────────────────────

describe('buildPersonProfileElements', () => {
  const profile: PersonProfile = {
    person: person('musk', 'Elon Musk'),
    positions: [{ entity: entity('spacex', 'SpaceX'), role: { role: 'CEO' } }],
    holdings:  [{ entity: entity('tesla', 'Tesla'), relationship: { stake_percent: 20.5, ownership_type: 'controlling' } }],
  }

  it('maps positions to role edges and holdings to owns edges, with entity nodes', () => {
    const els = buildPersonProfileElements(profile)
    expect(nodes(els).map(e => e.data.id).sort()).toEqual(['musk', 'spacex', 'tesla'])
    expect(ids(edges(els)).sort()).toEqual(['musk__owns__tesla', 'musk__role__spacex'])
  })

  it('carries the role label onto the role edge', () => {
    const els = buildPersonProfileElements(profile)
    const roleEdge = edges(els).find(e => e.data.id === 'musk__role__spacex')
    expect((roleEdge!.data as unknown as { label: string }).label).toBe('CEO')
  })

  it('emits nothing but the person node when there are no positions or holdings', () => {
    const els = buildPersonProfileElements({ person: person('solo'), positions: [], holdings: [] })
    expect(nodes(els).map(e => e.data.id)).toEqual(['solo'])
    expect(edges(els)).toHaveLength(0)
  })
})
