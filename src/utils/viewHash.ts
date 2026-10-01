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
//   #graph/e/<id>/all   …with the whole subsidiary tree ("all levels")
//   #graph/e/<id>/asof/2019-12-31   …as it stood on that day (time travel)
//   #graph/e/<id>/all/asof/2019-12-31   both
//   #map                world map
//   #map/c/<country>    map with a country selected
//   #map/n/<id>         map showing one company and its subsidiaries
//   #scraper, #settings

import { isAsOf } from './asOf'

export interface ViewState {
  tab: string
  entityId?: string
  entityType?: 'entity' | 'person'
  country?: string
  /** The company whose subsidiaries the map panel is listing.
   *
   *  It belongs in the URL because it is a *view*, not a detail: clicking a
   *  subsidiary in that list changes what the whole panel shows. Without it,
   *  selecting one pushed no history entry, so Back skipped the map entirely
   *  and landed on whatever came before it — the graph — while the panel still
   *  showed the subsidiary. */
  nodeId?: string
  /** "All levels": the whole subsidiary tree below the centre. In the URL so a
   *  tree view survives a reload and can be linked to. */
  allLevels?: boolean
  /** The day the graph shows (time travel), YYYY-MM-DD; absent = the present.
   *  In the URL so Back walks from the past to the present and a link to a
   *  past view opens as one. */
  asOf?: string
}

const TABS = new Set(['graph', 'map', 'scraper', 'settings', 'coverage'])

export function buildHash(view: ViewState): string {
  if (view.tab === 'graph' && view.entityId) {
    const kind = view.entityType === 'person' ? 'p' : 'e'
    const base = `#graph/${kind}/${encodeURIComponent(view.entityId)}${view.allLevels ? '/all' : ''}`
    return view.asOf && isAsOf(view.asOf) ? `${base}/asof/${view.asOf}` : base
  }
  // The context node wins over a selected country, because the panel shows it
  // that way round: a company's subsidiary list replaces the country list.
  if (view.tab === 'map' && view.nodeId) {
    return `#map/n/${encodeURIComponent(view.nodeId)}`
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
      ...(parts[3] === 'all' ? { allLevels: true } : {}),
      // the day follows the entity, or the /all that follows it
      ...(() => {
        const i = parts[3] === 'all' ? 4 : 3
        return parts[i] === 'asof' && isAsOf(parts[i + 1]) ? { asOf: parts[i + 1] } : {}
      })(),
    }
  }
  if (tab === 'map' && parts[1] === 'c' && parts[2]) {
    return { tab, country: decodeURIComponent(parts[2]) }
  }
  if (tab === 'map' && parts[1] === 'n' && parts[2]) {
    return { tab, nodeId: decodeURIComponent(parts[2]) }
  }
  return { tab }
}
