import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiArrowDownRight, FiArrowUpLeft, FiUser, FiClock, FiInbox } from 'react-icons/fi'
import { getHistory } from '../services/api'
import OwnershipBadge from './OwnershipBadge'
import { asOfFromYear, asOfYear } from '../utils/asOf'

interface TimelineEvent {
  kind?: string
  since?: string | null
  /** "first_listed": `since` is a LOWER bound — the oldest annual subsidiary
   *  list (Exhibit 21) naming it — not the start of the holding. */
  since_basis?: string | null
  until?: string | null
  active?: boolean
  role?: string
  stake_percent?: number | null
  ownership_type?: string | null
  party?: { name?: string; full_name?: string; id?: string } | null
}

function partyName(party: TimelineEvent['party']): string {
  return party?.name || party?.full_name || party?.id || '?'
}

function groupByYear(events: TimelineEvent[]): [string, TimelineEvent[]][] {
  const groups: Record<string, TimelineEvent[]> = {}
  for (const ev of events) {
    const year = ev.since ? ev.since.slice(0, 4) : null
    const key  = year || '__undated'
    if (!groups[key]) groups[key] = []
    groups[key].push(ev)
  }
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === '__undated') return 1
    if (b === '__undated') return -1
    return Number(b) - Number(a)
  })
}

const KIND_COLOR: Record<string, string> = {
  ownership_in:  '#8E44AD',
  ownership_out: '#4A90D9',
  role:          '#27AE60',
}
const KIND_ICON: Record<string, React.ElementType> = {
  ownership_in:  FiArrowDownRight,
  ownership_out: FiArrowUpLeft,
  role:          FiUser,
}

function EventRow({ ev }: { ev: TimelineEvent }) {
  const { t } = useTranslation()
  const kind      = ev.kind ?? ''
  const color     = KIND_COLOR[kind] || KIND_COLOR.role
  const Icon      = KIND_ICON[kind]  || FiUser
  // "Owns" / "Owned by", not "Acquired": most sources say a holding existed at
  // a date, not that it was bought then (an Exhibit 21 is a year-end list), and
  // the year heading above already carries the date.
  const kindLabel = kind === 'ownership_in'  ? t('timeline.ownedBy')
                  : kind === 'ownership_out' ? t('timeline.ownsLabel')
                  : t('timeline.executive')
  // A start date read off the annual subsidiary lists, not stated by a source:
  // "first_listed" — the oldest list naming it, the holding may be older;
  // "newly_listed" — the list for the year before does not name it, nor any
  // older one: it first appears that year.
  const listed = ev.since && (ev.since_basis === 'first_listed' || ev.since_basis === 'newly_listed')
    ? { year: ev.since.slice(0, 4), newly: ev.since_basis === 'newly_listed' } : null
  const name  = partyName(ev.party)
  const ended = ev.until ? ev.until.slice(0, 4) : null

  return (
    <div className="tl-event">
      <div className="tl-event__dot" style={{ background: color }} />
      <div className="tl-event__body">
        <div className="tl-event__row">
          <span className="tl-event__kind" style={{ color }}>
            <Icon />
            {ev.kind === 'role' ? ev.role || kindLabel : kindLabel}
          </span>
          {listed && (
            <span className="tl-event__badge tl-event__badge--bound"
              title={t(listed.newly ? 'timeline.firstListedHint' : 'timeline.sinceAtLeastHint', { year: listed.year })}>
              {t(listed.newly ? 'timeline.firstListed' : 'timeline.sinceAtLeast', { year: listed.year })}
            </span>
          )}
          {ev.active
            ? <span className="tl-event__badge tl-event__badge--active">{t('timeline.active')}</span>
            : ended && <span className="tl-event__badge tl-event__badge--closed">{t('timeline.until', { year: ended })}</span>}
        </div>
        <div className="tl-event__name">{name}</div>
        {ev.stake_percent != null && (
          <div className="tl-event__meta">
            <OwnershipBadge type={ev.ownership_type} percent={ev.stake_percent} />
          </div>
        )}
      </div>
    </div>
  )
}

interface TimelinePanelProps {
  entityId: string
  /** The day the graph currently shows (time travel); null = the present. */
  asOf?: string | null
  /** Clicking a year asks for the graph as of that year's end; clicking the
   *  selected year again asks for the present (null). Without this the
   *  headings are plain text, as before. */
  onYearSelect?: (asOf: string | null) => void
}

export default function TimelinePanel({ entityId, asOf = null, onYearSelect }: TimelinePanelProps) {
  const { t } = useTranslation()
  const [events,  setEvents]  = useState<TimelineEvent[] | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!entityId) return
    setLoading(true)
    setError(null)
    getHistory(entityId)
      .then(({ data }) => setEvents(data as unknown as TimelineEvent[]))
      .catch(() => setError(t('timeline.error')))
      .finally(() => setLoading(false))
  }, [entityId, t])

  if (loading) return <div className="tl-placeholder">{t('timeline.loading')}</div>
  if (error)   return <div className="tl-placeholder tl-placeholder--error">{error}</div>
  if (!events) return null

  if (events.length === 0) {
    return (
      <div className="tl-empty">
        <FiInbox className="tl-empty__icon" />
        <p>{t('timeline.empty')}</p>
        <p className="tl-empty__hint">{t('timeline.emptyHint')}</p>
      </div>
    )
  }

  const groups = groupByYear(events)

  return (
    <div className="timeline">
      {groups.map(([year, evs]) => (
        <div key={year} className="tl-group">
          {/* A dated year is a way into the past; "No date recorded" has no
              date to travel to and stays a heading. */}
          {year !== '__undated' && onYearSelect ? (() => {
            const selected = asOf != null && asOfYear(asOf) === year
            return (
              <button type="button" className="tl-group__label tl-group__label--btn"
                      aria-pressed={selected}
                      title={selected ? t('timeline.showPresent') : t('timeline.showAsOf', { year })}
                      onClick={() => onYearSelect(selected ? null : asOfFromYear(year))}>
                <FiClock />
                {year}
              </button>
            )
          })() : (
            <div className="tl-group__label">
              <FiClock />
              {year === '__undated' ? t('timeline.noDate') : year}
            </div>
          )}
          <div className="tl-group__events">
            {evs.map((ev, i) => <EventRow key={i} ev={ev} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
