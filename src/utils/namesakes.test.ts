import { describe, expect, it } from 'vitest'
import type { GraphElement } from '../types'
import { namesakeCountries, relabelNamesakes, withCountry } from './namesakes'

const co = (id: string, name: string, country?: string | null) => ({ id, name, country })

describe('namesakeCountries', () => {
  it('names the country of companies that share a name in different countries', () => {
    const got = namesakeCountries([co('a', 'Agrointegral Andina S.A.S.', 'CO'),
                                   co('b', 'Agrointegral Andina S.A.S.', 'EC'),
                                   co('c', 'Union Agro S.A.', 'BR')], 'en')
    expect(Object.fromEntries(got)).toEqual({ a: 'Colombia', b: 'Ecuador' })
  })

  it('ignores case and spacing at the ends, in the viewer’s language', () => {
    const got = namesakeCountries([co('a', 'Perfect Corp.', 'JP'), co('b', ' PERFECT CORP. ', 'US')], 'de')
    expect(got.get('a')).toBe('Japan')
    expect(got.get('b')).toBe('Vereinigte Staaten')
  })

  it('says nothing where the country cannot tell them apart', () => {
    expect(namesakeCountries([co('a', 'Alpha Ltd.', 'BM'), co('b', 'Alpha Ltd.', 'BM')], 'en').size).toBe(0)
    expect(namesakeCountries([co('a', 'Alpha Ltd.'), co('b', 'Alpha Ltd.')], 'en').size).toBe(0)
    // one of them with a country: that one shows it, the other has nothing to show
    expect(Object.fromEntries(namesakeCountries([co('a', 'Alpha Ltd.', 'BM'), co('b', 'Alpha Ltd.', null)], 'en')))
      .toEqual({ a: 'Bermuda' })
  })

  it('the same company twice is no namesake', () => {
    expect(namesakeCountries([co('a', 'Alpha Ltd.', 'BM'), co('a', 'Alpha Ltd.', 'BM'), null, undefined], 'en').size)
      .toBe(0)
  })

  it('withCountry', () => {
    expect(withCountry('Alpha Ltd.', 'Bermuda')).toBe('Alpha Ltd. (Bermuda)')
    expect(withCountry('Alpha Ltd.', undefined)).toBe('Alpha Ltd.')
  })
})

describe('relabelNamesakes', () => {
  const node = (id: string, name: string, country: string): GraphElement =>
    ({ data: { id, label: name, nodeType: 'entity', raw: { id, name, country } } }) as unknown as GraphElement
  const edge = { data: { id: 'e', source: 'a', target: 'b', label: '51%' } } as unknown as GraphElement

  it('puts the country on the canvas label of each namesake only', () => {
    const els = [node('a', 'Perfect Corp.', 'JP'), node('b', 'Perfect Corp.', 'US'), node('c', 'Wannaby Inc.', 'US'), edge]
    const got = relabelNamesakes(els, 'en')
    expect(got.map(e => (e.data as { label: string }).label))
      .toEqual(['Perfect Corp. (Japan)', 'Perfect Corp. (United States)', 'Wannaby Inc.', '51%'])
    expect(got[2]).toBe(els[2])                                  // untouched elements stay the same objects
    expect((els[0].data as { label: string }).label).toBe('Perfect Corp.')   // the input is not changed
  })

  it('returns the same list when no name is shared', () => {
    const els = [node('a', 'Alpha Ltd.', 'BM'), node('b', 'Beta GmbH', 'DE'), edge]
    expect(relabelNamesakes(els, 'en')).toBe(els)
  })

  it('a person is never a namesake company', () => {
    const person = { data: { id: 'p', label: 'Perfect Corp.', nodeType: 'person',
                             raw: { name: 'Perfect Corp.', country: 'FR' } } } as unknown as GraphElement
    const els = [node('a', 'Perfect Corp.', 'JP'), person]
    expect(relabelNamesakes(els, 'en')).toBe(els)
  })
})
