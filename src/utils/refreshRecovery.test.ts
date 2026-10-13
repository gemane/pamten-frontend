import { describe, expect, it, vi } from 'vitest'
import type { ScrapeRun } from '../types'
import { CLOCK_SLACK_MS, recoverFromRunLog, runStartMs, runsSince } from './refreshRecovery'
import type { RefreshOutcome } from './refreshSummary'

const CLICK = Date.parse('2026-10-13T10:00:00.000Z')
const iso = (offsetMs: number) => new Date(CLICK + offsetMs).toISOString()
const run = (source: string, over: Partial<ScrapeRun> = {}): ScrapeRun => ({
  id: `${source}-${over.started_at ?? 'x'}`, source, target: 'Apple Inc.', status: 'ok',
  started_at: iso(1_000), total: 0, ...over,
})
const empty = (): RefreshOutcome => ({ instant: 'skipped', sec13f: null, secEx21: null, secAcq: null })
const once = (runs: ScrapeRun[]) => vi.fn(async () => runs)
const noSleep = { intervalMs: 0, sleep: async () => {} }

describe('runStartMs', () => {
  it('reads the server stamp, microseconds and offset included', () => {
    expect(runStartMs({ started_at: '2026-10-13T10:00:00.123456+00:00' })).toBe(CLICK + 123)
    expect(runStartMs({ started_at: '2026-10-13T10:00:00.5Z' })).toBe(CLICK + 500)
  })
  it('is NaN for a missing or unreadable stamp, which no comparison accepts', () => {
    expect(runStartMs({ started_at: '' })).toBeNaN()
    expect(runStartMs({ started_at: 'yesterday' })).toBeNaN()
  })
})

describe('runsSince', () => {
  it('keeps the company\'s runs from the click on, the newest per source', () => {
    const rows = [
      run('sec-13f', { started_at: iso(5_000), total: 89 }),
      run('sec-13f', { started_at: iso(2_000), total: 1 }),
      run('sec-13f', { started_at: iso(-3 * CLOCK_SLACK_MS), total: 500 }),   // last week's refresh
      run('sec-ex21', { target: 'Alphabet Inc.', total: 12 }),               // someone else's
      run('wikidata', { started_at: iso(-CLOCK_SLACK_MS / 2), total: 3 }),   // the server's clock runs ahead
    ]
    const got = runsSince(rows, 'Apple Inc.', CLICK)
    expect([...got.keys()].sort()).toEqual(['sec-13f', 'wikidata'])
    expect(got.get('sec-13f')?.total).toBe(89)
  })
})

describe('recoverFromRunLog', () => {
  it('fills a lost slow slot from the log and marks the outcome recovered', async () => {
    const o = empty(); o.instant = 'scraped'; o.sourceTotals = { sec_edgar: 2 }
    await recoverFromRunLog(o, 'Apple Inc.', CLICK, once([run('sec-13f', { total: 89 })]), noSleep)
    expect(o.sec13f).toEqual({ status: 'ok', total: 89 })
    expect(o.recovered).toBe(true)
    expect(o.stillRunning).toBeUndefined()
    expect(o.sourceTotals).toEqual({ sec_edgar: 2 })   // what the browser heard stays
  })

  it('instant totals the browser heard are kept, however the log counts them', async () => {
    const o = empty(); o.instant = 'scraped'; o.sourceTotals = { sec_edgar: 2 }
    await recoverFromRunLog(o, 'Apple Inc.', CLICK,
      once([run('sec_edgar', { total: 5 }), run('wikidata', { total: 1 })]), noSleep)
    expect(o.sourceTotals).toEqual({ sec_edgar: 2 })
    expect(o.recovered).toBeUndefined()
  })

  it('never overwrites a slot whose call answered', async () => {
    const o = empty(); o.sec13f = { status: 'fresh', total: 0 }
    await recoverFromRunLog(o, 'Apple Inc.', CLICK, once([run('sec-13f', { total: 89 })]), noSleep)
    expect(o.sec13f).toEqual({ status: 'fresh', total: 0 })
    expect(o.recovered).toBeUndefined()
  })

  it('a refused call has no run since the click and stays empty', async () => {
    const o = empty()
    await recoverFromRunLog(o, 'Apple Inc.', CLICK,
      once([run('sec-13f', { started_at: iso(-3 * CLOCK_SLACK_MS), total: 500 })]), noSleep)
    expect(o.sec13f).toBeNull()
    expect(o.recovered).toBeUndefined()
  })

  it('rebuilds the instant sources\' totals when that answer was the one lost', async () => {
    const o = empty()
    await recoverFromRunLog(o, 'Apple Inc.', CLICK,
      once([run('wikidata', { total: 0 }), run('sec_edgar', { total: 22 })]), noSleep)
    expect(o.instant).toBe('scraped')
    expect(o.sourceTotals).toEqual({ wikidata: 0, sec_edgar: 22 })
    expect(o.recovered).toBe(true)
  })

  it('waits while the server is still at it, then reports the finished run', async () => {
    const o = empty()
    const sleep = vi.fn(async () => {})
    const fetchRuns = vi.fn()
      .mockResolvedValueOnce([run('sec-13f', { status: 'running' })])
      .mockResolvedValueOnce([run('sec-13f', { status: 'running' })])
      .mockResolvedValueOnce([run('sec-13f', { status: 'ok', total: 89 })])
    await recoverFromRunLog(o, 'Apple Inc.', CLICK, fetchRuns, { intervalMs: 7, sleep })
    expect(fetchRuns).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(7)
    expect(o.sec13f).toEqual({ status: 'ok', total: 89 })
    expect(o.stillRunning).toBeUndefined()
  })

  it('gives up after the last look and says the server is still running', async () => {
    const o = empty()
    const fetchRuns = once([run('sec-ex21', { status: 'running' })])
    await recoverFromRunLog(o, 'Apple Inc.', CLICK, fetchRuns, { ...noSleep, maxPolls: 3 })
    expect(fetchRuns).toHaveBeenCalledTimes(3)
    expect(o.secEx21).toEqual({ status: 'running', total: 0 })
    expect(o.stillRunning).toBe(true)
    expect(o.recovered).toBe(true)
  })

  it('a run the server gave up on (stale) is not waited for', async () => {
    const o = empty()
    const fetchRuns = once([run('sec-ex21', { status: 'running', stale: true })])
    await recoverFromRunLog(o, 'Apple Inc.', CLICK, fetchRuns, noSleep)
    expect(fetchRuns).toHaveBeenCalledTimes(1)
    expect(o.stillRunning).toBeUndefined()
  })

  it('a log that cannot be read changes nothing', async () => {
    const o = empty()
    await recoverFromRunLog(o, 'Apple Inc.', CLICK, async () => { throw new Error('offline') }, noSleep)
    expect(o).toEqual(empty())
  })
})
