/**
 * Ordering the subsidiary list by country, and choosing which country to use.
 *
 * The map can count a company where it is registered or where it is run. The two
 * differ precisely where it matters — Cayman-registered, London-run — so the
 * important thing these tests pin is that the basis genuinely changes the answer,
 * and that a company the basis cannot place is still shown rather than dropped.
 */
import { describe, it, expect } from 'vitest'
import { basisCountry, sortSubsidiaries, readMapBasis, MAP_BASIS_KEY } from './mapBasis'
import type { Entity, NodeData } from '../types'

const sub = (label: string, country?: string | null, hq?: string | null): NodeData => ({
  id: label, label, nodeType: 'entity',
  raw: { id: label, name: label, type: 'company', country, hq_country: hq } as Entity,
})

const order = (subs: NodeData[], basis: 'jurisdiction' | 'hq' = 'jurisdiction') =>
  sortSubsidiaries(subs, basis, 'en').map(s => s.label)

describe('basisCountry', () => {
  const cayman = { country: 'KY', hq_country: 'GB' } as Entity

  it('reads the registration country for jurisdiction', () => {
    expect(basisCountry(cayman, 'jurisdiction')).toBe('KY')
  })

  it('reads the headquarters country for hq', () => {
    expect(basisCountry(cayman, 'hq')).toBe('GB')
  })

  it('does NOT fall back to the other basis', () => {
    // The whole point of the switch. A fallback would show a company with no
    // recorded HQ as though it were run where it is registered.
    expect(basisCountry({ country: 'KY' } as Entity, 'hq')).toBeNull()
    expect(basisCountry({ hq_country: 'GB' } as Entity, 'jurisdiction')).toBeNull()
  })

  it('treats blank and whitespace as unknown', () => {
    expect(basisCountry({ country: '' } as Entity, 'jurisdiction')).toBeNull()
    expect(basisCountry({ country: '   ' } as Entity, 'jurisdiction')).toBeNull()
    expect(basisCountry(null, 'jurisdiction')).toBeNull()
  })
})

describe('sortSubsidiaries', () => {
  it('puts the country with the most subsidiaries first', () => {
    expect(order([
      sub('Solo', 'FR'),
      sub('Big One', 'DE'), sub('Big Two', 'DE'), sub('Big Three', 'DE'),
      sub('Pair One', 'IT'), sub('Pair Two', 'IT'),
    ])).toEqual(['Big One', 'Big Three', 'Big Two', 'Pair One', 'Pair Two', 'Solo'])
  })

  it('breaks equal-sized countries alphabetically by country name', () => {
    expect(order([sub('Z Co', 'ZW'), sub('A Co', 'AT')])).toEqual(['A Co', 'Z Co'])
  })

  it('compares display names, not ISO codes', () => {
    // CH/SE is the pair that separates them: by code CH sorts first, by name
    // Sweden sorts before Switzerland. ZW/AT above orders the same either way,
    // so it proves nothing here.
    expect(order([sub('Swiss Co', 'CH'), sub('Swedish Co', 'SE')]))
      .toEqual(['Swedish Co', 'Swiss Co'])
  })

  it('orders companies within a country by name', () => {
    expect(order([sub('Zeta', 'DE'), sub('Alpha', 'DE')])).toEqual(['Alpha', 'Zeta'])
  })

  it('keeps subsidiaries the basis cannot place, at the end', () => {
    // Dropped would be worse: they are still subsidiaries, and the map already
    // cannot show them.
    expect(order([sub('Nowhere'), sub('Known', 'DE')])).toEqual(['Known', 'Nowhere'])
  })

  it('orders several unplaceable ones by name rather than arbitrarily', () => {
    expect(order([sub('Zulu'), sub('Alpha'), sub('Known', 'DE')]))
      .toEqual(['Known', 'Alpha', 'Zulu'])
  })

  it('reorders when the basis changes', () => {
    // The Cayman company is registered in KY but run from GB, so switching basis
    // moves it into the GB group — which is the entire feature.
    const subs = [
      sub('Cayman Co', 'KY', 'GB'),
      sub('London One', 'GB', 'GB'),
      sub('Kylie Two', 'KY', 'KY'),
    ]
    expect(order(subs, 'jurisdiction')).toEqual(['Cayman Co', 'Kylie Two', 'London One'])
    expect(order(subs, 'hq')).toEqual(['Cayman Co', 'London One', 'Kylie Two'])
  })

  it('does not mutate the input', () => {
    const subs = [sub('B', 'DE'), sub('A', 'DE')]
    sortSubsidiaries(subs, 'jurisdiction', 'en')
    expect(subs.map(s => s.label)).toEqual(['B', 'A'])
  })
})

describe('readMapBasis', () => {
  it('defaults to jurisdiction — what the map has always shown', () => {
    localStorage.clear()
    expect(readMapBasis()).toBe('jurisdiction')
  })

  it('restores a stored choice', () => {
    localStorage.setItem(MAP_BASIS_KEY, 'hq')
    expect(readMapBasis()).toBe('hq')
    localStorage.clear()
  })

  it('ignores a value it does not recognise', () => {
    localStorage.setItem(MAP_BASIS_KEY, 'nonsense')
    expect(readMapBasis()).toBe('jurisdiction')
    localStorage.clear()
  })
})
