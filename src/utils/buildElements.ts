import type { GraphElement, NodeData, FullProfile, PersonProfile, Entity, Person } from '../types'

// Cytoscape element builders. Each takes a `loadedIds`/`seen` set and only
// emits nodes/edges whose id isn't already present, so a graph can be grown
// incrementally without duplicating elements.

export function buildElements(profile: FullProfile, loadedIds: Set<string>): GraphElement[] {
  const els: GraphElement[] = []

  const addNode = (data: NodeData) => {
    if (!loadedIds.has(data.id)) {
      loadedIds.add(data.id)
      els.push({ data })
    }
  }

  const addEdge = (data: GraphElement['data']) => {
    if (!loadedIds.has(data.id)) {
      loadedIds.add(data.id)
      els.push({ data } as GraphElement)
    }
  }

  const { entity, subsidiaries = [], owners = [], executives = [] } = profile

  addNode({
    id:            entity.id,
    label:         entity.name,
    nodeType:      'entity',
    entitySubtype: entity.type,
    raw:           entity,
  })

  for (const sub of subsidiaries) {
    addNode({
      id:            sub.entity.id,
      label:         sub.entity.name,
      nodeType:      'entity',
      entitySubtype: sub.entity.type,
      raw:           sub.entity,
    })
    addEdge({
      id:            `${entity.id}__owns__${sub.entity.id}`,
      source:        entity.id,
      target:        sub.entity.id,
      label:         sub.relationship?.stake_percent != null ? `${sub.relationship.stake_percent}%` : '',
      edgeType:      'owns',
      edgeDir:       'out',
      ownershipType: sub.relationship?.ownership_type || '',
      stakePct:      sub.relationship?.stake_percent ?? null,
    })
  }

  for (const own of owners) {
    const owner = own.owner
    if (!owner) continue
    const importance = own.relationship?.voting_power_pct ?? own.relationship?.stake_percent ?? 0
    addNode({
      id:            owner.id,
      label:         ('name' in owner ? owner.name : owner.full_name) || '?',
      nodeType:      'first_name' in owner ? 'person' : 'entity',
      entitySubtype: 'type' in owner ? owner.type : null,
      raw:           owner,
      importance:    importance > 0 ? importance : undefined,
    })
    const stake = own.relationship?.stake_percent
    const vote  = own.relationship?.voting_power_pct
    addEdge({
      id:             `${owner.id}__owns__${entity.id}`,
      source:         owner.id,
      target:         entity.id,
      label:          stake != null ? `${stake}%` : '',
      edgeType:       'owns',
      edgeDir:        'in',
      ownershipType:  own.relationship?.ownership_type || '',
      votingPowerPct: vote ?? null,
      stakePct:       stake ?? null,
    })
    if (vote != null && vote !== stake) {
      addEdge({
        id:             `${owner.id}__votes__${entity.id}`,
        source:         owner.id,
        target:         entity.id,
        label:          `${vote}%`,
        edgeType:       'votes',
        edgeDir:        'in',
        votingPowerPct: vote,
        stakePct:       stake ?? null,
      })
    }
  }

  // Executives / directors → person node + role edge, so a company's people are
  // in the graph and can be clicked through to (double-click a person node
  // navigates to them). Person is the outer node → role label sits near it.
  for (const ex of executives) {
    const p = ex.person
    if (!p) continue
    addNode({
      id:       p.id,
      label:    p.full_name,
      nodeType: 'person',
      raw:      p,
    })
    addEdge({
      id:       `${p.id}__role__${entity.id}`,
      source:   p.id,
      target:   entity.id,
      label:    ex.role?.role || '',
      edgeType: 'role',
      edgeDir:  'in',
    })
  }

  return els
}

export function buildElementsUpward(profile: FullProfile, loadedIds: Set<string>): GraphElement[] {
  const els: GraphElement[] = []
  const { entity, owners = [] } = profile
  for (const own of owners) {
    const owner = own.owner
    if (!owner) continue
    const importance = own.relationship?.voting_power_pct ?? own.relationship?.stake_percent ?? 0
    if (!loadedIds.has(owner.id)) {
      loadedIds.add(owner.id)
      els.push({ data: {
        id:            owner.id,
        label:         ('name' in owner ? owner.name : owner.full_name) || '?',
        nodeType:      ('first_name' in owner ? 'person' : 'entity') as 'person' | 'entity',
        entitySubtype: 'type' in owner ? owner.type : null,
        raw:           owner,
        importance:    importance > 0 ? importance : undefined,
      } })
    }
    const stake = own.relationship?.stake_percent
    const vote  = own.relationship?.voting_power_pct
    const edgeId = `${owner.id}__owns__${entity.id}`
    if (!loadedIds.has(edgeId)) {
      loadedIds.add(edgeId)
      els.push({ data: { id: edgeId, source: owner.id, target: entity.id, label: stake != null ? `${stake}%` : '', edgeType: 'owns', edgeDir: 'in', ownershipType: own.relationship?.ownership_type || '', votingPowerPct: vote ?? null, stakePct: stake ?? null } } as GraphElement)
    }
    if (vote != null && vote !== stake) {
      const votesId = `${owner.id}__votes__${entity.id}`
      if (!loadedIds.has(votesId)) {
        loadedIds.add(votesId)
        els.push({ data: { id: votesId, source: owner.id, target: entity.id, label: `${vote}%`, edgeType: 'votes', edgeDir: 'in', votingPowerPct: vote, stakePct: stake ?? null } } as GraphElement)
      }
    }
  }
  return els
}

