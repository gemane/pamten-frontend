/**
 * Companies that share a name inside one list or one graph, told apart by
 * their country.
 *
 * A subsidiary list can give one name in two countries — Lavoro lists
 * "Agrointegral Andina S.A.S." in Colombia and in Ecuador, Perfect Corp. a
 * "Perfect Corp." in Japan, the US and France — and the backend keeps one
 * company per country. Side by side they would read as the same company
 * twice, so each of them shows its country after the name. Only then: a name
 * no other company in the same view carries stays as it is.
 */
import type { GraphElement } from '../types'
import { entityLabel } from './displayName'
import { countryName } from './isoCountries'

type Placed = { id: string; name?: string | null; other_names?: readonly string[] | null;
                country?: string | null }

/** id → the country name that tells it apart from a namesake in `entities`.
 *  A namesake without a country gets nothing: there is nothing to show. */
export function namesakeCountries(entities: readonly (Placed | null | undefined)[],
                                  locale?: string): Map<string, string> {
  const byName = new Map<string, Placed[]>()
  for (const e of entities) {
    if (!e?.id) continue
    const key = entityLabel(e).trim().toLocaleLowerCase()
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key)!.push(e)
  }
  const out = new Map<string, string>()
  for (const group of byName.values()) {
    // one country among them (the same company twice, or namesakes in one
    // country), or none: the country does not tell them apart
    if (new Set(group.map(e => e.country ?? '')).size < 2) continue
    for (const e of group) {
      if (e.country) out.set(e.id, countryName(e.country, locale))
    }
  }
  return out
}

/** The label with the country after it, where a namesake needs it. */
export function withCountry(label: string, country: string | undefined): string {
  return country ? `${label} (${country})` : label
}

/** The graph's elements with each namesake entity's label carrying its
 *  country. Elements that need nothing are passed through as they are (same
 *  objects), so the list is new only when a label changes. */
export function relabelNamesakes(elements: GraphElement[], locale?: string): GraphElement[] {
  const entities: Placed[] = []
  for (const el of elements) {
    const d = el.data as { id?: string; nodeType?: string; raw?: Placed; source?: string }
    if (d.source === undefined && d.nodeType === 'entity' && d.raw && d.id) entities.push({ ...d.raw, id: d.id })
  }
  const places = namesakeCountries(entities, locale)
  if (places.size === 0) return elements
  return elements.map(el => {
    const d = el.data as { id?: string; label?: string; source?: string }
    const place = d.source === undefined && d.id ? places.get(d.id) : undefined
    return place ? { ...el, data: { ...el.data, label: withCountry(d.label ?? '', place) } } as GraphElement : el
  })
}
