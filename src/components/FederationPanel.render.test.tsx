import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import FederationPanel from './FederationPanel'
import type { FederationStatus, FederationPeer, FederationPublicKey } from '../types'

vi.mock('../services/api', () => ({
  getFederationStatus: vi.fn(),
  getFederationPeers: vi.fn(),
  getFederationPublicKey: vi.fn(),
  addFederationPeer: vi.fn(),
  deleteFederationPeer: vi.fn(),
  pullFederationPeer: vi.fn(),
}))
import { getFederationStatus, getFederationPeers, getFederationPublicKey } from '../services/api'

const status = (enabled: boolean): FederationStatus => ({ enabled, entities: 1, persons: 2, ownerships: 3 })
const pubkey: FederationPublicKey = { signing_enabled: true, key_id: 'key-abc' }
const peer = (name: string): FederationPeer => ({ id: 'p1', name, base_url: 'https://peer.example' })

beforeEach(() => {
  vi.mocked(getFederationStatus).mockReset()
  vi.mocked(getFederationPeers).mockResolvedValue({ data: { peers: [] } } as never)
  vi.mocked(getFederationPublicKey).mockResolvedValue({ data: pubkey } as never)
})

describe('FederationPanel (render)', () => {
  it('shows the disabled message when federation is off', async () => {
    vi.mocked(getFederationStatus).mockResolvedValue({ data: status(false) } as never)
    render(<FederationPanel />)
    expect(await screen.findByText(/Federation is disabled/i)).toBeInTheDocument()
  })

  it('lists trusted peers when enabled', async () => {
    vi.mocked(getFederationStatus).mockResolvedValue({ data: status(true) } as never)
    vi.mocked(getFederationPeers).mockResolvedValue({ data: { peers: [peer('Partner Org')] } } as never)
    render(<FederationPanel />)
    expect(await screen.findByText('Partner Org')).toBeInTheDocument()
  })

  it('shows the empty-peers hint when enabled with no peers', async () => {
    vi.mocked(getFederationStatus).mockResolvedValue({ data: status(true) } as never)
    render(<FederationPanel />)
    await waitFor(() => expect(screen.getByText(/No trusted peers yet/i)).toBeInTheDocument())
  })
})
