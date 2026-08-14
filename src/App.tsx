import { Component, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import { FiSearch, FiDatabase, FiGlobe, FiSettings, FiShare2, FiFlag } from 'react-icons/fi'
import SearchBar, { type SearchBarHandle } from './components/SearchBar'
import Breadcrumb    from './components/Breadcrumb'
import Graph         from './components/Graph'
import type { GraphHandle } from './components/Graph'
import { buildCsvContent } from './utils/exportCsv'
import GraphLegend   from './components/GraphLegend'
import NodePanel     from './components/NodePanel'
import ScrapeOverlay from './components/ScrapeOverlay'
import ScraperPanel  from './components/ScraperPanel'
import SettingsPanel from './components/SettingsPanel'
import MapView       from './components/MapView'
import MapPanel      from './components/MapPanel'
import AuthModal     from './components/AuthModal'
import ModeratorQueue from './components/ModeratorQueue'
import Toast         from './components/Toast'
import { useTheme } from './hooks/useTheme'
import { useAndroidBackButton } from './hooks/useAndroidBackButton'
import { useMobile } from './hooks/useMobile'
import { useEmailActionLinks } from './hooks/useEmailActionLinks'
import { AuthProvider, useAuth } from './context/AuthContext'
import { getFullProfile, getPersonProfile, search, getEntitiesByCountry, getCountryEntities, getEntitiesWithoutCountry, getEntitiesBySubdivision, getSubdivisionEntities, getCountries, setUnauthorizedHandler, authVerifyEmail, ensureScrape } from './services/api'
import { readMapBasis, MAP_BASIS_KEY, NO_COUNTRY, type MapBasis } from './utils/mapBasis'
import { isSubdivision } from './utils/isoSubdivisions'
import { buildContextCountries } from './utils/contextCountries'
import { canScrape } from './utils/scrapeAccess'
import { scheduleIdle } from './utils/idle'
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


function AppInner() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const [theme, themeMode, setThemeMode] = useTheme()
  const [showAuth, setShowAuth] = useState<boolean>(false)
  const [authMode, setAuthMode] = useState<'login' | 'reset'>('login')
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [showFlagQueue, setShowFlagQueue] = useState<boolean>(false)
  const canModerate = user?.role === 'moderator' || user?.role === 'admin'
  const userCanScrape = canScrape(user)
  const isMobile = useMobile()
  // Android's back gesture would otherwise close the app outright — Capacitor's
  // native bridge does not handle it, so the web layer must.
  useAndroidBackButton()
  const searchBarRef = useRef<SearchBarHandle>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab,       setActiveTab]       = useState<string>('graph')
  // Share + report (flag) tools belong to the data views, not the scraper/settings panels.
  const showShareTools = activeTab === 'graph' || activeTab === 'map'

  const [elements,        setElements]        = useState<GraphElement[]>([])
  const [centerId,        setCenterId]        = useState<string | null>(null)
  const [selectedNode,    setSelectedNode]    = useState<NodeData | null>(null)
  const [searchLabel,     setSearchLabel]     = useState<string | undefined>(undefined)
  const [navHistory,      setNavHistory]      = useState<NodeData[]>([])
  const [loading,         setLoading]         = useState<boolean>(false)
  const [expandingId,     setExpandingId]     = useState<string | null>(null)
  const [scraping,        setScraping]        = useState<boolean>(false)   // on-demand scrape in flight
  const [scrapingCompany, setScrapingCompany] = useState<string | null>(null)  // scrape in flight (prominent overlay)
  const [enrichNonce,     setEnrichNonce]     = useState<number>(0)   // bumps when a scrape appends data → NodePanel refetches
  const [toast,           setToast]           = useState<ToastState | null>(null)
  const [countryData,     setCountryData]     = useState<CountryEntityGroup[]>([])
  // Registered-in versus run-from. Persisted, because it is a way of reading the
  // map rather than a transient filter.
  const [mapBasis,        setMapBasis]        = useState<MapBasis>(readMapBasis)
  const [countryLoading,  setCountryLoading]  = useState<boolean>(false)
  // Counts per ISO 3166-2 subdivision (US-DE, CA-ON), for the countries that state
  // one. A separate list because it is a different key space: 'US-DE' is not a
  // country and must never be mixed into countryData, where MapView would try to
  // colour it.
  const [subdivisionData, setSubdivisionData] = useState<CountryEntityGroup[]>([])
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  // Country list for the search filter — fetched once here (not in SearchBar) so it's
  // available whichever tab the app opens on, not only after the graph SearchBar mounts.
  const [searchCountries, setSearchCountries] = useState<{ country: string; count: number }[]>([])
  const [mapFlyTo,        setMapFlyTo]        = useState<{ center: [number, number]; zoom: number } | null>(null)
  const loadedIds          = useRef<Set<string>>(new Set())
  // On-demand enrichment: a monotonically-increasing token invalidates a stale phase-2
  // (idle) append when the user navigates away; idleCancelRef cancels the pending idle.
  const enrichSeqRef       = useRef<number>(0)
  const idleCancelRef      = useRef<null | (() => void)>(null)
  const scrapeBarTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrapeOverlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elementsRef        = useRef<GraphElement[]>([])
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

  // Country list for the search filter — fetched once on load, independent of tab.
  useEffect(() => {
    getCountries().then(r => setSearchCountries(r.data)).catch(() => {})
  }, [])

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

  // ── On-demand enrichment ──────────────────────────────────────────────────
  // Append any newly-scraped nodes/edges to the graph without a full reset (mirrors
  // handleExpand's draft-loadedIds append), so the selected node "fills" in place.
  const appendProfile = useCallback((profile: FullProfile) => {
    const draftIds = new Set(loadedIds.current)
    const newEls = buildElements(profile, draftIds)
    if (newEls.length > 0) {
      loadedIds.current = draftIds
      setElements(prev => [...prev, ...newEls])
    }
    // A scrape just wrote new data — nudge the open NodePanel to refetch its profile so
    // the panel reflects the enrichment (it's keyed on node.id, which didn't change).
    setEnrichNonce(n => n + 1)
  }, [])

  const cancelPendingIdle = useCallback(() => {
    idleCancelRef.current?.()
    idleCancelRef.current = null
  }, [])

  // Show the top progress bar for an in-flight scrape — but only after a short delay, so
  // a fresh company (the backend answers instantly, no scrape) doesn't flash the bar.
  const startScrapeBar = useCallback(() => {
    if (scrapeBarTimer.current) return
    scrapeBarTimer.current = setTimeout(() => setScraping(true), 250)
  }, [])
  const stopScrapeBar = useCallback(() => {
    if (scrapeBarTimer.current) { clearTimeout(scrapeBarTimer.current); scrapeBarTimer.current = null }
    setScraping(false)
  }, [])

  // The prominent full-screen "Searching sources for X…" overlay for a user-initiated
  // scrape. Shown after a short delay so a fresh company (backend answers instantly, no
  // scrape) doesn't flash it — same anti-flash guard as the top bar.
  const startScrapeOverlay = useCallback((company: string) => {
    if (scrapeOverlayTimer.current) return
    scrapeOverlayTimer.current = setTimeout(() => setScrapingCompany(company), 250)
  }, [])
  const stopScrapeOverlay = useCallback(() => {
    if (scrapeOverlayTimer.current) { clearTimeout(scrapeOverlayTimer.current); scrapeOverlayTimer.current = null }
    setScrapingCompany(null)
  }, [])

  // Invalidate any in-flight enrichment (its phase-2 append) — call before a new
  // search / navigation / clear so a stale idle scrape can't append into a fresh graph.
  const resetEnrichment = useCallback(() => {
    enrichSeqRef.current += 1
    cancelPendingIdle()
    stopScrapeBar()
    stopScrapeOverlay()
  }, [cancelPendingIdle, stopScrapeBar, stopScrapeOverlay])

  useEffect(() => () => { cancelPendingIdle(); stopScrapeBar(); stopScrapeOverlay() },
    [cancelPendingIdle, stopScrapeBar, stopScrapeOverlay])  // unmount

  // Phase 2: when the UI goes idle, deepen to depth 2 and append what's new.
  const scheduleDepth2Enrich = useCallback((query: string) => {
    const token = enrichSeqRef.current
    cancelPendingIdle()
    idleCancelRef.current = scheduleIdle(async () => {
      idleCancelRef.current = null
      startScrapeBar()
      try {
        const { data } = await ensureScrape(query, 2, false)
        if (token !== enrichSeqRef.current) return       // navigated away — drop it
        if (data.scraped && data.profile) appendProfile(data.profile)
      } catch { /* best-effort — enrichment never blocks the UI */ }
      finally { stopScrapeBar() }
    })
  }, [appendProfile, cancelPendingIdle, startScrapeBar, stopScrapeBar])

  // Phase 1: enrich an already-rendered entity (depth 1), then schedule the idle deepen.
  const enrichExisting = useCallback(async (query: string, entityId: string, force = false) => {
    if (!canScrape(user)) return
    const token = enrichSeqRef.current
    setExpandingId(entityId)
    // Only an explicit refresh (force) shows the prominent "Searching sources for X…"
    // overlay — that's a deliberate re-scrape. A passive enrich-on-select mostly hits
    // already-fresh companies where the backend does NO scrape (just a DB read), so it uses
    // the subtle top bar and never flashes a misleading full-screen "fetching from Wikidata
    // / SEC" overlay for data that's already in the DB.
    if (force) startScrapeOverlay(query); else startScrapeBar()
    try {
      const { data } = await ensureScrape(query, 1, force)
      if (token !== enrichSeqRef.current) return
      if (data.scraped && data.profile) appendProfile(data.profile)
      // A forced refresh is denied within the 24h cooldown — tell the user why nothing changed.
      else if (force && data.reason === 'cooldown') showToast(t('toast.scrapeCooldown'), 'info')
    } catch { /* best-effort */ }
    finally {
      setExpandingId(cur => (cur === entityId ? null : cur))
      if (force) stopScrapeOverlay(); else stopScrapeBar()
    }
    if (token === enrichSeqRef.current) scheduleDepth2Enrich(query)
  }, [user, appendProfile, scheduleDepth2Enrich, startScrapeOverlay, stopScrapeOverlay,
      startScrapeBar, stopScrapeBar, showToast, t])

  // A search that found nothing in the DB → scrape the typed query (force, since it's
  // absent), build the fresh graph, then deepen on idle.
  // Force a fresh re-scrape of a company already in the graph (the node-panel button).
  const handleReScrape = useCallback((node: NodeData) => {
    void enrichExisting(node.label, node.id, true)
  }, [enrichExisting])

  const handleScrapeQuery = useCallback(async (query: string) => {
    if (!canScrape(user)) { setShowAuth(true); return }
    resetEnrichment()
    setToast(null)
    setSelectedNode(null)
    setSearchLabel(query)
    setScrapingCompany(query)   // prominent centered overlay while the new company is fetched
    setLoading(true)
    loadedIds.current = new Set()
    try {
      const { data } = await ensureScrape(query, 1, true)
      if (data.scraped && data.entity_id && data.profile) {
        const entity = data.profile.entity
        const newNode: NodeData = {
          id: entity.id, label: entity.name, nodeType: 'entity',
          entitySubtype: entity.type ?? null, raw: entity,
        }
        setCenterId(entity.id)
        setElements(buildElements(data.profile, loadedIds.current))
        setSelectedNode(newNode)
        setNavHistory([newNode])
        scheduleDepth2Enrich(query)
      } else {
        showToast(t('toast.scrapeNoResults', { query }), 'info')
      }
    } catch {
      showToast(t('toast.scrapeError'), 'error')
    } finally {
      setLoading(false)
      setScrapingCompany(null)
    }
  }, [user, resetEnrichment, scheduleDepth2Enrich, showToast, t])

  const handleSearchSelect = useCallback(async (result: SearchResult) => {
    resetEnrichment()
    setToast(null)
    setSelectedNode(null)
    setSearchLabel(('name' in result.node ? result.node.name : result.node.full_name) || '')

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
      // Enrich in the background if the company is stale / never on-demand-scraped —
      // the node is already on screen; this fills it, then deepens on idle.
      void enrichExisting(newNode.label, result.node.id)
    } catch {
      showToast(t('toast.entityLoadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [loadEntity, loadPerson, showToast, t, resetEnrichment, enrichExisting])

  const handleNavigateTo = useCallback(async (nodeData: NodeData) => {
    resetEnrichment()
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
  }, [loadEntity, loadPerson, showToast, resetEnrichment])

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
    resetEnrichment()
    setElements([])
    setCenterId(null)
    setSelectedNode(null)
    setSearchLabel(undefined)
    setNavHistory([])
    setToast(null)
    setSidebarOpen(false)
    loadedIds.current = new Set()
  }, [resetEnrichment])

  const handleExportPng = useCallback(() => {
    graphRef.current?.exportPng()
  }, [])

  const handleExportCsv = useCallback(() => {
    const csv = buildCsvContent(elementsRef.current, t, i18n.language)
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'owlgraph-graph.csv'
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
      setSearchLabel(newNode.label)
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
        getEntitiesByCountry(mapBasis)
          .then(({ data }) => setCountryData(data))
          .catch(() => {})
          .finally(() => setCountryLoading(false))
      }
      // Only under the registration basis: a subdivision is where a company is
      // registered, so it says nothing about where it is run. Failure is silent —
      // the breakdown is an extra, and the map is fine without it.
      if (mapBasis === 'jurisdiction' && subdivisionData.length === 0) {
        getEntitiesBySubdivision()
          .then(({ data }) => setSubdivisionData(data.filter(d => d.country)))
          .catch(() => {})
      }
    }
  }, [countryData.length, subdivisionData.length, mapBasis])

  /** The search icon. Two taps, doing different things on purpose.
   *
   * From another tab it only navigates. Raising the keyboard there would cover
   * the graph the tap just asked to see — you would have to dismiss it before
   * looking at anything, which is worse than the extra tap it saves.
   *
   * Once the graph is showing, a tap empties the field and opens the keyboard.
   * That call has to happen synchronously inside the click: a mobile browser
   * raises the keyboard only for a focus() during the user's gesture, and the
   * same call a tick later from an effect moves the cursor in silence.
   */
  const handleSearchTab = useCallback(() => {
    if (activeTab === 'graph') searchBarRef.current?.clearAndFocus()
    handleTabChange('graph')
  }, [activeTab, handleTabChange])

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
  const contextCountries = useMemo(
    () => buildContextCountries(selectedNode, elements, mapBasis, entityCountryCache.current),
    [selectedNode, elements, mapBasis],
  )
  // Fly to whichever company the map is currently about: on opening the tab, when
  // a subsidiary is clicked in the panel, and when Back restores the one before it.
  //
  // This used to be computed once, in the tab handler, from a snapshot — so
  // selecting a subsidiary left the viewport on the parent's country while the
  // panel talked about somewhere else entirely.
  const mapPrimary = contextCountries.find(
    c => c.role === 'primary' && c.lat != null && c.lng != null)
  const flyLat = mapPrimary?.lat ?? null
  const flyLng = mapPrimary?.lng ?? null
  const hasContext = !!selectedNode
  useEffect(() => {
    if (activeTab !== 'map') return
    if (flyLat != null && flyLng != null) {
      setMapFlyTo({ center: [flyLng, flyLat], zoom: 4 })
    } else if (!hasContext) {
      setMapFlyTo(null)           // nothing selected → back to the world view
    }
    // A company selected but not placeable keeps the current viewport: there is
    // nowhere to fly to, and snapping out to the world would be worse than
    // leaving the map where the reader put it.
  }, [activeTab, flyLat, flyLng, hasContext])

  /** Switching basis invalidates every count and list derived from the old one.
   *  Refetching without clearing would leave one basis's counts beside the
   *  other's entity lists — a map that looks right and is not. */
  const handleBasisChange = useCallback((basis: MapBasis) => {
    if (basis === mapBasis) return
    setMapBasis(basis)
    localStorage.setItem(MAP_BASIS_KEY, basis)
    setSelectedCountry(null)
    entityCountryCache.current.clear()
    setCountryLoading(true)
    getEntitiesByCountry(basis)
      .then(({ data }) => setCountryData(data))
      .catch(() => setCountryData([]))
      .finally(() => setCountryLoading(false))
    // Subdivisions belong to the registration basis alone. Under headquarters they
    // are dropped rather than left stale: a company registered in Delaware and run
    // from London must not appear under Delaware in a view of where things are run.
    if (basis === 'jurisdiction') {
      getEntitiesBySubdivision()
        .then(({ data }) => setSubdivisionData(data.filter(d => d.country)))
        .catch(() => setSubdivisionData([]))
    } else {
      setSubdivisionData([])
    }
  }, [mapBasis])

  // Lazy-load entities for a country the first time it is selected
  useEffect(() => {
    if (!selectedCountry) return
    // The API keys the unplaced group as country: null; the selection uses a
    // sentinel, because null already means "nothing selected" here.
    // A subdivision ('US-DE') is a row in the other list, loaded from the other
    // endpoint. Country codes are two characters and the unplaced group uses a
    // sentinel, so the hyphen tells them apart with nothing to keep in sync.
    if (isSubdivision(selectedCountry)) {
      const code = selectedCountry
      if (subdivisionData.find(d => d.country === code)?.entities) return
      getSubdivisionEntities(code)
        .then(({ data: entities }) => {
          setSubdivisionData(prev => prev.map(d =>
            d.country === code ? { ...d, entities } : d
          ))
        })
        .catch(() => {})
      return
    }
    const key = selectedCountry === NO_COUNTRY ? null : selectedCountry
    const already = countryData.find(d => d.country === key)
    if (already?.entities) return
    const load = key === null
      ? getEntitiesWithoutCountry(mapBasis)
      : getCountryEntities(key, mapBasis)
    load
      .then(({ data: entities }) => {
        setCountryData(prev => prev.map(d =>
          d.country === key ? { ...d, entities } : d
        ))
      })
      .catch(() => {})
  }, [selectedCountry, mapBasis]) // intentionally excludes countryData to avoid re-runs

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
        setSearchLabel((center.data as NodeData).label)   // keep the search field in sync on back/forward + map load
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
        setSearchLabel((center.data as NodeData).label)   // keep the search field in sync on back/forward + map load
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
    if (view.tab === 'map') {
      // Back out of a subsidiary to the company whose list it came from. The node
      // is normally already in the graph — it is how it got on screen — so this is
      // a lookup, not a fetch. A deep link into a company that was never loaded
      // falls through to restoreEntity, which loads it and selects it.
      if (view.nodeId) {
        const found = elementsRef.current.find(
          el => !('source' in el.data) && el.data.id === view.nodeId)
        if (found) setSelectedNode(found.data as NodeData)
        else if (view.nodeId !== centerIdRef.current) restoreEntity(view.nodeId, 'entity')
      } else {
        setSelectedNode(null)
      }
    }
    if (view.tab === 'graph') {
      if (view.entityId && view.entityId !== centerIdRef.current) {
        restoreEntity(view.entityId, view.entityType ?? 'entity')
      } else if (!view.entityId && centerIdRef.current) {
        handleClearGraph()
      }
    }
  }, [handleTabChange, restoreEntity, handleClearGraph])

  // Handle the emailed verification / password-reset links, once on load.
  useEmailActionLinks({
    onVerifyEmail: (token) => {
      authVerifyEmail(token)
        .then(() => showToast(t('auth.verifyOk'), 'success'))
        .catch(() => showToast(t('auth.verifyFail'), 'error'))
        .finally(() => { setAuthMode('login'); setShowAuth(true) })
    },
    onResetPassword: (token) => { setResetToken(token); setAuthMode('reset'); setShowAuth(true) },
  })

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
      // On the map, which company's subsidiaries the panel is listing. Selecting
      // one used to change nothing in the URL, so Back walked past the map.
      nodeId:     activeTab === 'map' ? selectedNode?.id : undefined,
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
  }, [activeTab, centerId, centerType, selectedCountry, selectedNode])

  return (
    <div className="app">
      {(loading || scraping) && <div className="loading-bar" />}
      {/* On mobile the canvas is only a half-screen split, so show the scrape overlay
          full-screen at the root instead of inside the small canvas. */}
      {isMobile && scrapingCompany && <ScrapeOverlay company={scrapingCompany} fullscreen />}
      {showAuth && (
        <AuthModal
          onClose={() => { setShowAuth(false); setResetToken(null); setAuthMode('login') }}
          initialMode={authMode}
          resetToken={resetToken ?? undefined}
        />
      )}
      {showFlagQueue && canModerate && <ModeratorQueue onClose={() => setShowFlagQueue(false)} />}
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
                <span className="logo">Owlgraph</span>
                <span className="logo-sub">Ownership Graph</span>
              </div>
              <div className="tab-toggle">
                <button className={`tab-btn ${activeTab === 'graph' ? 'tab-btn--active' : ''}`} onClick={handleSearchTab} title={t('nav.graph')}><FiSearch /></button>
                <button className={`tab-btn ${activeTab === 'map' ? 'tab-btn--active' : ''}`} onClick={() => handleTabChange('map')} title={t('nav.map')}><FiGlobe /></button>
                <button className={`tab-btn ${activeTab === 'scraper' ? 'tab-btn--active' : ''}`} onClick={() => handleTabChange('scraper')} title={t('scraper.title')}><FiDatabase /></button>
                <button className={`tab-btn ${activeTab === 'settings' ? 'tab-btn--active' : ''}`} onClick={() => handleTabChange('settings')} title={t('settings.title')}><FiSettings /></button>
              </div>
              {showShareTools && (
                <>
                  {canModerate && (
                    <button className="tab-btn" onClick={() => setShowFlagQueue(true)} title={t('modQueue.title')}><FiFlag /></button>
                  )}
                  <button className="tab-btn share-btn" onClick={handleShare} title={t('share.title')}><FiShare2 /></button>
                </>
              )}
            </div>
          </div>

          {activeTab === 'graph' && (
            <>
              <Breadcrumb history={navHistory} onNavigate={handleBreadcrumbNav} />
              <div className="left-panel__detail">
                <NodePanel
                  node={selectedNode}
                  refreshKey={enrichNonce}
                  onExportPng={elements.length > 0 ? handleExportPng : undefined}
                  onExportCsv={elements.length > 0 ? handleExportCsv : undefined}
                  onViewOnMap={() => handleTabChange('map')}
                  onNavigate={handleNavigateTo}
                  onReScrape={userCanScrape ? handleReScrape : undefined}
                />
              </div>
            </>
          )}
          {activeTab === 'map' && (
            <div className="left-panel__detail">
              <MapPanel
                countryData={countryData}
                subdivisionData={subdivisionData}
                selectedCountry={selectedCountry}
                onSelectCountry={setSelectedCountry}
                onLoadEntity={handleEntityFromMap}
                basis={mapBasis}
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
                themeMode={themeMode}
                onSetThemeMode={setThemeMode}
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
                  <SearchBar ref={searchBarRef} onSelect={handleSearchSelect} selectedLabel={searchLabel} countries={searchCountries} onScrapeQuery={handleScrapeQuery} canScrape={userCanScrape} onRequestLogin={() => setShowAuth(true)} />
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
                    refreshKey={enrichNonce}
                    onExportPng={elements.length > 0 ? handleExportPng : undefined}
                    onExportCsv={elements.length > 0 ? handleExportCsv : undefined}
                    onViewOnMap={() => handleTabChange('map')}
                    onNavigate={handleNavigateTo}
                    onReScrape={userCanScrape ? handleReScrape : undefined}
                  />
                </div>
              </>
            )}
            {activeTab === 'map' && (
              <>
                <div className="mobile-canvas">
                  <MapView
                    countryData={countryData}
                    subdivisionData={subdivisionData}
                    selectedCountry={selectedCountry}
                    onCountryClick={setSelectedCountry}
                    basis={mapBasis}
                    onBasisChange={handleBasisChange}
                    contextCountries={contextCountries}
                    theme={theme}
                    flyTo={mapFlyTo}
                  />
                </div>
                <div className="mobile-panel">
                  <MapPanel
                    countryData={countryData}
                    subdivisionData={subdivisionData}
                    selectedCountry={selectedCountry}
                    onSelectCountry={setSelectedCountry}
                    onLoadEntity={handleEntityFromMap}
                    basis={mapBasis}
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
                  themeMode={themeMode}
                  onSetThemeMode={setThemeMode}
                  user={user}
                  onLogin={() => setShowAuth(true)}
                  onLogout={logout}
                />
              </div>
            )}
            {showShareTools && (
              <>
                {canModerate && (
                  <button className="mobile-share-fab mobile-flag-fab" onClick={() => setShowFlagQueue(true)} title={t('modQueue.title')}>
                    <FiFlag />
                  </button>
                )}
                <button className="mobile-share-fab" onClick={handleShare} title={t('share.title')}>
                  <FiShare2 />
                </button>
              </>
            )}
          </>
        ) : (
          /* ── Desktop layout ── */
          <>
            {activeTab === 'graph' && (
              <div className="graph-topbar">
                <SearchBar ref={searchBarRef} onSelect={handleSearchSelect} selectedLabel={searchLabel} countries={searchCountries} onScrapeQuery={handleScrapeQuery} canScrape={userCanScrape} onRequestLogin={() => setShowAuth(true)} />
              </div>
            )}
            <div className="graph-area">
              {activeTab === 'graph' && elements.length > 0 && <GraphLegend />}
              {activeTab === 'map'
                ? <MapView
                    countryData={countryData}
                    subdivisionData={subdivisionData}
                    selectedCountry={selectedCountry}
                    onCountryClick={setSelectedCountry}
                    basis={mapBasis}
                    onBasisChange={handleBasisChange}
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
              {activeTab === 'graph' && scrapingCompany && <ScrapeOverlay company={scrapingCompany} />}
            </div>
          </>
        )}
      </div>

      {isMobile && (
        <nav className="app-bottom-nav">
          <button className={`bottom-nav-btn ${activeTab === 'graph' ? 'bottom-nav-btn--active' : ''}`} onClick={handleSearchTab}>
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
