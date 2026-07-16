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

  const { entity, subsidiaries = [], owners = [] } = profile

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
  [key: string]: unknown
}

export interface OwnershipItem {
  entity?: Entity
  owned_entity?: Entity
  relationship?: { stake_percent?: number | null; ownership_type?: string | null }
}

// Build the graph around a person from their full-profile: the person node plus
// an entity node + owns edge for every entity they OWN. The graph is ownership-
// only — positions/roles (companies they merely lead) are shown in the panel,
// not the graph. Passing a shared loadedIds set lets the person be expanded
// incrementally into an existing graph.
export function buildPersonProfileElements(profile: PersonProfile, loadedIds: Set<string> = new Set()): GraphElement[] {
  return buildPersonElements({ person: profile.person }, profile.holdings, loadedIds)
}

export function buildPersonElements(
  personData: PersonData,
  ownerships: OwnershipItem[],
  loadedIds: Set<string> = new Set(),
): GraphElement[] {
  const person = personData.person || (personData as unknown as Person)
  const els: GraphElement[] = []
  const seen   = loadedIds   // node/edge ids already in the graph — only emit new ones

  const addNode = (data: NodeData) => {
    if (!seen.has(data.id)) { seen.add(data.id); els.push({ data }) }
  }
  const addEdge = (data: GraphElement['data']) => {
    if (!seen.has(data.id)) { seen.add(data.id); els.push({ data } as GraphElement) }
  }

  addNode({ id: person.id, label: person.full_name, nodeType: 'person', raw: person })

  // Entities the person owns
  const ownList = Array.isArray(ownerships) ? ownerships : []
  for (const item of ownList) {
    const entity = item.entity || item.owned_entity
    if (!entity?.id) continue
    addNode({ id: entity.id, label: entity.name, nodeType: 'entity', entitySubtype: entity.type, raw: entity })
    const stake = item.relationship?.stake_percent
    const vote  = (item.relationship as { voting_power_pct?: number | null })?.voting_power_pct
    addEdge({
      id: `${person.id}__owns__${entity.id}`, source: person.id, target: entity.id, edgeType: 'owns',
      edgeDir:        'out',   // entity is the outer node → label (stake %) near it
      label:          stake != null ? `${stake}%` : '',
      ownershipType:  item.relationship?.ownership_type || '',
      votingPowerPct: vote ?? null,
      stakePct:       stake ?? null,
    })
    if (vote != null && vote !== stake) {
      addEdge({
        id: `${person.id}__votes__${entity.id}`, source: person.id, target: entity.id,
        label: `${vote}%`, edgeType: 'votes', edgeDir: 'out', votingPowerPct: vote,
      })
    }
  }

  return els
}
