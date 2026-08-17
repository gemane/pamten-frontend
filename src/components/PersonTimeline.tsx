import { useTranslation } from 'react-i18next'
import { FiClock, FiUser, FiArrowUpLeft, FiGift } from 'react-icons/fi'
import OwnershipBadge from './OwnershipBadge'
import type { OwnsRelationship, PersonProfile } from '../types'

/**
 * A person's positions and holdings, in time order.
 *
 * The panel already lists them; what it cannot show is the shape of a career.
 * Steve Jobs founded Apple in 1976, sat on its board until 1985, came back in
 * 1997 and ran it until 2011 — four rows that mean something in sequence and
 * very little unordered. Larry Page was Google's CEO twice, which is a fact the
 * list flattens into a repeated line.
 *
 * Built from the profile the panel has already fetched — every position and
 * holding carries `since` and `until` — so this costs no request.
 *
 * Two rules, both about not overstating what the sources say:
 *
 * - **Undated entries keep their own group.** "Founder of Google" has no period
 *   and never will, and Wikidata's reverse lookup returns no dates at all.
 *   Guessing one would put a fabricated year on the graph's own timeline.
 * - **Ownership has no end dates** in this data (0 of 111 on the dev graph), so
 *   a holding reads "since 2022" rather than as a closed span.
 *
 * Born and died appear as their own markers, and only as **years**. The panel
 * shows a living person an age rather than a date, deliberately — the smaller
 * disclosure about somebody who never contacted us. A year is smaller again, and
 * it is what makes a career legible: a first directorship reads differently at 24
 * than at 54. The record of processing says so too; the two move together.
 */

export interface TimelineRow {
  /** A relationship, or a marker on the person's own life. */
  kind: 'role' | 'owns' | 'life'
  label: string                 // the role, or "owns"
  company: string
  companyId?: string
  since: string | null
  until: string | null
  stakePercent?: number | null
  ownershipType?: OwnsRelationship['ownership_type']
}

/** Positions and holdings as one list, newest first, undated last. */
export function personTimelineRows(profile: PersonProfile): TimelineRow[] {
  const rows: TimelineRow[] = []

  // Born, and died where recorded. Year only — see the note above.
  const born = profile.person?.birth_date
  const died = profile.person?.death_date
  if (born) {
    rows.push({ kind: 'life', label: 'born', company: '', since: born, until: null })
  }
  if (died) {
    rows.push({ kind: 'life', label: 'died', company: '', since: died, until: null })
  }

  for (const position of profile.positions ?? []) {
    const rel = position.role
    rows.push({
      kind: 'role',
      label: rel?.role ?? '',
      company: position.entity?.name ?? '',
      companyId: position.entity?.id,
      since: rel?.since ?? null,
      until: rel?.until ?? null,
    })
  }

  for (const holding of profile.holdings ?? []) {
    const rel = holding.relationship
    rows.push({
      kind: 'owns',
      label: 'owns',
      company: holding.entity?.name ?? '',
      companyId: holding.entity?.id,
      since: rel?.since ?? null,
      until: rel?.until ?? null,
      stakePercent: rel?.stake_percent ?? null,
      ownershipType: rel?.ownership_type ?? null,
    })
  }

  // Newest first, and everything undated after everything dated — the same order
  // the entity timeline uses, so the two read alike.
  return rows.sort((a, b) => {
    if (!a.since && !b.since) return a.company.localeCompare(b.company)
    if (!a.since) return 1
    if (!b.since) return -1
    return b.since.localeCompare(a.since)
  })
}

/** Whether there is a timeline worth showing.
 *
 *  A birth year on its own is not a career — it would open a tab containing one
 *  grey dot — so the gate asks for a dated *relationship*, not merely a dated row.
 */
export function hasDatedRows(profile: PersonProfile | null | undefined): boolean {
  if (!profile) return false
  return personTimelineRows(profile).some(r => !!r.since && r.kind !== 'life')
}

function groupByYear(rows: TimelineRow[]): [string, TimelineRow[]][] {
  const groups: Record<string, TimelineRow[]> = {}
  for (const row of rows) {
    const key = row.since ? row.since.slice(0, 4) : '__undated'
    ;(groups[key] ||= []).push(row)
  }
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === '__undated') return 1
    if (b === '__undated') return -1
    return Number(b) - Number(a)
  })
}

function Row({ row }: { row: TimelineRow }) {
  const { t } = useTranslation()
  const isOwns = row.kind === 'owns'
  const isLife = row.kind === 'life'
  const color = isLife ? '#8892a4' : isOwns ? '#8E44AD' : '#27AE60'
  const Icon = isLife ? FiGift : isOwns ? FiArrowUpLeft : FiUser
  const ended = row.until ? row.until.slice(0, 4) : null

  if (isLife) {
    // No company, no badge: a life event is a marker on the line, not a
    // relationship, and "Active" against a birth would be absurd.
    return (
      <div className="tl-event tl-event--life">
        <div className="tl-event__dot" style={{ background: color }} />
        <div className="tl-event__body">
          <span className="tl-event__kind" style={{ color }}>
            <Icon />
            {row.label === 'born' ? t('timeline.born') : t('timeline.died')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="tl-event">
      <div className="tl-event__dot" style={{ background: color }} />
      <div className="tl-event__body">
        <div className="tl-event__row">
          <span className="tl-event__kind" style={{ color }}>
            <Icon />
            {isOwns ? t('timeline.owns') : row.label}
          </span>
          {ended
            ? <span className="tl-event__badge tl-event__badge--closed">
                {t('timeline.until', { year: ended })}
              </span>
            : row.since && <span className="tl-event__badge tl-event__badge--active">
                {t('timeline.active')}
              </span>}
        </div>
        <div className="tl-event__name">{row.company}</div>
        {row.stakePercent != null && (
          <div className="tl-event__meta">
            <OwnershipBadge type={row.ownershipType} percent={row.stakePercent} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function PersonTimeline({ profile }: { profile: PersonProfile }) {
  const { t } = useTranslation()
  const rows = personTimelineRows(profile)

  if (rows.length === 0) {
    return <div className="tl-placeholder">{t('timeline.empty')}</div>
  }

  return (
    <div className="timeline">
      {groupByYear(rows).map(([year, group]) => (
        <div key={year} className="tl-group">
          <div className="tl-group__label">
            <FiClock />
            {year === '__undated' ? t('timeline.noDate') : year}
          </div>
          <div className="tl-group__events">
            {group.map((row, i) => <Row key={i} row={row} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
