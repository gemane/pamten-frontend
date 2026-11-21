import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import NodePanel from './NodePanel'
import { addressNode } from '../utils/addressElements'
import type { NodeData, FullProfile, Entity, RegisteredAddress } from '../types'

// The letterbox view in the panel: the companies registered at the same
// office as the one open, and an address node's own list.
vi.mock('../services/api', () => ({
  getCompaniesAtAddress: vi.fn(),
  getFullProfile: vi.fn(),
  getEntitySources: vi.fn(),
  getPersonProfile: vi.fn(),
  getPersonSources: vi.fn(),
  getSubsidiaryTree: vi.fn(),
  getStakeHistory: vi.fn(),
  getMediaImage: vi.fn(),
  mediaFileUrl: (path: string) => `https://api.example.test/v1${path}`,
}))
vi.mock('./NodeFlags', () => ({ default: () => null }))
vi.mock('./TimelinePanel', () => ({ default: () => null }))

import { getCompaniesAtAddress, getEntitySources, getFullProfile, getMediaImage } from '../services/api'

const CSC = 'C/O Corporation Service Company, 251 Little Falls Drive, Wilmington, 19808, US'
const KEY = 'c o corporation service company 251 little falls drive wilmington 19808 us'
const co = (id: string, name: string): Entity => ({ id, name, type: 'company' } as Entity)
const node = (id: string, label: string): NodeData => ({ id, label, nodeType: 'entity', raw: {} as Entity })
const withAddress = (section: RegisteredAddress | null): FullProfile => ({
  entity: { id: 'A', name: 'Alpha Holdings LLC', type: 'company', address: CSC } as Entity,
  owners: [], subsidiaries: [], executives: [], registered_address: section,
})

beforeEach(() => {
  vi.mocked(getFullProfile).mockReset()
  vi.mocked(getCompaniesAtAddress).mockReset()
  vi.mocked(getEntitySources).mockResolvedValue({ data: [] } as never)
  vi.mocked(getMediaImage).mockResolvedValue({ data: null } as never)
})
afterEach(cleanup)

