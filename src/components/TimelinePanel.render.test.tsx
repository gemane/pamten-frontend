import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TimelinePanel from './TimelinePanel'

vi.mock('../services/api', () => ({ getHistory: vi.fn() }))
import { getHistory } from '../services/api'
const mockHistory = vi.mocked(getHistory)

const ev = (o: Record<string, unknown>) => ({ active: true, stake_percent: null, ownership_type: 'controlling', ...o })

beforeEach(() => mockHistory.mockReset())

describe('a real acquisition, and a running holding', () => {
  it('the acquisition reader\'s closing date reads "Acquired", with the price and the filing', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_out', since: '2026-03-11', party: { id: 'wiz', name: 'WIZ, INC.' },
           start_kind: 'acquired', value_usd: 2.95e10,
           since_source_url: 'https://www.sec.gov/Archives/edgar/data/1652044/000165204426000071/goog-20260331_htm.xml' }),
      ev({ kind: 'ownership_in', since: '2026-03-10', party: { id: 'g', name: 'Alphabet, Inc.' },
           start_kind: 'acquired', value_usd: 5.9e9 }),
      ev({ kind: 'ownership_out', since: '2019-01-01', party: { id: 'k', name: 'Listed Ltd' } }),
    ] } as never)
    render(<TimelinePanel entityId="x" />)
    await screen.findByText('WIZ, INC.')
    expect(screen.getByText('Acquired')).toBeInTheDocument()
    expect(screen.getByText('Acquired by')).toBeInTheDocument()
    expect(screen.getByText('Owns')).toBeInTheDocument()                 // the list's edge stays "Owns"
    const deals = screen.getAllByTestId('tl-deal')
    expect(deals[0]).toHaveTextContent('for $29.5 bn')
    expect(deals[0].querySelector('a')).toHaveAttribute('href', expect.stringContaining('goog-20260331_htm.xml'))
    expect(deals[1]).toHaveTextContent('for $5.9 bn')
    expect(deals[1].querySelector('a')).toBeNull()
    // no state badge on a running holding: a timeline tells transitions
    expect(screen.queryByText('ongoing')).toBeNull()
    expect(screen.queryByText('Active')).toBeNull()
  })

  it('a 13F holding carries a market value, which is not a price: no "for …"', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_in', since: '2020-03-31', since_basis: 'first_reported', stake_percent: 1.2,
           party: { id: 'v', name: 'Vanguard Group' }, value_usd: 1.2e9 }),
    ] } as never)
    render(<TimelinePanel entityId="x" />)
    await screen.findByText('Vanguard Group')
    expect(screen.queryByTestId('tl-deal')).toBeNull()
    expect(screen.getByText('Owned by')).toBeInTheDocument()
  })

  it('a rename reads "Renamed", the old name then the new, under the year the old name ended', async () => {
    mockHistory.mockResolvedValue({ data: [
      { kind: 'renamed', party: null, since: '2021-08-20', until: null, active: false,
        former_name: 'BRIGHTSTAR 20:20 UK LIMITED', new_name: 'LIKEWIZE SERVICES UK LIMITED' },
      { kind: 'renamed', party: null, since: '2013-11-27', until: null, active: false,
        former_name: '20:20 MOBILE 1 LIMITED', new_name: 'BRIGHTSTAR 20:20 UK LIMITED' },
      ev({ kind: 'ownership_in', since: '2018-11-09', party: { id: 'sb', name: 'Softbank Group Corp' } }),
    ] } as never)
    render(<TimelinePanel entityId="x" />)
    const rows = await screen.findAllByTestId('tl-renamed')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Renamed')
    expect(rows[0]).toHaveTextContent('BRIGHTSTAR 20:20 UK LIMITED → LIKEWIZE SERVICES UK LIMITED')
    expect(rows[0]).toHaveTextContent('The register records the change of name on 2021-08-20.')
    expect(rows[0].querySelector('[aria-label="became"]')).not.toBeNull()
    // filed under its own year, between the holding's 2018 and the older rename
    const years = screen.getAllByText(/^20\d\d$/).map(e => e.textContent)
    expect(years).toEqual(['2021', '2018', '2013'])
    // a rename is a transition in itself: no derived "ended" or "no longer confirmed" row
    expect(screen.queryByTestId('tl-ended')).toBeNull()
    expect(screen.queryByTestId('tl-dimmed')).toBeNull()
  })

  it('a rename whose successor is unknown shows the old name alone', async () => {
    mockHistory.mockResolvedValue({ data: [
      { kind: 'renamed', party: null, since: '2020-01-01', former_name: 'Old Co', new_name: null },
    ] } as never)
    render(<TimelinePanel entityId="x" />)
    const row = await screen.findByTestId('tl-renamed')
    expect(row).toHaveTextContent('Old Co')
    expect(row.textContent).not.toContain('→')
  })

  it('formats a price the way the panel says it', async () => {
    const { formatUsd } = await import('./TimelinePanel')
    expect(formatUsd(2.95e10)).toBe('$29.5 bn')
    expect(formatUsd(5.9e9)).toBe('$5.9 bn')
    expect(formatUsd(2.7e9)).toBe('$2.7 bn')
    expect(formatUsd(150e9)).toBe('$150 bn')
    expect(formatUsd(2.7e6)).toBe('$2.7 m')
    expect(formatUsd(950000)).toBe('$950,000')
  })
})

