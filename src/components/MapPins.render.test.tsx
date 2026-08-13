/**
 * The pins on a selected company's map, and the fact that the switch moves them.
 *
 * Reported symptom: with a company selected, switching Registered/Headquarters
 * changed nothing on the map. It was true — `contextCountries` read
 * `hq_country || hq_lat` and did not list `mapBasis` as a dependency, so the
 * switch could not affect it. These tests render the real MapView with both
 * bases and compare what comes out.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MapView, { pinFill, countryFill } from './MapView'
import type { ContextCountry } from '../types'

vi.mock('react-simple-maps', () => ({
  ComposableMap: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ZoomableGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Geographies: () => null,
  Geography: () => null,
  Marker: ({ coordinates, children }: { coordinates: [number, number]; children?: React.ReactNode }) => (
    <div data-testid="pin" data-at={coordinates.join(',')}>{children}</div>
  ),
}))

// The same company under each basis, as App now builds it.
const london: ContextCountry = {
  country: 'GB', role: 'primary', lat: 51.5074, lng: -0.0757,
  label: 'BARCLAYS CAPITAL (CAYMAN) LIMITED', basis: 'hq', precise: true,
}
const grandCayman: ContextCountry = {
  country: 'KY', role: 'primary', lat: 19.29, lng: -81.38,
  label: 'BARCLAYS CAPITAL (CAYMAN) LIMITED', basis: 'jurisdiction', precise: false,
}

const pinsFor = (contextCountries: ContextCountry[], basis: 'hq' | 'jurisdiction') => {
  const { container, unmount } = render(
    <MapView countryData={[]} contextCountries={contextCountries}
             basis={basis} onCountryClick={vi.fn()} />,
  )
  const pins = Array.from(container.querySelectorAll('[data-testid="pin"]'))
    .map(p => ({ at: p.getAttribute('data-at'),
                 fill: p.querySelector('circle[fill]:not([fill="transparent"])')?.getAttribute('fill') }))
  unmount()
  return pins
}

describe('the pin follows the basis', () => {
  it('stands in London under Headquarters', () => {
    expect(pinsFor([london], 'hq')[0].at).toBe('-0.0757,51.5074')
  })

  it('stands on Grand Cayman under Registered', () => {
    expect(pinsFor([grandCayman], 'jurisdiction')[0].at).toBe('-81.38,19.29')
  })

  it('moves between the two — the reported bug', () => {
    expect(pinsFor([london], 'hq')[0].at).not.toBe(pinsFor([grandCayman], 'jurisdiction')[0].at)
  })

  it('is a different colour, so you can tell which place you are looking at', () => {
    expect(pinsFor([london], 'hq')[0].fill).toBe(pinFill('primary', 'hq'))
    expect(pinsFor([grandCayman], 'jurisdiction')[0].fill).toBe(pinFill('primary', 'jurisdiction'))
    expect(pinFill('primary', 'hq')).not.toBe(pinFill('primary', 'jurisdiction'))
  })

  it('drops the pin rather than guessing when that basis has no coordinates', () => {
    // A company registered somewhere we could not geocode: the country still
    // shades, but there is no pin claiming a location the register never gave.
    const unplaced: ContextCountry = { country: 'KY', role: 'primary',
                                       label: 'Somewhere Ltd', basis: 'jurisdiction' }
    expect(pinsFor([unplaced], 'jurisdiction')).toEqual([])
  })
})

describe('pin colours', () => {
  it('separates the selected company from its subsidiaries in both bases', () => {
    expect(pinFill('primary', 'hq')).not.toBe(pinFill('subsidiary', 'hq'))
    expect(pinFill('primary', 'jurisdiction')).not.toBe(pinFill('subsidiary', 'jurisdiction'))
  })

  it('gives all four combinations a distinct colour', () => {
    const all = [pinFill('primary', 'hq'), pinFill('subsidiary', 'hq'),
                 pinFill('primary', 'jurisdiction'), pinFill('subsidiary', 'jurisdiction')]
    expect(new Set(all).size).toBe(4)
  })
})

describe('the shaded country agrees with the pin on it', () => {
  it('shades in the basis colour family', () => {
    const hq = countryFill(undefined, 'primary', false, 'dark', true, 20, 'hq')
    const reg = countryFill(undefined, 'primary', false, 'dark', true, 20, 'jurisdiction')
    expect(hq).not.toBe(reg)
  })

  it('still defaults to the headquarters colours', () => {
    // The parameter is last and optional; existing callers must keep their behaviour.
    expect(countryFill(undefined, 'primary', false, 'dark', true))
      .toBe(countryFill(undefined, 'primary', false, 'dark', true, 20, 'hq'))
  })

  it('leaves countries with no context alone', () => {
    const plain = { country: 'DE', count: 5 }
    expect(countryFill(plain, undefined, false, 'dark', false, 20, 'jurisdiction'))
      .toBe(countryFill(plain, undefined, false, 'dark', false, 20, 'hq'))
  })
})

describe('the empty state', () => {
  it('says nothing is on the map when there is nothing', () => {
    render(<MapView countryData={[]} contextCountries={[]} onCountryClick={vi.fn()} />)
    expect(screen.getByText(/no geographic data/i)).toBeInTheDocument()
  })
})
