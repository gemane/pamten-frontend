import { describe, it, expect } from 'vitest'
import { buildHash, parseHash, type ViewState } from './viewHash'

describe('buildHash', () => {
  it('encodes plain tabs', () => {
    expect(buildHash({ tab: 'graph' })).toBe('#graph')
    expect(buildHash({ tab: 'map' })).toBe('#map')
    expect(buildHash({ tab: 'scraper' })).toBe('#scraper')
    expect(buildHash({ tab: 'settings' })).toBe('#settings')
  })

  it('encodes a centered entity and person', () => {
    expect(buildHash({ tab: 'graph', entityId: 'abc-123', entityType: 'entity' }))
      .toBe('#graph/e/abc-123')
    expect(buildHash({ tab: 'graph', entityId: 'p-9', entityType: 'person' }))
      .toBe('#graph/p/p-9')
  })

  it('encodes a selected map country, uri-escaping it', () => {
    expect(buildHash({ tab: 'map', country: 'AT' })).toBe('#map/c/AT')
    expect(buildHash({ tab: 'map', country: 'United States' }))
      .toBe('#map/c/United%20States')
  })

  it('encodes the company whose subsidiaries the map is listing', () => {
    expect(buildHash({ tab: 'map', nodeId: 'e-msft' })).toBe('#map/n/e-msft')
    expect(buildHash({ tab: 'map', nodeId: 'lei:213800/X' })).toBe('#map/n/lei%3A213800%2FX')
  })

  it('puts the company ahead of a selected country', () => {
    // The panel shows it that way round: a company's subsidiary list replaces the
    // country list, so the URL has to describe the view that is actually on screen.
    expect(buildHash({ tab: 'map', nodeId: 'e-msft', country: 'US' })).toBe('#map/n/e-msft')
  })

  it('ignores a node on non-map tabs', () => {
    expect(buildHash({ tab: 'graph', nodeId: 'e-msft' })).toBe('#graph')
  })

  it('ignores entity on non-graph tabs and country on non-map tabs', () => {
    expect(buildHash({ tab: 'map', entityId: 'x' })).toBe('#map')
    expect(buildHash({ tab: 'graph', country: 'AT' })).toBe('#graph')
  })

  it('falls back to graph for unknown tabs', () => {
    expect(buildHash({ tab: 'bogus' })).toBe('#graph')
  })
})

describe('parseHash', () => {
  it('round-trips every buildHash form', () => {
    const views: ViewState[] = [
      { tab: 'graph' },
      { tab: 'graph', entityId: 'abc-123', entityType: 'entity' },
      { tab: 'graph', entityId: 'p-9', entityType: 'person' },
      { tab: 'map' },
      { tab: 'map', country: 'United States' },
      { tab: 'scraper' },
      { tab: 'settings' },
    ]
    for (const v of views) {
      expect(parseHash(buildHash(v))).toEqual(v)
    }
  })

  it('defaults to graph home for empty or garbage hashes', () => {
    expect(parseHash('')).toEqual({ tab: 'graph' })
    expect(parseHash('#')).toEqual({ tab: 'graph' })
    expect(parseHash('#nonsense')).toEqual({ tab: 'graph' })
    expect(parseHash('#graph/x/1')).toEqual({ tab: 'graph' })
    expect(parseHash('#map/c/')).toEqual({ tab: 'map' })
  })
})
