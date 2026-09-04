import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/api', () => ({
  getScraperSources: vi.fn(),
  getScraperHealth: vi.fn(),
  getStats: vi.fn(),
}))

import CoveragePage from './CoveragePage'
import { getScraperSources, getScraperHealth, getStats } from '../services/api'
import type { ScraperSource, ScraperHealth } from '../types'

const mockSources = vi.mocked(getScraperSources)
const mockHealth = vi.mocked(getScraperHealth)
const mockStats = vi.mocked(getStats)

const src = (o: Partial<ScraperSource>): ScraperSource => ({
  name: 'sec_edgar', description: 'd', enabled: true, kind: 'instant',
  label: 'SEC EDGAR', url: 'https://www.sec.gov/edgar', credibility: 98,
  quality: 'statutory', region: 'US',
  coverage: 'Ownership of US-listed companies', ...o,
})

const health = (o: Partial<ScraperHealth> = {}): ScraperHealth => ({
  sources: [], datasets: [], import_lock: { held: false }, ...o,
})

beforeEach(() => {
  mockSources.mockReset(); mockHealth.mockReset(); mockStats.mockReset()
  mockSources.mockResolvedValue({ data: [src({})] } as never)
  mockHealth.mockResolvedValue({ data: health() } as never)
  mockStats.mockResolvedValue({
    data: { companies: 1838, people: 306, relationships: 2394, sources: 4 },
  } as never)
})

describe('CoveragePage', () => {
  it('renders a source card with region, coverage sentence and quality', async () => {
    render(<CoveragePage />)
    expect(await screen.findByText('SEC EDGAR')).toBeTruthy()
    expect(screen.getByText('US')).toBeTruthy()
    expect(screen.getByText('Ownership of US-listed companies')).toBeTruthy()
    expect(screen.getByText(/Legally mandated filings/)).toBeTruthy()
  })

  it('shows the graph totals', async () => {
    render(<CoveragePage />)
    expect(await screen.findByText('1,838')).toBeTruthy()
    expect(screen.getByText('2,394')).toBeTruthy()
  })

  it('an instant source shows its last successful update from health', async () => {
    mockHealth.mockResolvedValue({ data: health({ sources: [{
      name: 'sec_edgar', label: 'SEC EDGAR', failure_streak: 0, runs_24h: 1,
      last_ok_at: new Date(Date.now() - 3600_000).toISOString(),
    }] }) } as never)
    render(<CoveragePage />)
    expect(await screen.findByText(/last updated 1h ago/)).toBeTruthy()
  })

  it('a bulk source shows data-as-of, lag and scope from the dataset', async () => {
    mockSources.mockResolvedValue({ data: [src({
      name: 'bods_gleif', label: 'GLEIF', kind: 'bulk', region: 'Global',
      coverage: 'Legal entities worldwide', quality: 'official', credibility: 92,
    })] } as never)
    mockHealth.mockResolvedValue({ data: health({ datasets: [{
      name: 'bods_gleif', label: 'GLEIF', scope: 'subset',
      last_publish_date: '2026-09-03 08:00:00', behind_days: 1,
    }] }) } as never)
    const { container } = render(<CoveragePage />)
    await screen.findByText('GLEIF')
    const fresh = container.querySelector('.coverage__fresh')
    expect(fresh?.textContent).toContain('data as of 2026-09-03')
    expect(fresh?.textContent).toContain('1 day behind')
    expect(fresh?.textContent).toContain('test subset')
  })

  it('a source health has never seen renders the muted never-ran state', async () => {
    render(<CoveragePage />)
    await screen.findByText('SEC EDGAR')
    expect(screen.getByText(/never ran/)).toBeTruthy()
  })

  it('a paused instant source wears the chip absorbed from the old catalogue', async () => {
    mockSources.mockResolvedValue({ data: [src({ enabled: false })] } as never)
    render(<CoveragePage />)
    await screen.findByText('SEC EDGAR')
    expect(screen.getByText(/on-demand lookups paused/)).toBeTruthy()
  })

  it('the ops link navigates to the scraper tab', async () => {
    const onShowScraper = vi.fn()
    render(<CoveragePage onShowScraper={onShowScraper} />)
    const link = await screen.findByText(/Live scrape activity/)
    link.closest('button')!.click()
    expect(onShowScraper).toHaveBeenCalled()
  })
})