describe('an end is a transition too', () => {
  it('an ended holding gets its own entry under the year it ended, saying how the source states it', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_in', since: '2020-03-31', since_basis: 'first_reported', until: '2024-02-13',
           active: false, filing_type: '13G/A', until_reason: null, party: { id: 'v', name: 'Vanguard Group' },
           source_url: 'https://www.sec.gov/Archives/edgar/data/1/0009/amend.xml' }),
      ev({ kind: 'ownership_out', since: '2016-04-06', since_basis: 'register_start', until: '2021-03-31',
           active: false, filing_type: 'PSC', until_reason: 'ceased', party: { id: 'c', name: 'Ceased Ltd' } }),
      ev({ kind: 'ownership_out', since: '2015-01-01', until: '2024-01-10', active: false,
           filing_type: 'RR', until_reason: 'gleif_dropped', party: { id: 'd', name: 'Dropped GmbH' } }),
      ev({ kind: 'ownership_out', since: '2019-01-01', party: { id: 'k', name: 'Kept Ltd' } }),
    ] } as never)
    render(<TimelinePanel entityId="x" />)
    await screen.findByText('Kept Ltd')
    const ends = screen.getAllByTestId('tl-ended')
    expect(ends).toHaveLength(3)                                     // Kept Ltd has no end
    const by = (name: string) => ends.find(e => e.textContent!.includes(name))!
    expect(by('Vanguard Group')).toHaveTextContent('No longer owned by')
    expect(by('Vanguard Group')).toHaveTextContent('amended ownership report of 2024-02-13')
    expect(by('Vanguard Group').querySelector('a')).toHaveAttribute('href', expect.stringContaining('amend.xml'))
    expect(by('Ceased Ltd')).toHaveTextContent('No longer owns')
    expect(by('Ceased Ltd')).toHaveTextContent('ceased to be a person with significant control on 2021-03-31')
    expect(by('Ceased Ltd').querySelector('a')).toBeNull()
    expect(by('Dropped GmbH')).toHaveTextContent('no longer appears in GLEIF')
    // filed under the years they ended, while the start rows keep their "until" badge
    expect(screen.getByText('2021')).toBeInTheDocument()
    expect(screen.getAllByText('until 2024')).toHaveLength(2)      // Vanguard and Dropped GmbH
    expect(screen.queryByText(/sold/i)).toBeNull()
  })

  it('a role that ended is a transition as well', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'role', role: 'CEO', since: '2000-01-01', until: '2011-08-24', active: false,
           party: { id: 'sj', full_name: 'Steve Jobs' } }),
    ] } as never)
    render(<TimelinePanel entityId="x" />)
    const end = await screen.findByTestId('tl-ended')
    expect(end).toHaveTextContent('No longer CEO')
    expect(end).toHaveTextContent('Steve Jobs')
    expect(end.querySelector('.tl-event__reason')).toBeNull()      // no source reason for roles
    expect(screen.getByText('2011')).toBeInTheDocument()
  })

  it('a seat the holder\'s death ended reads as the death, not as leaving', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'role', role: 'Board Member', since: '1990-01-01', until: '2022-05-17', active: false,
           until_reason: 'death', party: { id: 'bp', full_name: 'Byung-Gook Park' } }),
    ] } as never)
    render(<TimelinePanel entityId="x" />)
    const end = await screen.findByTestId('tl-ended')
    expect(end).toHaveTextContent('Died while Board Member')
    expect(end).not.toHaveTextContent('No longer')
    expect(screen.getByText('died 2022')).toBeInTheDocument()       // the start row's badge
    expect(screen.queryByText('until 2022')).toBeNull()
  })
})

