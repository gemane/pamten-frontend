import { describe, it, expect } from 'vitest'
import { buildElements, buildElementsUpward, buildElementsDownward, buildPersonElements, buildPersonProfileElements, isDrawableOwnership } from './buildElements'
import type { Entity, Person, FullProfile, PersonProfile, OwnerEntry, SubsidiaryEntry, ExecutiveEntry, OwnsRelationship, EdgeData } from '../types'

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

// ── Redundant ownership shortcuts ─────────────────────────────────────────────
//
// GLEIF records "X is the ultimate parent of Y" alongside the chain that already
// links them, so many indirect edges duplicate a drawn path. But not all: for 58
// of 484 owned entities the ultimate-parent edge is the ONLY inbound ownership
// there is, and an earlier version that filtered on `direct_or_indirect` removed
// those companies from the graph entirely.
//
// So the graph hides only edges a maintenance pass has PROVEN redundant. Absent
// means unproven, and unproven means drawn.

describe('isDrawableOwnership', () => {
  it('hides an edge proven redundant', () => {
    expect(isDrawableOwnership({ shortcut: true })).toBe(false)
  })

  it('draws an edge proven load-bearing', () => {
    expect(isDrawableOwnership({ shortcut: false })).toBe(true)
  })

  it('draws an unproven edge — including an indirect one', () => {
    // The regression: filtering by kind hid 58 companies whose only owner link
    // was an ultimate-parent edge. Nothing is hidden until it is checked.
    expect(isDrawableOwnership({ direct_or_indirect: 'indirect' } as never)).toBe(true)
    expect(isDrawableOwnership({})).toBe(true)
    expect(isDrawableOwnership(null)).toBe(true)
    expect(isDrawableOwnership(undefined)).toBe(true)
  })
})

describe('buildElements and ownership shortcuts', () => {
  const profile = (): FullProfile => ({
    entity: { id: 'p', name: 'Parent', type: 'company', verified: false } as Entity,
    owners: [], executives: [],
    subsidiaries: [
      { entity: { id: 'd', name: 'Direct Co', type: 'company' } as Entity,
        relationship: { direct_or_indirect: 'direct' } },
      { entity: { id: 'r', name: 'Redundant Co', type: 'company' } as Entity,
        relationship: { direct_or_indirect: 'indirect', shortcut: true } },
      { entity: { id: 'l', name: 'Load Bearing Co', type: 'company' } as Entity,
        relationship: { direct_or_indirect: 'indirect', shortcut: false } },
      { entity: { id: 'u', name: 'Unchecked Co', type: 'company' } as Entity,
        relationship: { direct_or_indirect: 'indirect' } },
    ],
  } as FullProfile)

  const ids = (els: ReturnType<typeof buildElements>) =>
    els.filter(e => !('source' in e.data)).map(e => e.data.id)

  it('omits only the proven-redundant shortcut', () => {
    expect(ids(buildElements(profile(), new Set()))).toEqual(['p', 'd', 'l', 'u'])
  })

  it('keeps a company whose only link is an ultimate-parent edge', () => {
    // Exactly the 58 that vanished. This is the test that would have caught it.
    expect(ids(buildElements(profile(), new Set()))).toContain('l')
  })

  it('keeps an indirect edge nobody has checked yet', () => {
    expect(ids(buildElements(profile(), new Set()))).toContain('u')
  })

  it('marks a surviving indirect edge so it can be drawn dashed', () => {
    const edges = buildElements(profile(), new Set())
      .filter(e => 'source' in e.data)
      .map(e => e.data as EdgeData)
    const loadBearing = edges.find(d => d.target === 'l')
    expect(loadBearing?.directOrIndirect).toBe('indirect')
  })

  it('applies the same rule when expanding a node', () => {
    expect(ids(buildElementsDownward(profile(), new Set()))).toEqual(['d', 'l', 'u'])
  })
})

// ── Voting groups on the canvas ─────────────────────────────────────────────

