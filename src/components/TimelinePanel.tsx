import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiArrowDownRight, FiArrowUpLeft, FiUser, FiClock, FiInbox, FiEyeOff, FiLogOut, FiExternalLink, FiTag } from 'react-icons/fi'
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
  /** Dimmed: no newer list or quarter confirms it. With the evidence behind
   *  the mark — why (`stale_reason`) and since when (`stale_since`) — the
   *  holding ALSO gets a dated "no longer confirmed" entry under that year. */
  stale?: boolean | null
  stale_since?: string | null
  stale_reason?: string | null
  stale_source_url?: string | null
  /** "acquired": the one start a source STATES as a purchase — the SEC
   *  acquisition reader's closing date, with the price paid and the filing.
   *  Every other start is a date the holding existed by. */
  start_kind?: string | null
  value_usd?: number | null
  since_source_url?: string | null
  /** How the source says the holding ended (`gleif_inactive`, `gleif_dropped`,
   *  `ceased`, `withdrawn`; a 13D/G amendment has none and is read off the
   *  filing type) and the filing itself — for the end entry. */
  until_reason?: string | null
  source_url?: string | null
  filing_type?: string | null
  /** On a derived entry ('dimmed', 'ended'): the kind of the row it came from. */
  origin?: string | null
  /** 'renamed': the company's own rename — no party; the old name and the
   *  one that followed it (the current name after the last), `since` = the
   *  last day the old name applied, as the register records it. */
  former_name?: string | null
  new_name?: string | null
}

/** A deal price as the panel says it: "$29.5 bn", "$2.7 m", "$950,000". */
export function formatUsd(v: number): string {
  const abs = Math.abs(v)
  const [n, unit] = abs >= 1e9 ? [v / 1e9, 'bn'] : abs >= 1e6 ? [v / 1e6, 'm'] : [v, '']
  const s = n.toLocaleString('en-US', { maximumFractionDigits: unit && Math.abs(n) < 100 ? 1 : 0 })
  return unit ? `$${s} ${unit}` : `$${s}`
}

/** The reasons the backend writes (edge_schema.STALE_REASONS); anything else
 *  reads as the generic one. */
const KNOWN_REASONS = new Set(['13f_not_confirmed', 'ex21_not_listed', 'unconfirmed', 'lei_lapsed'])
const reasonKey = (reason: string | null | undefined): string =>
  `timeline.reason.${reason && KNOWN_REASONS.has(reason) ? reason : 'unknown'}`

/** The timeline tells transitions, never states. A row from the API is the
 *  start of a holding or a role; this adds the other transitions it implies,
 *  each filed under its own year: the day the holding ENDED (every row with an
 *  `until`), and the day it stopped being CONFIRMED (a dimmed holding with a
 *  dated reason — one marked before the reason was recorded keeps only the
 *  badge on its own row). */
function withTransitionEvents(events: TimelineEvent[]): TimelineEvent[] {
  const out: TimelineEvent[] = []
  for (const ev of events) {
    out.push(ev)
    const ownership = ev.kind === 'ownership_in' || ev.kind === 'ownership_out'
    if (ev.stale && ev.stale_since && ownership) {
      out.push({ ...ev, kind: 'dimmed', origin: ev.kind, since: ev.stale_since, since_basis: null,
                 until: null, active: false })
    }
    if (ev.until && (ownership || ev.kind === 'role')) {
      out.push({ ...ev, kind: 'ended', origin: ev.kind, since: ev.until, since_basis: null,
                 until: null, active: false })
    }
  }
  return out
}