describe('why a holding went grey', () => {
  it('a dimmed holding reads "not confirmed", and gets a dated entry saying why', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_in', since: '2020-03-31', since_basis: 'first_reported', stake_percent: 1.2,
           party: { id: 'v', name: 'Vanguard Group' }, stale: true, stale_since: '2026-06-30',
           stale_reason: '13f_not_confirmed', stale_source_url: null }),
      ev({ kind: 'ownership_out', since: '2019-01-01', party: { id: 'k', name: 'Kept Ltd' } }),
    ] } as never)
    render(<TimelinePanel entityId="nc" />)
    await screen.findByText('Kept Ltd')
    // the holding's own row: dimmed, not "Active" — with the reason on hover
    const badge = screen.getByText('not confirmed')
    expect(badge).toHaveAttribute('title', expect.stringContaining('2026-06-30'))
    expect(screen.queryByText('ongoing')).toBeNull()                // Kept Ltd carries no state badge
    // the dated entry under 2026, in words
    const entry = screen.getByTestId('tl-dimmed')
    expect(entry).toHaveTextContent('No longer confirmed')
    expect(entry).toHaveTextContent('Vanguard Group')
    expect(entry).toHaveTextContent('quarter ending 2026-06-30')
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(entry.querySelector('a')).toBeNull()                      // a 13F has no newer list to link
  })

  it('words a 13D/G statement older than its restatement window', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_in', since: '2014-02-14', since_basis: 'first_reported', stake_percent: 7.11,
           party: { id: 'm', name: 'Macquarie Bank' }, stale: true, stale_since: '2014-02-14',
           stale_reason: 'not_restated', stale_source_url: null }),
    ] } as never)
    render(<TimelinePanel entityId="nc" />)
    const entry = await screen.findByTestId('tl-dimmed')
    expect(entry).toHaveTextContent('No longer confirmed')
    expect(entry).toHaveTextContent('last Schedule 13D/G, filed 2014-02-14')
    expect(entry).not.toHaveTextContent('No newer source confirms this')
  })

  it('links the newer subsidiary list when there is one', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_out', since: '2014-12-31', since_basis: 'first_listed',
           party: { id: 'd', name: 'Dropped GmbH' }, stale: true, stale_since: '2025-12-31',
           stale_reason: 'ex21_not_listed',
           stale_source_url: 'https://www.sec.gov/Archives/edgar/data/1/0002/ex21.htm' }),
    ] } as never)
    render(<TimelinePanel entityId="nc" />)
    const entry = await screen.findByTestId('tl-dimmed')
    expect(entry).toHaveTextContent('newer subsidiary list dated 2025-12-31')
    const link = entry.querySelector('a')!
    expect(link).toHaveAttribute('href', 'https://www.sec.gov/Archives/edgar/data/1/0002/ex21.htm')
    expect(link).toHaveTextContent('the newer list')
  })

  it('a holding dimmed before the reason was recorded keeps the badge but gets no dated entry', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_in', since: '2018-01-01', party: { id: 'w', name: 'Old Mark Inc' }, stale: true }),
    ] } as never)
    render(<TimelinePanel entityId="nc" />)
    await screen.findByText('Old Mark Inc')
    expect(screen.getByText('not confirmed')).toHaveAttribute('title', expect.stringContaining('No newer source'))
    expect(screen.queryByTestId('tl-dimmed')).toBeNull()
  })

  it('an unknown reason code reads as the generic reason, and a fresh holding gets nothing', async () => {
    mockHistory.mockResolvedValue({ data: [
      ev({ kind: 'ownership_in', since: '2018-01-01', party: { id: 'u', name: 'Odd Reason Co' },
           stale: true, stale_since: '2025-01-01', stale_reason: 'something_new' }),
      ev({ kind: 'ownership_in', since: '2021-01-01', party: { id: 'f', name: 'Fresh Co' }, stale: false }),
    ] } as never)
    render(<TimelinePanel entityId="nc" />)
    const entry = await screen.findByTestId('tl-dimmed')
    expect(entry).toHaveTextContent('No newer source confirms this')
    expect(screen.getAllByTestId('tl-dimmed')).toHaveLength(1)
  })
})

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

