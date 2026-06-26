import { useState, useRef, useCallback } from 'react'
import { FiSearch, FiDatabase, FiGlobe, FiLogIn, FiLogOut, FiUser, FiX } from 'react-icons/fi'
import SearchBar    from './components/SearchBar'
import Graph        from './components/Graph'
import NodePanel    from './components/NodePanel'
import ScraperPanel from './components/ScraperPanel'
import MapView      from './components/MapView'
import MapPanel     from './components/MapPanel'
import AuthModal    from './components/AuthModal'
import Toast        from './components/Toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { getFullProfile, getPerson, getOwners, search, getEntitiesByCountry } from './services/api'

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

function buildPersonElements(personData, ownerships) {
  const person = personData.person || personData
  const roles  = personData.roles  || []
  const els    = []
  const seen   = new Set()

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
      els.push({ data: {
        id: edgeId, source: person.id, target: entity.id, edgeType: 'owns',
        label: item.relationship?.stake_percent != null ? `${item.relationship.stake_percent}%` : '',
        ownershipType: item.relationship?.ownership_type || '',
      } })
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
      els.push({ data: { id: edgeId, source: person.id, target: entity.id, label: r.role?.role || '', edgeType: 'role' } })
    }
  }

  return els
}

function AppInner() {
  const { user, logout } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [activeTab,       setActiveTab]       = useState('graph')

  const [elements,        setElements]        = useState([])
  const [selectedNode,    setSelectedNode]    = useState(null)
  const [loading,         setLoading]         = useState(false)
  const [expandingId,     setExpandingId]     = useState(null)
  const [toast,           setToast]           = useState(null)
  const [countryData,     setCountryData]     = useState([])
  const [countryLoading,  setCountryLoading]  = useState(false)
  const [selectedCountry, setSelectedCountry] = useState(null)
  const loadedIds = useRef(new Set())

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type })
  }, [])

  const loadEntity = useCallback(async (entityId) => {
    const { data: profile } = await getFullProfile(entityId)
    return buildElements(profile, loadedIds.current)
  }, [])

  const handleSearchSelect = useCallback(async (result) => {
    setToast(null)
    setSelectedNode(null)

    if (result.type === 'Person') {
      setLoading(true)
      loadedIds.current = new Set()
      try {
        const [personRes, ownersRes] = await Promise.all([
          getPerson(result.node.id),
          getOwners(result.node.id).catch(() => ({ data: [] })),
        ])
        const els = buildPersonElements(personRes.data, ownersRes.data)
        setElements(els)
        setSelectedNode({ id: result.node.id, nodeType: 'person', raw: result.node })
      } catch {
        showToast('Could not load person graph.', 'error')
        setSelectedNode({ id: result.node.id, nodeType: 'person', raw: result.node })
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    loadedIds.current = new Set()
    try {
      const els = await loadEntity(result.node.id)
      setElements(els)
    } catch {
      showToast('Could not load entity. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  const handleExpand = useCallback(async (entityId) => {
    setExpandingId(entityId)
    try {
      const newEls = await loadEntity(entityId)
      if (newEls.length > 0) setElements(prev => [...prev, ...newEls])
    } catch {
      showToast('Could not expand node.', 'error')
    } finally {
      setExpandingId(null)
    }
  }, [loadEntity, showToast])

  const handleClearGraph = useCallback(() => {
    setElements([])
    setSelectedNode(null)
    setToast(null)
    loadedIds.current = new Set()
  }, [])

  const handleNodeClick = useCallback((nodeData) => {
    setSelectedNode(nodeData)
  }, [])

  const handleExampleClick = useCallback(async (query) => {
    setToast(null)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      const { data: results } = await search(query)
      const entity = results.find(r => r.type === 'Entity')
      if (!entity) throw new Error('not found')
      const els = await loadEntity(entity.node.id)
      setElements(els)
      setSelectedNode(null)
    } catch {
      showToast(`No results found for "${query}".`, 'info')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab)
    if (tab === 'map' && countryData.length === 0) {
      setCountryLoading(true)
      getEntitiesByCountry()
        .then(({ data }) => setCountryData(data))
        .catch(() => {})
        .finally(() => setCountryLoading(false))
    }
  }, [countryData.length])

  const handleEntityFromMap = useCallback(async (entityId) => {
    setActiveTab('graph')
    setSelectedCountry(null)
    setToast(null)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      const els = await loadEntity(entityId)
      setElements(els)
    } catch {
      showToast('Could not load entity into graph.', 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  const handleLoadIntoGraph = useCallback(async (queryStr) => {
    setActiveTab('graph')
    setToast(null)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      const { data: results } = await search(queryStr)
      const entity = results.find(r => r.type === 'Entity')
      if (!entity) throw new Error('Entity not found')
      const els = await loadEntity(entity.node.id)
      setElements(els)
      showToast(`Loaded ${queryStr} into graph.`, 'success')
    } catch {
      showToast('Could not load scraped entity into graph.', 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  return (
    <div className="app">
      {loading && <div className="loading-bar" />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="left-panel">
        <div className="left-panel__header">
          <div className="left-panel__header-row">
            <div className="logo-group">
              <span className="logo">Pamten</span>
              <span className="logo-sub">Ownership Graph</span>
            </div>
          </div>
          <div className="header-right">
            <div className="tab-toggle">
            <button
              className={`tab-btn ${activeTab === 'graph' ? 'tab-btn--active' : ''}`}
              onClick={() => handleTabChange('graph')}
              title="Search & graph"
            >
              <FiSearch />
            </button>
            <button
              className={`tab-btn ${activeTab === 'map' ? 'tab-btn--active' : ''}`}
              onClick={() => handleTabChange('map')}
              title="Geographic map"
            >
              <FiGlobe />
            </button>
            <button
              className={`tab-btn ${activeTab === 'scraper' ? 'tab-btn--active' : ''}`}
              onClick={() => handleTabChange('scraper')}
              title="Scraper"
            >
              <FiDatabase />
            </button>
            </div>

            {user ? (
              <div className="user-badge">
                <FiUser />
                <span className="user-badge__email">
                  {user.email.split('@')[0].split('.')[0]}
                </span>
                <span className={`user-badge__role user-badge__role--${user.role}`}>
                  {user.role}
                </span>
                <button className="user-badge__logout" onClick={logout} title="Sign out">
                  <FiLogOut />
                </button>
              </div>
            ) : (
              <button className="login-btn" onClick={() => setShowAuth(true)}>
                <FiLogIn /> Sign in
              </button>
            )}
          </div>
        </div>

        {activeTab === 'graph' && (
          <>
            <SearchBar onSelect={handleSearchSelect} />
            <div className="left-panel__detail">
              <NodePanel node={selectedNode} onExpand={handleExpand} expandingId={expandingId} />
            </div>
          </>
        )}

        {activeTab === 'map' && (
          <div className="left-panel__detail">
            <MapPanel
              countryData={countryData}
              selectedCountry={selectedCountry}
              onSelectCountry={setSelectedCountry}
              onLoadEntity={handleEntityFromMap}
              loading={countryLoading}
            />
          </div>
        )}

        {activeTab === 'scraper' && (
          <div className="left-panel__detail">
            <ScraperPanel onLoadIntoGraph={handleLoadIntoGraph} user={user} />
          </div>
        )}
      </div>

      <div className="right-panel">
        {activeTab === 'map'
          ? <MapView
              countryData={countryData}
              selectedCountry={selectedCountry}
              onCountryClick={setSelectedCountry}
            />
          : <Graph
              elements={elements}
              onNodeClick={handleNodeClick}
              onExampleClick={handleExampleClick}
              onClear={elements.length > 0 ? handleClearGraph : null}
            />
        }
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
