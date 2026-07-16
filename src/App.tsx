import { Component, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import { FiSearch, FiDatabase, FiGlobe, FiSettings, FiShare2 } from 'react-icons/fi'
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
import { getFullProfile, getPersonProfile, search, getEntitiesByCountry, getCountryEntities, setUnauthorizedHandler } from './services/api'
import type {
  GraphElement,
  NodeData,
  FullProfile,
  SearchResult,
  CountryEntityGroup,
  ContextCountry,
  Entity,
  Person,
} from './types'
import {
  buildElements,
  buildElementsUpward,
  buildElementsDownward,
  buildPersonProfileElements,
} from './utils/buildElements'
import { buildHash, parseHash, type ViewState } from './utils/viewHash'
import { shareLink } from './utils/shareLink'

interface ToastState {
  message: string
  type: string
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(_err: Error, info: ErrorInfo) { console.error('React render error:', info.componentStack) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#e87c6e', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <strong>Render error — please reload the page.</strong>{'\n\n'}
          {String(this.state.error)}
        </div>
      )
    }
    return this.props.children
  }
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
  const [mapFlyTo,        setMapFlyTo]        = useState<{ center: [number, number]; zoom: number } | null>(null)
  const loadedIds          = useRef<Set<string>>(new Set())
  const elementsRef        = useRef<GraphElement[]>([])
  const contextCountriesRef = useRef<ContextCountry[]>([])
  elementsRef.current = elements
  // Cache entity→country resolved during contextCountries so subsidiaries can use it when selected
  const entityCountryCache = useRef<Map<string, { country: string; lat?: number; lng?: number }>>(new Map())
  const graphRef = useRef<GraphHandle | null>(null)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout()
      setShowAuth(true)
    })
  }, [logout])

  const showToast = useCallback((message: string, type = 'info') => {
    setToast({ message, type })
  }, [])

  const loadEntity = useCallback(async (entityId: string): Promise<GraphElement[]> => {
    const { data: profile } = await getFullProfile(entityId)
    return buildElements(profile, loadedIds.current)
  }, [])

  // Build the graph around a person: their positions (role edges) and
  // ownerships (owns edges) as connected entity nodes.
  const loadPerson = useCallback(async (personId: string): Promise<{ els: GraphElement[]; person: Person }> => {
    const { data: profile } = await getPersonProfile(personId)
    return { els: buildPersonProfileElements(profile, loadedIds.current), person: profile.person }
  }, [])

  const handleSearchSelect = useCallback(async (result: SearchResult) => {
    setToast(null)
    setSelectedNode(null)

    if (result.type === 'Person') {
      setLoading(true)
      loadedIds.current = new Set()
      try {
        const { els, person } = await loadPerson(result.node.id)
        const newNode: NodeData = { id: person.id, nodeType: 'person', label: person.full_name, raw: person }
        setCenterId(person.id)
        setElements(els)
        setSelectedNode(newNode)
        setNavHistory([newNode])
      } catch {
        showToast(t('toast.personGraphError'), 'error')
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
      showToast(t('toast.entityLoadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, loadPerson, showToast])

  const handleNavigateTo = useCallback(async (nodeData: NodeData) => {
    setToast(null)
    setSelectedNode(null)
    setSearchLabel(nodeData.label)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      if (nodeData.nodeType === 'person') {
        const { els } = await loadPerson(nodeData.id)
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
      showToast(t('toast.nodeLoadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, loadPerson, showToast])

  const handleExpand = useCallback(async (nodeId: string) => {
    setExpandingId(nodeId)
    try {
      // Build against a draft copy: the build functions mark every ID they
      // emit, so mutating loadedIds directly and then discarding the elements
      // would make those edges unloadable forever.
      const draftIds = new Set(loadedIds.current)
      const node = elementsRef.current.find(el => !('source' in el.data) && el.data.id === nodeId)
      let newEls: GraphElement[]
      if (node && (node.data as NodeData).nodeType === 'person') {
        // Person: pull in their positions/ownerships around the existing graph.
        const { data: profile } = await getPersonProfile(nodeId)
        newEls = buildPersonProfileElements(profile, draftIds)
      } else {
        const { data: profile } = await getFullProfile(nodeId)
        const cur = elementsRef.current
        const isAbove = cur.some(el =>
          'source' in el.data && el.data.source === nodeId && el.data.edgeDir === 'in')
        const isBelow = cur.some(el =>
          'source' in el.data && el.data.target === nodeId && el.data.edgeDir === 'out')
        newEls = isAbove && !isBelow
          ? buildElementsUpward(profile as FullProfile, draftIds)
          : isBelow && !isAbove
            ? buildElementsDownward(profile as FullProfile, draftIds)
            : buildElements(profile as FullProfile, draftIds)
      }
      if (newEls.length > 0) {
        loadedIds.current = draftIds
        setElements(prev => [...prev, ...newEls])
      } else {
        showToast(t('toast.noNewConnections'), 'info')
      }
    } catch {
      showToast(t('toast.expandError'), 'error')
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
    const csv = buildCsvContent(elementsRef.current, t, i18n.language)
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'pamten-graph.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [t])

  const handleShare = useCallback(async () => {
    const outcome = await shareLink(window.location.href, isMobile)
    if (outcome === 'copied')      showToast(t('share.copied'), 'success')
    else if (outcome === 'failed') showToast(t('share.error'), 'error')
    // 'shared' / 'dismissed': the native share sheet provides its own feedback
  }, [isMobile, showToast, t])

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
      showToast(t('toast.noResults', { query }), 'info')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab)
    if (tab === 'map') {
      if (countryData.length === 0) {
        setCountryLoading(true)
        getEntitiesByCountry()
          .then(({ data }) => setCountryData(data))
          .catch(() => {})
          .finally(() => setCountryLoading(false))
      }
      const primary = contextCountriesRef.current.find(c => c.role === 'primary' && c.lat != null && c.lng != null)
      setMapFlyTo(primary ? { center: [primary.lng!, primary.lat!], zoom: 4 } : null)
    }
  }, [countryData.length])

  // Subsidiary NodeData for the MapPanel list when a company is selected
  const contextSubsidiaries = useMemo((): NodeData[] => {
    if (!selectedNode || selectedNode.nodeType !== 'entity') return []
    const subsidiaryIds = new Set<string>()
    for (const el of elements) {
      const d = el.data
      if ('source' in d && d.source === selectedNode.id && d.edgeDir === 'out') {
        subsidiaryIds.add(d.target)
      }
    }
    return elements
      .filter(el => {
        const d = el.data as NodeData & Record<string, unknown>
        return !d.source && subsidiaryIds.has(d.id) && d.nodeType === 'entity'
      })
      .map(el => el.data as NodeData)
  }, [selectedNode, elements])

  // Countries to highlight on the map based on the selected graph node
  const contextCountries = useMemo((): ContextCountry[] => {
    if (!selectedNode || selectedNode.nodeType !== 'entity') return []
    const result: ContextCountry[] = []
    const seen = new Set<string>()
    const cache = entityCountryCache.current

    const addEntity = (raw: Entity, id: string, role: 'primary' | 'subsidiary') => {
      const country = raw.hq_country || raw.country || cache.get(id)?.country
      if (!country) return
      const lat = raw.hq_lat ?? cache.get(id)?.lat
      const lng = raw.hq_lng ?? cache.get(id)?.lng
      const key = `${role}:${country}`
      if (seen.has(key)) return
      seen.add(key)
      cache.set(id, { country, lat, lng })
      result.push({ country, role, lat, lng, label: raw.name })
    }

    addEntity(selectedNode.raw as Entity, selectedNode.id, 'primary')

    // Collect IDs of direct subsidiaries (outbound ownership edges)
    const subsidiaryIds = new Set<string>()
    for (const el of elements) {
      const d = el.data
      if ('source' in d && d.source === selectedNode.id && d.edgeDir === 'out') {
        subsidiaryIds.add(d.target)
      }
    }

    for (const el of elements) {
      const d = el.data as NodeData & Record<string, unknown>
      if (!d.source && subsidiaryIds.has(d.id) && d.nodeType === 'entity' && d.raw) {
        addEntity(d.raw as Entity, d.id as string, 'subsidiary')
      }
    }

    return result
  }, [selectedNode, elements])
  contextCountriesRef.current = contextCountries

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
      const center = els.find(el => !('source' in el.data) && el.data.id === entityId)
      if (center) {
        setSelectedNode(center.data as NodeData)
        setNavHistory([center.data as NodeData])
      }
    } catch {
      showToast(t('toast.entityIntoGraphError'), 'error')
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
      showToast(t('toast.loadedIntoGraph', { query: queryStr }), 'success')
    } catch {
      showToast(t('toast.scrapedIntoGraphError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, showToast])

  // ── Browser history integration ──────────────────────────────────────────
  // Navigation state (tab, centered node, selected country) is mirrored into
  // location.hash so back/forward walk through views and hashes deep-link.

  const centerType = useMemo((): 'entity' | 'person' | undefined => {
    if (!centerId) return undefined
    const center = elements.find(el => !('source' in el.data) && el.data.id === centerId)
    return center ? (center.data as NodeData).nodeType : undefined
  }, [elements, centerId])

  const centerIdRef = useRef<string | null>(null)
  centerIdRef.current = centerId
  // While a popstate/deep-link restore is in flight, URL pushes are suppressed
  // until app state has caught up with this target hash.
  const restoreTargetRef = useRef<string | null>(null)

  const restoreEntity = useCallback(async (entityId: string, entityType: 'entity' | 'person') => {
    setToast(null)
    setSelectedNode(null)
    setLoading(true)
    loadedIds.current = new Set()
    try {
      let els: GraphElement[]
      if (entityType === 'person') {
        els = (await loadPerson(entityId)).els
      } else {
        els = await loadEntity(entityId)
      }
      setCenterId(entityId)
      setElements(els)
      const center = els.find(el => !('source' in el.data) && el.data.id === entityId)
      if (center) {
        setSelectedNode(center.data as NodeData)
        setNavHistory([center.data as NodeData])
      }
    } catch {
      restoreTargetRef.current = null  // give up so normal URL syncing resumes
      showToast(t('toast.entityLoadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, loadPerson, showToast])

  const applyView = useCallback((view: ViewState) => {
    handleTabChange(view.tab)
    setSelectedCountry(view.tab === 'map' ? (view.country ?? null) : null)
    if (view.tab === 'graph') {
      if (view.entityId && view.entityId !== centerIdRef.current) {
        restoreEntity(view.entityId, view.entityType ?? 'entity')
      } else if (!view.entityId && centerIdRef.current) {
        handleClearGraph()
      }
    }
  }, [handleTabChange, restoreEntity, handleClearGraph])

  // Restore a deep link once on load (runs before the URL-sync effect below).
  const didInitViewRef = useRef(false)
  useEffect(() => {
    if (didInitViewRef.current) return
    didInitViewRef.current = true
    const view = parseHash(window.location.hash)
    const target = buildHash(view)
    if (target !== '#graph') {
      restoreTargetRef.current = target
      applyView(view)
    }
  }, [applyView])

  useEffect(() => {
    const onPop = () => {
      const view = parseHash(window.location.hash)
      restoreTargetRef.current = buildHash(view)
      applyView(view)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [applyView])

  // Push a history entry whenever the view changes (except during restores).
  useEffect(() => {
    const hash = buildHash({
      tab:        activeTab,
      entityId:   centerId ?? undefined,
      entityType: centerType,
      country:    selectedCountry ?? undefined,
    })
    if (restoreTargetRef.current) {
      if (hash === restoreTargetRef.current) restoreTargetRef.current = null
      return
    }
    if (window.location.hash === hash) return
    if (window.location.hash === '') {
      window.history.replaceState(null, '', hash)  // normalize the landing entry
    } else {
      window.history.pushState(null, '', hash)
    }
  }, [activeTab, centerId, centerType, selectedCountry])

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
                title={t('nav.home')}
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
              <button className="tab-btn share-btn" onClick={handleShare} title={t('share.title')}><FiShare2 /></button>
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
                  onViewOnMap={() => handleTabChange('map')}
                  onNavigate={handleNavigateTo}
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
                contextNode={selectedNode}
                contextSubsidiaries={contextSubsidiaries}
                onSelectSubsidiary={setSelectedNode}
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
                    onViewOnMap={() => handleTabChange('map')}
                    onNavigate={handleNavigateTo}
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
                    contextCountries={contextCountries}
                    theme={theme}
                    flyTo={mapFlyTo}
                  />
                </div>
                <div className="mobile-panel">
                  <MapPanel
                    countryData={countryData}
                    selectedCountry={selectedCountry}
                    onSelectCountry={setSelectedCountry}
                    onLoadEntity={handleEntityFromMap}
                    loading={countryLoading}
                    contextNode={selectedNode}
                    contextSubsidiaries={contextSubsidiaries}
                    onSelectSubsidiary={setSelectedNode}
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
            <button className="mobile-share-fab" onClick={handleShare} title={t('share.title')}>
              <FiShare2 />
            </button>
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
                    contextCountries={contextCountries}
                    theme={theme}
                    flyTo={mapFlyTo}
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
    <ErrorBoundary>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ErrorBoundary>
  )
}
