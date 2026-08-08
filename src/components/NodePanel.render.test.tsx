import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import NodePanel from './NodePanel'
import type { NodeData, FullProfile, Entity } from '../types'

// Mock the api + the children that do their own fetching, so the test isolates NodePanel's
// own load/refresh behaviour.
vi.mock('../services/api', () => ({
  getFullProfile: vi.fn(),
  getEntitySources: vi.fn(),
  getPersonProfile: vi.fn(),
  getPersonSources: vi.fn(),
}))
vi.mock('./NodeFlags', () => ({ default: () => null }))
vi.mock('./TimelinePanel', () => ({ default: () => null }))
vi.mock('./EdgeReportButton', () => ({ default: () => null }))

import { getFullProfile, getEntitySources } from '../services/api'

const mockProfile = vi.mocked(getFullProfile)
const mockSources = vi.mocked(getEntitySources)

const entityNode = (id: string, label: string): NodeData => ({ id, label, nodeType: 'entity', raw: {} as Entity })

const profile = (id: string, name: string): FullProfile => ({
  entity: { id, name, type: 'company', verified: false } as Entity,
  owners: [], subsidiaries: [], executives: [],
})

beforeEach(() => {
  mockProfile.mockReset()
  mockSources.mockReset()
  mockSources.mockResolvedValue({ data: [] } as never)
})

describe('NodePanel (render)', () => {
  it('loads and shows the selected entity profile', async () => {
    mockProfile.mockResolvedValue({ data: profile('e1', 'Acme Corp') } as Awaited<ReturnType<typeof getFullProfile>>)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)

    expect(await screen.findByText('Acme Corp')).toBeInTheDocument()
    expect(mockProfile).toHaveBeenCalledTimes(1)
    expect(mockProfile).toHaveBeenCalledWith('e1')
  })

  it('refetches the SAME node when refreshKey bumps (enrichment landed)', async () => {
    mockProfile.mockResolvedValue({ data: profile('e1', 'Sparse Co') } as Awaited<ReturnType<typeof getFullProfile>>)
    const node = entityNode('e1', 'Sparse Co')
    const { rerender } = render(<NodePanel node={node} refreshKey={0} />)
    await screen.findByText('Sparse Co')

    // A scrape enriched the company → App bumps refreshKey; the panel must refetch in place.
    mockProfile.mockResolvedValue({ data: profile('e1', 'Enriched Co') } as Awaited<ReturnType<typeof getFullProfile>>)
    rerender(<NodePanel node={node} refreshKey={1} />)

    // Silent refresh: no spinner flash, the previous content stays until the new data lands.
    expect(document.querySelector('.panel-spinner')).toBeNull()
    expect(await screen.findByText('Enriched Co')).toBeInTheDocument()
    expect(mockProfile).toHaveBeenCalledTimes(2)
  })

  it('does not refetch when neither node nor refreshKey changes', async () => {
    mockProfile.mockResolvedValue({ data: profile('e1', 'Acme Corp') } as Awaited<ReturnType<typeof getFullProfile>>)
    const node = entityNode('e1', 'Acme Corp')
    const { rerender } = render(<NodePanel node={node} refreshKey={3} />)
    await screen.findByText('Acme Corp')

    rerender(<NodePanel node={node} refreshKey={3} />)   // unrelated re-render
    await waitFor(() => expect(mockProfile).toHaveBeenCalledTimes(1))
  })

  it('fetches the new profile when a different node is selected', async () => {
    mockProfile.mockResolvedValue({ data: profile('e1', 'First Co') } as Awaited<ReturnType<typeof getFullProfile>>)
    const { rerender } = render(<NodePanel node={entityNode('e1', 'First Co')} refreshKey={0} />)
    await screen.findByText('First Co')

    mockProfile.mockResolvedValue({ data: profile('e2', 'Second Co') } as Awaited<ReturnType<typeof getFullProfile>>)
    rerender(<NodePanel node={entityNode('e2', 'Second Co')} refreshKey={0} />)

    expect(await screen.findByText('Second Co')).toBeInTheDocument()
    expect(mockProfile).toHaveBeenCalledWith('e2')
  })
})

