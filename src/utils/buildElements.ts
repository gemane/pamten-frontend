import type { GraphElement, NodeData, FullProfile, PersonProfile, Entity, Person, GroupParty, OwnsRelationship, EntityType } from '../types'

// Cytoscape element builders. Each takes a `loadedIds`/`seen` set and only
// emits nodes/edges whose id isn't already present, so a graph can be grown
// incrementally without duplicating elements.

/**
 * Should this ownership edge be drawn?
 *
 * GLEIF records "X is the *ultimate* parent of Y" alongside the chain that
 * already links them, so many `indirect` edges are shortcuts for a path the
 * graph draws anyway. Drawn, they are indistinguishable from a real holding —
 * Barclays looks like it owns 118 companies outright when it directly owns 20.
 *
 * But NOT all of them are redundant. For 58 of 484 owned entities in the
 * database the ultimate-parent edge is the ONLY inbound ownership there is:
 * GLEIF recorded the top of the chain but not its steps, so no path reaches
 * them. Filtering on `direct_or_indirect` removed those companies from the
 * graph entirely — a regression this replaces.
 *
 * Whether a shortcut is genuinely redundant is a global property of the graph,
 * far too expensive to work out per request (measured: 223 ms for one profile
 * on the test subset). A maintenance pass computes it once and stamps
 * `shortcut` on the edge.
 *
 * The default is deliberately fail-safe: only an edge PROVEN redundant is
 * hidden. No flag — a new edge, or one the pass has not reached — is drawn.
 * Hiding something we have not checked is how the last version lost data.
 */
export function isDrawableOwnership(
  rel: { shortcut?: boolean | null } | null | undefined,
): boolean {
  return rel?.shortcut !== true
}

/** Nodes and edges for a filing group's membership, in whichever direction the
 *  profile supplies it.
 *
 *  Shared by all three builders. `buildElements` alone knew about membership at
 *  first, which meant "open as center" showed a group's parties and "expand"
 *  did not — expand routes through the directional builders, and a group whose
 *  only edge is to the company it votes takes the upward path, where it found
 *  no owners and reported "no new connections".
 *
 *  Membership is not directional in the ownership sense, so it is emitted on
 *  both paths: it is the group's defining relation, and expanding a group
 *  without it returns nothing worth having.
 */
function membershipElements(
  profile: { entity?: { id: string }; person?: { id: string }
             group_members?: GroupParty[]; voting_groups?: { group: Entity }[] },
  loadedIds: Set<string>,
): GraphElement[] {
  const selfId = profile.entity?.id ?? profile.person?.id
  if (!selfId) return []
  const els: GraphElement[] = []
  const edge = (memberId: string, groupId: string) => {
    const id = `${memberId}__member__${groupId}`
    if (loadedIds.has(id)) return
    loadedIds.add(id)
    els.push({ data: { id, source: memberId, target: groupId, label: '',
                       edgeType: 'member', edgeDir: 'out', stakePct: null } })
  }
  for (const m of profile.group_members ?? []) {
    const party = m.party
    if (!loadedIds.has(party.id)) {
      loadedIds.add(party.id)
      els.push({ data: {
        id: party.id, label: (party.name ?? party.full_name) || '?',
        nodeType: m.kind === 'person' ? 'person' : 'entity',
        entitySubtype: m.kind === 'person' ? null : (party.type ?? null),
        raw: party as Entity | Person,
      } })
    }
    edge(party.id, selfId)
  }
  for (const g of profile.voting_groups ?? []) {
    if (!loadedIds.has(g.group.id)) {
      loadedIds.add(g.group.id)
      els.push({ data: {
        id: g.group.id, label: g.group.name, nodeType: 'entity',
        entitySubtype: g.group.type ?? null, raw: g.group,
      } })
    }
    edge(selfId, g.group.id)
  }
  return els
}

/** One party of an ownership relationship, as the graph draws it. */
interface OwnershipParty {
  id: string
  name?: string
  full_name?: string
  type?: EntityType | null
  first_name?: string
}

/** Nodes and edges for ONE ownership relationship, whichever way it points.

 *  The sixth extraction of this session's recurring lesson: five hand-written
 *  loops each emitted "node + owns edge + conditional votes edge", and every
 *  field added to one drifted from the others — `buildElementsDownward` had no
 *  votes edge at all, the person builder's votes edge lacked `stakePct`,
 *  `importance` and `isDrawableOwnership` each applied on one side only. One
 *  emitter means one answer, from every entry point; the parity test in
 *  buildElements.test.ts holds it there.
 *
 *  `dir` is the edge's direction relative to the CENTRE: 'in' when the other
 *  party owns the centre, 'out' when the centre owns the other party.
 */
