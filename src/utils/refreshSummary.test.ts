import { describe, expect, it } from 'vitest'
import { secRunWrote, summarizeRefresh } from './refreshSummary'

// A literal t: the key plus any interpolations, so the assembled sentence is
// visible without the i18n runtime.
const t = (key: string, o?: Record<string, unknown>) =>
  o ? `${key}(${Object.entries(o).map(([k, v]) => `${k}=${v}`).join(',')})` : key

describe('summarizeRefresh', () => {
  it('joins every source that wrote something', () => {
    expect(summarizeRefresh(t, 'Acme', {
      instant: 'scraped', sec13f: { status: 'ok', total: 89 }, secEx21: { status: 'ok', total: 12 },
      secAcq: { status: 'ok', total: 3, enriched: 1 },
    })).toBe('toast.refreshDone(company=Acme,summary=toast.refreshPart13f(count=89) · toast.refreshPartEx21(count=12) · toast.refreshPartAcq(count=3) · toast.refreshPartAcqDated(count=1))')
  })

  it('names what each instant source wrote — a refresh that found things never says "nothing new"', () => {
    expect(summarizeRefresh(t, 'SpaceX', {
      instant: 'scraped', sourceTotals: { wikidata: 0, sec_edgar: 22 }, sec13f: null, secEx21: null, secAcq: null,
    })).toBe('toast.refreshDone(company=SpaceX,summary=SEC EDGAR: 22)')
  })

  it('keeps the instant sources and the SEC phase in one sentence, in that order', () => {
    expect(summarizeRefresh(t, 'Acme', {
      instant: 'scraped', sourceTotals: { wikidata: 2 }, sec13f: { status: 'ok', total: 89 }, secEx21: null, secAcq: null,
    })).toBe('toast.refreshDone(company=Acme,summary=Wikidata: 2 · toast.refreshPart13f(count=89))')
  })

  it('says when another refresh of the company is still running', () => {
    expect(summarizeRefresh(t, 'Acme', { instant: 'in_progress', sec13f: null, secEx21: null, secAcq: null }))
      .toBe('toast.refreshDone(company=Acme,summary=toast.refreshPartInProgress)')
  })

  it('reports a 13F that was already current this quarter', () => {
    expect(summarizeRefresh(t, 'Acme', { instant: 'scraped', sec13f: { status: 'fresh', total: 0 }, secEx21: null, secAcq: null }))
      .toBe('toast.refreshDone(company=Acme,summary=toast.refreshPart13fFresh)')
  })

  it('says so when nothing changed — the reader waited and must be told it is over', () => {
    expect(summarizeRefresh(t, 'Acme', { instant: 'nothing', sec13f: null, secEx21: null, secAcq: null }))
      .toBe('toast.refreshDoneNothing(company=Acme)')
  })

  it('carries the cooldown refusal instead of a separate toast', () => {
    expect(summarizeRefresh(t, 'Acme', { instant: 'cooldown', sec13f: null, secEx21: null, secAcq: null }))
      .toBe('toast.refreshDone(company=Acme,summary=toast.refreshPartCooldown)')
  })

  it('ignores runs that found nothing or failed', () => {
    expect(summarizeRefresh(t, 'Acme', {
      instant: 'scraped', sec13f: { status: 'ok', total: 0 }, secEx21: { status: 'no_exhibit' },
      secAcq: { status: 'fresh', total: 0 },
    })).toBe('toast.refreshDoneNothing(company=Acme)')
  })

  it('an acquisitions run that only dated already-listed holdings is still reported', () => {
    expect(summarizeRefresh(t, 'Alphabet', {
      instant: 'nothing', sec13f: null, secEx21: null, secAcq: { status: 'ok', total: 0, enriched: 2 },
    })).toBe('toast.refreshDone(company=Alphabet,summary=toast.refreshPartAcqDated(count=2))')
  })

  it('an acquisitions run with nothing to draw adds no part', () => {
    expect(summarizeRefresh(t, 'Acme', {
      instant: 'nothing', sec13f: null, secEx21: null, secAcq: { status: 'ok', total: 0, enriched: 0 },
    })).toBe('toast.refreshDoneNothing(company=Acme)')
  })
})

describe('secRunWrote', () => {
  it('is true when edges were drawn or dated, false for fresh, failed or empty runs', () => {
    expect(secRunWrote({ status: 'ok', total: 3 })).toBe(true)
    expect(secRunWrote({ status: 'ok', total: 0, enriched: 1 })).toBe(true)
    expect(secRunWrote({ status: 'ok', total: 0 })).toBe(false)
    expect(secRunWrote({ status: 'fresh', total: 5 })).toBe(false)
    expect(secRunWrote(null)).toBe(false)
  })
})
