import { describe, it, expect } from 'vitest'
import { osmLargeUrl } from '../utils/osm'

describe('osmLargeUrl', () => {
  it('links to the point on openstreetmap.org at the given zoom', () => {
    expect(osmLargeUrl(51.5, -0.12, 17)).toBe(
      'https://www.openstreetmap.org/?mlat=51.5&mlon=-0.12#map=17/51.5/-0.12')
  })
})
