import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModeratorQueue from './ModeratorQueue'
import type { FlagGroup } from '../types'

vi.mock('../services/api', () => ({
  getFlagGroups: vi.fn(),
  updateFlagStatus: vi.fn(),
  suppressFlag: vi.fn(),
  getSuppressions: vi.fn(),
  removeSuppression: vi.fn(),
  getPins: vi.fn(),
  removePin: vi.fn(),
}))
vi.mock('./PinModal', () => ({ default: () => null }))
import { getFlagGroups, getSuppressions, getPins } from '../services/api'

const flagGroup = (o: Partial<FlagGroup> = {}): FlagGroup => ({
  target_kind: 'entity', from_id: '', to_id: '', role: '', node_id: 'Acme Corp',
  category: 'not-real', count: 1, flag_ids: ['f1'], note: 'looks fake', created_at: new Date().toISOString(), ...o,
})

beforeEach(() => {
  vi.mocked(getFlagGroups).mockResolvedValue({ data: [flagGroup()] } as never)
  vi.mocked(getSuppressions).mockResolvedValue({ data: [] } as never)
  vi.mocked(getPins).mockResolvedValue({ data: [] } as never)
})

describe('ModeratorQueue (render)', () => {
  it('loads open flags and shows the target + category', async () => {
    render(<ModeratorQueue onClose={vi.fn()} />)
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText(/isn't a real entity/i)).toBeInTheDocument()
    expect(getFlagGroups).toHaveBeenCalledWith({ status: 'open' })
  })

  it('switches to the Suppressed tab and fetches suppressions', async () => {
    render(<ModeratorQueue onClose={vi.fn()} />)
    await screen.findByText('Acme Corp')
    await userEvent.click(screen.getByRole('button', { name: 'Suppressed' }))
    await waitFor(() => expect(getSuppressions).toHaveBeenCalled())
  })

  it('closes via the close button', async () => {
    const onClose = vi.fn()
    render(<ModeratorQueue onClose={onClose} />)
    await userEvent.click(screen.getAllByRole('button')[0])
    expect(onClose).toHaveBeenCalled()
  })
})
