import { describe, it, expect } from 'vitest'
import { ALPHA2_TO_NUMERIC, COUNTRY_NAMES, countryName, toAlpha2 } from './isoCountries'

describe('isoCountries coverage', () => {
  it('every mappable alpha-2 code has a display name (no raw codes in lists)', () => {
    const missing = Object.keys(ALPHA2_TO_NUMERIC).filter(code => !COUNTRY_NAMES[code])
    expect(missing, `codes without a display name: ${missing.join(', ')}`).toEqual([])
  })

  it('countryName maps codes and passes unknown values through', () => {
    expect(countryName('BR')).toBe('Brazil')
    expect(countryName('RO')).toBe('Romania')     // was missing before full coverage
    expect(countryName('Atlantis')).toBe('Atlantis')
  })

  it('toAlpha2 resolves codes and full names', () => {
    expect(toAlpha2('BR')).toBe('BR')
    expect(toAlpha2('Brazil')).toBe('BR')
    expect(toAlpha2('Romania')).toBe('RO')        // name lookup beyond the old 52
    expect(toAlpha2('nowhere land')).toBeNull()
  })

  it('Åland and Albania have distinct numeric ids', () => {
    expect(ALPHA2_TO_NUMERIC.AX).toBe(248)
    expect(ALPHA2_TO_NUMERIC.AL).toBe(8)
  })
})

describe('countryName localization', () => {
  it('localizes codes when a locale is given', () => {
    expect(countryName('BR', 'de')).toBe('Brasilien')
    expect(countryName('DE', 'de')).toBe('Deutschland')
    expect(countryName('AT', 'de')).toBe('Österreich')
    expect(countryName('BR', 'es')).toBe('Brasil')
    expect(countryName('US', 'en')).toBe('United States')
  })

  it('keeps English map behavior without a locale', () => {
    expect(countryName('BR')).toBe('Brazil')
  })

  it('falls back to the English map for user-assigned codes Intl cannot name', () => {
    expect(countryName('XI', 'de')).toBe('International')
    expect(countryName('XK', 'de')).toBe('Kosovo')
  })

  it('passes non-code values through regardless of locale', () => {
    expect(countryName('Atlantis', 'de')).toBe('Atlantis')
  })
})
