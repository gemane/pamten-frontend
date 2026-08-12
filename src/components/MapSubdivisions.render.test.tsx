/**
 * The subdivision breakdown in the country list.
 *
 * What this exists to show: 35 of the 47 American companies in the graph are
 * registered in Delaware. At country level the map can only say "United States",
 * so the breakdown is the whole point — and the two things that could quietly
 * ruin it are showing it under the wrong basis, and losing the companies that
 * state no subdivision.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import MapPanel, { subdivisionRows } from './MapPanel'
import type { CountryEntityGroup } from '../types'

beforeEach(() => localStorage.clear())
afterEach(() => { localStorage.clear(); i18n.changeLanguage('en') })

const countries: CountryEntityGroup[] = [
  { country: 'GB', count: 119 },
  { country: 'US', count: 55 },
  { country: 'CA', count: 10 },
]

const subdivisions: CountryEntityGroup[] = [
  { country: 'US-DE', count: 35 },
  { country: 'US-CA', count: 2 },
  { country: 'US-NV', count: 2 },
  { country: 'US-NY', count: 8 },
  // NY and NC exist as a pair on purpose: by ISO code NC sorts first, by display
  // name New York does. Without a pair that disagrees, sorting by code and
  // sorting by name are indistinguishable and the ordering test proves nothing.
  { country: 'US-NC', count: 8 },
  { country: 'CA-ON', count: 5 },
  { country: 'CA-QC', count: 2 },
  { country: 'CA-BC', count: 2 },
]

const panel = (over = {}) => render(
  <MapPanel countryData={countries} subdivisionData={subdivisions}
            selectedCountry={null} onSelectCountry={vi.fn()}
            onLoadEntity={vi.fn()} loading={false} {...over} />,
)

const toggle = (country: string) =>
  screen.getByRole('button', { name: new RegExp(`Show where in ${country}`, 'i') })

describe('subdivisionRows', () => {
  it('takes only the rows belonging to that country', () => {
    expect(subdivisionRows('CA', 10, subdivisions).map(r => r.code))
      .toEqual(['CA-ON', 'CA-BC', 'CA-QC', null])
  })

  it('orders by size, then by display name — not by code', () => {
    // The pair that separates the two: NY and NC both have 8, and they sort in
    // opposite orders by name ('New York' first) and by code ('US-NC' first).
    expect(subdivisionRows('US', 55, subdivisions).map(r => r.code))
      .toEqual(['US-DE', 'US-NY', 'US-NC', 'US-CA', 'US-NV'])
  })

  it('adds the remainder as a null row so the numbers add up', () => {
    // Canada: 5+2+2 = 9 of 10. The tenth company states no province and must
    // still be counted — the alternative implies the list is complete when it
    // is not.
    expect(subdivisionRows('CA', 10, subdivisions).at(-1)).toEqual({ code: null, count: 1 })
  })

  it('omits the remainder when every company is accounted for', () => {
    expect(subdivisionRows('US', 55, subdivisions).some(r => r.code === null)).toBe(false)
  })

  it('is empty for a country that states none', () => {
    expect(subdivisionRows('GB', 119, subdivisions)).toEqual([])
  })
})

describe('the country list', () => {
  it('offers a breakdown only where there is one', () => {
    panel()
    expect(toggle('United States')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show where in United Kingdom/i })).toBeNull()
  })

  it('shows Delaware leading the United States when expanded', async () => {
    panel()
    await userEvent.click(toggle('United States'))
    const rows = Array.from(document.querySelectorAll('.map-subdivision-row__name'))
      .map(n => n.textContent)
    expect(rows).toEqual(['Delaware', 'New York', 'North Carolina', 'California', 'Nevada'])
  })

  it('keeps the breakdown collapsed until asked', () => {
    panel()
    expect(screen.queryByText('Delaware')).toBeNull()
  })

  it('opens one country at a time', async () => {
    panel()
    await userEvent.click(toggle('United States'))
    await userEvent.click(toggle('Canada'))
    expect(screen.queryByText('Delaware')).toBeNull()
    expect(screen.getByText('Ontario')).toBeInTheDocument()
  })

  it('selects the subdivision, not the country', async () => {
    const onSelectCountry = vi.fn()
    panel({ onSelectCountry })
    await userEvent.click(toggle('United States'))
    await userEvent.click(screen.getByText('Delaware'))
    expect(onSelectCountry).toHaveBeenCalledWith('US-DE')
  })

  it('still selects the whole country from the row itself', async () => {
    // Expanding must not swallow the ordinary click: "all American companies" is
    // still a thing to ask for.
    const onSelectCountry = vi.fn()
    panel({ onSelectCountry })
    await userEvent.click(screen.getByText('United States'))
    expect(onSelectCountry).toHaveBeenCalledWith('US')
  })

  it('shows the not-stated remainder but does not let it be opened', async () => {
    panel()
    await userEvent.click(toggle('Canada'))
    const rest = screen.getByText('Not stated').closest('button')!
    expect(rest).toBeDisabled()
    expect(within(rest).getByText('1')).toBeInTheDocument()
  })

  it('has no expanders under the headquarters basis', () => {
    // A subdivision is where a company is *registered*. Offering it in a view of
    // where companies are run would answer a different question than the one on
    // screen. App clears the data; the panel must cope with that alone.
    panel({ basis: 'hq', subdivisionData: [] })
    expect(screen.queryByRole('button', { name: /Show where in/i })).toBeNull()
  })
})

describe('a selected subdivision', () => {
  it('names the place and its country', () => {
    panel({ selectedCountry: 'US-DE' })
    expect(screen.getByText('Delaware, United States')).toBeInTheDocument()
  })

  it('reports its count while the companies load', () => {
    panel({ selectedCountry: 'US-DE' })
    expect(screen.getByText('35 entities')).toBeInTheDocument()
  })

  it('lists the companies once they arrive', () => {
    panel({
      selectedCountry: 'US-DE',
      subdivisionData: [{ country: 'US-DE', count: 2, entities: [
        { id: 'a', name: 'Acme Holdings', type: 'company', verified: false },
        { id: 'b', name: 'Beta Corp', type: 'company', verified: false },
      ] }],
    })
    expect(Array.from(document.querySelectorAll('.map-entity-name')).map(n => n.textContent))
      .toEqual(['Acme Holdings', 'Beta Corp'])
  })
})
