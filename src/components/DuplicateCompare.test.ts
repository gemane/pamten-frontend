import { describe, it, expect } from 'vitest'
import { companyLines, sharedCompanies, yearSpan } from './DuplicateCompare'
import { clampPage, PAGE_SIZE } from './DuplicatesModal'
import type { PersonProfile } from '../types'

describe('yearSpan', () => {
  it.each([
    ['2014-05-01', '2019-12-31', '2014–2019'],
    ['2014-05-01', null, '2014–'],
    [null, '2019', '–2019'],
    [undefined, undefined, ''],
  ])('%s to %s is "%s"', (since, until, out) => expect(yearSpan(since, until)).toBe(out))
})

describe('companyLines', () => {
  it('lists seats, then holdings, each with its years', () => {
    const profile = {
      person: { id: 'p', first_name: '', last_name: '', full_name: 'P' },
      positions: [{ entity: { id: 'e1', name: 'Alphabet' }, role: { role: 'Director', since: '2014-01-01', until: '2019-06-01' } }],
      holdings: [{ entity: { id: 'e2', name: 'Tesla' }, relationship: { since: '2020-03-00' } }],
    } as unknown as PersonProfile
    expect(companyLines(profile, 'holding')).toEqual([
      { entityId: 'e1', name: 'Alphabet', what: 'Director', years: '2014–2019' },
      { entityId: 'e2', name: 'Tesla', what: 'holding', years: '2020–' },
    ])
  })
})

describe('sharedCompanies', () => {
  const line = (entityId: string) => ({ entityId, name: entityId, what: '', years: '' })
  it('is the companies more than one record names', () => {
    expect(sharedCompanies([[line('a'), line('b')], [line('b'), line('c')], [line('c')]])).toEqual(new Set(['b', 'c']))
  })
  it('does not count two seats of one record at one company', () => {
    expect(sharedCompanies([[line('a'), line('a')], [line('b')]])).toEqual(new Set())
  })
  it('is empty for records still loading', () => {
    expect(sharedCompanies([[], []])).toEqual(new Set())
  })
})

describe('clampPage', () => {
  it.each([
    [0, 0, 0], [3, 0, 0],                       // an empty list has a first page
    [0, 45, 0], [2, 45, 2], [3, 45, 2],         // three pages of 45
    [1, PAGE_SIZE, 0],                          // exactly one page left
    [-1, 45, 0],
  ])('page %i of %i rows is %i', (page, total, out) => expect(clampPage(page, total)).toBe(out))
})
