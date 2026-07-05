import { FiArrowLeft, FiMapPin, FiLoader } from 'react-icons/fi'
import { countryName } from '../utils/isoCountries'
import type { CountryEntityGroup, Entity } from '../types'

const TYPE_COLOR: Record<string, string> = { company: '#4A90D9', brand: '#E67E22', holding: '#8E44AD' }

interface EntityItemProps {
  entity: Entity
  onLoad: (id: string) => void
}

function EntityItem({ entity, onLoad }: EntityItemProps) {
  return (
    <button className="map-entity-item" onClick={() => onLoad(entity.id)}>
      <span
        className="map-entity-dot"
        style={{ background: TYPE_COLOR[entity.type] || '#8892a4' }}
      />
      <span className="map-entity-name">{entity.name}</span>
      <span className="map-entity-type">{entity.type}</span>
    </button>
  )
}

interface MapPanelProps {
  countryData: CountryEntityGroup[]
  selectedCountry: string | null
  onSelectCountry: (country: string | null) => void
  onLoadEntity: (id: string) => void
  loading: boolean
}

export default function MapPanel({ countryData, selectedCountry, onSelectCountry, onLoadEntity, loading }: MapPanelProps) {
  const selected = countryData.find(d => d.country === selectedCountry)

  if (loading) {
    return (
      <div className="map-panel">
        <div className="map-panel__loading"><FiLoader className="spin" /> Loading map data…</div>
      </div>
    )
  }

  if (selected) {
    return (
      <div className="map-panel">
        <button className="map-panel__back" onClick={() => onSelectCountry(null)}>
          <FiArrowLeft /> All countries
        </button>
        <div className="map-panel__country-header">
          <FiMapPin />
          <div>
            <div className="map-panel__country-name">{countryName(selected.country)}</div>
            <div className="map-panel__country-count">{selected.count} {selected.count === 1 ? 'entity' : 'entities'}</div>
          </div>
        </div>
        {!selected.entities ? (
          <div className="map-panel__loading"><FiLoader className="spin" /> Loading entities…</div>
        ) : (
          <>
            <div className="map-panel__entity-list">
              {selected.entities.map(e => (
                <EntityItem key={e.id} entity={e} onLoad={(id) => { onLoadEntity(id) }} />
              ))}
            </div>
            {selected.count > selected.entities.length && (
              <p className="map-panel__limit-note">
                Showing first {selected.entities.length} of {selected.count} entities
              </p>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="map-panel">
      <p className="map-panel__hint">
        Click a highlighted country to see its entities. Click an entity to load it into the graph.
      </p>
      <div className="map-panel__country-list">
        {countryData.map(d => (
          <button
            key={d.country}
            className="map-country-row"
            onClick={() => onSelectCountry(d.country)}
          >
            <FiMapPin className="map-country-row__pin" />
            <span className="map-country-row__name">{countryName(d.country)}</span>
            <span className="map-country-row__count">{d.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
