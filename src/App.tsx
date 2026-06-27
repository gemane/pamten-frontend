import { useState, useRef, useCallback } from 'react'
import { FiSearch, FiDatabase, FiGlobe, FiLogIn, FiLogOut, FiUser } from 'react-icons/fi'
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
import type {
  GraphElement,
  NodeData,
  FullProfile,
  SearchResult,
  CountryEntityGroup,
  Entity,
  Person,
} from './types'

function buildElements(profile: FullProfile, loadedIds: Set<string>): GraphElement[] {
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
    // Show vote% when available (rendered yellow on graph); fall back to stake%.
    // Cytoscape can't colour part of a label, so we don't combine them.
    const edgeLabel = vote != null ? `${vote}%`
      : stake != null ? `${stake}%`
      : ''
    addEdge({
      id:             `${owner.id}__owns__${entity.id}`,
      source:         owner.id,
      target:         entity.id,
      label:          edgeLabel,
      edgeType:       'owns',
      ownershipType:  own.relationship?.ownership_type || '',
      votingPowerPct: vote ?? null,
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

interface PersonData {
  person?: Person
  roles?: Array<{ entity: Entity; role?: { role?: string } }>
  [key: string]: unknown
}

interface OwnershipItem {
  entity?: Entity
  owned_entity?: Entity
  relationship?: { stake_percent?: number | null; ownership_type?: string | null }
}

function buildPersonElements(personData: PersonData, ownerships: OwnershipItem[]): GraphElement[] {
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
      const edgeLabel = stake != null && vote != null
        ? `${stake}% stake\n${vote}% vote`
        : stake != null ? `${stake}%`
        : vote  != null ? `${vote}% vote`
        : ''
      els.push({ data: {
        id: edgeId, source: person.id, target: entity.id, edgeType: 'owns',
        label: edgeLabel,
        ownershipType:  item.relationship?.ownership_type || '',
        votingPowerPct: vote ?? null,
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

interface ToastState {
  message: string
  type: string
}

function AppInner() {
  const { user, logout } = useAuth()
  const [showAuth, setShowAuth] = useState<boolean>(false)
  const [activeTab,       setActiveTab]       = useState<string>('graph')

  const [elements,        setElements]        = useState<GraphElement[]>([])
  const [centerId,        setCenterId]        = useState<string | null>(null)
  const [selectedNode,    setSelectedNode]    = useState<NodeData | null>(null)
  const [loading,         setLoading]         = useState<boolean>(false)
  const [expandingId,     setExpandingId]     = useState<string | null>(null)
  const [toast,           setToast]           = useState<ToastState | null>(null)
  const [countryData,     setCountryData]     = useState<CountryEntityGroup[]>([])
  const [countryLoading,  setCountryLoading]  = useState<boolean>(false)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const loadedIds = useRef<Set<string>>(new Set())

  const showToast = useCallback((message: string, type = 'info') => {
    setToast({ message, type })
  }, [])

  const loadEntity = useCallback(async (entityId: string): Promise<GraphElement[]> => {
    const { data: profile } = await getFullProfile(entityId)
    return buildElements(profile, loadedIds.current)
  }, [])

  const handleSearchSelect = useCallback(async (result: SearchResult) => {
    setToast(null)
    setSelectedNode(null)

    if (result.type === 'Person') {
      setLoading(true)
      loadedIds.current = new Set()
      setCenterId(result.node.id)
      try {
        const [personRes, ownersRes] = await Promise.all([
          getPerson(result.node.id),
          getOwners(result.node.id).catch(() => ({ data: [] })),
        ])
        const els = buildPersonElements(personRes.data as PersonData, ownersRes.data as OwnershipItem[])
        setElements(els)
        setSelectedNode({ id: result.node.id, nodeType: 'person', label: ('full_name' in result.node ? result.node.full_name : result.node.name) || '', raw: result.node })
      } catch {
        showToast('Could not load person graph.', 'error')
        setSelectedNode({ id: result.node.id, nodeType: 'person', label: ('full_name' in result.node ? result.node.full_name : result.node.name) || '', raw: result.node })
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    loadedIds.current = new Set()
    setCenterId(result.node.id)
    try {
      const els = await loadEntity(result.node.id)
      setElements(els)
      setSelectedNode({
        id:            result.node.id,
        label:         ('name' in result.node ? result.node.name : result.node.full_name) || '',
        nodeType:      'entity',
        entitySubtype: ('type' in result.node ? result.node.type : null),
        raw:           result.node,
      })
    } catch {
      showToast('Could not load entity. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  const handleExpand = useCallback(async (entityId: string) => {
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
    setCenterId(null)
    setSelectedNode(null)
    setToast(null)
    loadedIds.current = new Set()
  }, [])

  const handleNodeClick = useCallback((nodeData: NodeData) => {
    setSelectedNode(nodeData)
  }, [])

  const handleExampleClick = useCallback(async (query: string) => {
    setToast(null)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      const { data: results } = await search(query)
      const entity = results.find((r: SearchResult) => r.type === 'Entity')
      if (!entity) throw new Error('not found')
      setCenterId(entity.node.id)
      const els = await loadEntity(entity.node.id)
      setElements(els)
      setSelectedNode({
        id:            entity.node.id,
        label:         ('name' in entity.node ? entity.node.name : entity.node.full_name) || '',
        nodeType:      'entity',
        entitySubtype: ('type' in entity.node ? entity.node.type : null),
        raw:           entity.node,
      })
    } catch {
      showToast(`No results found for "${query}".`, 'info')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab)
    if (tab === 'map' && countryData.length === 0) {
      setCountryLoading(true)
      getEntitiesByCountry()
        .then(({ data }) => setCountryData(data))
        .catch(() => {})
        .finally(() => setCountryLoading(false))
    }
  }, [countryData.length])

  const handleEntityFromMap = useCallback(async (entityId: string) => {
    setActiveTab('graph')
    setSelectedCountry(null)
    setToast(null)
    setLoading(true)
    loadedIds.current = new Set()
    setCenterId(entityId)
    try {
      const els = await loadEntity(entityId)
      setElements(els)
      const center = els.find(el => (el.data as NodeData).id === entityId && !(el.data as Record<string, unknown>).source)
      if (center) setSelectedNode(center.data as NodeData)
    } catch {
      showToast('Could not load entity into graph.', 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  const handleLoadIntoGraph = useCallback(async (queryStr: string) => {
    setActiveTab('graph')
    setToast(null)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      const { data: results } = await search(queryStr)
      const entity = results.find((r: SearchResult) => r.type === 'Entity')
      if (!entity) throw new Error('Entity not found')
      setCenterId(entity.node.id)
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
            <div
              className="logo-group logo-group--clickable"
              onClick={handleClearGraph}
              title="Return to home"
            >
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
              centerId={centerId}
              onNodeClick={handleNodeClick}
              onExampleClick={handleExampleClick}
              onClear={elements.length > 0 ? handleClearGraph : null}
              onExpand={handleExpand}
              onToast={showToast}
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
