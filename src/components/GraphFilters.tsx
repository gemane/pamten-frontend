import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FiSliders, FiX, FiChevronDown } from 'react-icons/fi'
import { countryName } from '../utils/isoCountries'
import { asOfYear } from '../utils/asOf'
import { DEFAULT_STAKE, STAKE_FILTERS, filterLabel, type StakeFilter } from './GraphStakeFilter'

/**
 * Every control over WHAT the graph shows, behind one button.
 *
 * They used to sit on the canvas each on its own — the stake band top right,
 * the year chip and its legend beside it, the subsidiaries switch under Clear,
 * and a country row under the search bar — and on a phone they covered the
 * graph and each other. Now the canvas keeps Clear, this button and the ⓘ.
 *
 * The button says how many of them are off their default, and names the year
 * when the graph shows the past: a filtered graph must never look like the
 * whole one, least of all a past one like the present.
 */
interface GraphFiltersProps {
  /** A graph is on the canvas: without one only the country (which scopes the
   *  SEARCH) has anything to act on. */
  hasGraph: boolean
  stake: StakeFilter
  onStakeChange: (filter: StakeFilter) => void
  /** How many ownership links state a percentage, out of how many there are. */
  stated: number
  total: number
  allLevels: boolean
  onAllLevelsChange?: (on: boolean) => void
  asOf: string | null
  onAsOfClear?: () => void
  country: string
  onCountryChange?: (country: string) => void
  countries: { country: string; count: number }[]
}

const PHONE_WIDTH = 640      // the stylesheet's phone breakpoint
const BOTTOM_NAV = 84        // the phone's bottom navigation, plus a margin

/** How many filters are off their default — what the badge shows. */
export function activeFilterCount(
  p: Pick<GraphFiltersProps, 'hasGraph' | 'stake' | 'allLevels' | 'asOf' | 'country'>,
): number {
  return (p.country ? 1 : 0)
    + (p.hasGraph && p.stake.id !== DEFAULT_STAKE.id ? 1 : 0)
    + (p.hasGraph && p.allLevels ? 1 : 0)
    + (p.hasGraph && p.asOf ? 1 : 0)
}