describe('registered at the same address', () => {
  it('lists the others behind the door, closed until asked', async () => {
    vi.mocked(getFullProfile).mockResolvedValue({ data: withAddress(
      { key: KEY, address: CSC, count: 2, entities: [co('B', 'Beta Finance LLC'), co('C', 'Charlie Capital LLC')] }) } as never)
    render(<NodePanel node={node('A', 'Alpha Holdings LLC')} refreshKey={0} />)
    const toggle = await screen.findByRole('button', { name: /Registered at the same address/ })
    expect(screen.queryByText('Beta Finance LLC')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByText('Beta Finance LLC')).toBeInTheDocument()
    expect(screen.getByText('Charlie Capital LLC')).toBeInTheDocument()
    expect(getCompaniesAtAddress).not.toHaveBeenCalled()       // the profile brought them
  })

  it('draws the door in the graph with the rows it holds', async () => {
    const section = { key: KEY, address: CSC, count: 1, entities: [co('B', 'Beta Finance LLC')] }
    vi.mocked(getFullProfile).mockResolvedValue({ data: withAddress(section) } as never)
    const onShowAddress = vi.fn()
    render(<NodePanel node={node('A', 'Alpha Holdings LLC')} refreshKey={0} onShowAddress={onShowAddress} />)
    fireEvent.click(await screen.findByRole('button', { name: /Registered at the same address/ }))
    fireEvent.click(screen.getByRole('button', { name: /Show in graph/ }))
    expect(onShowAddress).toHaveBeenCalledWith('A', expect.objectContaining({ key: KEY, entities: [co('B', 'Beta Finance LLC')] }))
  })

  it('offers the way back once the door is drawn: remove from graph', async () => {
    const section = { key: KEY, address: CSC, count: 1, entities: [co('B', 'Beta Finance LLC')] }
    vi.mocked(getFullProfile).mockResolvedValue({ data: withAddress(section) } as never)
    const onShowAddress = vi.fn(), onHideAddress = vi.fn()
    render(<NodePanel node={node('A', 'Alpha Holdings LLC')} refreshKey={0} onShowAddress={onShowAddress}
                      onHideAddress={onHideAddress} addressesInGraph={new Set([KEY])} />)
    fireEvent.click(await screen.findByRole('button', { name: /Registered at the same address/ }))
    expect(screen.queryByRole('button', { name: /Show in graph/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Remove from graph/ }))
    expect(onHideAddress).toHaveBeenCalledWith(KEY)
    expect(onShowAddress).not.toHaveBeenCalled()
  })

  it('stands right beneath the details', async () => {
    vi.mocked(getFullProfile).mockResolvedValue({ data: { ...withAddress(
      { key: KEY, address: CSC, count: 1, entities: [co('B', 'Beta Finance LLC')] }),
      subsidiaries: [{ entity: co('S', 'Sub LLC'), relationship: {} }] } } as never)
    render(<NodePanel node={node('A', 'Alpha Holdings LLC')} refreshKey={0} />)
    const door = await screen.findByRole('button', { name: /Registered at the same address/ })
    const details = screen.getByRole('button', { name: /^Details/ })
    const subs = screen.getByText(/^Subsidiaries/)
    const after = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(after(details, door)).toBe(true)
    expect(after(door, subs)).toBe(true)
  })

  it('pages the rest from the address, never listing the company itself', async () => {
    vi.mocked(getFullProfile).mockResolvedValue({ data: withAddress(
      { key: KEY, address: CSC, count: 3, entities: [co('B', 'Beta Finance LLC')] }) } as never)
    vi.mocked(getCompaniesAtAddress).mockResolvedValue({ data: {
      key: KEY, address: CSC, count: 4, entities: [co('A', 'Alpha Holdings LLC'), co('C', 'Charlie Capital LLC'), co('D', 'Delta LLC')],
    } } as never)
    render(<NodePanel node={node('A', 'Alpha Holdings LLC')} refreshKey={0} />)
    fireEvent.click(await screen.findByRole('button', { name: /Registered at the same address/ }))
    fireEvent.click(screen.getByRole('button', { name: /Show more \(1 of 3\)/ }))
    await screen.findByText('Delta LLC')
    // the next page starts after the rows shown and the company itself
    expect(getCompaniesAtAddress).toHaveBeenCalledWith(KEY, 2)
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull()
    expect(screen.getAllByText('Alpha Holdings LLC')).toHaveLength(1)   // the header, not a row
  })

  it('shows nothing for a company alone at its address or without one', async () => {
    vi.mocked(getFullProfile).mockResolvedValue({ data: withAddress({ key: KEY, address: CSC, count: 0, entities: [] }) } as never)
    const { unmount } = render(<NodePanel node={node('A', 'Alpha Holdings LLC')} refreshKey={0} />)
    await screen.findAllByText('Alpha Holdings LLC')
    expect(screen.queryByRole('button', { name: /Registered at the same address/ })).toBeNull()
    unmount()
    vi.mocked(getFullProfile).mockResolvedValue({ data: withAddress(null) } as never)
    render(<NodePanel node={node('A', 'Alpha Holdings LLC')} refreshKey={0} />)
    await screen.findAllByText('Alpha Holdings LLC')
    expect(screen.queryByRole('button', { name: /Registered at the same address/ })).toBeNull()
  })
})

describe('an address node', () => {
  it('can be taken out of the graph from its own panel', async () => {
    vi.mocked(getCompaniesAtAddress).mockResolvedValue({ data: { key: KEY, address: CSC, count: 1, entities: [co('A', 'Alpha Holdings LLC')] } } as never)
    const onHideAddress = vi.fn()
    render(<NodePanel node={addressNode({ key: KEY, address: CSC, count: 1 })} refreshKey={0} onHideAddress={onHideAddress} />)
    fireEvent.click(await screen.findByRole('button', { name: /Remove from graph/ }))
    expect(onHideAddress).toHaveBeenCalledWith(KEY)
  })

  it('lists every company there, no profile asked', async () => {
    vi.mocked(getCompaniesAtAddress).mockResolvedValue({ data: {
      key: KEY, address: CSC, count: 2, entities: [co('A', 'Alpha Holdings LLC'), co('B', 'Beta Finance LLC')],
    } } as never)
    const onNavigate = vi.fn()
    render(<NodePanel node={addressNode({ key: KEY, address: CSC, count: 2 })} refreshKey={0} onNavigate={onNavigate} />)
    await screen.findByText('Beta Finance LLC')
    expect(getCompaniesAtAddress).toHaveBeenCalledWith(KEY, 0)
    expect(getFullProfile).not.toHaveBeenCalled()
    expect(screen.getByText('2 companies registered here')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Alpha Holdings LLC'))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'A', nodeType: 'entity' })))
  })
})
