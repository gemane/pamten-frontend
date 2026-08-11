import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiMapPin, FiLoader } from 'react-icons/fi'
import { countryName } from '../utils/isoCountries'
import { sortCountries, type CountrySort } from '../utils/sortCountries'
import { NO_COUNTRY, basisCountry, sortSubsidiaries, type MapBasis } from '../utils/mapBasis'
import type { CountryEntityGroup, Entity, NodeData } from '../types'
import { colorFor } from '../utils/entityColors'

// Was a three-entry copy of the palette — see ScraperPanel for the same fix.
const typeColor = (type?: string | null) => colorFor('entity', type).fill

interface EntityItemProps {
  entity: Entity
  onLoad: (id: string) => void
}

function EntityItem({ entity, onLoad }: EntityItemProps) {
  return (
    <button className="map-entity-item" onClick={() => onLoad(entity.id)}>
      <span
        className="map-entity-dot"
        style={{ background: typeColor(entity.type) }}
      />
      <span className="map-entity-name">{entity.name}</span>
      <span className="map-entity-type">{entity.type}</span>
    </button>
  )
}

interface MapPanelProps {
  countryData: CountryEntityGroup[]
  basis?: MapBasis
  selectedCountry: string | null
  onSelectCountry: (country: string | null) => void
  onLoadEntity: (id: string) => void
  loading: boolean
  contextNode?: NodeData | null
  contextSubsidiaries?: NodeData[]
  onSelectSubsidiary?: (node: NodeData) => void
}

export default function MapPanel({
  countryData, selectedCountry, onSelectCountry, onLoadEntity, loading, basis = 'jurisdiction',
  contextNode, contextSubsidiaries = [], onSelectSubsidiary,
}: MapPanelProps) {
  const { t, i18n } = useTranslation()
  // The unplaced group arrives as country: null but is selected by sentinel.
  const selected = countryData.find(d => (d.country ?? NO_COUNTRY) === selectedCountry)

  const [sortBy, setSortBy] = useState<CountrySort>(
    () => (localStorage.getItem('map-sort') === 'name' ? 'name' : 'count'),
  )
  const changeSort = (s: CountrySort) => {
    setSortBy(s)
    localStorage.setItem('map-sort', s)
  }
  const sortedCountries = useMemo(
    () => sortCountries(countryData, sortBy, i18n.language),
    [countryData, sortBy, i18n.language],
  )

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
    const primaryCountry = basisCountry(primary, basis)
    return (
      <div className="map-panel">
        <div className="map-panel__country-header">
          <span className="map-entity-dot" style={{ background: '#b45309', width: 10, height: 10, flexShrink: 0 }} />
          <div>
            <div className="map-panel__country-name">{contextNode.label}</div>
            {primaryCountry && (
              <div className="map-panel__country-count">{countryName(primaryCountry, i18n.language)}</div>
            )}
          </div>
        </div>
        {contextSubsidiaries.length > 0 ? (
          <div className="map-panel__entity-list">
            {sortSubsidiaries(contextSubsidiaries, basis, i18n.language).map(sub => {
              const e = sub.raw as Entity
              const subCountry = basisCountry(e, basis)
              return (
                <button
                  key={sub.id}
                  className="map-entity-item"
                  onClick={() => onSelectSubsidiary ? onSelectSubsidiary(sub) : onLoadEntity(sub.id)}
                >
                  <span className="map-entity-dot" style={{ background: '#d97706' }} />
                  <span className="map-entity-name">{sub.label}</span>
                  {subCountry
                    ? <span className="map-entity-type">{countryName(subCountry, i18n.language)}</span>
                    : <span className="map-entity-type map-entity-type--unknown">{t('map.noCountry')}</span>
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
            <div className="map-panel__country-name">
              {selected.country ? countryName(selected.country, i18n.language) : t('map.noCountry')}
            </div>
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
      <div className="map-sort-toggle">
        <button
          className={`map-sort-btn ${sortBy === 'count' ? 'map-sort-btn--active' : ''}`}
          onClick={() => changeSort('count')}
        >
          {t('map.sortByCount')}
        </button>
        <button
          className={`map-sort-btn ${sortBy === 'name' ? 'map-sort-btn--active' : ''}`}
          onClick={() => changeSort('name')}
        >
          {t('map.sortByName')}
        </button>
      </div>
      <div className="map-panel__country-list">
        {sortedCountries.map(d => (
          <button
            key={d.country}
            className="map-country-row"
            onClick={() => onSelectCountry(d.country ?? NO_COUNTRY)}
          >
            <FiMapPin className="map-country-row__pin" />
            <span className="map-country-row__name">
              {d.country ? countryName(d.country, i18n.language) : t('map.noCountry')}
            </span>
            <span className="map-country-row__count">{d.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
