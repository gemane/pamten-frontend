import { useTranslation } from 'react-i18next'
import { FiX, FiExternalLink } from 'react-icons/fi'
import { countryName } from '../utils/isoCountries'

export interface MapDetailData {
  label: string
  city?: string
  address?: string
  country: string
  lat: number
  lng: number
}

// OpenStreetMap embed for a point: a small bbox around it + a marker. `d` (degrees)
// controls the zoom — ~0.01 is roughly a town/neighbourhood view.
export function osmEmbedUrl(lat: number, lng: number, d = 0.01): string {
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`
}

export function osmLargeUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
}

// A closeable street-level detail map for one company, over the world map.
export default function MapDetail({ data, onClose }: { data: MapDetailData; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const place = [data.city, countryName(data.country, i18n.language)].filter(Boolean).join(', ')
  return (
    <div className="map-detail" role="dialog" aria-label={data.label}>
      <div className="map-detail__header">
        <div className="map-detail__title">
          <strong className="map-detail__name">{data.label}</strong>
          {place && <span className="map-detail__place">{place}</span>}
          {data.address && <span className="map-detail__addr">{data.address}</span>}
        </div>
        <button className="map-detail__close" onClick={onClose} title={t('map.close')} type="button">
          <FiX />
        </button>
      </div>
      <iframe
        className="map-detail__frame"
        title={data.label}
        src={osmEmbedUrl(data.lat, data.lng)}
        loading="lazy"
      />
      <a className="map-detail__link" href={osmLargeUrl(data.lat, data.lng)}
         target="_blank" rel="noopener noreferrer">
        {t('map.viewLarger')} <FiExternalLink size={12} />
      </a>
    </div>
  )
}
