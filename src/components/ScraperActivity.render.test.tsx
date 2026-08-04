import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ScraperActivity from './ScraperActivity'
import type { ScrapeRun } from '../types'

vi.mock('../services/api', () => ({ getScraperRuns: vi.fn() }))
import { getScraperRuns } from '../services/api'
const mockRuns = vi.mocked(getScraperRuns)

const run = (o: Partial<ScrapeRun>): ScrapeRun => ({
  id: 'r1', source: 'wikidata', target: 'Acme Corp', status: 'ok',
  started_at: new Date().toISOString(), total: 3, ...o,
})

const resolveRuns = (runs: ScrapeRun[]) =>
  mockRuns.mockResolvedValue({ data: { runs } } as never)

beforeEach(() => mockRuns.mockReset())

describe('ScraperActivity (render)', () => {
  it('lists recent runs with a friendly source label', async () => {
    resolveRuns([run({ source: 'sec_edgar', target: 'Microsoft' })])
    render(<ScraperActivity />)
    expect(await screen.findByText('Microsoft')).toBeInTheDocument()
    expect(screen.getByText('SEC EDGAR')).toBeInTheDocument()
  })

  it('renders nothing once loaded with no runs', async () => {
    resolveRuns([])
    const { container } = render(<ScraperActivity />)
    await waitFor(() => expect(container.querySelector('.scr-activity')).toBeNull())
  })

  it('surfaces a live "running" indicator for in-progress runs', async () => {
    resolveRuns([run({ status: 'running', stale: false, target: 'Tesla' })])
    render(<ScraperActivity />)
    expect(await screen.findByText('Tesla')).toBeInTheDocument()
    expect(screen.getByText(/running/i)).toBeInTheDocument()
  })

  it('shows the error text for a failed run', async () => {
    resolveRuns([run({ status: 'failed', error: 'rate limited', target: 'Foo' })])
    render(<ScraperActivity />)
    expect(await screen.findByText('rate limited')).toBeInTheDocument()
  })
})
