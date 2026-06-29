import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiArrowDownRight, FiArrowUpLeft, FiUser, FiClock, FiInbox } from 'react-icons/fi'
import { getHistory } from '../services/api'
import OwnershipBadge from './OwnershipBadge'

interface TimelineEvent {
  kind?: string
  since?: string | null
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
  const kindLabel = kind === 'ownership_in'  ? t('timeline.acquiredBy')
                  : kind === 'ownership_out' ? t('timeline.acquired')
                  : t('timeline.executive')
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
}

export default function TimelinePanel({ entityId }: TimelinePanelProps) {
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
          <div className="tl-group__label">
            <FiClock />
            {year === '__undated' ? t('timeline.noDate') : year}
          </div>
          <div className="tl-group__events">
            {evs.map((ev, i) => <EventRow key={i} ev={ev} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
