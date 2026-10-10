import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiX, FiExternalLink } from 'react-icons/fi'
import * as maplibregl from 'maplibre-gl'
import { countryName } from '../utils/isoCountries'
import { osmLargeUrl, osmAddressUrl } from '../utils/osm'

export interface MapDetailData {
  label: string
  city?: string
  country: string
  lat: number            // HQ coordinate, geocoded server-side from the full HQ address
  lng: number
  hqAddress?: string     // the pinned (HQ) address
  legalAddress?: string  // registered/legal address — shown as info when it differs
  precise?: boolean      // exact street-level pin vs approximate (city) circle
}

/** The basemap: OpenFreeMap's vector tiles — free, no account, no key, no
 *  usage caps, served from Hetzner in Germany. CARTO's free raster basemap,
 *  used before, began watermarking every keyless tile "API KEY REQUIRED" in
 *  2026, with a 200 status, so nothing failed and the map simply went grey.
 *  One style per theme. */
export const OPENFREEMAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark:  'https://tiles.openfreemap.org/styles/dark',
} as const

export function basemapStyle(theme: string | null | undefined): string {
  return theme === 'dark' ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.light
}

/** The theme the page is drawn in — useTheme writes it on <html>. */
export function currentTheme(): 'dark' | 'light' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

/** A circle of `radiusM` metres around a point as a GeoJSON polygon, for the
 *  "somewhere in this city" mark: a vector map has no circle-in-metres of its
 *  own, and a pixel circle would not scale with the zoom. */
export function circlePolygon(lat: number, lng: number, radiusM: number, sides = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = radiusM / 111_320
  const dLng = radiusM / (111_320 * Math.cos(lat * Math.PI / 180))
  const ring: [number, number][] = []
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * 2 * Math.PI
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

interface Target { lat: number; lng: number; zoom: number; precise: boolean }

const HQ_SOURCE = 'hq-area'

/** The map itself: created once, re-aimed and re-marked whenever another
 *  company is picked (the popup re-renders with new props, it does not
 *  remount), restyled when the theme changes while it is open. */
function Basemap({ lat, lng, zoom, precise }: Target) {
  const { t } = useTranslation()
  // MapLibre throws at construction without WebGL2 (a hardened or remote
  // browser): the pop-up then says so and keeps its link to the large map,
  // instead of taking the whole map view down with it.
  const [unsupported, setUnsupported] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const target = useRef<Target>({ lat, lng, zoom, precise })
  target.current = { lat, lng, zoom, precise }

  useEffect(() => {
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: box.current!,
        style: basemapStyle(currentTheme()),
        center: [lng, lat], zoom,
        attributionControl: { compact: true },
      })
    } catch {
      setUnsupported(true)
      return
    }
    mapRef.current = map
    // the popup is sized only after it appeared: measure again once mounted
    const sized = setTimeout(() => map.resize(), 0)
    // a style (re)load drops the marks: draw them again whenever one finishes
    map.on('style.load', () => drawTarget(map, markerRef, target.current))
    // the theme switched while open: the style follows the page
    const themed = new MutationObserver(() => map.setStyle(basemapStyle(currentTheme())))
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      clearTimeout(sized)
      themed.disconnect()
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — one map per mount

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.jumpTo({ center: [lng, lat], zoom })
    if (map.isStyleLoaded()) drawTarget(map, markerRef, target.current)
    // else the pending style.load draws it
  }, [lat, lng, zoom, precise])

  return (
    <div ref={box} className="map-detail__map">
      {unsupported && <p className="map-detail__unsupported" role="note">{t('map.webglMissing')}</p>}
    </div>
  )
}

/** The mark: a pin on the address when the geocoder found the house, a
 *  1,500 m circle on the city when it did not. */
function drawTarget(map: maplibregl.Map, markerRef: { current: maplibregl.Marker | null }, t: Target): void {
  markerRef.current?.remove()
  markerRef.current = null
  if (map.getLayer(`${HQ_SOURCE}-fill`)) map.removeLayer(`${HQ_SOURCE}-fill`)
  if (map.getLayer(`${HQ_SOURCE}-line`)) map.removeLayer(`${HQ_SOURCE}-line`)
  if (map.getSource(HQ_SOURCE)) map.removeSource(HQ_SOURCE)
  if (t.precise) {
    const el = document.createElement('div')
    el.className = 'map-detail__pin'
    markerRef.current = new maplibregl.Marker({ element: el }).setLngLat([t.lng, t.lat]).addTo(map)
    return
  }
  map.addSource(HQ_SOURCE, { type: 'geojson', data: circlePolygon(t.lat, t.lng, 1500) })
  map.addLayer({ id: `${HQ_SOURCE}-fill`, type: 'fill', source: HQ_SOURCE,
                 paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.15 } })
  map.addLayer({ id: `${HQ_SOURCE}-line`, type: 'line', source: HQ_SOURCE,
                 paint: { 'line-color': '#f59e0b', 'line-width': 1, 'line-dasharray': [4, 4] } })
}

// A closeable street-level detail map for one company, over the world map. Pins the HQ
// at its server-geocoded coordinate — a precise marker when the full address resolved,
// otherwise a circle at the city to signal the location is approximate.
export default function MapDetail({ data, onClose }: { data: MapDetailData; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const precise = data.precise ?? false
  const place = [data.city, countryName(data.country, i18n.language)].filter(Boolean).join(', ')
  const legal = data.legalAddress && data.legalAddress !== data.hqAddress ? data.legalAddress : null

  return (
    <div className="map-detail" role="dialog" aria-label={data.label}>
      <div className="map-detail__header">
        <div className="map-detail__title">
          <strong className="map-detail__name">{data.label}</strong>
          {place && <span className="map-detail__place">{place}</span>}
          {data.hqAddress && <span className="map-detail__addr">{data.hqAddress}</span>}
          {legal && (
            <span className="map-detail__addr map-detail__addr--legal">
              {t('map.registeredAddr')}: {legal}
            </span>
          )}
          {!precise && <span className="map-detail__approx">{t('map.approxLocation')}</span>}
        </div>
        <button className="map-detail__close" onClick={onClose} title={t('map.close')} type="button">
          <FiX />
        </button>
      </div>

      <Basemap lat={data.lat} lng={data.lng} zoom={precise ? 16 : 12} precise={precise} />

      <a className="map-detail__link"
         href={data.hqAddress ? osmAddressUrl(data.hqAddress) : osmLargeUrl(data.lat, data.lng, precise ? 17 : 13)}
         target="_blank" rel="noopener noreferrer">
        {t('map.viewLarger')} <FiExternalLink size={12} />
      </a>
    </div>
  )
}
