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
