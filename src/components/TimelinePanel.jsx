import { useState, useEffect } from 'react'
import { FiArrowDownRight, FiArrowUpLeft, FiUser, FiClock, FiInbox } from 'react-icons/fi'
import { getHistory } from '../services/api'
import OwnershipBadge from './OwnershipBadge'

const KIND_META = {
  ownership_in:  { label: 'Acquired by',  color: '#8E44AD', Icon: FiArrowDownRight },
  ownership_out: { label: 'Acquired',      color: '#4A90D9', Icon: FiArrowUpLeft   },
  role:          { label: 'Executive',     color: '#27AE60', Icon: FiUser          },
}

function partyName(party) {
  return party?.name || party?.full_name || party?.id || '?'
}

function groupByYear(events) {
  const groups = {}
  for (const ev of events) {
    const year = ev.since ? ev.since.slice(0, 4) : null
    const key  = year || '__undated'
    if (!groups[key]) groups[key] = []
    groups[key].push(ev)
  }
  // Sort keys: numeric years desc, undated last
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === '__undated') return 1
    if (b === '__undated') return -1
    return Number(b) - Number(a)
  })
}

function EventRow({ ev }) {
  const meta  = KIND_META[ev.kind] || KIND_META.role
  const name  = partyName(ev.party)
  const ended = ev.until ? ev.until.slice(0, 4) : null

  return (
    <div className="tl-event">
      <div className="tl-event__dot" style={{ background: meta.color }} />
      <div className="tl-event__body">
        <div className="tl-event__row">
          <span className="tl-event__kind" style={{ color: meta.color }}>
            <meta.Icon />
            {ev.kind === 'role' ? ev.role || meta.label : meta.label}
          </span>
          {ev.active
            ? <span className="tl-event__badge tl-event__badge--active">Active</span>
            : ended && <span className="tl-event__badge tl-event__badge--closed">until {ended}</span>}
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

export default function TimelinePanel({ entityId }) {
  const [events,  setEvents]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!entityId) return
    setLoading(true)
    setError(null)
    getHistory(entityId)
      .then(({ data }) => setEvents(data))
      .catch(() => setError('Could not load timeline.'))
      .finally(() => setLoading(false))
  }, [entityId])

  if (loading) return <div className="tl-placeholder">Loading timeline…</div>
  if (error)   return <div className="tl-placeholder tl-placeholder--error">{error}</div>
  if (!events) return null

  if (events.length === 0) {
    return (
      <div className="tl-empty">
        <FiInbox className="tl-empty__icon" />
        <p>No historical data yet.</p>
        <p className="tl-empty__hint">Dates are recorded when relationships are created manually or via the scraper.</p>
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
            {year === '__undated' ? 'No date recorded' : year}
          </div>
          <div className="tl-group__events">
            {evs.map((ev, i) => <EventRow key={i} ev={ev} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
