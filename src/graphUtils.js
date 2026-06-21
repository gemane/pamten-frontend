// Converts a full-profile API response into cytoscape elements.
// Mutates loadedIds (a Set) to track what has already been added.
// Returns only the net-new elements.
export function profileToElements(profile, loadedIds) {
  const newElements = []

  const addNode = (el) => {
    if (!loadedIds.has(el.data.id)) {
      loadedIds.add(el.data.id)
      newElements.push(el)
    }
  }

  const addEdge = (el) => {
    if (!loadedIds.has(el.data.id)) {
      loadedIds.add(el.data.id)
      newElements.push(el)
    }
  }

  const { entity, subsidiaries = [], executives = [], owners = [] } = profile

  addNode({
    data: {
      id: entity.id,
      label: entity.name,
      nodeType: 'entity',
      entitySubtype: entity.type,
      raw: entity,
    },
  })

  for (const sub of subsidiaries) {
    addNode({
      data: {
        id: sub.entity.id,
        label: sub.entity.name,
        nodeType: 'entity',
        entitySubtype: sub.entity.type,
        raw: sub.entity,
      },
    })
    addEdge({
      data: {
        id: `${entity.id}__owns__${sub.entity.id}`,
        source: entity.id,
        target: sub.entity.id,
        label: sub.relationship?.stake_percent != null
          ? `${sub.relationship.stake_percent}%`
          : 'owns',
        edgeType: 'owns',
      },
    })
  }

  for (const own of owners) {
    const owner = own.owner
    if (!owner) continue
    const ownerLabel = owner.name || owner.full_name || '?'
    const ownerType = owner.full_name ? 'person' : 'entity'
    addNode({
      data: { id: owner.id, label: ownerLabel, nodeType: ownerType, raw: owner },
    })
    addEdge({
      data: {
        id: `${owner.id}__owns__${entity.id}`,
        source: owner.id,
        target: entity.id,
        label: own.relationship?.stake_percent != null
          ? `${own.relationship.stake_percent}%`
          : 'owns',
        edgeType: 'owns',
      },
    })
  }

  for (const exec of executives) {
    const person = exec.person
    addNode({
      data: { id: person.id, label: person.full_name, nodeType: 'person', raw: person },
    })
    addEdge({
      data: {
        id: `${person.id}__role__${entity.id}`,
        source: person.id,
        target: entity.id,
        label: exec.role?.role || 'role',
        edgeType: 'role',
      },
    })
  }

  return { newElements }
}
