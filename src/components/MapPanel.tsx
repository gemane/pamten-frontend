import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiMapPin, FiLoader } from 'react-icons/fi'
import { countryName } from '../utils/isoCountries'
import type { CountryEntityGroup, Entity, NodeData } from '../types'

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
  contextNode?: NodeData | null
  contextSubsidiaries?: NodeData[]
  onSelectSubsidiary?: (node: NodeData) => void
}

export default function MapPanel({
  countryData, selectedCountry, onSelectCountry, onLoadEntity, loading,
  contextNode, contextSubsidiaries = [], onSelectSubsidiary,
}: MapPanelProps) {
  const { t } = useTranslation()
  const selected = countryData.find(d => d.country === selectedCountry)

  if (loading) {
    return (
      <div className="map-panel">
        <div className="map-panel__loading"><FiLoader className="spin" /> {t('map.loadingData')}</div>
      </div>
    )
  }

  // Context mode: a graph node is selected — show that company + its subsidiaries
  if (contextNode) {
    const primary = contextNode.raw as Entity
    const primaryCountry = primary.hq_country || primary.country
    return (
      <div className="map-panel">
        <div className="map-panel__country-header">
          <span className="map-entity-dot" style={{ background: '#b45309', width: 10, height: 10, flexShrink: 0 }} />
          <div>
            <div className="map-panel__country-name">{contextNode.label}</div>
            {primaryCountry && (
              <div className="map-panel__country-count">{countryName(primaryCountry)}</div>
            )}
          </div>
        </div>
        {contextSubsidiaries.length > 0 ? (
          <div className="map-panel__entity-list">
            {contextSubsidiaries.map(sub => {
              const e = sub.raw as Entity
              const subCountry = e.hq_country || e.country
              return (
                <button
                  key={sub.id}
                  className="map-entity-item"
                  onClick={() => onSelectSubsidiary ? onSelectSubsidiary(sub) : onLoadEntity(sub.id)}
                >
                  <span className="map-entity-dot" style={{ background: '#d97706' }} />
                  <span className="map-entity-name">{sub.label}</span>
                  {subCountry
                    ? <span className="map-entity-type">{countryName(subCountry)}</span>
                    : <span className="map-entity-type">{(e as Entity).type}</span>
                  }
                </button>
              )
            })}
          </div>
        ) : (
          <p className="map-panel__hint">{t('map.noSubsidiaries')}</p>
        )}
      </div>
    )
  }

  // Normal mode: country selected from map click
  if (selected) {
    return (
      <div className="map-panel">
        <button className="map-panel__back" onClick={() => onSelectCountry(null)}>
          <FiArrowLeft /> {t('map.allCountries')}
        </button>
        <div className="map-panel__country-header">
          <FiMapPin />
          <div>
            <div className="map-panel__country-name">{countryName(selected.country)}</div>
            <div className="map-panel__country-count">{t('map.entityCount', { count: selected.count })}</div>
          </div>
        </div>
        {!selected.entities ? (
          <div className="map-panel__loading"><FiLoader className="spin" /> {t('map.loadingEntities')}</div>
        ) : (
          <>
            <div className="map-panel__entity-list">
              {selected.entities.map(e => (
                <EntityItem key={e.id} entity={e} onLoad={(id) => { onLoadEntity(id) }} />
              ))}
            </div>
            {selected.count > selected.entities.length && (
              <p className="map-panel__limit-note">
                {t('map.showingFirst', { shown: selected.entities.length, total: selected.count })}
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
        {t('map.panelHint')}
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
