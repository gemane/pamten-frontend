import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import { FiSearch, FiDatabase, FiGlobe, FiSettings } from 'react-icons/fi'
import SearchBar     from './components/SearchBar'
import Breadcrumb    from './components/Breadcrumb'
import Graph         from './components/Graph'
import type { GraphHandle } from './components/Graph'
import { buildCsvContent } from './utils/exportCsv'
import GraphLegend   from './components/GraphLegend'
import NodePanel     from './components/NodePanel'
import ScraperPanel  from './components/ScraperPanel'
import SettingsPanel from './components/SettingsPanel'
import MapView       from './components/MapView'
import MapPanel      from './components/MapPanel'
import AuthModal     from './components/AuthModal'
import Toast         from './components/Toast'
import { useTheme } from './hooks/useTheme'
import { AuthProvider, useAuth } from './context/AuthContext'
import { getFullProfile, getPerson, getOwners, search, getEntitiesByCountry, getCountryEntities } from './services/api'
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

function buildElementsUpward(profile: FullProfile, loadedIds: Set<string>): GraphElement[] {
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

function buildElementsDownward(profile: FullProfile, loadedIds: Set<string>): GraphElement[] {
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
      els.push({ data: {
        id: edgeId, source: person.id, target: entity.id, edgeType: 'owns',
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
      els.push({ data: { id: edgeId, source: person.id, target: entity.id, label: r.role?.role || '', edgeType: 'role' } })
    }
  }

  return els
}

interface ToastState {
  message: string
  type: string
}


function useMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

function AppInner() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const [theme, toggleTheme] = useTheme()
  const [showAuth, setShowAuth] = useState<boolean>(false)
  const isMobile = useMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab,       setActiveTab]       = useState<string>('graph')

  const [elements,        setElements]        = useState<GraphElement[]>([])
  const [centerId,        setCenterId]        = useState<string | null>(null)
  const [selectedNode,    setSelectedNode]    = useState<NodeData | null>(null)
  const [searchLabel,     setSearchLabel]     = useState<string | undefined>(undefined)
  const [navHistory,      setNavHistory]      = useState<NodeData[]>([])
  const [loading,         setLoading]         = useState<boolean>(false)
  const [expandingId,     setExpandingId]     = useState<string | null>(null)
  const [toast,           setToast]           = useState<ToastState | null>(null)
  const [countryData,     setCountryData]     = useState<CountryEntityGroup[]>([])
  const [countryLoading,  setCountryLoading]  = useState<boolean>(false)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const loadedIds   = useRef<Set<string>>(new Set())
  const elementsRef = useRef<GraphElement[]>([])
  elementsRef.current = elements
  const graphRef = useRef<GraphHandle | null>(null)

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
      try {
        const [personRes, ownersRes] = await Promise.all([
          getPerson(result.node.id),
          getOwners(result.node.id).catch(() => ({ data: [] })),
        ])
        const els = buildPersonElements(personRes.data as PersonData, ownersRes.data as OwnershipItem[])
        const newNode: NodeData = { id: result.node.id, nodeType: 'person', label: ('full_name' in result.node ? result.node.full_name : result.node.name) || '', raw: result.node }
        setCenterId(result.node.id)
        setElements(els)
        setSelectedNode(newNode)
        setNavHistory([newNode])
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
    try {
      const els = await loadEntity(result.node.id)
      const newNode: NodeData = {
        id:            result.node.id,
        label:         ('name' in result.node ? result.node.name : result.node.full_name) || '',
        nodeType:      'entity',
        entitySubtype: ('type' in result.node ? result.node.type : null),
        raw:           result.node,
      }
      setCenterId(result.node.id)
      setElements(els)
      setSelectedNode(newNode)
      setNavHistory([newNode])
    } catch {
      showToast('Could not load entity. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  const handleNavigateTo = useCallback(async (nodeData: NodeData) => {
    setToast(null)
    setSelectedNode(null)
    setSearchLabel(nodeData.label)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      if (nodeData.nodeType === 'person') {
        const [personRes, ownersRes] = await Promise.all([
          getPerson(nodeData.id),
          getOwners(nodeData.id).catch(() => ({ data: [] })),
        ])
        const els = buildPersonElements(personRes.data as PersonData, ownersRes.data as OwnershipItem[])
        setCenterId(nodeData.id)
        setElements(els)
        setSelectedNode(nodeData)
        setNavHistory(prev => [...prev, nodeData])
      } else {
        const els = await loadEntity(nodeData.id)
        setCenterId(nodeData.id)
        setElements(els)
        setSelectedNode(nodeData)
        setNavHistory(prev => [...prev, nodeData])
      }
    } catch {
      showToast('Could not load node.', 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  const handleExpand = useCallback(async (entityId: string) => {
    setExpandingId(entityId)
    try {
      const { data: profile } = await getFullProfile(entityId)
      const cur = elementsRef.current
      const isAbove = cur.some(el => {
        const d = el.data as Record<string, unknown>
        return d.source === entityId && d.edgeDir === 'in'
      })
      const isBelow = cur.some(el => {
        const d = el.data as Record<string, unknown>
        return d.target === entityId && d.edgeDir === 'out'
      })
      const newEls = isAbove && !isBelow
        ? buildElementsUpward(profile as FullProfile, loadedIds.current)
        : isBelow && !isAbove
          ? buildElementsDownward(profile as FullProfile, loadedIds.current)
          : buildElements(profile as FullProfile, loadedIds.current)
      const newNodes = newEls.filter(el => !(el.data as Record<string, unknown>).source)
      if (newNodes.length > 0) {
        setElements(prev => [...prev, ...newEls])
      } else {
        showToast('No new connections found.', 'info')
      }
    } catch {
      showToast('Could not expand node.', 'error')
    } finally {
      setExpandingId(null)
    }
  }, [showToast])

  const handleClearGraph = useCallback(() => {
    setElements([])
    setCenterId(null)
    setSelectedNode(null)
    setSearchLabel(undefined)
    setNavHistory([])
    setToast(null)
    setSidebarOpen(false)
    loadedIds.current = new Set()
  }, [])

  const handleExportPng = useCallback(() => {
    graphRef.current?.exportPng()
  }, [])

  const handleExportCsv = useCallback(() => {
    const csv = buildCsvContent(elementsRef.current, t)
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'pamten-graph.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [t])

  const handleNodeClick = useCallback((nodeData: NodeData) => {
    setSelectedNode(nodeData)
  }, [])

  const handleBreadcrumbNav = useCallback((nodeData: NodeData, index: number) => {
    // Truncate trail before the target; handleNavigateTo will append it back
    setNavHistory(prev => prev.slice(0, index))
    handleNavigateTo(nodeData)
  }, [handleNavigateTo])

  const handleExampleClick = useCallback(async (query: string) => {
    setToast(null)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      const { data: results } = await search(query)
      const entity = results.find((r: SearchResult) => r.type === 'Entity')
      if (!entity) throw new Error('not found')
      const els = await loadEntity(entity.node.id)
      const newNode: NodeData = {
        id:            entity.node.id,
        label:         ('name' in entity.node ? entity.node.name : entity.node.full_name) || '',
        nodeType:      'entity',
        entitySubtype: ('type' in entity.node ? entity.node.type : null),
        raw:           entity.node,
      }
      setCenterId(entity.node.id)
      setElements(els)
      setSelectedNode(newNode)
      setNavHistory([newNode])
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

  // Lazy-load entities for a country the first time it is selected
  useEffect(() => {
    if (!selectedCountry) return
    const already = countryData.find(d => d.country === selectedCountry)
    if (already?.entities) return
    getCountryEntities(selectedCountry)
      .then(({ data: entities }) => {
        setCountryData(prev => prev.map(d =>
          d.country === selectedCountry ? { ...d, entities } : d
        ))
      })
      .catch(() => {})
  }, [selectedCountry]) // intentionally excludes countryData to avoid re-runs

  const handleEntityFromMap = useCallback(async (entityId: string) => {
    setActiveTab('graph')
    setSelectedCountry(null)
    setToast(null)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      const els = await loadEntity(entityId)
      setCenterId(entityId)
      setElements(els)
      const center = els.find(el => (el.data as NodeData).id === entityId && !(el.data as Record<string, unknown>).source)
      if (center) {
        setSelectedNode(center.data as NodeData)
        setNavHistory([center.data as NodeData])
      }
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
      const els = await loadEntity(entity.node.id)
      setCenterId(entity.node.id)
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

      {/* Desktop sidebar — hidden on mobile */}
      {!isMobile && (
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
              <div className="tab-toggle">
                <button className={`tab-btn ${activeTab === 'graph' ? 'tab-btn--active' : ''}`} onClick={() => handleTabChange('graph')} title={t('nav.graph')}><FiSearch /></button>
                <button className={`tab-btn ${activeTab === 'map' ? 'tab-btn--active' : ''}`} onClick={() => handleTabChange('map')} title={t('nav.map')}><FiGlobe /></button>
                <button className={`tab-btn ${activeTab === 'scraper' ? 'tab-btn--active' : ''}`} onClick={() => handleTabChange('scraper')} title={t('scraper.title')}><FiDatabase /></button>
                <button className={`tab-btn ${activeTab === 'settings' ? 'tab-btn--active' : ''}`} onClick={() => handleTabChange('settings')} title={t('settings.title')}><FiSettings /></button>
              </div>
            </div>
          </div>

          {activeTab === 'graph' && (
            <>
              <Breadcrumb history={navHistory} onNavigate={handleBreadcrumbNav} />
              <div className="left-panel__detail">
                <NodePanel
                  node={selectedNode}
                  onExportPng={elements.length > 0 ? handleExportPng : undefined}
                  onExportCsv={elements.length > 0 ? handleExportCsv : undefined}
                />
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
          {activeTab === 'settings' && (
            <div className="left-panel__detail">
              <SettingsPanel
                theme={theme}
                onToggleTheme={toggleTheme}
                user={user}
                onLogin={() => setShowAuth(true)}
                onLogout={logout}
              />
            </div>
          )}
        </div>
      )}

      <div className="right-panel">
        {isMobile ? (
          /* ── Mobile layout ── */
          <>
            {activeTab === 'graph' && (
              <>
                <div className="graph-topbar">
                  <SearchBar onSelect={handleSearchSelect} selectedLabel={searchLabel} />
                </div>
                <div className="mobile-canvas">
                  {elements.length > 0 && <GraphLegend />}
                  <Graph
                    ref={graphRef}
                    elements={elements}
                    centerId={centerId}
                    selectedNode={selectedNode}
                    onNodeClick={handleNodeClick}
                    onExampleClick={handleExampleClick}
                    onClear={elements.length > 0 ? handleClearGraph : null}
                    onNavigateTo={handleNavigateTo}
                    onExpand={handleExpand}
                    expandingId={expandingId}
                    onToast={showToast}
                    theme={theme}
                  />
                </div>
                <div className="mobile-panel">
                  <Breadcrumb history={navHistory} onNavigate={handleBreadcrumbNav} />
                  <NodePanel
                    node={selectedNode}
                    onExportPng={elements.length > 0 ? handleExportPng : undefined}
                    onExportCsv={elements.length > 0 ? handleExportCsv : undefined}
                  />
                </div>
              </>
            )}
            {activeTab === 'map' && (
              <>
                <div className="mobile-canvas">
                  <MapView
                    countryData={countryData}
                    selectedCountry={selectedCountry}
                    onCountryClick={setSelectedCountry}
                    theme={theme}
                  />
                </div>
                <div className="mobile-panel">
                  <MapPanel
                    countryData={countryData}
                    selectedCountry={selectedCountry}
                    onSelectCountry={setSelectedCountry}
                    onLoadEntity={handleEntityFromMap}
                    loading={countryLoading}
                  />
                </div>
              </>
            )}
            {activeTab === 'scraper' && (
              <div className="mobile-full-panel">
                <ScraperPanel onLoadIntoGraph={handleLoadIntoGraph} user={user} />
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="mobile-full-panel">
                <SettingsPanel
                  theme={theme}
                  onToggleTheme={toggleTheme}
                  user={user}
                  onLogin={() => setShowAuth(true)}
                  onLogout={logout}
                />
              </div>
            )}
          </>
        ) : (
          /* ── Desktop layout ── */
          <>
            {activeTab === 'graph' && (
              <div className="graph-topbar">
                <SearchBar onSelect={handleSearchSelect} selectedLabel={searchLabel} />
              </div>
            )}
            <div className="graph-area">
              {activeTab === 'graph' && elements.length > 0 && <GraphLegend />}
              {activeTab === 'map'
                ? <MapView
                    countryData={countryData}
                    selectedCountry={selectedCountry}
                    onCountryClick={setSelectedCountry}
                    theme={theme}
                  />
                : <Graph
                    ref={graphRef}
                    elements={elements}
                    centerId={centerId}
                    selectedNode={selectedNode}
                    onNodeClick={handleNodeClick}
                    onExampleClick={handleExampleClick}
                    onClear={elements.length > 0 ? handleClearGraph : null}
                    onNavigateTo={handleNavigateTo}
                    onExpand={handleExpand}
                    expandingId={expandingId}
                    onToast={showToast}
                    theme={theme}
                  />
              }
            </div>
          </>
        )}
      </div>

      {isMobile && (
        <nav className="app-bottom-nav">
          <button className={`bottom-nav-btn ${activeTab === 'graph' ? 'bottom-nav-btn--active' : ''}`} onClick={() => handleTabChange('graph')}>
            <FiSearch /><span>{t('nav.graph')}</span>
          </button>
          <button className={`bottom-nav-btn ${activeTab === 'map' ? 'bottom-nav-btn--active' : ''}`} onClick={() => handleTabChange('map')}>
            <FiGlobe /><span>{t('nav.map')}</span>
          </button>
          <button className={`bottom-nav-btn ${activeTab === 'scraper' ? 'bottom-nav-btn--active' : ''}`} onClick={() => handleTabChange('scraper')}>
            <FiDatabase /><span>{t('scraper.title')}</span>
          </button>
          <button className={`bottom-nav-btn ${activeTab === 'settings' ? 'bottom-nav-btn--active' : ''}`} onClick={() => handleTabChange('settings')}>
            <FiSettings /><span>{t('settings.title')}</span>
          </button>
        </nav>
      )}
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
