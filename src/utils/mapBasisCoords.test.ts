/**
 * Which point a company's pin stands on, for the selected basis.
 *
 * The bug this exists to keep fixed: `contextCountries` in App used to read
 * `hq_country || country` and `hq_lat`, ignoring the basis entirely — so
 * switching Registered/Headquarters moved nothing, and a company with no
 * recorded HQ was drawn at its registration country as though it were run there.
 *
 * BARCLAYS CAPITAL (CAYMAN) LIMITED is the case throughout: registered at its
 * agent's door on Grand Cayman, run from London.
 */
import { describe, it, expect } from 'vitest'
import { basisCoords, basisCountry } from './mapBasis'
import type { Entity } from '../types'

const cayman = {
  id: 'e1', name: 'BARCLAYS CAPITAL (CAYMAN) LIMITED', type: 'company', verified: false,
  country: 'KY', hq_country: 'GB',
  reg_lat: 19.29, reg_lng: -81.38, reg_geo_precision: 'approx',
  hq_lat: 51.5074, hq_lng: -0.0757, hq_geo_precision: 'exact',
} as Entity

describe('basisCoords', () => {
  it('puts the pin in London for headquarters', () => {
    expect(basisCoords(cayman, 'hq')).toEqual({ lat: 51.5074, lng: -0.0757, precise: true })
  })

  it('puts it on Grand Cayman for registration', () => {
    expect(basisCoords(cayman, 'jurisdiction')).toEqual({ lat: 19.29, lng: -81.38, precise: false })
  })

  it('actually moves — the two are different points', () => {
    // The assertion the old code would have failed: same entity, same render,
    // different basis, different place.
    expect(basisCoords(cayman, 'hq')).not.toEqual(basisCoords(cayman, 'jurisdiction'))
  })

  it('does NOT fall back to the other basis', () => {
    // Drawing the HQ pin under Registered would place a company at an address
    // the register never gave, with nothing on screen to say so.
    const hqOnly = { hq_lat: 51.5, hq_lng: -0.1 } as Entity
    expect(basisCoords(hqOnly, 'jurisdiction')).toBeNull()
    const regOnly = { reg_lat: 19.3, reg_lng: -81.4 } as Entity
    expect(basisCoords(regOnly, 'hq')).toBeNull()
  })

  it('is null when a coordinate is missing rather than half-placing the pin', () => {
    expect(basisCoords({ hq_lat: 51.5 } as Entity, 'hq')).toBeNull()
    expect(basisCoords({ hq_lng: -0.1 } as Entity, 'hq')).toBeNull()
    expect(basisCoords(null, 'hq')).toBeNull()
    expect(basisCoords(undefined, 'jurisdiction')).toBeNull()
  })

  it('reports precision from the matching basis', () => {
    // The registered address usually resolves only to a town, so its pin is
    // approximate; captioning it as exact would overstate what we know.
    const mixed = { hq_lat: 1, hq_lng: 1, hq_geo_precision: 'exact',
                    reg_lat: 2, reg_lng: 2, reg_geo_precision: 'approx' } as Entity
    expect(basisCoords(mixed, 'hq')?.precise).toBe(true)
    expect(basisCoords(mixed, 'jurisdiction')?.precise).toBe(false)
  })

  it('handles a zero coordinate — the Gulf of Guinea is a place', () => {
    // `lat ?? null` vs `lat || null`: 0 is falsy and would drop the pin.
    expect(basisCoords({ hq_lat: 0, hq_lng: 0 } as Entity, 'hq'))
      .toEqual({ lat: 0, lng: 0, precise: false })
  })
})

describe('country and coordinates agree', () => {
  it('both follow the same basis', () => {
    expect(basisCountry(cayman, 'jurisdiction')).toBe('KY')
    expect(basisCoords(cayman, 'jurisdiction')?.lng).toBeLessThan(0)   // western hemisphere
    expect(basisCountry(cayman, 'hq')).toBe('GB')
    expect(basisCoords(cayman, 'hq')?.lat).toBeGreaterThan(50)         // northern Europe
  })
})
