import { describe, it, expect } from 'vitest'
import { countryFill, spreadOverlapping } from './MapView'
import type { CountryEntityGroup, ContextCountry } from '../types'

const data = (count: number): CountryEntityGroup => ({ country: 'US', count })

const mk = (label: string, lat: number, lng: number,
            role: 'primary' | 'subsidiary' = 'subsidiary'): ContextCountry =>
  ({ country: 'US', role, label, lat, lng })

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

describe('spreadOverlapping — fan out coincident pins', () => {
  it('leaves a lone marker un-offset', () => {
    const out = spreadOverlapping([mk('Solo', 47.64, -122.13)])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ ox: 0, oy: 0, clustered: false })
  })

  it('does not cluster markers that are far apart', () => {
    const out = spreadOverlapping([mk('A', 47.64, -122.13), mk('B', 51.5, -0.12)])
    expect(out.every(m => !m.clustered && m.ox === 0 && m.oy === 0)).toBe(true)
  })

  it('anchors the HQ (primary) and fans the subsidiary out (Microsoft Corp + Round Island One)', () => {
    // ~90 m apart → same rounded coordinate. The HQ must stay at its true point; the
    // subsidiary is nudged out so it stays clickable.
    const out = spreadOverlapping([
      mk('Microsoft Corp', 47.6411813, -122.1266792, 'primary'),
      mk('Round Island One', 47.6419845, -122.1269364),
    ])
    expect(out).toHaveLength(2)
    expect(out.every(m => m.clustered)).toBe(true)
    const corp = out.find(m => m.c.label === 'Microsoft Corp')!
    const sub = out.find(m => m.c.label === 'Round Island One')!
    expect(corp.ox).toBe(0)                            // HQ stays put
    expect(corp.oy).toBe(0)
    expect(Math.hypot(sub.ox, sub.oy)).toBeGreaterThan(0)  // subsidiary nudged out
  })

  it('anchors one pin at the centre and rings the rest at the given radius', () => {
    const out = spreadOverlapping([mk('A', 1, 1), mk('B', 1, 1), mk('C', 1, 1)], 12)
    const atCentre = out.filter(m => m.ox === 0 && m.oy === 0)
    const onRing = out.filter(m => Math.hypot(m.ox, m.oy) > 0)
    expect(atCentre).toHaveLength(1)
    expect(onRing).toHaveLength(2)
    onRing.forEach(m => expect(Math.hypot(m.ox, m.oy)).toBeCloseTo(12, 5))
  })
})
