import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiMapPin, FiLoader, FiChevronRight, FiChevronDown, FiMoreVertical, FiShare2, FiFlag } from 'react-icons/fi'
import { countryName } from '../utils/isoCountries'
import { sortCountries, type CountrySort } from '../utils/sortCountries'
import { subdivisionName, subdivisionCountry, isSubdivision } from '../utils/isoSubdivisions'
import { NO_COUNTRY, basisCountry, basisAddress, sortSubsidiaries, pinFill, type MapBasis } from '../utils/mapBasis'
import type { CountryEntityGroup, Entity, NodeData } from '../types'
import { colorFor } from '../utils/entityColors'
import ActionMenu from './ActionMenu'
import ReportModal from './ReportModal'

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

/**
 * The subdivision rows for one country, biggest first, with the companies that
 * state no subdivision as an explicit tail row.
 *
 * That tail row is the honest part: GLEIF states a subdivision for about 1% of
 * records, so a country's subdivisions rarely add up to its total. Leaving the
 * remainder out would imply every American company is accounted for by the states
 * listed, when in this data 47 of 47 happen to be — and on other data they will
 * not be.
 */
export function subdivisionRows(
  country: string,
  countryCount: number,
  subdivisions: CountryEntityGroup[],
): { code: string | null; count: number }[] {
  const mine = subdivisions
    .filter(d => d.country && subdivisionCountry(d.country) === country)
    .map(d => ({ code: d.country as string, count: d.count }))
    .sort((a, b) => b.count - a.count || subdivisionName(a.code).localeCompare(subdivisionName(b.code)))

  // A country that states no subdivision at all has no breakdown — returning
  // "United Kingdom: 119 not stated" would be a row that says nothing the row
  // above it did not already say.
  if (mine.length === 0) return []

  const stated = mine.reduce((n, d) => n + d.count, 0)
  const rest = countryCount - stated
  return rest > 0 ? [...mine, { code: null, count: rest }] : mine
}

interface MapPanelProps {
  countryData: CountryEntityGroup[]
  /** Counts per ISO 3166-2 code, across all countries; rows are matched by prefix.
   *  Empty under the headquarters basis, where a registration subdivision would be
   *  answering a different question than the one on screen. */
  subdivisionData?: CountryEntityGroup[]
  basis?: MapBasis
  selectedCountry: string | null
  onSelectCountry: (country: string | null) => void
  onLoadEntity: (id: string) => void
  loading: boolean
  contextNode?: NodeData | null
  contextSubsidiaries?: NodeData[]
  onSelectSubsidiary?: (node: NodeData) => void
  onShare?: () => void
}

export default function MapPanel({
  countryData, subdivisionData = [], selectedCountry, onSelectCountry, onLoadEntity, loading,
  basis = 'jurisdiction', contextNode, contextSubsidiaries = [], onSelectSubsidiary, onShare,
}: MapPanelProps) {
  const { t, i18n } = useTranslation()
  // The unplaced group arrives as country: null but is selected by sentinel. A
  // selected subdivision lives in the other list — same row shape, different key
  // space, so the lookup falls through to it.
  const selected = countryData.find(d => (d.country ?? NO_COUNTRY) === selectedCountry)
    ?? subdivisionData.find(d => d.country === selectedCountry)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

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
    // The address the pin is standing on, so the reader can see where that is
    // without opening the pin. Follows the basis: a Cayman pin must not be
    // captioned with a London street.
    const primaryAddress = basisAddress(primary, basis)
    return (
      <div className="map-panel">
        <div className="map-panel__country-header">
          {/* The company's own pin colour, not a fixed amber: under Registered the
              pins are violet, and a list that stays amber beside them makes the
              reader match names by hand to find a company on the map. */}
          <span className="map-entity-dot"
                style={{ background: pinFill('primary', basis), width: 10, height: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="map-panel__country-name">{contextNode.label}</div>
            {primaryCountry && (
              <div className="map-panel__country-count">{countryName(primaryCountry, i18n.language)}</div>
            )}
            {primaryAddress && (
              <div className="map-panel__address" title={primaryAddress}>{primaryAddress}</div>
            )}
          </div>
          {/* Same ⋮ as the node panel: the map is another place a company is
              named, so it is another place to share or report one. */}
          <ActionMenu
            triggerLabel={t('menu.actions')}
            trigger={<FiMoreVertical />}
            items={[
              ...(onShare ? [{ key: 'share', label: t('menu.share'),
                               icon: <FiShare2 size={13} />, onSelect: onShare }] : []),
              { key: 'report', label: t('menu.report'), icon: <FiFlag size={13} />,
                onSelect: () => setReporting(true) },
            ]}
          />
        </div>
        {reporting && (
          <ReportModal targetKind="entity" targetLabel={contextNode.label}
                       nodeId={contextNode.id} onClose={() => setReporting(false)} />
        )}
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
                  <span className="map-entity-dot" style={{ background: pinFill('subsidiary', basis) }} />
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
              {selected.country
                ? (isSubdivision(selected.country)
                    ? `${subdivisionName(selected.country)}, ${countryName(subdivisionCountry(selected.country), i18n.language)}`
                    : countryName(selected.country, i18n.language))
                : t('map.noCountry')}
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
        {sortedCountries.map(d => {
          const rows = d.country ? subdivisionRows(d.country, d.count, subdivisionData) : []
          // One row plus the remainder tells the reader nothing they cannot see
          // already, so an expander only appears where there is a breakdown.
          const canExpand = rows.filter(r => r.code).length > 0
          const isOpen = canExpand && expanded === d.country
          return (
            <div key={d.country} className="map-country-group">
              <div className={`map-country-row ${isOpen ? 'map-country-row--open' : ''}`}>
                {canExpand ? (
                  <button
                    className="map-country-row__toggle"
                    aria-expanded={isOpen}
                    aria-label={t('map.subdivisionsOf', {
                      country: countryName(d.country as string, i18n.language),
                    })}
                    onClick={() => setExpanded(isOpen ? null : d.country)}
                  >
                    {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                  </button>
                ) : (
                  <FiMapPin className="map-country-row__pin" />
                )}
                <button
                  className="map-country-row__main"
                  onClick={() => onSelectCountry(d.country ?? NO_COUNTRY)}
                >
                  <span className="map-country-row__name">
                    {d.country ? countryName(d.country, i18n.language) : t('map.noCountry')}
                  </span>
                  <span className="map-country-row__count">{d.count}</span>
                </button>
              </div>
              {isOpen && (
                <div className="map-subdivision-list">
                  {rows.map(r => (
                    <button
                      key={r.code ?? '__rest__'}
                      className="map-subdivision-row"
                      disabled={!r.code}
                      onClick={() => r.code && onSelectCountry(r.code)}
                    >
                      <span className="map-subdivision-row__name">
                        {r.code ? subdivisionName(r.code) : t('map.subdivisionNotStated')}
                      </span>
                      <span className="map-country-row__count">{r.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
