/**
 * What sits under a node's name.
 *
 * The disputed badge is for everyone — it says the record is contested. The
 * queue button is for moderators, and only when this node has something waiting.
 *
 * Two gates, and both fail silently: a moderator control leaking to ordinary
 * readers is invisible in review and obvious in production, and a button that
 * opens an empty queue on every clean company is the thing this change removed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../services/api', () => ({ getFlagSummary: vi.fn() }))
vi.mock('./ModeratorQueue', () => ({
  default: ({ onClose, relatedTo }: { onClose: () => void; relatedTo?: string }) =>
    <div data-testid="queue" data-related-to={relatedTo}>
      <button onClick={onClose}>close</button>
    </div>,
}))

const auth = { user: null as { role: string } | null }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))

import NodeFlags from './NodeFlags'
import { getFlagSummary } from '../services/api'

const summary = (open: number) =>
  vi.mocked(getFlagSummary).mockResolvedValue({ data: { open } } as never)

const show = () => render(<NodeFlags nodeId="e1" targetKind="entity" label="Acme Corp" />)

beforeEach(() => { auth.user = null; vi.mocked(getFlagSummary).mockReset() })

describe('the disputed badge', () => {
  it('appears for anyone when the record is contested', async () => {
    summary(2)
    show()
    expect(await screen.findByText(/Disputed/i)).toBeInTheDocument()
  })

  it('is absent when nothing is contested', async () => {
    summary(0)
    show()
    await waitFor(() => expect(getFlagSummary).toHaveBeenCalled())
    expect(screen.queryByText(/Disputed/i)).toBeNull()
  })

  it('survives a failed summary rather than breaking the panel', async () => {
    vi.mocked(getFlagSummary).mockRejectedValue(new Error('offline'))
    show()
    await waitFor(() => expect(getFlagSummary).toHaveBeenCalled())
    expect(screen.queryByText(/Disputed/i)).toBeNull()
  })
})

describe('the moderator queue', () => {
  it('is offered to a moderator when something is waiting', async () => {
    auth.user = { role: 'moderator' }
    summary(2)
    show()
    expect(await screen.findByRole('button', { name: /Flag queue/i })).toBeInTheDocument()
  })

  it('is offered to an admin', async () => {
    auth.user = { role: 'admin' }
    summary(2)
    show()
    expect(await screen.findByRole('button', { name: /Flag queue/i })).toBeInTheDocument()
  })

  it('is NOT offered on a clean company, even to a moderator', async () => {
    // The point of the change: a button under the name means there is work
    // behind it. The full queue is in Settings for when you go looking.
    auth.user = { role: 'moderator' }
    summary(0)
    const { container } = show()
    await waitFor(() => expect(getFlagSummary).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('is NOT offered to an ordinary user', async () => {
    auth.user = { role: 'viewer' }
    summary(3)
    show()
    await screen.findByText(/Disputed/i)                       // rendered, so we know it ran
    expect(screen.queryByRole('button', { name: /Flag queue/i })).toBeNull()
  })

  it('is NOT offered to a logged-out visitor', async () => {
    summary(3)
    show()
    await screen.findByText(/Disputed/i)
    expect(screen.queryByRole('button', { name: /Flag queue/i })).toBeNull()
  })

  it('opens the queue, scoped to this node', async () => {
    auth.user = { role: 'moderator' }
    summary(1)
    show()
    await userEvent.click(await screen.findByRole('button', { name: /Flag queue/i }))
    expect(screen.getByTestId('queue')).toHaveAttribute('data-related-to', 'e1')
  })
})

describe('the count', () => {
  it('asks for the node AND its relationships, not the node alone', async () => {
    // A report filed by right-clicking a subsidiary row belongs to the panel it
    // was filed from. Ask by node_id and those reports vanish from the company
    // that owns them — with the badge still reading a confident, wrong number.
    summary(1)
    show()
    await waitFor(() => expect(getFlagSummary).toHaveBeenCalledWith({ related_to: 'e1' }))
  })
})

describe('reporting has moved out', () => {
  it('offers no Report button here — it lives in the ⋮ menu now', async () => {
    summary(1)
    show()
    await screen.findByText(/Disputed/i)
    expect(screen.queryByRole('button', { name: /^Report$/i })).toBeNull()
  })

  it('renders nothing at all for a clean record and an ordinary reader', async () => {
    summary(0)
    const { container } = show()
    await waitFor(() => expect(getFlagSummary).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
