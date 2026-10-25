import { describe, it, expect } from 'vitest'
import {
  asOfFromYear, asOfYear, edgePresence, endedBy, evidenceDate, isAsOf, isLowerBound, nodeExists,
  rowPresence, startedAfter, tenureOfEdge,
} from './asOf'

const Y19 = '2019-12-31'

describe('asOf rules', () => {
  it('a year means its last day', () => {
    expect(asOfFromYear(2019)).toBe('2019-12-31')
    expect(asOfYear('2019-12-31')).toBe('2019')
    expect(isAsOf('2019-12-31')).toBe(true)
    expect(isAsOf('2019')).toBe(false)
    expect(isAsOf(null)).toBe(false)
  })

  it('without a day every rule is a no-op: the present behaves as before', () => {
    expect(edgePresence({ since: '2030-01-01' }, null)).toBe('present')
    expect(edgePresence({}, null)).toBe('present')
    expect(startedAfter({ since: '2030-01-01' }, null)).toBe(false)
    expect(endedBy({ until: '2010-01-01' }, null)).toBe(true)    // today's `!!until`
    expect(endedBy({}, null)).toBe(false)
    expect(nodeExists({ founded: 2030 }, null)).toBe(true)
  })

  it('a stated start after the day is absent; on the day it is present', () => {
    expect(edgePresence({ since: '2020-01-01' }, Y19)).toBe('absent')
    expect(edgePresence({ since: '2019-12-31' }, Y19)).toBe('present')
    expect(edgePresence({ since: '2015-06-01' }, Y19)).toBe('present')
  })

  it('a lower bound after the day is unknown, never absent', () => {
    expect(edgePresence({ since: '2023-06-30', since_basis: 'first_listed' }, Y19)).toBe('unknown')
    expect(edgePresence({ since: '2013-06-30', since_basis: 'first_listed' }, Y19)).toBe('present')
    // first listed 2023, and the 2022 list does not name it: gone before 2023, there from it
    expect(edgePresence({ since: '2023-06-30', since_basis: 'newly_listed' }, Y19)).toBe('absent')
    expect(edgePresence({ since: '2023-06-30', since_basis: 'newly_listed' }, '2023-12-31')).toBe('present')
    expect(edgePresence({ since: '2023-06-30', since_basis: 'newly_listed' }, '2022-12-31')).toBe('absent')
    expect(edgePresence({ since: '2023-06-30', since_basis: 'newly_listed' }, null)).toBe('present')
  })

  it('every basis but newly_listed is a lower bound — a 13D/G amendment, the PSC register start, the next one', () => {
    for (const basis of ['amendment', 'register_start', 'some_future_basis']) {
      expect(edgePresence({ since: '2026-02-10', since_basis: basis }, Y19)).toBe('unknown')
      expect(isLowerBound(basis)).toBe(true)
    }
    expect(isLowerBound('newly_listed')).toBe(false)
    expect(isLowerBound(null)).toBe(false)
    expect(isLowerBound('')).toBe(false)
  })

  it('a stale edge is dimmed after its last confirmation, present up to it', () => {
    const stale = { since: '2020-03-31', since_basis: 'first_reported', source_date: '2024-12-31', stale: true }
    expect(edgePresence(stale, '2023-12-31')).toBe('present')
    expect(edgePresence(stale, '2024-12-31')).toBe('present')
    expect(edgePresence(stale, '2025-12-31')).toBe('unknown')      // silence, not an end
    expect(edgePresence({ ...stale, stale: false }, '2025-12-31')).toBe('present')
    expect(edgePresence(stale, null)).toBe('present')
  })

  it('an until on or before the day is absent; after it, still present', () => {
    expect(edgePresence({ since: '2010-01-01', until: '2019-12-31' }, Y19)).toBe('absent')
    expect(edgePresence({ since: '2010-01-01', until: '2020-01-01' }, Y19)).toBe('present')
    expect(edgePresence({ since: '2010-01-01', until: '2018-03-31', }, Y19)).toBe('absent')
  })

  it('with no start, the filing date is the evidence', () => {
    expect(evidenceDate({ source_date: '2025-06-30' })).toBe('2025-06-30')
    expect(evidenceDate({ since: '2013-06-30', source_date: '2026-08-07' })).toBe('2013-06-30')
    expect(edgePresence({ source_date: '2025-06-30' }, Y19)).toBe('unknown')
    expect(edgePresence({ source_date: '2019-06-30' }, Y19)).toBe('present')
  })

  it('no dates at all is unknown', () => {
    expect(edgePresence({}, Y19)).toBe('unknown')
    expect(edgePresence(null, Y19)).toBe('unknown')
  })

  it('partial dates sort where their month belongs', () => {
    expect(edgePresence({ since: '2019-04-00' }, '2019-03-31')).toBe('absent')
    expect(edgePresence({ since: '2019-04-00' }, '2019-04-30')).toBe('present')
  })

  it('a company founded after the day did not exist', () => {
    expect(nodeExists({ founded: 2020 }, Y19)).toBe(false)
    expect(nodeExists({ founded: 2019 }, Y19)).toBe(true)
    expect(nodeExists({ incorporated_on: '2020-01-01' }, Y19)).toBe(false)
    expect(nodeExists({ incorporated_on: '2019-12-31' }, Y19)).toBe(true)
    // the register's date decides over the headline year when both are known
    expect(nodeExists({ founded: 1690, incorporated_on: '1896-07-20' }, '1800-12-31')).toBe(false)
    expect(nodeExists({}, Y19)).toBe(true)
    expect(nodeExists(null, Y19)).toBe(true)
  })

  it('a company that had ceased by the day no longer existed', () => {
    expect(nodeExists({ dissolved_on: '2019-06-30' }, Y19)).toBe(false)
    expect(nodeExists({ dissolved_on: '2019-12-31' }, Y19)).toBe(true)      // gone at the end of that day, not before
    expect(nodeExists({ dissolved_on: '2020-01-01' }, Y19)).toBe(true)
    expect(nodeExists({ dissolved_on: '2019-00-00' }, Y19)).toBe(false)     // a year alone: gone as of that year's end
    expect(nodeExists({ incorporated_on: '2010-01-01', dissolved_on: '2015-01-01' }, Y19)).toBe(false)
    expect(nodeExists({ dissolved_on: '2015-01-01' }, null)).toBe(true)     // no time travel: the present shows it
  })

  it('a row needs both the party and the relationship', () => {
    const rel = { since: '2010-01-01' }
    expect(rowPresence({ id: 'x', name: 'X', founded: 2020 } as never, rel, Y19)).toBe('absent')
    expect(rowPresence({ id: 'x', name: 'X', founded: 2000 } as never, rel, Y19)).toBe('present')
    expect(rowPresence({ id: 'x', name: 'X' } as never, {}, Y19)).toBe('unknown')
  })

  it('edge data maps back to the API shape', () => {
    expect(tenureOfEdge({ id: 'e', source: 'a', target: 'b', label: '', edgeType: 'owns',
                          since: '2010-01-01', sinceBasis: 'first_listed', until: null,
                          sourceDate: '2026-01-01', stale: true, staleSince: '2026-06-30' } as never))
      .toEqual({ since: '2010-01-01', since_basis: 'first_listed', until: null, source_date: '2026-01-01',
                 stale: true, stale_since: '2026-06-30' })
  })

  it("the mark's own date decides the dimming, not the filing date", () => {
    // a 13F position: filed 2024-05-15 (source_date), gone from the quarter
    // ending 2024-06-30 (stale_since) — present through that quarter, dimmed after
    const stale = { since: '2020-03-31', since_basis: 'first_reported', source_date: '2024-05-15',
                    stale: true, stale_since: '2024-06-30' }
    expect(edgePresence(stale, '2024-06-01')).toBe('present')
    expect(edgePresence(stale, '2024-06-30')).toBe('present')
    expect(edgePresence(stale, '2024-07-01')).toBe('unknown')
    // without the mark's date the filing date still rules, as before
    expect(edgePresence({ ...stale, stale_since: null }, '2024-06-01')).toBe('unknown')
  })
})
