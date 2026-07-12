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
  const byName = (a: CountryEntityGroup, b: CountryEntityGroup) =>
    countryName(a.country, locale).localeCompare(countryName(b.country, locale), locale)
  const arr = [...data]
  arr.sort(by === 'name' ? byName : (a, b) => b.count - a.count || byName(a, b))
  return arr
}