export function buildElementsDownward(profile: FullProfile, loadedIds: Set<string>): GraphElement[] {
  const els: GraphElement[] = []
  const { entity, subsidiaries = [] } = profile
  for (const sub of subsidiaries) {
    if (!loadedIds.has(sub.entity.id)) {
      loadedIds.add(sub.entity.id)
      els.push({ data: { id: sub.entity.id, label: sub.entity.name, nodeType: 'entity', entitySubtype: sub.entity.type, raw: sub.entity } })
    }
    const edgeId = `${entity.id}__owns__${sub.entity.id}`
    if (!loadedIds.has(edgeId)) {
      loadedIds.add(edgeId)
      els.push({ data: { id: edgeId, source: entity.id, target: sub.entity.id, label: sub.relationship?.stake_percent != null ? `${sub.relationship.stake_percent}%` : '', edgeType: 'owns', edgeDir: 'out', ownershipType: sub.relationship?.ownership_type || '', stakePct: sub.relationship?.stake_percent ?? null } } as GraphElement)
    }
  }
  return els
}

export interface PersonData {
  person?: Person
  roles?: Array<{ entity: Entity; role?: { role?: string } }>
  [key: string]: unknown
}

export interface OwnershipItem {
  entity?: Entity
  owned_entity?: Entity
  relationship?: { stake_percent?: number | null; ownership_type?: string | null }
}

// Build the graph around a person from their full-profile: the person node plus
// an entity node + edge for every position they hold (role edge) and every
// entity they own (owns edge). Delegates to buildPersonElements, which maps
// positions → role edges and holdings → owns edges.
export function buildPersonProfileElements(profile: PersonProfile): GraphElement[] {
  return buildPersonElements(
    { person: profile.person, roles: profile.positions },
    profile.holdings,
  )
}

export function buildPersonElements(personData: PersonData, ownerships: OwnershipItem[]): GraphElement[] {
  const person = personData.person || (personData as unknown as Person)
  const roles  = personData.roles  || []
  const els: GraphElement[]    = []
  const seen   = new Set<string>()

  seen.add(person.id)
  els.push({ data: { id: person.id, label: person.full_name, nodeType: 'person', raw: person } })

  // Entities the person owns
  const ownList = Array.isArray(ownerships) ? ownerships : []
  for (const item of ownList) {
    const entity = item.entity || item.owned_entity
    if (!entity?.id || seen.has(entity.id)) continue
    seen.add(entity.id)
    els.push({ data: { id: entity.id, label: entity.name, nodeType: 'entity', entitySubtype: entity.type, raw: entity } })
    const edgeId = `${person.id}__owns__${entity.id}`
    if (!seen.has(edgeId)) {
      seen.add(edgeId)
      const stake = item.relationship?.stake_percent
      const vote  = (item.relationship as { voting_power_pct?: number | null })?.voting_power_pct
      els.push({ data: {
        id: edgeId, source: person.id, target: entity.id, edgeType: 'owns',
        edgeDir:        'out',   // entity is the outer node → label (stake %) near it
        label:          stake != null ? `${stake}%` : '',
        ownershipType:  item.relationship?.ownership_type || '',
        votingPowerPct: vote ?? null,
        stakePct:       stake ?? null,
      } })
      if (vote != null && vote !== stake) {
        const votesId = `${person.id}__votes__${entity.id}`
        if (!seen.has(votesId)) {
          seen.add(votesId)
          els.push({ data: {
            id: votesId, source: person.id, target: entity.id,
            label: `${vote}%`, edgeType: 'votes', edgeDir: 'in',
            votingPowerPct: vote,
          } })
        }
      }
    }
  }

  // Role relationships from person data
  for (const r of roles) {
    const entity = r.entity
    if (!entity?.id) continue
    if (!seen.has(entity.id)) {
      seen.add(entity.id)
      els.push({ data: { id: entity.id, label: entity.name, nodeType: 'entity', entitySubtype: entity.type, raw: entity } })
    }
    const edgeId = `${person.id}__role__${entity.id}`
    if (!seen.has(edgeId)) {
      seen.add(edgeId)
      els.push({ data: { id: edgeId, source: person.id, target: entity.id, label: r.role?.role || '', edgeType: 'role', edgeDir: 'out' } })
    }
  }

  return els
}
