/**
 * Where the map looks, and where a highlighted country is.
 *
 * The map used to fly to the selected company at a fixed zoom, and only a
 * company with coordinates got a pin. So a parent in Redmond showed the
 * north-west of America while its Irish and Indian subsidiaries were painted
 * off screen; and Chubb's Switzerland — the selected company's own country —
 * was a ten-pixel speck on the world, its Bermuda holding not even that.
 *
 * Two things fix that. Every highlighted country gets a POINT: the company's
 * coordinates where it has them, else the centre of its country (a table
 * generated from the map's own geometry: scripts/country-centroids.mjs). A
 * country too small to see gets a marker there. And the view is FITTED to all
 * of those points, no closer than the old zoom 4.
 */
import { geoEqualEarth } from 'd3-geo'
import centroids from './countryCentroids.json'
import { toAlpha2 } from './isoCountries'
import type { ContextCountry } from '../types'

export type LatLng = { lat: number; lng: number }

/** ComposableMap's frame (its defaults) and MapView's projectionConfig: the
 *  projection every fit is computed in. */
export const MAP_WIDTH = 800
export const MAP_HEIGHT = 600
export const MAP_SCALE = 140
/** How close a fit goes: the zoom one company got. Zoom 1 is the world. */
export const FIT_MAX_ZOOM = 4
/** Kept clear inside the frame: a point at the edge is a country's CENTRE,
 *  and the country reaches on from it — the United States 25° west of its
 *  (Kansas) centre, 80 px at zoom 1.5. */
export const FIT_PADDING = 100

/** Where the world is drawn whole at zoom 1 (MapView's default centre). */
export const WORLD_CENTER: [number, number] = [0, 20]

const projection = () => geoEqualEarth().scale(MAP_SCALE).translate([MAP_WIDTH / 2, MAP_HEIGHT / 2])

/** The centre of a country's main landmass, by any code `toAlpha2` reads. */
export function countryCentroid(country: string | null | undefined): LatLng | undefined {
  const code = country ? toAlpha2(country) ?? country : null
  const c = code ? (centroids as Record<string, number[]>)[code] : undefined
  return c ? { lat: c[0], lng: c[1] } : undefined
}

/** Where a highlighted country is on the map: the company's own coordinates
 *  (`exact`) or, without them, its country's centre. Null when not even the
 *  country is known. */
export function anchorOf(c: Pick<ContextCountry, 'country' | 'lat' | 'lng'>): { point: LatLng; exact: boolean } | null {
  if (c.lat != null && c.lng != null && isFinite(c.lat) && isFinite(c.lng)) return { point: { lat: c.lat, lng: c.lng }, exact: true }
  const centre = countryCentroid(c.country)
  return centre ? { point: centre, exact: false } : null
}

/** The viewport that shows every point: `center` as ZoomableGroup takes it
 *  ([lng, lat] at the middle of the frame) and the zoom that fits them all
 *  with FIT_PADDING to spare — between the world (1) and FIT_MAX_ZOOM. One
 *  point: that point at FIT_MAX_ZOOM. None: null. */
export function fitView(points: LatLng[]): { center: [number, number]; zoom: number } | null {
  const proj = projection()
  const xy = points.map(p => proj([p.lng, p.lat])).filter((q): q is [number, number] => !!q && isFinite(q[0]) && isFinite(q[1]))
  if (xy.length === 0) return null
  const x1 = Math.min(...xy.map(q => q[0])), x2 = Math.max(...xy.map(q => q[0]))
  const y1 = Math.min(...xy.map(q => q[1])), y2 = Math.max(...xy.map(q => q[1]))
  const fits = Math.min((MAP_WIDTH - 2 * FIT_PADDING) / Math.max(x2 - x1, 1e-9),
                        (MAP_HEIGHT - 2 * FIT_PADDING) / Math.max(y2 - y1, 1e-9))
  // Wider than the frame holds at the world zoom: the whole world, centred
  // where it is drawn whole — centred between the points, one side of it
  // (the United States, with a holding in Australia) falls off the frame.
  if (fits < 1) return { center: WORLD_CENTER, zoom: 1 }
  const zoom = Math.min(FIT_MAX_ZOOM, fits)
  const centre = proj.invert!([(x1 + x2) / 2, (y1 + y2) / 2])
  if (!centre || !isFinite(centre[0]) || !isFinite(centre[1])) return null
  return { center: [round(centre[0]), round(centre[1])], zoom: round(zoom) }
}

const round = (v: number) => Math.round(v * 100) / 100
