import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReportModal from './ReportModal'

vi.mock('../services/api', () => ({ createFlag: vi.fn() }))
import { createFlag } from '../services/api'
const mockCreate = vi.mocked(createFlag)

beforeEach(() => mockCreate.mockReset())

describe('ReportModal (render)', () => {
  it('offers node-appropriate categories and submits a flag, then thanks the user', async () => {
    mockCreate.mockResolvedValue({ data: { status: 'open' } } as never)
    const onReported = vi.fn()
    render(<ReportModal targetKind="entity" targetLabel="Acme Corp" nodeId="e1" onClose={vi.fn()} onReported={onReported} />)

    // A node target can't be reported for edge-only reasons like "wrong owner".
    expect(screen.getByRole('option', { name: 'Out of date' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Wrong owner' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Send report' }))

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ target_kind: 'entity', node_id: 'e1', category: 'not-real' }),
    )
    expect(await screen.findByText(/a moderator will review it/i)).toBeInTheDocument()
    expect(onReported).toHaveBeenCalled()
  })

  it('offers edge-appropriate categories for an owns edge', () => {
    render(<ReportModal targetKind="owns" targetLabel="A → B" fromId="a" toId="b" onClose={vi.fn()} />)
    expect(screen.getByRole('option', { name: 'Wrong ownership %' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: "This isn't a real entity" })).toBeNull()
  })

  it('closes via the close button', async () => {
    const onClose = vi.fn()
    render(<ReportModal targetKind="entity" targetLabel="Acme" nodeId="e1" onClose={onClose} />)
    // The × button is the first control in the modal.
    await userEvent.click(screen.getAllByRole('button')[0])
    expect(onClose).toHaveBeenCalled()
  })
})
