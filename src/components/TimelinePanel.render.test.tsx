import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('says "first listed" where the list for the year before does not name it', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_out', since: '2025-06-30', since_basis: 'newly_listed',
           party: { id: 'st', name: 'Storyful Limited' } }),
      ev({ kind: 'ownership_out', since: '2013-06-30', since_basis: 'first_listed',
           party: { id: 'dj', name: 'Dow Jones & Company, Inc.' } }),
    ] } as never)
    render(<TimelinePanel entityId="nc" />)
    const badge = await screen.findByText('first listed 2025')
    expect(badge).toHaveAttribute('title', expect.stringContaining('year before'))
    expect(screen.getByText('since 2013 or earlier')).toBeInTheDocument()
    expect(screen.queryByText('since 2025 or earlier')).toBeNull()
    expect(screen.getAllByText(/first listed/)).toHaveLength(1)
  })

  it('an amendment and the PSC register start are lower bounds too, each with its reason', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_in', since: '2025-12-31', since_basis: 'amendment',
           party: { id: 'v', name: 'Vanguard Group' } }),
      ev({ kind: 'ownership_in', since: '2016-04-06', since_basis: 'register_start',
           party: { id: 'g', name: 'Group Holdings Ltd' } }),
    ] } as never)
    render(<TimelinePanel entityId="nc" />)
    const amend = await screen.findByText('since 2025 or earlier')
    expect(amend).toHaveAttribute('title', expect.stringContaining('amendment'))
    const reg = screen.getByText('since 2016 or earlier')
    expect(reg).toHaveAttribute('title', expect.stringContaining('6 April 2016'))
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

describe('time travel from the timeline', () => {
  const two = [ev({ kind: 'ownership_out', since: '2019-03-01', party: { id: 'a', name: 'Alpha' } }),
               ev({ kind: 'ownership_out', since: '2014-08-14', party: { id: 'b', name: 'Beta' } }),
               ev({ kind: 'ownership_out', since: null, party: { id: 'c', name: 'Gamma' } })]

  it('a dated year is a button that asks for the end of that year; the undated group is not', async () => {
    mockHistory.mockResolvedValue({ data: two } as never)
    const onYearSelect = vi.fn()
    render(<TimelinePanel entityId="nc" onYearSelect={onYearSelect} />)
    await userEvent.click(await screen.findByRole('button', { name: /2019/ }))
    expect(onYearSelect).toHaveBeenCalledWith('2019-12-31')
    expect(screen.getByText('No date recorded').closest('button')).toBeNull()
  })

  it('the selected year is pressed, and clicking it again asks for the present', async () => {
    mockHistory.mockResolvedValue({ data: two } as never)
    const onYearSelect = vi.fn()
    render(<TimelinePanel entityId="nc" asOf="2014-12-31" onYearSelect={onYearSelect} />)
    const selected = await screen.findByRole('button', { name: /2014/ })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /2019/ })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(selected)
    expect(onYearSelect).toHaveBeenCalledWith(null)
  })

  it('without a handler the years are plain headings, as before', async () => {
    mockHistory.mockResolvedValue({ data: two } as never)
    render(<TimelinePanel entityId="nc" />)
    expect(await screen.findByText('2019')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
