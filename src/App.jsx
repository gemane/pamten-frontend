import { useState, useRef, useCallback } from 'react'
import { FiSearch, FiDatabase, FiGlobe, FiLogIn, FiLogOut, FiUser } from 'react-icons/fi'
import SearchBar    from './components/SearchBar'
import Graph        from './components/Graph'
import NodePanel    from './components/NodePanel'
import ScraperPanel from './components/ScraperPanel'
import MapView      from './components/MapView'
import MapPanel     from './components/MapPanel'
import AuthModal    from './components/AuthModal'
import { AuthProvider, useAuth } from './context/AuthContext'
import { getFullProfile, search, getEntitiesByCountry } from './services/api'

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

function AppInner() {
  const { user, logout } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [activeTab,       setActiveTab]       = useState('graph')

  const [elements,        setElements]        = useState([])
  const [selectedNode,    setSelectedNode]    = useState(null)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState(null)
  const [countryData,     setCountryData]     = useState([])
  const [countryLoading,  setCountryLoading]  = useState(false)
  const [selectedCountry, setSelectedCountry] = useState(null)
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
      if (newEls.length > 0) setElements(prev => [...prev, ...newEls])
    } catch {
      setError('Could not expand node.')
    } finally {
      setLoading(false)
    }
  }, [loadEntity])

  const handleNodeClick = useCallback((nodeData) => {
    setSelectedNode(nodeData)
  }, [])

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
    setError(null)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      const els = await loadEntity(entityId)
      setElements(els)
    } catch {
      setError('Could not load entity into graph.')
    } finally {
      setLoading(false)
    }
  }, [loadEntity])

  // Called from ScraperPanel after a successful scrape
  const handleLoadIntoGraph = useCallback(async (queryStr) => {
    setActiveTab('graph')
    setError(null)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      const { data: results } = await search(queryStr)
      const entity = results.find(r => r.type === 'Entity')
      if (!entity) throw new Error('Entity not found')
      const els = await loadEntity(entity.node.id)
      setElements(els)
    } catch {
      setError('Could not load scraped entity into graph.')
    } finally {
      setLoading(false)
    }
  }, [loadEntity])

  return (
    <div className="app">
      {loading && <div className="loading-bar" />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

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
              title="Wikidata scraper"
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
            {error && <div className="error-msg">{error}</div>}
            <div className="left-panel__detail">
              <NodePanel node={selectedNode} onExpand={handleExpand} />
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
          : <Graph elements={elements} onNodeClick={handleNodeClick} />
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
