/**
 * The queue in its two modes.
 *
 * **Scoped** — opened from under a company's name: that company's reports,
 * grouped. **Everything** — opened from Settings: every report, paged.
 *
 * The parameters are the contract with the server, so they are asserted rather
 * than loosened: a queue that quietly drops `related_to` looks completely normal
 * on screen and shows a moderator other companies' reports under this one's name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModeratorQueue, { PAGE_SIZE } from './ModeratorQueue'
import type { Flag, FlagGroup } from '../types'

vi.mock('../services/api', () => ({
  getFlags: vi.fn(),
  getFlagGroups: vi.fn(),
  updateFlagStatus: vi.fn(),
  suppressFlag: vi.fn(),
  getSuppressions: vi.fn(),
  removeSuppression: vi.fn(),
  getPins: vi.fn(),
  removePin: vi.fn(),
  undoPersonMerge: vi.fn(),
}))
vi.mock('./PinModal', () => ({ default: () => null }))
import { getFlags, getFlagGroups, getSuppressions, getPins, suppressFlag, undoPersonMerge } from '../services/api'

const flagGroup = (o: Partial<FlagGroup> = {}): FlagGroup => ({
  target_kind: 'entity', from_id: '', to_id: '', role: '', node_id: 'Acme Corp',
  category: 'not-real', count: 1, flag_ids: ['f1'], note: 'looks fake', created_at: new Date().toISOString(), ...o,
})

const flag = (o: Partial<Flag> = {}): Flag => ({
  id: 'f1', target_kind: 'entity', category: 'not-real', note: '', status: 'open',
  reporter_kind: 'anon', from_id: '', to_id: '', role: '', node_id: 'Acme Corp',
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...o,
})

/** A page of reports plus the total the server would report alongside it. */
const pageOf = (n: number, total: number, offset = 0) =>
  vi.mocked(getFlags).mockResolvedValue({
    data: Array.from({ length: n }, (_, i) => flag({ id: `f${offset + i}`, node_id: `Co ${offset + i}` })),
    headers: { 'x-total-count': String(total) },
  } as never)

beforeEach(() => {
  vi.clearAllMocks()          // call counts are the assertion here, so they cannot carry over
  vi.mocked(getFlagGroups).mockResolvedValue({ data: [flagGroup()] } as never)
  vi.mocked(getSuppressions).mockResolvedValue({ data: [] } as never)
  vi.mocked(getPins).mockResolvedValue({ data: [] } as never)
  pageOf(1, 1)
})

