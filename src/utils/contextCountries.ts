import { basisCountry, basisCoords, type MapBasis } from './mapBasis'
import type { ContextCountry, Entity, GraphElement, NodeData } from '../types'

/** Country and coordinates remembered for an entity, so a subsidiary opened on
 *  its own still has somewhere to go. Cleared when the basis changes — the two
 *  bases place a company differently and a stale entry would mix them. */
export interface CountryCacheEntry {
  country: string
  lat?: number
  lng?: number
}

/**
 * The places to mark on the map for the selected company and its subsidiaries.
 *
 * **Everything here follows the basis, with no fallback between the two.** It
 * used to read `hq_country || country` and `hq_lat`, ignoring the basis
 * entirely — which is why switching Registered/Headquarters moved neither the
 * pins nor the country shading, and why a company with no recorded headquarters
 * was drawn at its registration country as though it were run there.
 *
 * Extracted from App so it can be tested. Inline in a `useMemo` it could not be,
 * and the bug was precisely a `useMemo` that did not list `mapBasis` among its
 * dependencies — invisible to every test that rendered the map with fixed props.
 */
export function buildContextCountries(
  selectedNode: NodeData | null,
  elements: GraphElement[],
  basis: MapBasis,
  cache: Map<string, CountryCacheEntry>,
): ContextCountry[] {
  if (!selectedNode || selectedNode.nodeType !== 'entity') return []

  const result: ContextCountry[] = []
  const seen = new Set<string>()

  const addEntity = (raw: Entity, id: string, role: 'primary' | 'subsidiary') => {
    const country = basisCountry(raw, basis) ?? cache.get(id)?.country
    if (!country) return
    const coords = basisCoords(raw, basis)
    const lat = coords?.lat ?? cache.get(id)?.lat
    const lng = coords?.lng ?? cache.get(id)?.lng
    // One marker per role and country: a parent with forty Cayman subsidiaries
    // should not stack forty pins on Grand Cayman.
    const key = `${role}:${country}`
    if (seen.has(key)) return
    seen.add(key)
    cache.set(id, { country, lat, lng })
    result.push({
      country, role, lat, lng, label: raw.name, basis,
      city: basis === 'hq' ? raw.hq_city : undefined,
      // The address the pin actually stands on, so the detail popup does not
      // caption a registered office with a headquarters street.
      hqAddress: basis === 'hq' ? raw.hq_address : raw.address,
      legalAddress: basis === 'hq' ? raw.address : undefined,
      precise: coords?.precise ?? false,
    })
  }

  addEntity(selectedNode.raw as Entity, selectedNode.id, 'primary')

  // Direct subsidiaries only — the ones this company owns, by outbound edge.
  const subsidiaryIds = new Set<string>()
  for (const el of elements) {
    const d = el.data
    if ('source' in d && d.source === selectedNode.id && d.edgeDir === 'out') {
      subsidiaryIds.add(d.target as string)
    }
  }

  for (const el of elements) {
    const d = el.data as NodeData & Record<string, unknown>
    if (!d.source && subsidiaryIds.has(d.id) && d.nodeType === 'entity' && d.raw) {
      addEntity(d.raw as Entity, d.id as string, 'subsidiary')
    }
  }

  return result
}