function ownershipElements(
  centreId: string,
  other: OwnershipParty,
  rel: OwnsRelationship | undefined,
  dir: 'in' | 'out',
  loadedIds: Set<string>,
): GraphElement[] {
  // A proven-shortcut edge is omitted from BOTH sides — it used to be filtered
  // on the subsidiary side only, so the same redundant edge was hidden from
  // the parent's view and drawn from the child's.
  if (!isDrawableOwnership(rel)) return []

  const els: GraphElement[] = []
  const stake = rel?.stake_percent
  const vote  = rel?.voting_power_pct
  const importance = vote ?? stake ?? 0
  const [source, target] = dir === 'in' ? [other.id, centreId] : [centreId, other.id]

  if (!loadedIds.has(other.id)) {
    loadedIds.add(other.id)
    els.push({ data: {
      id:            other.id,
      label:         (other.name ?? other.full_name) || '?',
      // A Person carries full_name; an Entity carries name. The profile's
      // owner objects have exactly one of the two.
      nodeType:      other.full_name !== undefined ? 'person' : 'entity',
      entitySubtype: other.type ?? null,
      raw:           other as Entity | Person,
      // Sized by control on either side — a subsidiary was never sized before.
      importance:    importance > 0 ? importance : undefined,
    } })
  }

  const ownsId = `${source}__owns__${target}`
  if (!loadedIds.has(ownsId)) {
    loadedIds.add(ownsId)
    els.push({ data: {
      id:             ownsId,
      source, target,
      label:          stake != null ? `${stake}%` : '',
      edgeType:       'owns',
      edgeDir:        dir,
      ownershipType:  rel?.ownership_type || '',
      stakePct:       stake ?? null,
      votingPowerPct: vote ?? null,
      directOrIndirect: rel?.direct_or_indirect ?? '',
    } })
  }

  if (vote != null && vote !== stake) {
    const votesId = `${source}__votes__${target}`
    if (!loadedIds.has(votesId)) {
      loadedIds.add(votesId)
      els.push({ data: {
        id:             votesId,
        source, target,
        label:          `${vote}%`,
        edgeType:       'votes',
        edgeDir:        dir,
        votingPowerPct: vote,
        stakePct:       stake ?? null,
      } })
    }
  }
  return els
}

export function buildElements(profile: FullProfile, loadedIds: Set<string>): GraphElement[] {
  const els: GraphElement[] = []

  const { entity, subsidiaries = [], owners = [],
          group_members = [], voting_groups = [] } = profile

  if (!loadedIds.has(entity.id)) {
    loadedIds.add(entity.id)
    els.push({ data: {
      id:            entity.id,
      label:         entity.name,
      nodeType:      'entity',
      entitySubtype: entity.type,
      raw:           entity,
    } })
  }

  for (const sub of subsidiaries) {
    els.push(...ownershipElements(entity.id, sub.entity, sub.relationship, 'out', loadedIds))
  }

  for (const own of owners) {
    if (!own.owner) continue
    els.push(...ownershipElements(entity.id, own.owner, own.relationship, 'in', loadedIds))
  }

  els.push(...membershipElements(profile, loadedIds))

  return els
}

export function buildElementsUpward(profile: FullProfile, loadedIds: Set<string>): GraphElement[] {
  const els: GraphElement[] = [...membershipElements(profile, loadedIds)]
  const { entity, owners = [] } = profile
  for (const own of owners) {
    if (!own.owner) continue
    els.push(...ownershipElements(entity.id, own.owner, own.relationship, 'in', loadedIds))
  }
  return els
}

export function buildElementsDownward(profile: FullProfile, loadedIds: Set<string>): GraphElement[] {
  const els: GraphElement[] = [...membershipElements(profile, loadedIds)]
  const { entity, subsidiaries = [] } = profile
  for (const sub of subsidiaries) {
    els.push(...ownershipElements(entity.id, sub.entity, sub.relationship, 'out', loadedIds))
  }
  return els
}

export interface PersonData {
  person?: Person
  [key: string]: unknown
}

export interface OwnershipItem {
  entity?: Entity
  owned_entity?: Entity
  // The full relationship, not a two-field redeclaration: a narrowed copy was
  // the fourth parallel shape of OwnsRelationship, and its narrowness forced
  // an inline cast wherever a third field was needed.
  relationship?: OwnsRelationship
}

// Build the graph around a person from their full-profile: the person node plus
// an entity node + owns edge for every entity they OWN. The graph is ownership-
// only — positions/roles (companies they merely lead) are shown in the panel,
// not the graph. Passing a shared loadedIds set lets the person be expanded
// incrementally into an existing graph.
export function buildPersonProfileElements(profile: PersonProfile, loadedIds: Set<string> = new Set()): GraphElement[] {
  return [
    ...buildPersonElements({ person: profile.person }, profile.holdings, loadedIds),
    // A person can be a party to a filing group — three of AB InBev's nine are
    // — and this is the fifth builder that had to be told so. The helper is
    // shared precisely so the answer is the same from every entry point.
    ...membershipElements(profile, loadedIds),
  ]
}

export function buildPersonElements(
  personData: PersonData,
  ownerships: OwnershipItem[],
  loadedIds: Set<string> = new Set(),
): GraphElement[] {
  const person = personData.person || (personData as unknown as Person)
  const els: GraphElement[] = []

  if (!loadedIds.has(person.id)) {
    loadedIds.add(person.id)
    els.push({ data: { id: person.id, label: person.full_name, nodeType: 'person', raw: person } })
  }

  // Entities the person owns — the same shared emitter as every other builder,
  // so a person's holding carries exactly the fields a company's would.
  const ownList = Array.isArray(ownerships) ? ownerships : []
  for (const item of ownList) {
    const entity = item.entity || item.owned_entity
    if (!entity?.id) continue
    els.push(...ownershipElements(person.id, entity, item.relationship, 'out', loadedIds))
  }

  return els
}
