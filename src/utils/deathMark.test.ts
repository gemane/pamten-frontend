import { describe, it, expect } from 'vitest'
import { deathMark, deathYear, dissolutionMark, entityBoxLabel, personBoxLabel } from './deathMark'

describe('the death mark: one rule wherever a person is named', () => {
  it('a recorded death reads "† year"; the living get nothing', () => {
    expect(deathMark({ death_date: '2018-10-15' })).toBe('\u2020 2018')
    expect(deathMark({ death_date: '1955' })).toBe('\u2020 1955')        // a year-only date
    expect(deathMark({ death_date: null })).toBeNull()
    expect(deathMark({})).toBeNull()
    expect(deathMark(null)).toBeNull()
    expect(deathYear({ death_date: 'unknown' })).toBeNull()              // not a date: no mark
  })

  it("the graph box puts the mark on its own line under the name", () => {
    expect(personBoxLabel('Paul Allen', { death_date: '2018-10-15' })).toBe('Paul Allen\n\u2020 2018')
    expect(personBoxLabel('Bill Gates', { death_date: null })).toBe('Bill Gates')
  })

  it('a dissolved company carries the same mark, at the precision the source states', () => {
    expect(dissolutionMark({ dissolved_on: '2023-03-15' })).toBe('\u2020 2023')
    expect(dissolutionMark({ dissolved_on: '2002-00-00' })).toBe('\u2020 2002')     // Wikidata's year-only date
    expect(dissolutionMark({})).toBeNull()
    expect(dissolutionMark(null)).toBeNull()
    expect(entityBoxLabel('Compaq', { dissolved_on: '2002-00-00' })).toBe('Compaq\n\u2020 2002')
    expect(entityBoxLabel('Apple Inc.', {})).toBe('Apple Inc.')
  })
})
