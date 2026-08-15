/**
 * The Registered / Headquarters switch, and what the panel does with it.
 *
 * The switch lives on the map rather than in the panel: on a phone the map sits
 * above the panel, so a control in the panel can be scrolled out of sight while
 * you are looking at the thing it controls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import MapView from './MapView'
import MapPanel from './MapPanel'
import { MAP_BASIS_KEY, NO_COUNTRY, pinFill } from '../utils/mapBasis'
import type { CountryEntityGroup, Entity, NodeData } from '../types'

// react-simple-maps needs a real layout engine; the switch is plain DOM beside it.
vi.mock('react-simple-maps', () => ({
  ComposableMap: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Geographies: () => null,
  Geography: () => null,
  ZoomableGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

beforeEach(() => localStorage.clear())
afterEach(() => { localStorage.clear(); i18n.changeLanguage('en') })

const groups: CountryEntityGroup[] = [
  { country: 'DE', count: 9 },
  { country: 'KY', count: 2 },
  { country: null, count: 59 },        // the "not recorded" group
]

describe('the basis switch on the map', () => {
  it('offers both ways of counting', () => {
    render(<MapView countryData={groups} onCountryClick={vi.fn()}
                    basis="jurisdiction" onBasisChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Registered/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Headquarters/i })).toBeInTheDocument()
  })

  it('reports the change rather than deciding alone', async () => {
    // The state lives in App: the panel and the fetches depend on it too.
    const onBasisChange = vi.fn()
    render(<MapView countryData={groups} onCountryClick={vi.fn()}
                    basis="jurisdiction" onBasisChange={onBasisChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Headquarters/i }))
    expect(onBasisChange).toHaveBeenCalledWith('hq')
  })

  it('marks which one is active', () => {
    render(<MapView countryData={groups} onCountryClick={vi.fn()}
                    basis="hq" onBasisChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Headquarters/i }))
      .toHaveClass('map-basis-btn--active')
    expect(screen.getByRole('button', { name: /Registered/i }))
      .not.toHaveClass('map-basis-btn--active')
  })

  it('is absent when the map is not interactive', () => {
    // No handler means no control, rather than a dead button.
    render(<MapView countryData={groups} onCountryClick={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Headquarters/i })).toBeNull()
  })
})

describe('the panel with an unplaceable group', () => {
  const panel = (over = {}) => render(
    <MapPanel countryData={groups} selectedCountry={null} onSelectCountry={vi.fn()}
              onLoadEntity={vi.fn()} loading={false} {...over} />,
  )

  it('shows the companies it cannot place instead of dropping them', () => {
    panel()
    expect(screen.getByText(/Not recorded/i)).toBeInTheDocument()
    expect(screen.getByText('59')).toBeInTheDocument()
  })

  it('selects that group by sentinel, not by null', () => {
    // null already means "nothing selected"; reusing it would open the group on load.
    const onSelectCountry = vi.fn()
    panel({ onSelectCountry })
    return userEvent.click(screen.getByText(/Not recorded/i)).then(() => {
      expect(onSelectCountry).toHaveBeenCalledWith(NO_COUNTRY)
    })
  })

  it('lists it last, below real countries, whatever its count', () => {
    // 59 is the biggest number here, but it is not a place and must not head the list.
    panel()
    const names = Array.from(document.querySelectorAll('.map-country-row__name'))
      .map(n => n.textContent?.trim())
    expect(names[names.length - 1]).toMatch(/Not recorded/i)
  })
})

describe('the subsidiary list', () => {
  const sub = (label: string, country?: string, hq?: string): NodeData => ({
    id: label, label, nodeType: 'entity',
    raw: { id: label, name: label, type: 'company', country, hq_country: hq } as Entity,
  })
  const node = { id: 'p', label: 'Parent', nodeType: 'entity' as const,
                 raw: { id: 'p', name: 'Parent', type: 'company' } as Entity }

  const withBasis = (basis: 'jurisdiction' | 'hq') => {
    const { container } = render(
      <MapPanel countryData={groups} selectedCountry={null} onSelectCountry={vi.fn()}
                onLoadEntity={vi.fn()} loading={false} basis={basis} contextNode={node}
                contextSubsidiaries={[
                  sub('Cayman Co', 'KY', 'GB'),
                  sub('London One', 'GB', 'GB'),
                  sub('London Two', 'GB', 'GB'),
                ]} />,
    )
    return Array.from(container.querySelectorAll('.map-entity-name')).map(n => n.textContent)
  }

  it('groups by the selected basis, biggest country first', () => {
    // By registration: GB has 2, KY has 1. By headquarters all three are GB.
    expect(withBasis('jurisdiction')).toEqual(['London One', 'London Two', 'Cayman Co'])
  })

  it('reorders when the basis changes', () => {
    expect(withBasis('hq')).toEqual(['Cayman Co', 'London One', 'London Two'])
  })
})

/**
 * The dots beside the names in the context list are the same companies the map
 * draws as pins, so they have to be the same colour. They were a fixed amber —
 * the *shaded-country* amber, at that — which meant that under Registered, the
 * default, every pin on the map was violet and every dot beside it was orange.
 */
