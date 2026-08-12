/**
 * Subdivision codes, names, and the FIPS join.
 *
 * The join is the part worth testing hardest: us-atlas keys its geometries by
 * FIPS, we store ISO 3166-2, and a wrong entry paints the wrong state a
 * convincing shade of blue. Nothing on screen would look broken.
 */
import { describe, it, expect } from 'vitest'
import {
  isSubdivision, subdivisionCountry, subdivisionName, subdivisionForFips,
  SUBDIVISION_NAMES, FIPS_TO_SUBDIVISION,
} from './isoSubdivisions'

describe('isSubdivision', () => {
  it('accepts an ISO 3166-2 code', () => {
    expect(isSubdivision('US-DE')).toBe(true)
    expect(isSubdivision('CA-ON')).toBe(true)
    expect(isSubdivision('GB-SCT')).toBe(true)
    expect(isSubdivision('KN-N')).toBe(true)      // one-letter second part
  })

  it('rejects a plain country code — the distinction the map depends on', () => {
    expect(isSubdivision('US')).toBe(false)
    expect(isSubdivision('GB')).toBe(false)
  })

  it('rejects nothing and rubbish', () => {
    expect(isSubdivision(null)).toBe(false)
    expect(isSubdivision(undefined)).toBe(false)
    expect(isSubdivision('')).toBe(false)
    expect(isSubdivision('United States')).toBe(false)
  })
})

describe('subdivisionCountry', () => {
  it('takes the country half', () => {
    expect(subdivisionCountry('US-DE')).toBe('US')
    expect(subdivisionCountry('ca-on')).toBe('CA')
  })
})

describe('subdivisionName', () => {
  it('names the one that matters', () => {
    expect(subdivisionName('US-DE')).toBe('Delaware')
  })

  it('covers the other users of subdivisions', () => {
    expect(subdivisionName('CA-ON')).toBe('Ontario')
    expect(subdivisionName('GB-SCT')).toBe('Scotland')
    expect(subdivisionName('KN-N')).toBe('Nevis')
    expect(subdivisionName('AE-DU')).toBe('Dubai')
  })

  it('returns the code for one it does not know, rather than nothing', () => {
    // A real place with real companies in it. "US-ZZ" tells the reader more than
    // a blank row, and far more than a row that was silently dropped.
    expect(subdivisionName('US-ZZ')).toBe('US-ZZ')
  })

  it('has all 50 states plus DC', () => {
    const us = Object.keys(SUBDIVISION_NAMES).filter(c => c.startsWith('US-'))
    expect(us.length).toBeGreaterThanOrEqual(51)
    expect(SUBDIVISION_NAMES['US-WY']).toBe('Wyoming')
  })
})

describe('the FIPS join', () => {
  it('maps Delaware, which is the whole point', () => {
    expect(subdivisionForFips('10')).toBe('US-DE')
  })

  it('pads a numeric id — TopoJSON ids are sometimes numbers', () => {
    expect(subdivisionForFips(6)).toBe('US-CA')
    expect(subdivisionForFips('06')).toBe('US-CA')
  })

  it('returns null for a code it does not cover', () => {
    // Better an uncoloured state than a confidently mis-coloured one.
    expect(subdivisionForFips('99')).toBeNull()
  })

  it('is one-to-one — no state shares another state\'s code', () => {
    // The failure this guards: a copy-paste duplicate silently steals a state's
    // companies and paints the wrong one. Every value must be distinct.
    const codes = Object.values(FIPS_TO_SUBDIVISION)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('only produces codes the name table can name', () => {
    for (const code of Object.values(FIPS_TO_SUBDIVISION)) {
      expect(SUBDIVISION_NAMES[code], `${code} has no name`).toBeDefined()
    }
  })

  it('agrees with the states that carry data today', () => {
    // Spot-checked against the FIPS register rather than derived from the same
    // table, so this fails if an entry is edited to something plausible.
    expect(subdivisionForFips('32')).toBe('US-NV')
    expect(subdivisionForFips('36')).toBe('US-NY')
    expect(subdivisionForFips('53')).toBe('US-WA')
    expect(subdivisionForFips('06')).toBe('US-CA')
  })
})
