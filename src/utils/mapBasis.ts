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
 * Where to put this company's pin for the selected basis — its headquarters, or
 * its registered office.
 *
 * Two genuinely different places, and the gap between them is the finding:
 * BARCLAYS CAPITAL (CAYMAN) LIMITED is registered at its agent's door on Grand
 * Cayman and run from London.
 *
 * Same rule as `basisCountry`: **no fallback**. Showing the headquarters pin
 * under Registered would put a company at an address the register never gave,
 * and nothing on screen would say so. Null means "we cannot place it here" —
 * the country still shades, there is simply no pin.
 */
export function basisCoords(
  entity: Entity | undefined | null,
  basis: MapBasis,
): { lat: number; lng: number; precise: boolean } | null {
  const lat = basis === 'hq' ? entity?.hq_lat : entity?.reg_lat
  const lng = basis === 'hq' ? entity?.hq_lng : entity?.reg_lng
  if (lat == null || lng == null) return null
  const precision = basis === 'hq' ? entity?.hq_geo_precision : entity?.reg_geo_precision
  return { lat, lng, precise: precision === 'exact' }
}

/**
 * The address the pin stands on for this basis: the headquarters street address,
 * or the registered office.
 *
 * Same no-fallback rule as the rest of the switch. Showing an HQ street under
 * Registered would caption a Cayman pin with a London address — the two are
 * different places, which is the entire reason the switch exists.
 */
export function basisAddress(entity: Entity | undefined | null, basis: MapBasis): string | null {
  // `address` is GLEIF's human-readable legal address — the registered office.
  const value = basis === 'hq' ? entity?.hq_address : entity?.address
  return value?.trim() ? value.trim() : null
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

/**
 * The colour of a company on the map — its pin, and the dot beside its name in
 * the panel.
 *
 * Violet under Registered, amber under Headquarters, lighter for the company the
 * map is about than for its subsidiaries. It lives here, beside the basis it
 * depends on, because the panel needs it as much as the map does: a list whose
 * dots disagree with the pins next to them makes the reader match names by hand.
 */
export function pinFill(role: 'primary' | 'subsidiary', basis: MapBasis): string {
  if (basis === 'jurisdiction') return role === 'primary' ? '#c084fc' : '#9333ea'
  return role === 'primary' ? '#fcd34d' : '#f59e0b'
}