describe('a holding crossing the 5 % line', () => {
  it('reads "Holder reached 5 %" with the move and the filing, under the statement\'s year', async () => {
    mockHistory.mockResolvedValue({ data: [
      { kind: 'stake_reached', direction: 'in', party: { id: 'br', name: 'BlackRock' }, since: '2025-02-13',
        since_basis: null, until: null, active: null, stake_percent: 7.3, previous_percent: 4.8,
        source_id: 'sec', filing_type: '13G/A', source_url: 'https://www.sec.gov/Archives/13ga.htm' },
      { kind: 'stake_dropped', direction: 'out', party: { id: 'li', name: 'LinkedIn' }, since: '2026-01-05',
        since_basis: null, until: null, active: null, stake_percent: 3.0, previous_percent: 9.0, source_id: 'gleif' },
      ev({ kind: 'ownership_in', since: '2019-01-01', party: { id: 'v', name: 'Vanguard Group' } }),
    ] } as never)
    render(<TimelinePanel entityId="x" />)
    const rows = await screen.findAllByTestId('tl-crossing')
    expect(rows).toHaveLength(2)
    expect(screen.getByText('Holder reached 5 %')).toBeInTheDocument()
    expect(screen.getByText('Holding fell below 5 %')).toBeInTheDocument()
    const moves = screen.getAllByTestId('tl-crossing-move')
    expect(moves[0]).toHaveTextContent('9 % → 3 %')          // newest year first: 2026 (LinkedIn)
    expect(moves[1]).toHaveTextContent('4.8 % → 7.3 %, as stated on 2025-02-13')
    expect(moves[1].querySelector('a')).toHaveAttribute('href', 'https://www.sec.gov/Archives/13ga.htm')
    expect(moves[0].querySelector('a')).toBeNull()
    // the crossing is a transition, not a holding: no stake badge, no "Owned by"
    expect(screen.getAllByText('Owned by')).toHaveLength(1)
  })

  it('a stake withdrawn reads "not stated"', async () => {
    mockHistory.mockResolvedValue({ data: [
      { kind: 'stake_dropped', direction: 'in', party: { id: 'br', name: 'BlackRock' }, since: '2025-02-13',
        stake_percent: null, previous_percent: 7.3, source_id: 'sec' },
    ] } as never)
    render(<TimelinePanel entityId="x" />)
    expect(await screen.findByTestId('tl-crossing-move')).toHaveTextContent('7.3 % → not stated')
  })
})
