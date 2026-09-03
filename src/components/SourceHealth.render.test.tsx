import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/api', () => ({ getScraperHealth: vi.fn() }))

import SourceHealth from './SourceHealth'
import { getScraperHealth } from '../services/api'
import type { ScraperHealth, SourceHealthEntry } from '../types'

const mockHealth = vi.mocked(getScraperHealth)

const entry = (o: Partial<SourceHealthEntry>): SourceHealthEntry => ({
  name: 'wikidata', label: 'Wikidata', kind: 'instant', quality: 'community',
  enabled: true, last_run_at: new Date(Date.now() - 120_000).toISOString(),
  last_status: 'ok', last_total: 12, last_ok_at: null,
  failure_streak: 0, runs_24h: 3, ...o,
})

const health = (o: Partial<ScraperHealth> = {}): ScraperHealth => ({
  sources: [entry({})], datasets: [], import_lock: { held: false }, ...o,
})

const resolve = (h: ScraperHealth) =>
  mockHealth.mockResolvedValue({ data: h } as never)

beforeEach(() => mockHealth.mockReset())

describe('SourceHealth', () => {
  it('a healthy source shows label, recency and item count', async () => {
    resolve(health())
    const { container } = render(<SourceHealth />)
    expect(await screen.findByText('Wikidata')).toBeTruthy()
    // the meta line is assembled from fragments — assert the joined text
    const meta = container.querySelector('.src-health__meta')
    expect(meta?.textContent).toContain('2m ago')
    expect(meta?.textContent).toContain('12 items')
  })

  it('a failure streak of 2+ shows the failing badge, 1 does not', async () => {
    resolve(health({ sources: [
      entry({ name: 'a', label: 'A', last_status: 'failed', failure_streak: 3 }),
      entry({ name: 'b', label: 'B', last_status: 'failed', failure_streak: 1 }),
    ] }))
    render(<SourceHealth />)
    await screen.findByText('A')
    expect(screen.getByText(/×3 failing/)).toBeTruthy()
    expect(screen.queryByText(/×1 failing/)).toBeNull()
  })

  it('a source that never ran says so in the muted state', async () => {
    resolve(health({ sources: [entry({ last_run_at: null, last_status: null })] }))
    const { container } = render(<SourceHealth />)
    await screen.findByText(/never ran/)
    expect(container.querySelector('.src-health__row--never')).toBeTruthy()
  })

  it('a dataset shows its scope, age and lag', async () => {
    resolve(health({ datasets: [{
      name: 'bods_gleif', label: 'GLEIF', scope: 'subset',
      last_publish_date: '2026-09-01 08:00:00', behind_days: 2,
    }] }))
    render(<SourceHealth />)
    expect(await screen.findByText(/data as of 2026-09-01/)).toBeTruthy()
    expect(screen.getByText(/2 days behind/)).toBeTruthy()
    expect(screen.getByText('test subset')).toBeTruthy()
  })

  it('the lock pill appears only while an import holds the lock', async () => {
    resolve(health({ import_lock: { held: true } }))
    render(<SourceHealth />)
    expect(await screen.findByText(/import running/)).toBeTruthy()
  })

  it('the error line renders only when the backend included one', async () => {
    resolve(health({ sources: [
      entry({ last_status: 'failed', last_error: 'boom at internal' }),
    ] }))
    render(<SourceHealth />)
    expect(await screen.findByText(/boom at internal/)).toBeTruthy()
  })
})
