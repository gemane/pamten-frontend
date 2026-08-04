import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DuplicatesModal from './DuplicatesModal'
import type { DuplicateGroup } from '../types'

vi.mock('../services/api', () => ({
  getPersonDuplicates: vi.fn(),
  getMergeLog: vi.fn(),
  getKeptSeparate: vi.fn(),
  mergePersons: vi.fn(),
  runDeduplicate: vi.fn(),
  keepSeparate: vi.fn(),
  undoKeepSeparate: vi.fn(),
}))
import { getPersonDuplicates, getMergeLog, getKeptSeparate } from '../services/api'

const group: DuplicateGroup = {
  confidence: 'high',
  reason: 'same name + shared company',
  suggested_keep_id: 'p1',
  members: [
    { id: 'p1', full_name: 'Larry Page' },
    { id: 'p2', full_name: 'Page Lawrence' },
  ],
}

beforeEach(() => {
  vi.mocked(getPersonDuplicates).mockResolvedValue({ data: { groups: [group] } } as never)
  vi.mocked(getMergeLog).mockResolvedValue({ data: { entries: [] } } as never)
  vi.mocked(getKeptSeparate).mockResolvedValue({ data: { pairs: [] } } as never)
})

describe('DuplicatesModal (render)', () => {
  it('renders a duplicate group with its members and reason', async () => {
    render(<DuplicatesModal onClose={vi.fn()} />)
    expect(await screen.findByText('Larry Page')).toBeInTheDocument()
    expect(screen.getByText('Page Lawrence')).toBeInTheDocument()
    expect(screen.getByText(/same name \+ shared company/i)).toBeInTheDocument()
  })

  it('shows the review tab count', async () => {
    render(<DuplicatesModal onClose={vi.fn()} />)
    // "To review" tab reflects the one pending group.
    expect(await screen.findByText(/To review/i)).toBeInTheDocument()
  })

  it('closes via the close button', async () => {
    const onClose = vi.fn()
    render(<DuplicatesModal onClose={onClose} />)
    await screen.findByText('Larry Page')
    await userEvent.click(screen.getAllByRole('button')[0])   // the × close
    expect(onClose).toHaveBeenCalled()
  })
})
