import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// The letterbox view on the map: a pin's street-level detail names the other
// companies registered at its registered office. MapLibre needs WebGL: a bare stand-in.
vi.mock('maplibre-gl', () => {
  class FakeMap {
    on() { return this } once() { return this } isStyleLoaded() { return false }
    jumpTo() {} setStyle() {} resize() {} remove() {}
  }
  class FakeMarker { setLngLat() { return this } addTo() { return this } remove() {} }
  return { Map: FakeMap, Marker: FakeMarker, setWorkerUrl: () => {} }
})
vi.mock('../services/api', () => ({ getCompaniesAtAddress: vi.fn() }))

import MapDetail, { DOOR_ROWS } from './MapDetail'
import { getCompaniesAtAddress } from '../services/api'
import type { Entity } from '../types'

const CSC = 'C/O Corporation Service Company, 251 Little Falls Drive, Wilmington, 19808, US'
const co = (id: string, name: string) => ({ id, name, type: 'company' } as Entity)
const pin = { label: 'Alpha Holdings LLC', country: 'US', lat: 39.75, lng: -75.55, precise: true,
              entityId: 'A', registeredAddress: CSC }
const answer = (count: number, entities: Entity[]) =>
  vi.mocked(getCompaniesAtAddress).mockResolvedValue({ data: { key: 'k', address: CSC, count, entities } } as never)

beforeEach(() => vi.mocked(getCompaniesAtAddress).mockReset())
afterEach(cleanup)

describe('the others at a registered office, on the map', () => {
  it('names them without the company itself, and opens one', async () => {
    answer(3, [co('A', 'Alpha Holdings LLC'), co('B', 'Beta Finance LLC'), co('C', 'Charlie Capital LLC')])
    const onOpenEntity = vi.fn()
    render(<MapDetail data={pin} onClose={() => {}} onOpenEntity={onOpenEntity} />)
    expect(await screen.findByText('2 other companies registered at this address')).toBeInTheDocument()
    expect(getCompaniesAtAddress).toHaveBeenCalledWith(CSC, 0, DOOR_ROWS + 1)
    expect(screen.getAllByText('Alpha Holdings LLC')).toHaveLength(1)     // the header only
    fireEvent.click(screen.getByText('Beta Finance LLC'))
    expect(onOpenEntity).toHaveBeenCalledWith('B')
  })

  it('says how many more there are beyond the rows it names', async () => {
    const many = Array.from({ length: DOOR_ROWS + 1 }, (_, i) => co(`N${i}`, `Nominee ${i} LLC`))
    answer(53, many)
    render(<MapDetail data={pin} onClose={() => {}} />)
    expect(await screen.findByText('52 other companies registered at this address')).toBeInTheDocument()
    expect(screen.getAllByText(/^Nominee \d+ LLC$/)).toHaveLength(DOOR_ROWS + 1)
    // "N more" is a button that fetches them — it used to be a sentence (the user, 2026-11-21)
    const next = Array.from({ length: 5 }, (_, i) => co(`M${i}`, `Nominee ${100 + i} LLC`))
    answer(53, next)
    fireEvent.click(screen.getByRole('button', { name: `Show more (${DOOR_ROWS + 1} of 52)` }))
    expect(await screen.findByText('Nominee 104 LLC')).toBeInTheDocument()
    expect(getCompaniesAtAddress).toHaveBeenLastCalledWith(CSC, DOOR_ROWS + 1)
    expect(screen.getAllByText(/^Nominee \d+ LLC$/)).toHaveLength(DOOR_ROWS + 6)
  })

  it('shows nothing when it is alone there, or when no registered office is known', async () => {
    answer(1, [co('A', 'Alpha Holdings LLC')])
    render(<MapDetail data={pin} onClose={() => {}} />)
    await vi.waitFor(() => expect(getCompaniesAtAddress).toHaveBeenCalled())
    expect(screen.queryByText(/registered at this address/)).toBeNull()
    cleanup()
    vi.mocked(getCompaniesAtAddress).mockReset()
    render(<MapDetail data={{ ...pin, registeredAddress: undefined }} onClose={() => {}} />)
    expect(getCompaniesAtAddress).not.toHaveBeenCalled()
  })
})
