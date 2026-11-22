import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// The letterbox view in the map panel: under a selected company, who else is
// registered at its registered office (the user, 2026-11-21) — since
// 2026-11-22 the only place that lists them.
vi.mock('../services/api', () => ({ getCompaniesAtAddress: vi.fn() }))
vi.mock('./ReportModal', () => ({ default: () => null }))

import MapPanel, { PANEL_DOOR_ROWS } from './MapPanel'
import { getCompaniesAtAddress } from '../services/api'
import type { Entity, NodeData } from '../types'

const CSC = 'C/O Corporation Service Company, 251 Little Falls Drive, Wilmington, 19808, US'
const co = (id: string, name: string) => ({ id, name, type: 'company' } as Entity)
const context = (address?: string): NodeData => ({
  id: 'A', label: 'Alpha Holdings LLC', nodeType: 'entity',
  raw: { ...co('A', 'Alpha Holdings LLC'), address } as Entity,
})
const answer = (count: number, entities: Entity[]) =>
  vi.mocked(getCompaniesAtAddress).mockResolvedValue({ data: { key: 'k', address: CSC, count, entities } } as never)
const panel = (node: NodeData, onLoadEntity = vi.fn()) => {
  render(<MapPanel countryData={[]} selectedCountry={null} onSelectCountry={() => {}}
                   onLoadEntity={onLoadEntity} loading={false} contextNode={node} />)
  return onLoadEntity
}

beforeEach(() => vi.mocked(getCompaniesAtAddress).mockReset())
afterEach(cleanup)

describe('registered at the same address, in the map panel', () => {
  it('lists the others without the company itself, and loads one', async () => {
    answer(3, [co('A', 'Alpha Holdings LLC'), co('B', 'Beta Finance LLC'), co('C', 'Charlie Capital LLC')])
    const onLoad = panel(context(CSC))
    expect(await screen.findByText('Beta Finance LLC')).toBeInTheDocument()
    expect(getCompaniesAtAddress).toHaveBeenCalledWith(CSC, 0, PANEL_DOOR_ROWS + 1)
    expect(screen.getByText('Registered at the same address')).toBeInTheDocument()
    expect(screen.getAllByText('Alpha Holdings LLC')).toHaveLength(1)     // the header only
    fireEvent.click(screen.getByText('Charlie Capital LLC'))
    expect(onLoad).toHaveBeenCalledWith('C')
  })

  it('stands right under the company, above its subsidiaries (the one place that lists them)', async () => {
    answer(2, [co('A', 'Alpha Holdings LLC'), co('B', 'Beta Finance LLC')])
    const sub: NodeData = { id: 'S', label: 'Sub One Ltd', nodeType: 'entity', raw: co('S', 'Sub One Ltd') }
    render(<MapPanel countryData={[]} selectedCountry={null} onSelectCountry={() => {}} onLoadEntity={() => {}}
                     loading={false} contextNode={context(CSC)} contextSubsidiaries={[sub]} />)
    const door = await screen.findByText('Registered at the same address')
    const after = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(after(screen.getByText('Alpha Holdings LLC'), door)).toBe(true)
    expect(after(screen.getByText('Beta Finance LLC'), screen.getByText('Sub One Ltd'))).toBe(true)
    // the number stands in the title
    expect(door.parentElement).toHaveTextContent('Registered at the same address1')
  })

  it('fetches the rest on "show more"', async () => {
    answer(44, Array.from({ length: PANEL_DOOR_ROWS + 1 }, (_, i) => co(`N${i}`, `Nominee ${i} LLC`)))
    panel(context(CSC))
    const more = await screen.findByRole('button', { name: `Show more (${PANEL_DOOR_ROWS + 1} of 43)` })
    answer(44, [co('Z', 'Zulu LLC')])
    fireEvent.click(more)
    expect(await screen.findByText('Zulu LLC')).toBeInTheDocument()
    expect(getCompaniesAtAddress).toHaveBeenLastCalledWith(CSC, PANEL_DOOR_ROWS + 1)
  })

  it('shows nothing for a company alone there, and asks nothing without an address', async () => {
    answer(1, [co('A', 'Alpha Holdings LLC')])
    panel(context(CSC))
    await vi.waitFor(() => expect(getCompaniesAtAddress).toHaveBeenCalled())
    expect(screen.queryByText('Registered at the same address')).toBeNull()
    cleanup()
    vi.mocked(getCompaniesAtAddress).mockReset()
    panel(context(undefined))
    expect(getCompaniesAtAddress).not.toHaveBeenCalled()
  })
})