// The profile used to carry a `headquarters` Location node, preferred over these
// fields with them as a fallback. The node is gone and the entity's own values
// are the only path, so they had better actually render.

describe('NodePanel HQ from the entity itself', () => {
  const withHq = (over: Partial<Entity>): FullProfile => ({
    entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false, ...over } as Entity,
    owners: [], subsidiaries: [], executives: [],
  })

  const show = async (over: Partial<Entity>) => {
    mockProfile.mockResolvedValue({ data: withHq(over) } as Awaited<ReturnType<typeof getFullProfile>>)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)
    await screen.findByText('Acme Corp')
  }

  it('shows the city and country from the entity', async () => {
    await show({ hq_city: 'Vienna', hq_country: 'AT' })
    expect(screen.getByText(/Vienna/)).toBeInTheDocument()
  })

  it('shows the full address from hq_address', async () => {
    await show({ hq_city: 'Vienna', hq_country: 'AT', hq_address: '1 Ringstrasse, 1010 Vienna, AT' })
    expect(screen.getByText('1 Ringstrasse, 1010 Vienna, AT')).toBeInTheDocument()
  })

  it('renders without an address at all', async () => {
    // Most entities have no HQ recorded; the panel must not break on it.
    await show({})
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })
})

// ── Type markers in the relationship lists ────────────────────────────────────
//
// The graph tells a fund from a holding from a person by colour; the panel's
// lists used to render every row as a bare name. These pin the marker's colour
// against the shared palette, and its shape — round for a person — which is what
// carries the distinction for anyone who cannot separate the person-green from
// the government-red.

describe('NodePanel type markers', () => {
  const withOwners = (owners: unknown[]): FullProfile => ({
    entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false } as Entity,
    owners: owners as never, subsidiaries: [], executives: [],
  })

  const show = async (owners: unknown[]) => {
    mockProfile.mockResolvedValue({ data: withOwners(owners) } as Awaited<ReturnType<typeof getFullProfile>>)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)
    await screen.findByText('Acme Corp')
  }

  const owner = (o: Record<string, unknown>) => ({ owner: o, relationship: {} })

  it('marks a person row with the person colour, round', async () => {
    await show([owner({ id: 'p1', full_name: 'Satya Nadella' })])
    const marker = screen.getByTestId('type-marker')
    expect(marker).toHaveStyle({ background: '#27AE60' })
    expect(marker.className).toContain('rel-item__marker--person')
  })

  it('marks a company row with the company colour, not round', async () => {
    await show([owner({ id: 'c1', name: 'BlackRock Inc', type: 'company' })])
    const marker = screen.getByTestId('type-marker')
    expect(marker).toHaveStyle({ background: '#4A90D9' })
    expect(marker.className).not.toContain('rel-item__marker--person')
  })

  it('colours a fund distinctly', async () => {
    // The type class ScraperPanel and MapPanel used to miss entirely — their
    // three-entry palettes rendered anything beyond company/brand/holding grey.
    await show([owner({ id: 'f1', name: 'Norges Bank', type: 'fund' })])
    expect(screen.getByTestId('type-marker')).toHaveStyle({ background: '#B7950B' })
  })

  it('gives each marker a readable label, not colour alone', async () => {
    await show([owner({ id: 'f1', name: 'Norges Bank', type: 'fund' })])
    expect(screen.getByTestId('type-marker')).toHaveAttribute('title', 'Fund')
  })

  it('distinguishes a person from a company in the same list', async () => {
    await show([
      owner({ id: 'p1', full_name: 'Satya Nadella' }),
      owner({ id: 'c1', name: 'BlackRock Inc', type: 'company' }),
    ])
    const markers = screen.getAllByTestId('type-marker')
    expect(markers).toHaveLength(2)
    expect(markers[0].className).not.toBe(markers[1].className)
  })
})
