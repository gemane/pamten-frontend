import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiX, FiExternalLink } from 'react-icons/fi'
import { MapContainer, TileLayer, CircleMarker, Circle, useMap } from 'react-leaflet'
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

      <MapContainer center={[data.lat, data.lng]} zoom={precise ? 16 : 12}
                    scrollWheelZoom className="map-detail__map">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
          subdomains="abcd"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        />
        <InvalidateSize />
        {precise
          ? <CircleMarker center={[data.lat, data.lng]} radius={9}
              pathOptions={{ color: '#b45309', weight: 2, fillColor: '#fcd34d', fillOpacity: 0.95 }} />
          : <Circle center={[data.lat, data.lng]} radius={1500}
              pathOptions={{ color: '#f59e0b', weight: 1, dashArray: '4', fillColor: '#f59e0b', fillOpacity: 0.15 }} />
        }
      </MapContainer>

      <a className="map-detail__link"
         href={data.hqAddress ? osmAddressUrl(data.hqAddress) : osmLargeUrl(data.lat, data.lng, precise ? 17 : 13)}
         target="_blank" rel="noopener noreferrer">
        {t('map.viewLarger')} <FiExternalLink size={12} />
      </a>
    </div>
  )
}