describe('the dots agree with the pins', () => {
  const sub = (label: string): NodeData => ({
    id: label, label, nodeType: 'entity',
    raw: { id: label, name: label, type: 'company', country: 'GB', hq_country: 'GB' } as Entity,
  })
  const node = { id: 'p', label: 'Parent', nodeType: 'entity' as const,
                 raw: { id: 'p', name: 'Parent', type: 'company', country: 'GB' } as Entity }

  const dots = (basis: 'jurisdiction' | 'hq') => {
    const { container } = render(
      <MapPanel countryData={[]} selectedCountry={null} onSelectCountry={vi.fn()}
                onLoadEntity={vi.fn()} loading={false} basis={basis}
                contextNode={node} contextSubsidiaries={[sub('Sub One')]} />)
    return Array.from(container.querySelectorAll('.map-entity-dot'))
      .map(d => (d as HTMLElement).style.background)
  }

  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
  }

  it('uses the pin colours under Registered', () => {
    expect(dots('jurisdiction')).toEqual([
      rgb(pinFill('primary', 'jurisdiction')),
      rgb(pinFill('subsidiary', 'jurisdiction')),
    ])
  })

  it('uses the pin colours under Headquarters', () => {
    expect(dots('hq')).toEqual([
      rgb(pinFill('primary', 'hq')),
      rgb(pinFill('subsidiary', 'hq')),
    ])
  })

  it('changes colour with the basis, as the pins do', () => {
    expect(dots('jurisdiction')).not.toEqual(dots('hq'))
  })

  it('tells the company apart from its subsidiaries', () => {
    const [primary, subsidiary] = dots('jurisdiction')
    expect(primary).not.toBe(subsidiary)
  })
})

describe('persistence', () => {
  it('remembers the choice', () => {
    localStorage.setItem(MAP_BASIS_KEY, 'hq')
    render(<MapView countryData={groups} onCountryClick={vi.fn()}
                    basis="hq" onBasisChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Headquarters/i }))
      .toHaveClass('map-basis-btn--active')
  })
})

describe('the address under the company name', () => {
  const cayman = {
    id: 'e1', name: 'BARCLAYS CAPITAL (CAYMAN) LIMITED', type: 'company', verified: false,
    country: 'KY', hq_country: 'GB',
    address: 'c/o Maples, Ugland House, Grand Cayman, KY1-1104, KY',
    hq_address: '1 Churchill Place, London, E14 5HP, GB',
  } as Entity
  const node = { id: 'e1', label: 'BARCLAYS CAPITAL (CAYMAN) LIMITED',
                 nodeType: 'entity' as const, raw: cayman }

  const panel = (basis: 'jurisdiction' | 'hq', raw: Entity = cayman) => {
    const { container } = render(
      <MapPanel countryData={[]} selectedCountry={null} onSelectCountry={vi.fn()}
                onLoadEntity={vi.fn()} loading={false} basis={basis}
                contextNode={{ ...node, raw }} contextSubsidiaries={[]} />)
    return container.querySelector('.map-panel__address')?.textContent ?? null
  }

  it('shows where the pin is standing, under the name', () => {
    expect(panel('hq')).toMatch(/Churchill Place/)
  })

  it('shows the registered office under Registered', () => {
    // The pin is on Grand Cayman in this view; the caption has to agree with it.
    expect(panel('jurisdiction')).toMatch(/Ugland House/)
  })

  it('shows nothing when that basis has no address', () => {
    const bare = { ...cayman, address: undefined, hq_address: undefined } as Entity
    expect(panel('hq', bare)).toBeNull()
  })
})