export default function GraphFilters(props: GraphFiltersProps) {
  const { hasGraph, stake, onStakeChange, stated, total, allLevels, onAllLevelsChange,
          asOf, onAsOfClear, country, onCountryChange, countries } = props
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [countryOpen, setCountryOpen] = useState(false)
  const [countryQuery, setCountryQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  // On a phone the canvas is short and clips what hangs inside it, so the panel
  // is laid over the page instead: fixed, edge to edge under the button, down
  // to the bottom navigation at most.
  const [sheet, setSheet] = useState<{ top: number } | null>(null)

  // Dismissal as everywhere else: pointer outside, or Escape. `touchstart` as
  // well as `mousedown`, because on touch the latter may never arrive.
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent | TouchEvent) => {
      const target = e instanceof TouchEvent ? e.touches[0]?.target : (e as MouseEvent).target
      if (ref.current && !ref.current.contains(target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('touchstart', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  useEffect(() => { if (!open) { setCountryOpen(false); setCountryQuery('') } }, [open])

  const count = activeFilterCount(props)
  const year = hasGraph && asOf ? asOfYear(asOf) : null
  const anyLabel = t('graph.filterAny')
  const showCountry = !!onCountryChange && countries.length > 0
  if (!hasGraph && !showCountry) return null

  const listed = countries.filter(c =>
    countryName(c.country, i18n.language).toLowerCase().includes(countryQuery.toLowerCase()))
  // A choice made is the panel done with: it closes, and the graph is in view again.
  const pick = (code: string) => { onCountryChange?.(code); setOpen(false) }

  return (
    <div className="graph-filters" ref={ref}>
      <button
        type="button"
        className={`graph-filters__toggle ${count > 0 ? 'graph-filters__toggle--on' : ''}`}
        title={t('graph.filters')} aria-haspopup="dialog" aria-expanded={open}
        ref={toggleRef}
        onClick={() => {
          const narrow = typeof window !== 'undefined' && window.innerWidth <= PHONE_WIDTH
          setSheet(narrow && toggleRef.current ? { top: toggleRef.current.getBoundingClientRect().bottom + 6 } : null)
          setOpen(v => !v)
        }}
      >
        <FiSliders aria-hidden="true" />
        <span>{year ? t('graph.filtersWithYear', { year }) : t('graph.filters')}</span>
        {count > 0 && <span className="graph-filters__badge" aria-label={t('graph.filtersActive', { count })}>{count}</span>}
      </button>

      {open && (
        <div className={`graph-filters__panel ${sheet ? 'graph-filters__panel--sheet' : ''}`}
             role="dialog" aria-label={t('graph.filters')}
             style={sheet ? { top: sheet.top, maxHeight: `calc(100dvh - ${sheet.top + BOTTOM_NAV}px)` } : undefined}>
          {hasGraph && (
            <section className="graph-filters__row" role="radiogroup" aria-label={t('graph.filterTitle')}>
              <h4 className="graph-filters__label">{t('graph.filterTitle')}</h4>
              <div className="graph-filters__chips">
                {STAKE_FILTERS.map(f => (
                  <button
                    key={f.id} type="button" role="radio" aria-checked={f.id === stake.id}
                    className={`graph-filters__chip ${f.id === stake.id ? 'graph-filters__chip--active' : ''}`}
                    onClick={() => { onStakeChange(f); setOpen(false) }}
                  >
                    {filterLabel(f, anyLabel)}
                  </button>
                ))}
              </div>
              <p className="graph-filters__note">
                {t('graph.filterCoverage', { stated, total })} {t('graph.filterCoverageRest')}
              </p>
            </section>
          )}

          {hasGraph && onAllLevelsChange && (
            <section className="graph-filters__row" role="radiogroup" aria-label={t('graph.levelsLabel')}>
              <h4 className="graph-filters__label">{t('graph.levelsLabel')}</h4>
              <div className="graph-filters__segments">
                {([[false, 'graph.levelsDirect', 'graph.levelsDirectHint'],
                   [true, 'graph.levelsAll', 'graph.levelsAllHint']] as const).map(([value, label, hint]) => (
                  <button
                    key={label} type="button" role="radio" aria-checked={allLevels === value} title={t(hint)}
                    className={`graph-filters__segment ${allLevels === value ? 'graph-filters__segment--active' : ''}`}
                    onClick={() => { if (allLevels !== value) onAllLevelsChange(value); setOpen(false) }}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            </section>
          )}

          {hasGraph && (
            <section className="graph-filters__row">
              <h4 className="graph-filters__label">{t('graph.filtersYear')}</h4>
              {asOf ? (
                <>
                  <div className="graph-filters__value" role="status">
                    <span>{t('asOf.chip', { year: asOfYear(asOf) })}</span>
                    <button type="button" className="graph-filters__clear" onClick={() => { onAsOfClear?.(); setOpen(false) }}
                            title={t('asOf.clear')} aria-label={t('asOf.clear')}>
                      <FiX />
                    </button>
                  </div>
                  <p className="graph-filters__note">
                    <span className="graph-filters__swatch" aria-hidden="true" />
                    {t('asOf.legend')}
                  </p>
                </>
              ) : (
                <p className="graph-filters__note">{t('graph.filtersYearHint')}</p>
              )}
            </section>
          )}

          {showCountry && (
            <section className="graph-filters__row">
              <h4 className="graph-filters__label">{t('graph.filtersCountry')}</h4>
              <div className="graph-filters__value">
                <button type="button" className="graph-filters__select" aria-expanded={countryOpen}
                        onClick={() => setCountryOpen(o => !o)}>
                  <span>{country ? countryName(country, i18n.language) : t('search.allCountries')}</span>
                  <FiChevronDown aria-hidden="true" />
                </button>
                {country && (
                  <button type="button" className="graph-filters__clear" onClick={() => pick('')}
                          title={t('search.allCountries')} aria-label={t('search.allCountries')}>
                    <FiX />
                  </button>
                )}
              </div>
              {countryOpen && (
                <div className="graph-filters__countries">
                  <input
                    className="graph-filters__search" type="text" autoFocus
                    placeholder={t('search.filterCountries')}
                    value={countryQuery} onChange={e => setCountryQuery(e.target.value)}
                  />
                  <ul className="graph-filters__list">
                    <li>
                      <button type="button" className={`graph-filters__item ${!country ? 'graph-filters__item--active' : ''}`}
                              onClick={() => pick('')}>
                        {t('search.allCountries')}
                      </button>
                    </li>
                    {listed.map(c => (
                      <li key={c.country}>
                        <button type="button"
                                className={`graph-filters__item ${country === c.country ? 'graph-filters__item--active' : ''}`}
                                onClick={() => pick(c.country)}>
                          <span>{countryName(c.country, i18n.language)}</span>
                          <span className="graph-filters__count">{c.count.toLocaleString()}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