/** How the source says a holding ended, as a words key. */
const END_REASONS = new Set(['gleif_inactive', 'gleif_dropped', 'ceased', 'withdrawn'])
function endReasonKey(ev: TimelineEvent): string {
  if (ev.until_reason && END_REASONS.has(ev.until_reason)) return `timeline.endReason.${ev.until_reason}`
  if (/^13[DG]/.test(ev.filing_type ?? '')) return 'timeline.endReason.amendment'
  return 'timeline.endReason.unknown'
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
  dimmed:        '#8892a4',
  ended:         '#718096',
  renamed:       '#B7791F',
}
const KIND_ICON: Record<string, React.ElementType> = {
  ownership_in:  FiArrowDownRight,
  ownership_out: FiArrowUpLeft,
  role:          FiUser,
  dimmed:        FiEyeOff,
  ended:         FiLogOut,
  renamed:       FiTag,
}

/** The company's own rename, under the year the old name ended: "Renamed",
 *  then the old name and the one that followed it. The one entry that is not
 *  a relationship — it comes off the register's list of previous names
 *  (Companies House, EDGAR), each with its change-of-name date. */
function RenamedRow({ ev }: { ev: TimelineEvent }) {
  const { t } = useTranslation()
  return (
    <div className="tl-event tl-event--renamed" data-testid="tl-renamed">
      <div className="tl-event__dot" style={{ background: KIND_COLOR.renamed }} />
      <div className="tl-event__body">
        <div className="tl-event__row">
          <span className="tl-event__kind" style={{ color: KIND_COLOR.renamed }}>
            <FiTag />
            {t('timeline.renamed')}
          </span>
        </div>
        <div className="tl-event__name">
          {ev.former_name}
          {ev.new_name && (
            <>
              {' '}<span role="img" aria-label={t('timeline.became')}>→</span>{' '}
              {ev.new_name}
            </>
          )}
        </div>
        <div className="tl-event__meta tl-event__reason">
          {t('timeline.renamedOn', { date: ev.since ?? '' })}
        </div>
      </div>
    </div>
  )
}

/** The day a holding or a role ended: what changed, and how the source says
 *  so. Never "sold" — no source states a sale, only that the holding ended. */
