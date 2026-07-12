// URL-hash codec for browser history integration.
//
// The app's navigation state (active tab, centered graph node, selected map
// country) is mirrored into location.hash so the browser back/forward buttons
// walk through views, and hashes double as shareable deep links.
//
// Formats:
//   #graph              home (empty graph)
//   #graph/e/<id>       entity centered in the graph
//   #graph/p/<id>       person centered in the graph
//   #map                world map
//   #map/c/<country>    map with a country selected
//   #scraper, #settings

export interface ViewState {
  tab: string
  entityId?: string
  entityType?: 'entity' | 'person'
  country?: string
}

const TABS = new Set(['graph', 'map', 'scraper', 'settings'])

export function buildHash(view: ViewState): string {
  if (view.tab === 'graph' && view.entityId) {
    const kind = view.entityType === 'person' ? 'p' : 'e'
    return `#graph/${kind}/${encodeURIComponent(view.entityId)}`
  }
  if (view.tab === 'map' && view.country) {
    return `#map/c/${encodeURIComponent(view.country)}`
  }
  return `#${TABS.has(view.tab) ? view.tab : 'graph'}`
}

export function parseHash(hash: string): ViewState {
  const parts = hash.replace(/^#/, '').split('/')
  const tab = TABS.has(parts[0]) ? parts[0] : 'graph'

  if (tab === 'graph' && (parts[1] === 'e' || parts[1] === 'p') && parts[2]) {
    return {
      tab,
      entityId: decodeURIComponent(parts[2]),
      entityType: parts[1] === 'p' ? 'person' : 'entity',
    }
  }
  if (tab === 'map' && parts[1] === 'c' && parts[2]) {
    return { tab, country: decodeURIComponent(parts[2]) }
  }
  return { tab }
}
