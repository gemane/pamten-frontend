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