describe('the voting relationship is drawn from both ends', () => {
  const rel = (o: Partial<OwnsRelationship>): OwnsRelationship => o as OwnsRelationship

  it('draws a votes edge when the bloc is an owner', () => {
    const els = buildElements(makeProfile(entity('abi', 'AB InBev'), {
      owners: [{ owner: entity('altria', 'Altria'),
                 relationship: rel({ stake_percent: 8.1, voting_power_pct: 51.9 }) }],
    }), new Set())
    const kinds = els.map(e => (e.data as EdgeData).edgeType).filter(Boolean)
    expect(kinds).toContain('votes')
  })

  it('draws it when the same pair is seen from the other side', () => {
    // Centring Altria used to show an 8.1% holding and no bloc at all: the
    // subsidiary loop never emitted the parallel edge the owners loop did, so
    // the same fact was visible or invisible depending on where you stood.
    const els = buildElements(makeProfile(entity('altria', 'Altria'), {
      subsidiaries: [{ entity: entity('abi', 'AB InBev'),
                       relationship: rel({ stake_percent: 8.1, voting_power_pct: 51.9 }) }],
    }), new Set())
    const votes = els.filter(e => (e.data as EdgeData).edgeType === 'votes')
    expect(votes).toHaveLength(1)
    expect((votes[0].data as EdgeData).votingPowerPct).toBe(51.9)
  })

  it('adds no votes edge when voting equals the stake', () => {
    const els = buildElements(makeProfile(entity('altria'), {
      subsidiaries: [{ entity: entity('abi'),
                       relationship: rel({ stake_percent: 5.7, voting_power_pct: 5.7 }) }],
    }), new Set())
    expect(els.some(e => (e.data as EdgeData).edgeType === 'votes')).toBe(false)
  })
})

describe('filing-group membership on the canvas', () => {
  it('draws the parties when the group is the centre', () => {
    const profile = {
      ...makeProfile(entity('g1', 'Voting group · 9 parties')),
      group_members: [
        { kind: 'entity' as const, party: entity('m1', 'Stichting') },
        { kind: 'person' as const, party: person('m2', 'Jorge Paulo Lemann') },
      ],
    }
    const els = buildElements(profile, new Set())
    const members = els.filter(e => (e.data as EdgeData).edgeType === 'member')
    expect(members).toHaveLength(2)
    // Membership points at the group, never the other way — nobody owns an
    // agreement.
    expect(members.every(e => (e.data as EdgeData).target === 'g1')).toBe(true)
    expect(els.some(e => e.data.id === 'm2' && (e.data as { nodeType?: string }).nodeType === 'person')).toBe(true)
  })

  it('draws the group when a party is the centre', () => {
    // The mirror. Clicking a member from the group's panel used to land on a
    // graph with no sign of the bloc it had just come from.
    const profile = {
      ...makeProfile(entity('m1', 'Stichting')),
      voting_groups: [{ group: { ...entity('g1', 'Voting group · 9 parties'),
                                 type: 'voting_group' as const } }],
    }
    const els = buildElements(profile, new Set())
    const edge = els.find(e => (e.data as EdgeData).edgeType === 'member')
    expect(edge).toBeDefined()
    expect((edge!.data as EdgeData).source).toBe('m1')
    expect((edge!.data as EdgeData).target).toBe('g1')
    const node = els.find(e => e.data.id === 'g1')
    expect((node!.data as { entitySubtype?: string }).entitySubtype).toBe('voting_group')
  })

  it('carries no stake, so no filter or sum can treat it as ownership', () => {
    const profile = {
      ...makeProfile(entity('g1', 'Voting group · 3 parties')),
      group_members: [{ kind: 'entity' as const, party: entity('m1') }],
    }
    const edge = buildElements(profile, new Set())
      .find(e => (e.data as EdgeData).edgeType === 'member')
    expect((edge!.data as EdgeData).stakePct).toBeNull()
    expect((edge!.data as EdgeData).label).toBe('')
  })

  it('adds nothing for an ordinary company', () => {
    const els = buildElements(makeProfile(entity('c1')), new Set())
    expect(els.some(e => (e.data as EdgeData).edgeType === 'member')).toBe(false)
  })
})