describe('scoped to one company', () => {
  const scoped = () => render(<ModeratorQueue relatedTo="acme" onClose={vi.fn()} />)

  it('asks for that company only, and stays grouped', async () => {
    scoped()
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument()
    expect(getFlagGroups).toHaveBeenCalledWith({ status: 'open', related_to: 'acme' })
    expect(getFlags).not.toHaveBeenCalled()
  })

  it('shows the target and the category', async () => {
    scoped()
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText(/isn't a real entity/i)).toBeInTheDocument()
  })

  it('keeps the scope when the tab changes', async () => {
    scoped()
    await screen.findByText('Acme Corp')
    await userEvent.click(screen.getByRole('button', { name: 'Rejected' }))
    await waitFor(() =>
      expect(getFlagGroups).toHaveBeenCalledWith({ status: 'rejected', related_to: 'acme' }))
  })

  it('never pages — a company is one screenful, and groups cannot be paged', async () => {
    vi.mocked(getFlagGroups).mockResolvedValue(
      { data: Array.from({ length: PAGE_SIZE + 5 }, (_, i) => flagGroup({ flag_ids: [`f${i}`], node_id: `Co ${i}` })) } as never)
    scoped()
    await screen.findByText('Co 0')
    expect(screen.queryByRole('button', { name: /Next/i })).toBeNull()
  })
})

describe('the full queue', () => {
  const all = () => render(<ModeratorQueue onClose={vi.fn()} />)

  it('asks for individual reports, unscoped, one page at a time', async () => {
    all()
    await screen.findByText('Co 0')
    expect(getFlags).toHaveBeenCalledWith({ status: 'open', skip: 0, limit: PAGE_SIZE })
    expect(getFlagGroups).not.toHaveBeenCalled()
  })

  it('says where you are in the whole set', async () => {
    pageOf(PAGE_SIZE, 60)
    all()
    await screen.findByText('Co 0')
    expect(screen.getByText(`1–${PAGE_SIZE} of 60`)).toBeInTheDocument()
  })

  it('walks forward by a page', async () => {
    pageOf(PAGE_SIZE, 60)
    all()
    await screen.findByText('Co 0')
    await userEvent.click(screen.getByRole('button', { name: /Next/i }))
    await waitFor(() =>
      expect(getFlags).toHaveBeenCalledWith({ status: 'open', skip: PAGE_SIZE, limit: PAGE_SIZE }))
    expect(screen.getByText(`${PAGE_SIZE + 1}–${PAGE_SIZE * 2} of 60`)).toBeInTheDocument()
  })

  it('offers no way back from the first page', async () => {
    pageOf(PAGE_SIZE, 60)
    all()
    await screen.findByText('Co 0')
    expect(screen.getByRole('button', { name: /Previous/i })).toBeDisabled()
  })

  it('offers no next on the last page, and the range stops at the total', async () => {
    pageOf(PAGE_SIZE, 30)
    all()
    await screen.findByText('Co 0')
    await userEvent.click(screen.getByRole('button', { name: /Next/i }))
    await waitFor(() => expect(getFlags).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled()
    expect(screen.getByText(`${PAGE_SIZE + 1}–30 of 30`)).toBeInTheDocument()
  })

  it('hides the pager when everything fits on one page', async () => {
    pageOf(3, 3)
    all()
    await screen.findByText('Co 0')
    expect(screen.queryByRole('button', { name: /Next/i })).toBeNull()
  })

  it('goes back to the first page when the tab changes', async () => {
    pageOf(PAGE_SIZE, 60)
    all()
    await screen.findByText('Co 0')
    await userEvent.click(screen.getByRole('button', { name: /Next/i }))
    await waitFor(() => expect(getFlags).toHaveBeenLastCalledWith(expect.objectContaining({ skip: PAGE_SIZE })))
    await userEvent.click(screen.getByRole('button', { name: 'Rejected' }))
    await waitFor(() =>
      expect(getFlags).toHaveBeenLastCalledWith({ status: 'rejected', skip: 0, limit: PAGE_SIZE }))
  })

  it('shows no pager when the server sends no total, rather than a page 2 that is not there', async () => {
    vi.mocked(getFlags).mockResolvedValue({ data: [flag({ node_id: 'Co 0' })], headers: {} } as never)
    all()
    await screen.findByText('Co 0')
    expect(screen.queryByRole('button', { name: /Next/i })).toBeNull()
  })
})

describe('always', () => {
  it('switches to the Suppressed tab and fetches suppressions', async () => {
    render(<ModeratorQueue relatedTo="acme" onClose={vi.fn()} />)
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

/**
 * A person made by merging two is not suppressed at once. What somebody reports
 * as "not mine" may be the other person's, and then the fix is to undo the
 * merge — so the server answers 409 and the queue has to put the question.
 */
describe('a merged person', () => {
  const question = {
    code: 'merged_person', message: 'm', fields: [],
    merges: [{ snapshot_id: 's1', keep_id: 'p-keep', keep_name: 'Jane Smith', dup_id: 'choff:dup',
               dup_name: 'Jane Mary Smith', at: '2026-11-16T18:14:00+00:00', reason: 'same birth month',
               fields: {}, link: 'duplicate' }],
  }
  const seat = flagGroup({ target_kind: 'role', from_id: 'p-keep', to_id: 'co-b', role: 'Company Secretary', node_id: '' })

  beforeEach(() => {
    vi.mocked(getFlagGroups).mockResolvedValue({ data: [seat] } as never)
    vi.mocked(suppressFlag).mockReset()
    vi.mocked(undoPersonMerge).mockReset()
    vi.mocked(suppressFlag).mockRejectedValueOnce({ response: { status: 409, data: { detail: question } } })
  })

  const ask = async () => {
    render(<ModeratorQueue relatedTo="p-keep" onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suppress' }))
    await screen.findByText('This person was made by a merge')
  }

  it('asks about the merge instead of suppressing, and says whose seat it was', async () => {
    await ask()
    expect(suppressFlag).toHaveBeenCalledTimes(1)
    expect(suppressFlag).toHaveBeenCalledWith('f1')
    expect(screen.getByText('Jane Smith')).toBeTruthy()
    expect(screen.getByText('This came from Jane Mary Smith.')).toBeTruthy()
    expect(screen.getByText(/same birth month/)).toBeTruthy()
    // the report is still in the queue: nothing happened yet
    expect(screen.getByText('p-keep → co-b (Company Secretary)')).toBeTruthy()
  })

  it('"the merge is right" suppresses with the confirmation and drops the report', async () => {
    vi.mocked(suppressFlag).mockResolvedValueOnce({ data: { id: 'x', flag_id: 'f1', status: 'suppressed' } } as never)
    await ask()
    await userEvent.click(screen.getByRole('button', { name: /The merge is right/ }))
    await waitFor(() => expect(suppressFlag).toHaveBeenLastCalledWith('f1', true))
    await waitFor(() => expect(screen.queryByText('p-keep → co-b (Company Secretary)')).toBeNull())
    expect(screen.queryByText('This person was made by a merge')).toBeNull()
    expect(undoPersonMerge).not.toHaveBeenCalled()
  })

  it('"undo this merge" splits the person, suppresses nothing and keeps the report', async () => {
    vi.mocked(undoPersonMerge).mockResolvedValueOnce({ data: {
      snapshot_id: 's1', kept_id: 'p-keep', restored_id: 'choff:dup',
      written_since: ['HAS_ROLE -> co-x (Director)'], held_back: [], not_restored: [] } } as never)
    await ask()
    await userEvent.click(screen.getByRole('button', { name: /Undo this merge/ }))
    await screen.findByText('The merge is undone: they are two persons again.')
    expect(undoPersonMerge).toHaveBeenCalledWith('s1')
    expect(suppressFlag).toHaveBeenCalledTimes(1)                    // only the first, refused one
    expect(screen.getByText(/1 item written since the merge stays/)).toBeTruthy()
    expect(screen.getByText('Nothing was suppressed. The report stays in the queue.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /The merge is right/ })).toBeNull()
    // the queue was read again: the undo changed what the report points at
    expect(vi.mocked(getFlagGroups).mock.calls.length).toBeGreaterThan(1)
  })

  it('any other failure leaves the row alone and asks nothing', async () => {
    vi.mocked(suppressFlag).mockReset()
    vi.mocked(suppressFlag).mockRejectedValueOnce({ response: { status: 500, data: { detail: 'boom' } } })
    render(<ModeratorQueue relatedTo="p-keep" onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suppress' }))
    await waitFor(() => expect(suppressFlag).toHaveBeenCalled())
    expect(screen.queryByText('This person was made by a merge')).toBeNull()
    expect(screen.getByText('p-keep → co-b (Company Secretary)')).toBeTruthy()
  })
})

