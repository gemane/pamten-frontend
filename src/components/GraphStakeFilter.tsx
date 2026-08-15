import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FiFilter, FiCheck } from 'react-icons/fi'

/**
 * How much of a company someone has to hold before the graph draws the link.
 *
 * Bands, not a slider. Ownership data is reported in bands — Companies House
 * PSC states "more than 25%", "more than 50%", "75% or more", and never a
 * number — so a continuous control offers precision the sources do not have,
 * and asks the reader to invent a number where the law already has names for
 * the ones that matter.
 *
 * It sits above the ⓘ, in the same stack, because it is the same kind of thing:
 * a control over how the graph is drawn rather than over the data behind it.
 */

export interface StakeFilter {
  id: string
  /** Percent to compare against. 0 with `inclusive` means "everything". */
  min: number
  /** `≥ min` when true, `> min` when false — following how each threshold is
   *  written in the rules it comes from. */
  inclusive: boolean
}

export const STAKE_FILTERS: StakeFilter[] = [
  { id: 'any',   min: 0,  inclusive: true },
  { id: 'gte5',  min: 5,  inclusive: true },
  { id: 'gte25', min: 25, inclusive: true },
  { id: 'gt50',  min: 50, inclusive: false },
  { id: 'gt75',  min: 75, inclusive: false },
]

export const ANY_STAKE = STAKE_FILTERS[0]

/**
 * Whether a relationship survives the filter.
 *
 * An undisclosed stake is **kept**, always. Most ownership links state no
 * percentage at all — 26 of 115 on the Barclays graph, 1 of 28 on Microsoft's —
 * and hiding what the sources decline to quantify would quietly delete most of
 * the graph and present the remainder as the whole picture.
 */
export function keepsEdge(stake: number | null | undefined, filter: StakeFilter): boolean {
  if (stake == null) return true
  return filter.inclusive ? stake >= filter.min : stake > filter.min
}

/** "Any", "≥25%", ">50%" — the label on the button and in the list. */
export function filterLabel(filter: StakeFilter, anyLabel: string): string {
  if (filter.min === 0) return anyLabel
  return `${filter.inclusive ? '≥' : '>'}${filter.min}%`
}

interface GraphStakeFilterProps {
  value: StakeFilter
  onChange: (filter: StakeFilter) => void
  /** How many ownership links state a percentage, out of how many there are.
   *  Shown because a filter that cannot touch most of the graph should say so
   *  rather than look broken. */
  stated: number
  total: number
}

export default function GraphStakeFilter({ value, onChange, stated, total }: GraphStakeFilterProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  const anyLabel = t('graph.filterAny')

  return (
    <div className="graph-filter" ref={ref}>
      <button
        className={`graph-filter__toggle ${value.min > 0 ? 'graph-filter__toggle--on' : ''}`}
        title={t('graph.filterTitle')} aria-label={t('graph.filterTitle')}
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <FiFilter />
        {/* The active band on the button, so a filtered graph never looks like
            the whole one. Nothing when it is showing everything. */}
        {value.min > 0 && <span className="graph-filter__value">{filterLabel(value, anyLabel)}</span>}
      </button>

      {open && (
        <div className="graph-filter__panel" role="menu">
          <div className="graph-filter__heading">{t('graph.filterTitle')}</div>
          {STAKE_FILTERS.map(f => (
            <button
              key={f.id} role="menuitemradio" aria-checked={f.id === value.id}
              className={`graph-filter__option ${f.id === value.id ? 'graph-filter__option--active' : ''}`}
              onClick={() => { onChange(f); setOpen(false) }}
            >
              <FiCheck size={12} style={{ visibility: f.id === value.id ? 'visible' : 'hidden' }} />
              {filterLabel(f, anyLabel)}
            </button>
          ))}
          <div className="graph-filter__note">
            <p>{t('graph.filterCoverage', { stated, total })}</p>
            <p>{t('graph.filterCoverageRest')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
