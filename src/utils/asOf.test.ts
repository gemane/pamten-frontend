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
    expect(nodeExists({ founded_date: '2020-01-01' }, Y19)).toBe(false)
    expect(nodeExists({ founded_date: '2019-12-31' }, Y19)).toBe(true)
    expect(nodeExists({}, Y19)).toBe(true)
    expect(nodeExists(null, Y19)).toBe(true)
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
                          sourceDate: '2026-01-01' } as never))
      .toEqual({ since: '2010-01-01', since_basis: 'first_listed', until: null, source_date: '2026-01-01' })
  })
})