describe('expanding a voting group', () => {
  const groupProfile = () => ({
    ...makeProfile({ ...entity('g1', 'Voting group · 9 parties'),
                     type: 'voting_group' as const }),
    group_members: [
      { kind: 'entity' as const, party: entity('m1', 'Stichting') },
      { kind: 'person' as const, party: person('m2', 'Jorge Paulo Lemann') },
    ],
  })

  // Expand routes through the DIRECTIONAL builders, not buildElements. A group
  // whose only edge is to the company it votes takes the upward path, where it
  // has no owners — so before this it found nothing and said "no new
  // connections", while "open as center" worked fine.
  it('brings in the parties when expanded upward', () => {
    const els = buildElementsUpward(groupProfile(), new Set())
    const members = els.filter(e => (e.data as EdgeData).edgeType === 'member')
    expect(members).toHaveLength(2)
  })

  it('brings them in downward too', () => {
    const els = buildElementsDownward(groupProfile(), new Set())
    expect(els.filter(e => (e.data as EdgeData).edgeType === 'member')).toHaveLength(2)
  })

  it('all three builders agree', () => {
    const count = (f: typeof buildElements) =>
      f(groupProfile(), new Set()).filter(e => (e.data as EdgeData).edgeType === 'member').length
    expect(count(buildElements)).toBe(2)
    expect(count(buildElementsUpward)).toBe(2)
    expect(count(buildElementsDownward)).toBe(2)
  })

  it('does not re-add what the canvas already holds', () => {
    // Expanding twice must not duplicate an edge or a node.
    const seen = new Set<string>()
    const first = buildElementsUpward(groupProfile(), seen)
    const second = buildElementsUpward(groupProfile(), seen)
    expect(first.length).toBeGreaterThan(0)
    expect(second).toHaveLength(0)
  })

  it('draws the group when a member is expanded', () => {
    const memberProfile = {
      ...makeProfile(entity('m1', 'Stichting')),
      voting_groups: [{ group: { ...entity('g1', 'Voting group · 9 parties'),
                                 type: 'voting_group' as const } }],
    }
    const els = buildElementsUpward(memberProfile, new Set())
    const edge = els.find(e => (e.data as EdgeData).edgeType === 'member')
    expect((edge!.data as EdgeData).source).toBe('m1')
    expect((edge!.data as EdgeData).target).toBe('g1')
  })
})

describe("a person's graph shows the bloc they vote in", () => {
  // buildPersonProfileElements was the fifth builder to need this, after
  // buildElements and its two directional variants. Three of AB InBev's nine
  // parties are people.
  const profile = () => ({
    person: person('p1', 'Jorge Paulo Lemann'),
    positions: [],
    holdings: [],
    voting_groups: [{ group: { ...entity('g1', 'Voting group · 9 parties'),
                               type: 'voting_group' as const } }],
  })

  it('draws the group and the edge to it', () => {
    const els = buildPersonProfileElements(profile(), new Set())
    const edge = els.find(e => (e.data as EdgeData).edgeType === 'member')
    expect(edge).toBeDefined()
    expect((edge!.data as EdgeData).source).toBe('p1')
    expect((edge!.data as EdgeData).target).toBe('g1')
    expect(els.some(e => e.data.id === 'g1')).toBe(true)
  })

  it('draws nothing extra for a person in no group', () => {
    const els = buildPersonProfileElements(
      { person: person('p1'), positions: [], holdings: [] }, new Set())
    expect(els.some(e => (e.data as EdgeData).edgeType === 'member')).toBe(false)
  })
})

