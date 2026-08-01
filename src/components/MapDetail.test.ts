import { describe, it, expect } from 'vitest'
import { osmEmbedUrl, osmLargeUrl } from './MapDetail'

describe('osmEmbedUrl', () => {
  it('builds a bbox + marker around the point', () => {
    const url = osmEmbedUrl(51.5, -0.12, 0.01)
    expect(url).toContain('bbox=-0.13,51.49,-0.11,51.51')
    expect(url).toContain('marker=51.5,-0.12')
    expect(url.startsWith('https://www.openstreetmap.org/export/embed.html')).toBe(true)
  })
})

describe('osmLargeUrl', () => {
  it('links to the point on openstreetmap.org', () => {
    expect(osmLargeUrl(51.5, -0.12)).toBe(
      'https://www.openstreetmap.org/?mlat=51.5&mlon=-0.12#map=16/51.5/-0.12')
  })
})
