import { countryName } from './isoCountries'
import type { Entity, NodeData } from '../types'

/**
 * Which country a company is shown under on the map.
 *
 * `jurisdiction` is where it is registered, `hq` where it is actually run. They
 * differ exactly where it is interesting: BARCLAYS CAPITAL (CAYMAN) LIMITED is
 * registered in KY and run from GB.
 */
export type MapBasis = 'jurisdiction' | 'hq'

export const MAP_BASIS_KEY = 'map-basis'

/**
 * Selection value for the "not recorded" group.
 *
 * The API represents that group as `country: null`, which is the honest shape
 * there. It cannot be reused for the *selection*, because `selectedCountry` has
 * always used null to mean "nothing selected" — reusing it would open the group
 * on page load. So the UI carries a sentinel and converts at the boundary.
 */
export const NO_COUNTRY = '__no-country__'

/** The stored choice, defaulting to jurisdiction — what the map has always shown. */
export function readMapBasis(): MapBasis {
  return localStorage.getItem(MAP_BASIS_KEY) === 'hq' ? 'hq' : 'jurisdiction'
}

/**
 * The country to show a company under, or null if that basis does not know.
 *
 * Deliberately **not** `hq_country || country`. Falling back would put a company
 * with no recorded headquarters under its registration country as though it were
 * run there, which is the very distinction the switch exists to draw — and there
 * would be no way to tell a real headquarters from a guessed one.
 */
export function basisCountry(entity: Entity | undefined | null, basis: MapBasis): string | null {
  const value = basis === 'hq' ? entity?.hq_country : entity?.country
  return value?.trim() ? value : null
}

/**
 * Order subsidiaries so the countries with the most of them come first.
 *
 * Answers "where is this group concentrated" at a glance, which a list in graph
 * order cannot. Within a country, by company name. Subsidiaries the basis cannot
 * place go last rather than being dropped — they are still subsidiaries, and the
 * map already hides them.
 */
export function sortSubsidiaries(
  subs: NodeData[],
  basis: MapBasis,
  locale?: string,
): NodeData[] {
  const countryOf = (s: NodeData) => basisCountry(s.raw as Entity, basis)

  const sizes = new Map<string, number>()
  for (const s of subs) {
    const c = countryOf(s)
    if (c) sizes.set(c, (sizes.get(c) ?? 0) + 1)
  }

  return [...subs].sort((a, b) => {
    const ca = countryOf(a)
    const cb = countryOf(b)
    if (ca === null || cb === null) {
      // Unplaceable last; two unplaceable fall through to the name comparison.
      if (ca !== cb) return ca === null ? 1 : -1
    } else if (ca !== cb) {
      const bySize = (sizes.get(cb) ?? 0) - (sizes.get(ca) ?? 0)
      if (bySize !== 0) return bySize
      const byCountry = countryName(ca, locale).localeCompare(countryName(cb, locale), locale)
      if (byCountry !== 0) return byCountry
    }
    return (a.label || '').localeCompare(b.label || '', locale)
  })
}
