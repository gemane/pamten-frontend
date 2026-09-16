import { describe, expect, it } from 'vitest'
import { summarizeRefresh } from './refreshSummary'

// A literal t: the key plus any interpolations, so the assembled sentence is
// visible without the i18n runtime.
const t = (key: string, o?: Record<string, unknown>) =>
  o ? `${key}(${Object.entries(o).map(([k, v]) => `${k}=${v}`).join(',')})` : key

describe('summarizeRefresh', () => {
  it('joins every source that wrote something', () => {
    expect(summarizeRefresh(t, 'Acme', {
      instant: 'scraped', sec13f: { status: 'ok', total: 89 }, secEx21: { status: 'ok', total: 12 },
    })).toBe('toast.refreshDone(company=Acme,summary=toast.refreshPart13f(count=89) · toast.refreshPartEx21(count=12))')
  })

  it('reports a 13F that was already current this quarter', () => {
    expect(summarizeRefresh(t, 'Acme', { instant: 'scraped', sec13f: { status: 'fresh', total: 0 }, secEx21: null }))
      .toBe('toast.refreshDone(company=Acme,summary=toast.refreshPart13fFresh)')
  })

  it('says so when nothing changed — the reader waited and must be told it is over', () => {
    expect(summarizeRefresh(t, 'Acme', { instant: 'nothing', sec13f: null, secEx21: null }))
      .toBe('toast.refreshDoneNothing(company=Acme)')
  })

  it('carries the cooldown refusal instead of a separate toast', () => {
    expect(summarizeRefresh(t, 'Acme', { instant: 'cooldown', sec13f: null, secEx21: null }))
      .toBe('toast.refreshDone(company=Acme,summary=toast.refreshPartCooldown)')
  })

  it('ignores runs that found nothing or failed', () => {
    expect(summarizeRefresh(t, 'Acme', {
      instant: 'scraped', sec13f: { status: 'ok', total: 0 }, secEx21: { status: 'no_exhibit' },
    })).toBe('toast.refreshDoneNothing(company=Acme)')
  })
})
