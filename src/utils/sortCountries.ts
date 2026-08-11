import { countryName } from './isoCountries'
import type { CountryEntityGroup } from '../types'

export type CountrySort = 'count' | 'name'

// Sort the map panel's country list either by company count (descending,
// alphabetical tie-break) or alphabetically by localized display name.
export function sortCountries(
  data: CountryEntityGroup[],
  by: CountrySort,
  locale?: string,
): CountryEntityGroup[] {
  // The "not recorded" group (country === null) has no name to sort by and is not
  // a place, so it sits at the end in both modes rather than competing for the top
  // of the list on count alone.
  const byName = (a: CountryEntityGroup, b: CountryEntityGroup) => {
    if (!a.country || !b.country) return a.country ? -1 : b.country ? 1 : 0
    return countryName(a.country, locale).localeCompare(countryName(b.country, locale), locale)
  }
  const unplaceableLast = (a: CountryEntityGroup, b: CountryEntityGroup) =>
    a.country === b.country ? 0 : !a.country ? 1 : !b.country ? -1 : 0

  const arr = [...data]
  arr.sort((a, b) =>
    unplaceableLast(a, b) || (by === 'name' ? byName(a, b) : b.count - a.count || byName(a, b)))
  return arr
}
