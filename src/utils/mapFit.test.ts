import { describe, it, expect } from 'vitest'
import { geoEqualEarth } from 'd3-geo'
import { anchorOf, countryCentroid, fitView, FIT_MAX_ZOOM, FIT_PADDING, MAP_HEIGHT, MAP_SCALE, MAP_WIDTH, WORLD_CENTER } from './mapFit'
import centroids from './countryCentroids.json'
import { ALPHA2_TO_NUMERIC } from './isoCountries'

const redmond = { lat: 47.64, lng: -122.13 }
const dublin = { lat: 53.34, lng: -6.26 }
const honolulu = { lat: 21.3, lng: -157.9 }
const auckland = { lat: -36.9, lng: 174.8 }
const sydney = { lat: -33.87, lng: 151.21 }

/** Where a point lands in the frame under a fitted view: the projection, then
 *  ZoomableGroup's transform (the centre at the middle, scaled by the zoom). */
const inFrame = (view: { center: [number, number]; zoom: number }, p: { lat: number; lng: number }) => {
  const proj = geoEqualEarth().scale(MAP_SCALE).translate([MAP_WIDTH / 2, MAP_HEIGHT / 2])
  const [cx, cy] = proj(view.center)!
  const [x, y] = proj([p.lng, p.lat])!
  return { x: MAP_WIDTH / 2 + (x - cx) * view.zoom, y: MAP_HEIGHT / 2 + (y - cy) * view.zoom }
}
const inside = (q: { x: number; y: number }) =>
  q.x >= FIT_PADDING - 0.5 && q.x <= MAP_WIDTH - FIT_PADDING + 0.5 && q.y >= FIT_PADDING - 0.5 && q.y <= MAP_HEIGHT - FIT_PADDING + 0.5

describe('countryCentroid — the centre of a country\'s main landmass', () => {
  it('knows every country the map paints', () => {
    for (const code of Object.keys(ALPHA2_TO_NUMERIC)) expect(countryCentroid(code), code).toBeDefined()
  })

  it('is on the mainland, not between it and the overseas parts', () => {
    expect(countryCentroid('FR')).toEqual({ lat: 46.6, lng: 2.5 })      // not the Atlantic
    expect(countryCentroid('US')).toEqual({ lat: 39.9, lng: -98.8 })    // Kansas, not Alaska-ward
  })

  it('reads any code toAlpha2 does, and nothing else', () => {
    expect(countryCentroid('United States')).toEqual(countryCentroid('US'))
    expect(countryCentroid('us')).toEqual(countryCentroid('US'))
    expect(countryCentroid('')).toBeUndefined()
    expect(countryCentroid(null)).toBeUndefined()
    expect(countryCentroid('ZZ')).toBeUndefined()
  })

  it('has the territories the map\'s own geometry lacks', () => {
    for (const code of ['BM', 'SG', 'HK', 'MO', 'KY', 'GI', 'MC', 'LI']) expect(countryCentroid(code), code).toBeDefined()
    expect(Object.keys(centroids).length).toBe(Object.keys(ALPHA2_TO_NUMERIC).length)
  })
})

describe('anchorOf — where a highlighted country is', () => {
  it('is the company\'s own coordinates when it has them', () => {
    expect(anchorOf({ country: 'US', ...redmond })).toEqual({ point: redmond, exact: true })
  })

  it('falls back to the country\'s centre, marked as not exact', () => {
    expect(anchorOf({ country: 'CH' })).toEqual({ point: countryCentroid('CH'), exact: false })
    expect(anchorOf({ country: 'CH', lat: 46.9 })).toEqual({ point: countryCentroid('CH'), exact: false })
    expect(anchorOf({ country: 'CH', lat: NaN, lng: 8 })).toEqual({ point: countryCentroid('CH'), exact: false })
  })

  it('is nothing when not even the country is known', () => {
    expect(anchorOf({ country: '' })).toBeNull()
  })
})

describe('fitView — the view that shows every highlighted country', () => {
  it('one point: that point, at the zoom one company always got', () => {
    expect(fitView([redmond])).toEqual({ center: [-122.13, 47.64], zoom: FIT_MAX_ZOOM })
  })

  it('two points: both inside the frame with the padding to spare, as close as that allows', () => {
    const view = fitView([redmond, dublin])!
    expect(view.zoom).toBeLessThan(FIT_MAX_ZOOM)
    expect(view.zoom).toBeGreaterThan(1)
    expect(inside(inFrame(view, redmond))).toBe(true)
    expect(inside(inFrame(view, dublin))).toBe(true)
    // the pair fills the frame: a little closer and one would be in the padding
    const closer = { ...view, zoom: view.zoom * 1.05 }
    expect(inside(inFrame(closer, redmond)) && inside(inFrame(closer, dublin))).toBe(false)
  })

  it('never closer than FIT_MAX_ZOOM, however near the points', () => {
    expect(fitView([dublin, { lat: 53.35, lng: -6.25 }])!.zoom).toBe(FIT_MAX_ZOOM)
  })

  it('wider than the world at zoom 1 holds: the whole world, where it is drawn whole', () => {
    // centred between the two, zoom 1 cut the western one off the left edge
    expect(fitView([honolulu, auckland])).toEqual({ center: WORLD_CENTER, zoom: 1 })
    // …but Redmond to Sydney still fits (just), so it is fitted
    const view = fitView([redmond, sydney])!
    expect(view.zoom).toBeGreaterThan(1)
    expect(inside(inFrame(view, redmond)) && inside(inFrame(view, sydney))).toBe(true)
  })

  it('nothing to fit: null', () => {
    expect(fitView([])).toBeNull()
    expect(fitView([{ lat: NaN, lng: 0 }])).toBeNull()
  })
})
