import { useState, useRef, useCallback } from 'react'
import SearchBar from './components/SearchBar'
import Graph     from './components/Graph'
import NodePanel from './components/NodePanel'
import { getFullProfile } from './services/api'

function buildElements(profile, loadedIds) {
  const els = []

  const addNode = (data) => {
    if (!loadedIds.has(data.id)) {
      loadedIds.add(data.id)
      els.push({ data })
    }
  }

  const addEdge = (data) => {
    if (!loadedIds.has(data.id)) {
      loadedIds.add(data.id)
      els.push({ data })
    }
  }

  const { entity, subsidiaries = [], executives = [], owners = [] } = profile

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
      ownershipType: sub.relationship?.ownership_type || '',
    })
  }

  for (const own of owners) {
    const owner = own.owner
    if (!owner) continue
    addNode({
      id:            owner.id,
      label:         owner.name || owner.full_name || '?',
      nodeType:      owner.first_name ? 'person' : 'entity',
      entitySubtype: owner.type || null,
      raw:           owner,
    })
    addEdge({
      id:            `${owner.id}__owns__${entity.id}`,
      source:        owner.id,
      target:        entity.id,
      label:         own.relationship?.stake_percent != null ? `${own.relationship.stake_percent}%` : '',
      edgeType:      'owns',
      ownershipType: own.relationship?.ownership_type || '',
    })
  }

  for (const exec of executives) {
    const person = exec.person
    if (!person) continue
    addNode({
      id:       person.id,
      label:    person.full_name,
      nodeType: 'person',
      raw:      person,
    })
    addEdge({
      id:       `${person.id}__role__${entity.id}`,
      source:   person.id,
      target:   entity.id,
      label:    exec.role?.role || '',
      edgeType: 'role',
    })
  }

  return els
}

export default function App() {
  const [elements,     setElements]     = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const loadedIds = useRef(new Set())

  const loadEntity = useCallback(async (entityId) => {
    const { data: profile } = await getFullProfile(entityId)
    return buildElements(profile, loadedIds.current)
  }, [])

  const handleSearchSelect = useCallback(async (result) => {
    setError(null)
    setSelectedNode(null)

    if (result.type === 'Person') {
      setSelectedNode({ id: result.node.id, nodeType: 'person', raw: result.node })
      return
    }

    setLoading(true)
    loadedIds.current = new Set()
    try {
      const els = await loadEntity(result.node.id)
      setElements(els)
    } catch {
      setError('Could not load entity. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [loadEntity])

  const handleExpand = useCallback(async (entityId) => {
    setError(null)
    setLoading(true)
    try {
      const newEls = await loadEntity(entityId)
      if (newEls.length > 0) {
        setElements(prev => [...prev, ...newEls])
      }
    } catch {
      setError('Could not expand node.')
    } finally {
      setLoading(false)
    }
  }, [loadEntity])

  const handleNodeClick = useCallback((nodeData) => {
    setSelectedNode(nodeData)
  }, [])

  return (
    <div className="app">
      {loading && <div className="loading-bar" />}

      <div className="left-panel">
        <div className="left-panel__header">
          <span className="logo">Pamten</span>
          <span className="logo-sub">Ownership Graph</span>
        </div>
        <SearchBar onSelect={handleSearchSelect} />
        {error && <div className="error-msg">{error}</div>}
        <div className="left-panel__detail">
          <NodePanel node={selectedNode} onExpand={handleExpand} />
        </div>
      </div>

      <div className="right-panel">
        <Graph elements={elements} onNodeClick={handleNodeClick} />
      </div>
    </div>
  )
}