function EndedRow({ ev }: { ev: TimelineEvent }) {
  const { t } = useTranslation()
  const name = partyName(ev.party)
  const date = ev.since ?? ''
  const label = ev.origin === 'ownership_in' ? t('timeline.endedOwnedBy')
              : ev.origin === 'ownership_out' ? t('timeline.endedOwns')
              : t('timeline.roleEnded', { role: ev.role ?? t('timeline.executive') })
  const amendment = endReasonKey(ev) === 'timeline.endReason.amendment'
  return (
    <div className="tl-event tl-event--ended" data-testid="tl-ended">
      <div className="tl-event__dot" style={{ background: KIND_COLOR.ended }} />
      <div className="tl-event__body">
        <div className="tl-event__row">
          <span className="tl-event__kind" style={{ color: KIND_COLOR.ended }}>
            <FiLogOut />
            {label}
          </span>
        </div>
        <div className="tl-event__name">{name}</div>
        {ev.origin !== 'role' && (
          <div className="tl-event__meta tl-event__reason">
            {t(endReasonKey(ev), { date })}
            {amendment && ev.source_url && (
              <>
                {' '}
                <a href={ev.source_url} target="_blank" rel="noreferrer">
                  {t('timeline.filing')} <FiExternalLink />
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** The dated entry for a holding that stopped being confirmed: why, in words,
 *  with the newer filing linked when there is one. */
function DimmedRow({ ev }: { ev: TimelineEvent }) {
  const { t } = useTranslation()
  const name = partyName(ev.party)
  const date = ev.since ?? ''
  return (
    <div className="tl-event tl-event--dimmed" data-testid="tl-dimmed">
      <div className="tl-event__dot" style={{ background: KIND_COLOR.dimmed }} />
      <div className="tl-event__body">
        <div className="tl-event__row">
          <span className="tl-event__kind" style={{ color: KIND_COLOR.dimmed }}>
            <FiEyeOff />
            {t('timeline.dimmedLabel')}
          </span>
        </div>
        <div className="tl-event__name">{name}</div>
        <div className="tl-event__meta tl-event__reason">
          {t(reasonKey(ev.stale_reason), { date })}
          {ev.stale_source_url && (
            <>
              {' '}
              <a href={ev.stale_source_url} target="_blank" rel="noreferrer">
                {t('timeline.reasonSource')} <FiExternalLink />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EventRow({ ev }: { ev: TimelineEvent }) {
  const { t } = useTranslation()
  const kind      = ev.kind ?? ''
  if (kind === 'dimmed') return <DimmedRow ev={ev} />
  if (kind === 'ended') return <EndedRow ev={ev} />
  if (kind === 'renamed') return <RenamedRow ev={ev} />
  const color     = KIND_COLOR[kind] || KIND_COLOR.role
  const Icon      = KIND_ICON[kind]  || FiUser
  // "Owns" / "Owned by", not "Acquired": most sources say a holding existed at
  // a date, not that it was bought then (an Exhibit 21 is a year-end list), and
  // the year heading above already carries the date.
  // …except the one start a source states as a purchase: the SEC acquisition
  // reader's closing date, which may say "Acquired", with the price paid.
  const acquired  = ev.start_kind === 'acquired'
  const kindLabel = kind === 'ownership_in'  ? t(acquired ? 'timeline.acquiredBy' : 'timeline.ownedBy')
                  : kind === 'ownership_out' ? t(acquired ? 'timeline.acquired' : 'timeline.ownsLabel')
                  : t('timeline.executive')
  // A start date read off the annual subsidiary lists, not stated by a source:
  // "first_listed" — the oldest list naming it, the holding may be older;
  // "newly_listed" — the list for the year before does not name it, nor any
  // older one: it first appears that year.
  // Any other basis is a lower bound too (utils/asOf.isLowerBound) — a 13D/G
  // amendment, the UK PSC register's first day — with its own reason on hover.
  const listed = ev.since && ev.since_basis
    ? { year: ev.since.slice(0, 4), newly: ev.since_basis === 'newly_listed', basis: ev.since_basis } : null
  const boundHint = !listed ? '' : listed.newly ? 'timeline.firstListedHint'
    : listed.basis === 'first_listed' ? 'timeline.sinceAtLeastHint'
    : listed.basis === 'amendment' ? 'timeline.sinceAmendmentHint'
    : listed.basis === 'register_start' ? 'timeline.sinceRegisterHint'
    : 'timeline.sinceLowerBoundHint'
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
              title={t(boundHint, { year: listed.year })}>
              {t(listed.newly ? 'timeline.firstListed' : 'timeline.sinceAtLeast', { year: listed.year })}
            </span>
          )}
          {/* No state badge: a timeline tells transitions, and what holds
              today is the Overview's job. The two badges left point at the
              other transition of the same holding — its end, or the day it
              stopped being confirmed — each with its own dated entry. */}
          {ev.stale
            ? <span className="tl-event__badge tl-event__badge--dimmed"
                    title={t(reasonKey(ev.stale_reason), { date: ev.stale_since ?? '' })}>
                {t('timeline.dimmedBadge')}
              </span>
            : ended && <span className="tl-event__badge tl-event__badge--closed">{t('timeline.until', { year: ended })}</span>}
        </div>
        <div className="tl-event__name">{name}</div>
        {acquired && (ev.value_usd != null || ev.since_source_url) && (
          <div className="tl-event__meta tl-event__deal" data-testid="tl-deal">
            {ev.value_usd != null && t('timeline.forValue', { value: formatUsd(ev.value_usd) })}
            {ev.since_source_url && (
              <>
                {ev.value_usd != null && ' · '}
                <a href={ev.since_source_url} target="_blank" rel="noreferrer">
                  {t('timeline.filing')} <FiExternalLink />
                </a>
              </>
            )}
          </div>
        )}
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

  const groups = groupByYear(withTransitionEvents(events))

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
