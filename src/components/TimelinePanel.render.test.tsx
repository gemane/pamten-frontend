import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import TimelinePanel from './TimelinePanel'

vi.mock('../services/api', () => ({ getHistory: vi.fn() }))
import { getHistory } from '../services/api'
const mockHistory = vi.mocked(getHistory)

const ev = (o: Record<string, unknown>) => ({ active: true, stake_percent: null, ownership_type: 'controlling', ...o })

beforeEach(() => mockHistory.mockReset())

describe('TimelinePanel', () => {
  it('says "Owns" / "Owned by", never "Acquired" — a list is not a purchase', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_out', since: '2019-08-13', party: { id: 'dj', name: 'Dow Jones & Company, Inc.' } }),
      ev({ kind: 'ownership_in', since: '2013-06-28', party: { id: 'p', name: 'Parent Holdings' } }),
    ] } as never)
    render(<TimelinePanel entityId="nc" />)
    expect(await screen.findByText('Dow Jones & Company, Inc.')).toBeInTheDocument()
    expect(screen.getByText('Owns')).toBeInTheDocument()
    expect(screen.getByText('Owned by')).toBeInTheDocument()
    expect(screen.queryByText(/Acquired/)).toBeNull()
  })

  it('marks a start date that is only a lower bound, and nothing else', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_out', since: '2014-08-14', since_basis: 'first_listed',
           party: { id: 'dj', name: 'Dow Jones & Company, Inc.' } }),
      ev({ kind: 'ownership_out', since: '2020-01-01', party: { id: 'x', name: 'Stated Start Ltd' } }),
    ] } as never)
    render(<TimelinePanel entityId="nc" />)
    const badge = await screen.findByText('since 2014 or earlier')
    expect(badge).toHaveAttribute('title', expect.stringContaining('2014'))
    expect(screen.getAllByText(/or earlier/)).toHaveLength(1)
  })

  it('a subsidiary list without a start date sits under "No date recorded", not this year', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_out', since: null, party: { id: 'st', name: 'Storyful Limited' } }),
    ] } as never)
    render(<TimelinePanel entityId="nc" />)
    expect(await screen.findByText('No date recorded')).toBeInTheDocument()
    expect(screen.queryByText('2026')).toBeNull()
  })
})
