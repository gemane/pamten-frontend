/**
 * Drilling from the world map into a country's states.
 *
 * The mock renders whichever geography MapView passed — world or states — so the
 * tests can assert the swap actually happened rather than that a button changed
 * colour. Which topology is in play is detected from its `objects` key, the same
 * distinction TopoJSON itself makes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MapView, { buildSubdivisionMap, canDrillInto, countryFill } from './MapView'
import type { CountryEntityGroup } from '../types'

interface Topo { objects?: Record<string, unknown> }

vi.mock('react-simple-maps', () => ({
  ComposableMap: ({ children, projection }: { children?: React.ReactNode; projection?: string }) =>
    <div data-testid="map" data-projection={projection ?? 'default'}>{children}</div>,
  ZoomableGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Geographies: ({ geography, children }: {
    geography: Topo
    children: (a: { geographies: Array<{ id: string; rsmKey: string }> }) => React.ReactNode
  }) => {
    const isStates = !!geography?.objects?.states
    const geographies = isStates
      ? [{ id: '10', rsmKey: 's10' },   // Delaware
         { id: '32', rsmKey: 's32' },   // Nevada
         { id: '38', rsmKey: 's38' }]   // North Dakota — no companies
      : [{ id: '840', rsmKey: 'c840' }, // United States
         { id: '826', rsmKey: 'c826' }] // United Kingdom
    return (
      <div data-testid={isStates ? 'states-map' : 'world-map'}>
        {children({ geographies })}
      </div>
    )
  },
  Geography: ({ geography, onClick, onMouseEnter, style }: {
    geography: { id: string }
    onClick?: () => void
    onMouseEnter?: () => void
    style?: { default?: { fill?: string } }
  }) => (
    <button data-geo={geography.id} data-fill={style?.default?.fill}
            onClick={onClick} onMouseEnter={onMouseEnter}>{geography.id}</button>
  ),
}))

const countryData: CountryEntityGroup[] = [
  { country: 'US', count: 47 },
  { country: 'GB', count: 119 },
]

const subdivisionData: CountryEntityGroup[] = [
  { country: 'US-DE', count: 35 },
  { country: 'US-NV', count: 2 },
  { country: 'CA-ON', count: 5 },
]

const view = (over = {}) => render(
  <MapView countryData={countryData} subdivisionData={subdivisionData}
           onCountryClick={vi.fn()} {...over} />,
)

const geo = (id: string) => screen.getByRole('button', { name: id })

// Vitest transforms the 112 KB states topojson on first import, which takes
// longer than the default one-second wait. In the browser it is a preloaded
// chunk; here it is a cold transform.
const statesMap = () => screen.findByTestId('states-map', {}, { timeout: 15000 })

beforeEach(() => vi.clearAllMocks())

describe('canDrillInto', () => {
  it('is true for a country with both a state map and data', () => {
    expect(canDrillInto('US', subdivisionData)).toBe(true)
  })

  it('is false for a country that states subdivisions but has no bundled map', () => {
    // Canada gets the panel breakdown; nine companies do not justify shipping
    // Canadian geometry, and a drill-down with nothing to draw is worse than none.
    expect(canDrillInto('CA', subdivisionData)).toBe(false)
  })

  it('is false when there is no subdivision data at all', () => {
    // Which is the case under the headquarters basis: App clears the list.
    expect(canDrillInto('US', [])).toBe(false)
  })

  it('is false for nothing', () => {
    expect(canDrillInto(null, subdivisionData)).toBe(false)
    expect(canDrillInto(undefined, subdivisionData)).toBe(false)
  })
})

describe('buildSubdivisionMap', () => {
  it('keeps only the requested country and keys by full code', () => {
    const map = buildSubdivisionMap(subdivisionData, 'US')
    expect([...map.keys()]).toEqual(['US-DE', 'US-NV'])
    expect(map.get('US-DE')?.count).toBe(35)
  })

  it('does not match a country whose code is a prefix of another', () => {
    // 'US' must not collect 'USX-…' style codes, and the hyphen is what stops it.
    expect([...buildSubdivisionMap([{ country: 'USA-X', count: 3 }], 'US').keys()]).toEqual([])
  })
})

describe('the state choropleth scale', () => {
  it('scales states to their own range, not the world\'s', () => {
    // Delaware holds 35 of 47 American companies. On the country scale (max 20)
    // every other state pins to the palest end and the map says nothing; the
    // state scale (max 10) separates them.
    const nevada = { country: 'US-NV', count: 2 }
    const world = countryFill(nevada, undefined, false, 'dark', false)
    const state = countryFill(nevada, undefined, false, 'dark', false, 10)
    expect(state).not.toBe(world)
  })
})

describe('drilling in', () => {
  it('starts on the world map', () => {
    view()
    expect(screen.getByTestId('world-map')).toBeInTheDocument()
    expect(screen.queryByTestId('states-map')).toBeNull()
  })

  it('swaps to the state geography when a drillable country is clicked', async () => {
    view()
    await userEvent.click(geo('840'))
    expect(await statesMap()).toBeInTheDocument()
    expect(screen.queryByTestId('world-map')).toBeNull()
  })

  it('selects the country as well as drilling in', async () => {
    // Otherwise "all American companies" becomes unreachable from the map.
    const onCountryClick = vi.fn()
    view({ onCountryClick })
    await userEvent.click(geo('840'))
    expect(onCountryClick).toHaveBeenCalledWith('US')
  })

  it('stays on the world map for a country with no state map', async () => {
    view()
    await userEvent.click(geo('826'))
    expect(screen.getByTestId('world-map')).toBeInTheDocument()
  })

  it('uses the Albers USA projection for states', async () => {
    // The default equal-earth projection puts Alaska off the side of the panel.
    view()
    await userEvent.click(geo('840'))
    await statesMap()
    expect(screen.getByTestId('map')).toHaveAttribute('data-projection', 'geoAlbersUsa')
  })

  it('selects a subdivision when a state is clicked', async () => {
    const onCountryClick = vi.fn()
    view({ onCountryClick })
    await userEvent.click(geo('840'))
    await statesMap()
    onCountryClick.mockClear()
    await userEvent.click(geo('10'))
    expect(onCountryClick).toHaveBeenCalledWith('US-DE')   // FIPS 10 is Delaware
  })

  it('ignores a state with no companies', async () => {
    const onCountryClick = vi.fn()
    view({ onCountryClick })
    await userEvent.click(geo('840'))
    await statesMap()
    onCountryClick.mockClear()
    await userEvent.click(geo('38'))
    expect(onCountryClick).not.toHaveBeenCalled()
  })

  it('colours Delaware darker than Nevada', async () => {
    view()
    await userEvent.click(geo('840'))
    await statesMap()
    expect(geo('10').getAttribute('data-fill')).not.toBe(geo('32').getAttribute('data-fill'))
  })

  it('shades states on the state scale', async () => {
    // Asserted on Nevada, not Delaware: 35 companies clamp to the darkest colour
    // on either scale, so Delaware cannot tell the two apart. Nevada's 2 can —
    // and the first version of this test used Delaware and passed against a
    // component still using the world scale.
    view()
    await userEvent.click(geo('840'))
    await statesMap()
    expect(geo('32').getAttribute('data-fill')).toBe(countryFill(
      { country: 'US-NV', count: 2 }, undefined, false, 'dark', false, 10))
  })

  it('comes back to the world map', async () => {
    view()
    await userEvent.click(geo('840'))
    await statesMap()
    await userEvent.click(screen.getByRole('button', { name: /Back to world/i }))
    expect(screen.getByTestId('world-map')).toBeInTheDocument()
  })

  it('offers no way back while on the world map', () => {
    view()
    expect(screen.queryByRole('button', { name: /Back to world/i })).toBeNull()
  })
})
