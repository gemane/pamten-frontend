import { describe, it, expect } from 'vitest'
import { countryFill } from './MapView'
import type { CountryEntityGroup } from '../types'

const data = (count: number): CountryEntityGroup => ({ country: 'US', count })

describe('countryFill — context highlighting', () => {
  it('uses amber for primary context country', () => {
    expect(countryFill(undefined, 'primary', false, 'dark', true)).toBe('#b45309')
  })

  it('uses hover amber for primary on hover', () => {
    expect(countryFill(undefined, 'primary', true, 'dark', true)).toBe('#fcd34d')
  })

  it('uses orange for subsidiary context country', () => {
    expect(countryFill(undefined, 'subsidiary', false, 'dark', true)).toBe('#d97706')
  })

  it('uses hover orange for subsidiary on hover', () => {
    expect(countryFill(undefined, 'subsidiary', true, 'dark', true)).toBe('#f59e0b')
  })
})

describe('countryFill — no-data state', () => {
  it('returns dark base color when no data and no context', () => {
    expect(countryFill(undefined, undefined, false, 'dark', false)).toBe('#1e2d4a')
  })

  it('returns light base color in light theme', () => {
    expect(countryFill(undefined, undefined, false, 'light', false)).toBe('#c8d4e8')
  })

  it('returns dark hover color on hover', () => {
    expect(countryFill(undefined, undefined, true, 'dark', false)).toBe('#263657')
  })

  it('returns no-data color when context exists but this country has no context', () => {
    expect(countryFill(data(5), undefined, false, 'dark', true)).toBe('#1e2d4a')
  })
})

describe('countryFill — heat map gradient', () => {
  it('returns a low-intensity blue for count=1', () => {
    const fill = countryFill(data(1), undefined, false, 'dark', false)
    expect(fill).toMatch(/^rgb\(/)
  })

  it('returns full-intensity blue for count >= 20', () => {
    const fill = countryFill(data(20), undefined, false, 'dark', false)
    expect(fill).toMatch(/^rgb\(74,144,217\)/)
  })

  it('clamps at MAX_COUNT (count=100 same as count=20)', () => {
    const at20  = countryFill(data(20),  undefined, false, 'dark', false)
    const at100 = countryFill(data(100), undefined, false, 'dark', false)
    expect(at20).toBe(at100)
  })

  it('returns hover blue regardless of count', () => {
    expect(countryFill(data(5),  undefined, true, 'dark', false)).toBe('#6aaae3')
    expect(countryFill(data(20), undefined, true, 'dark', false)).toBe('#6aaae3')
  })
})
