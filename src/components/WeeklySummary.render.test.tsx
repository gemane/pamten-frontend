import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../services/api', () => ({ getWeeklyReport: vi.fn() }))

import WeeklySummary from './WeeklySummary'
import { getWeeklyReport } from '../services/api'
import type { WeeklyReport } from '../types'

const mockGet = vi.mocked(getWeeklyReport)

const report = (week = '2026-W38', extra: Partial<WeeklyReport> = {}): WeeklyReport => ({
  week, label: `week ${week.slice(-2)}`, from: '2026-09-14', to: '2026-09-21',
  generated_at: '2026-09-21T06:00:00Z',
  searches: { total: 12, distinct_queries: 3, zero_results: 2, selected: 9,
              top: [{ query: 'SpaceX', country: null, searches: 8, zero_results: 0 },
                    { query: 'Alphabet', country: 'FR', searches: 2, zero_results: 2 }],
              usage: {} },
  scrapes: { runs: 5, by_source: { wikidata: { ok: 3 } }, records_written: 301,
             first_scrapes: [{ entity_id: 'e1', target: 'Gigafund', records: 4, name: 'Gigafund Management Company, LLC' }],
             refreshed: [{ entity_id: 'e2', target: 'SpaceX', records: 292, name: 'SPACE EXPLORATION TECHNOLOGIES CORP.' }],
             failures: [{ source: 'sec-13f', target: 'SpaceX', error: '500' }],
             sec_enrichments: {} },
  imports: { 'gleif-update': { runs: 7, ok: 7, failed: 0, skipped: 0, records: 184 } },
  graph: { totals: { companies: 6773, people: 385, relationships: 7638, roles: 440 },
           new_relationships: {}, since: '2026-W37',
           delta: { companies: 5, people: -1, relationships: 300, roles: 9 } },
  ...extra,
})

beforeEach(() => {
  mockGet.mockReset()
  mockGet.mockImplementation((week?: string) =>
    Promise.resolve({ data: report(week ?? '2026-W38') }) as never)
})

describe('WeeklySummary', () => {
  it('shows the four blocks with the numbers, the named companies and the deltas', async () => {
    render(<WeeklySummary />)
    expect(await screen.findByText('12')).toBeInTheDocument()            // searches
    expect(screen.getByText('3 distinct queries · 2 found nothing')).toBeInTheDocument()
    expect(screen.getByText('SpaceX')).toBeInTheDocument()
    expect(screen.getByText('FR')).toBeInTheDocument()
    expect(screen.getByText('no result')).toBeInTheDocument()
    expect(screen.getByText('301 records written · 1 failed')).toBeInTheDocument()
    expect(screen.getByText('Scraped for the first time (1)')).toBeInTheDocument()
    expect(screen.getByText('Gigafund Management Company, LLC')).toBeInTheDocument()
    expect(screen.getByText('Refreshed (1)')).toBeInTheDocument()
    expect(screen.getByText('7 runs · 184 records · 0 failed')).toBeInTheDocument()
    expect(screen.getByText('(+5)')).toBeInTheDocument()
    expect(screen.getByText('(-1)')).toBeInTheDocument()
    expect(screen.getByText(/change since 2026-W37/)).toBeInTheDocument()
  })

  it('asks for the server default first, then walks back a week and forward again', async () => {
    render(<WeeklySummary />)
    await screen.findByText(/week 38/)
    expect(mockGet).toHaveBeenCalledWith(undefined)
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await screen.findByText(/week 37/)
    expect(mockGet).toHaveBeenLastCalledWith('2026-W37')
    // forward is allowed only up to the newest week the server offered
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
    await screen.findByText(/week 38/)
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled()
  })

  it('crosses the year boundary correctly', async () => {
    mockGet.mockImplementation((week?: string) =>
      Promise.resolve({ data: report(week ?? '2026-W01') }) as never)
    render(<WeeklySummary />)
    await screen.findByText(/week 01/)
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith('2025-W52'))
  })

  it('an empty week reads as quiet, not broken', async () => {
    mockGet.mockResolvedValue({ data: report('2026-W38', {
      searches: { total: 0, distinct_queries: 0, zero_results: 0, selected: 0, top: [], usage: {} },
      scrapes: { runs: 0, by_source: {}, records_written: 0, first_scrapes: [], refreshed: [], failures: [], sec_enrichments: {} },
      imports: {},
      graph: { totals: { companies: 1 }, new_relationships: {}, since: null, delta: null },
    }) } as never)
    render(<WeeklySummary />)
    expect(await screen.findByText('none')).toBeInTheDocument()
    expect(screen.queryByText(/first time/)).toBeNull()
    expect(screen.queryByText(/change since/)).toBeNull()
  })

  it('says so when the digest cannot be loaded', async () => {
    mockGet.mockRejectedValue(new Error('403'))
    render(<WeeklySummary />)
    expect(await screen.findByText('Could not load the weekly summary.')).toBeInTheDocument()
  })
})
