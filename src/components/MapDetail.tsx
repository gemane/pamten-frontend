import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiX, FiExternalLink } from 'react-icons/fi'
import { MapContainer, TileLayer, CircleMarker, Circle, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { countryName } from '../utils/isoCountries'
import { osmLargeUrl, geocodeAddress } from '../utils/osm'

// Leaflet loads no tiles when it inits before its container is sized (a popup that
// just appeared) — the map shows blank while SVG overlays still render. Recompute the
// size once mounted so the tiles load.
function InvalidateSize() {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 0)
    return () => clearTimeout(id)
  }, [map])
  return null
}

export interface MapDetailData {
  label: string
  city?: string
  address?: string
  country: string
  lat: number       // city-level fallback (hq_city geocode)
  lng: number
}

// A closeable street-level detail map for one company, over the world map. Uses the
// full address for a precise pin when it geocodes; otherwise shows a circle at the
// city to signal the location is approximate (city-level only).
export default function MapDetail({ data, onClose }: { data: MapDetailData; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  // point starts city-level (approximate) and upgrades to the geocoded address.
  const [point, setPoint] = useState<{ lat: number; lng: number; precise: boolean }>(
    { lat: data.lat, lng: data.lng, precise: false })

  useEffect(() => {
    let active = true
    setPoint({ lat: data.lat, lng: data.lng, precise: false })
    if (data.address) {
      geocodeAddress(data.address).then(hit => {
        if (active && hit) setPoint({ ...hit, precise: true })
      })
    }
    return () => { active = false }
  }, [data.address, data.lat, data.lng])

  const place = [data.city, countryName(data.country, i18n.language)].filter(Boolean).join(', ')

  return (
    <div className="map-detail" role="dialog" aria-label={data.label}>
      <div className="map-detail__header">
        <div className="map-detail__title">
          <strong className="map-detail__name">{data.label}</strong>
          {place && <span className="map-detail__place">{place}</span>}
          {data.address && <span className="map-detail__addr">{data.address}</span>}
          {!point.precise && (
            <span className="map-detail__approx">{t('map.approxLocation')}</span>
          )}
        </div>
        <button className="map-detail__close" onClick={onClose} title={t('map.close')} type="button">
          <FiX />
        </button>
      </div>

      <MapContainer
        key={`${point.lat},${point.lng}`}      // recenter by remounting when the point resolves
        center={[point.lat, point.lng]}
        zoom={point.precise ? 16 : 12}
        scrollWheelZoom
        className="map-detail__map"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <InvalidateSize />
        {point.precise
          ? <CircleMarker center={[point.lat, point.lng]} radius={9}
              pathOptions={{ color: '#b45309', weight: 2, fillColor: '#fcd34d', fillOpacity: 0.95 }} />
          : <Circle center={[point.lat, point.lng]} radius={1500}
              pathOptions={{ color: '#f59e0b', weight: 1, dashArray: '4', fillColor: '#f59e0b', fillOpacity: 0.15 }} />
        }
      </MapContainer>

      <a className="map-detail__link" href={osmLargeUrl(point.lat, point.lng, point.precise ? 17 : 13)}
         target="_blank" rel="noopener noreferrer">
        {t('map.viewLarger')} <FiExternalLink size={12} />
      </a>
    </div>
  )
}