describe('every builder emits the same edge, whichever way you stand', () => {
  // The generalisation of "all three builders agree". Seven bugs came from a
  // field emitted on one path and not its siblings; this test renders ONE
  // maximal relationship through every builder and requires the same key set
  // and the same values on the resulting edges — so the next field added to
  // one builder fails here, before a person has to notice it on two screens.
  const REL: OwnsRelationship = {
    stake_percent: 8.05, voting_power_pct: 51.9, ownership_type: 'minority',
    direct_or_indirect: 'direct',
  } as OwnsRelationship

  const abi = entity('abi', 'AB InBev')
  const altria = entity('altria', 'Altria')

  const edgesOf = (els: ReturnType<typeof buildElements>) => {
    const owns = els.find(e => (e.data as EdgeData).edgeType === 'owns')!.data as EdgeData
    const votes = els.find(e => (e.data as EdgeData).edgeType === 'votes')?.data as EdgeData
    return { owns, votes }
  }

  const fromEveryBuilder = () => ({
    centre_owned: edgesOf(buildElements(makeProfile(abi, {
      owners: [{ owner: altria, relationship: REL }] }), new Set())),
    centre_owns: edgesOf(buildElements(makeProfile(altria, {
      subsidiaries: [{ entity: abi, relationship: REL }] }), new Set())),
    upward: edgesOf(buildElementsUpward(makeProfile(abi, {
      owners: [{ owner: altria, relationship: REL }] }), new Set())),
    downward: edgesOf(buildElementsDownward(makeProfile(altria, {
      subsidiaries: [{ entity: abi, relationship: REL }] }), new Set())),
    person: edgesOf(buildPersonElements({ person: person('p1', 'Somebody') },
      [{ entity: abi, relationship: REL }], new Set())),
  })

  it('the owns edge carries identical keys and values everywhere', () => {
    const all = fromEveryBuilder()
    const reference = all.centre_owned.owns
    for (const [name, { owns }] of Object.entries(all)) {
      expect(Object.keys(owns).sort(), `${name}: key set differs`)
        .toEqual(Object.keys(reference).sort())
      for (const k of ['stakePct', 'votingPowerPct', 'ownershipType',
                       'directOrIndirect', 'label'] as const) {
        expect(owns[k], `${name}.${k}`).toEqual(reference[k])
      }
    }
    // Parity alone is not enough — five builders dropping a field EQUALLY
    // still agree with each other. Anchor the reference to the input.
    expect(reference.stakePct).toBe(8.05)
    expect(reference.votingPowerPct).toBe(51.9)
    expect(reference.ownershipType).toBe('minority')
    expect(reference.directOrIndirect).toBe('direct')
    expect(reference.label).toBe('8.05%')
  })

  it('the votes edge exists everywhere the bloc differs from the stake', () => {
    // buildElementsDownward emitted NO votes edge until the audit; this is the
    // regression pin for that entire bug class.
    const all = fromEveryBuilder()
    for (const [name, { votes }] of Object.entries(all)) {
      expect(votes, `${name}: no votes edge`).toBeDefined()
      expect(votes!.votingPowerPct, `${name}`).toBe(51.9)
      expect(votes!.stakePct, `${name}: the person builder used to drop this`)
        .toBe(8.05)
    }
  })

  it('the shortcut filter applies from both sides', () => {
    // It used to apply on the subsidiary side only, so a proven-shortcut edge
    // was hidden from the parent's view and drawn from the child's.
    const shortcutRel = { ...REL, shortcut: true } as OwnsRelationship
    const asOwner = buildElements(makeProfile(abi, {
      owners: [{ owner: altria, relationship: shortcutRel }] }), new Set())
    const asSub = buildElements(makeProfile(altria, {
      subsidiaries: [{ entity: abi, relationship: shortcutRel }] }), new Set())
    expect(asOwner.some(e => (e.data as EdgeData).edgeType === 'owns')).toBe(false)
    expect(asSub.some(e => (e.data as EdgeData).edgeType === 'owns')).toBe(false)
  })

  it('both sides get sized by control', () => {
    // `importance` existed on the owners loop only, so a subsidiary was never
    // sized however large the holding.
    const all = fromEveryBuilder()
    void all
    const els = buildElements(makeProfile(altria, {
      subsidiaries: [{ entity: abi, relationship: REL }] }), new Set())
    const node = els.find(e => e.data.id === 'abi')!.data as { importance?: number }
    expect(node.importance).toBe(51.9)
  })
})
