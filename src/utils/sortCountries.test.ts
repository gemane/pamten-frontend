import { describe, it, expect } from 'vitest'
import { sortCountries } from './sortCountries'
import type { CountryEntityGroup } from '../types'

const data: CountryEntityGroup[] = [
  { country: 'AT', count: 5 },   // Austria
  { country: 'US', count: 42 },  // United States
  { country: 'DE', count: 5 },   // Germany
  { country: 'BE', count: 17 },  // Belgium
]

describe('sortCountries', () => {
  it('sorts by count descending with alphabetical tie-break', () => {
    const sorted = sortCountries(data, 'count', 'en')
    expect(sorted.map(d => d.country)).toEqual(['US', 'BE', 'AT', 'DE'])
  })

  it('sorts alphabetically by display name, not by code', () => {
    const sorted = sortCountries(data, 'name', 'en')
    // Austria, Belgium, Germany (DE would sort before US by code, but
    // Germany > Belgium by name), United States
    expect(sorted.map(d => d.country)).toEqual(['AT', 'BE', 'DE', 'US'])
  })

  it('does not mutate the input array', () => {
    const copy = [...data]
    sortCountries(data, 'name', 'en')
    expect(data).toEqual(copy)
  })

  it('handles empty input', () => {
    expect(sortCountries([], 'count')).toEqual([])
  })
})
