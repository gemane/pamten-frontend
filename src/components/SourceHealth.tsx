import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FiLoader, FiCheckCircle, FiAlertTriangle, FiClock, FiHeart, FiLock, FiMinus } from 'react-icons/fi'
import { getScraperHealth } from '../services/api'
import { ago } from '../utils/relativeTime'
import type { ScraperHealth, SourceHealthEntry, DatasetHealth } from '../types'

/** Per-source freshness and health — the OpenCorporates lesson: a data
 *  product's trustworthiness is the visibility of its plumbing. Public like
 *  the activity feed; the backend decides what each viewer may see
 *  (last_error arrives only for contributor+), so this component renders
 *  whatever is present and never gates by role itself. */

function statusOf(s: SourceHealthEntry): 'ok' | 'failed' | 'stale' | 'running' | 'never' {
  if (!s.last_run_at) return 'never'
  const st = s.last_status
  if (st === 'ok' || st === 'failed' || st === 'stale' || st === 'running') return st
  return 'ok'   // skipped and other benign statuses render as calm, not alarming
}

const ICON = {
  ok: FiCheckCircle, failed: FiAlertTriangle, stale: FiClock,
  running: FiLoader, never: FiMinus,
} as const

function HealthRow({ s }: { s: SourceHealthEntry }) {
  const { t } = useTranslation()
  const st = statusOf(s)
  const Icon = ICON[st]
  return (
    <li className={`src-health__row src-health__row--${st}`}>
      <span className="src-health__status"><Icon size={13} className={st === 'running' ? 'spin' : undefined} /></span>
      <span className="src-health__name">{s.label}</span>
      {s.kind && <span className="src-health__kind">{t(`scraper.sourceKind.${s.kind}`, { defaultValue: s.kind })}</span>}
      <span className="src-health__meta">
        {st === 'never'
          ? t('health.neverRan')
          : <>
              {ago(s.last_run_at!, t)}
              {s.last_status === 'ok' && s.last_total != null && <>{' · '}{t('health.items', { count: s.last_total })}</>}
              {st === 'failed' && s.last_ok_at && <>{' · '}{t('health.lastOk', { when: ago(s.last_ok_at, t) })}</>}
            </>}
      </span>
      {s.failure_streak >= 2 && (
        <span className="src-health__streak">{t('health.failing', { count: s.failure_streak })}</span>
      )}
      {s.last_error && st === 'failed' && <span className="src-health__error">{s.last_error}</span>}
    </li>
  )
}

function DatasetRow({ d }: { d: DatasetHealth }) {
  const { t } = useTranslation()
  const asOf = d.snapshot_date || (d.last_publish_date || '').slice(0, 10) || null
  return (
    <li className="src-health__row src-health__row--dataset">
      <span className="src-health__status"><FiCheckCircle size={13} /></span>
      <span className="src-health__name">{d.label}</span>
      {d.scope && <span className="src-health__kind">{t(`health.scope.${d.scope}`, { defaultValue: d.scope })}</span>}
      <span className="src-health__meta">
        {asOf
          ? <>
              {t('health.dataAsOf', { date: asOf })}
              {d.behind_days != null && d.behind_days > 0 && <>{' · '}{t('health.behindDays', { count: d.behind_days })}</>}
              {d.record_count != null && <>{' · '}{t('health.records', { count: d.record_count })}</>}
            </>
          : t('health.notLoaded')}
      </span>
    </li>
  )
}

export default function SourceHealth() {
  const { t } = useTranslation()
  const [health, setHealth] = useState<ScraperHealth | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await getScraperHealth()
      setHealth(data)
    } catch { /* keep the last snapshot on transient errors */ }
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(load, 15000)   // health moves slower than the feed
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [load])

  if (!health) return null

  return (
    <div className="src-health">
      <div className="src-health__head">
        <FiHeart size={13} />
        <span>{t('health.title')}</span>
        {health.import_lock.held && (
          <span className="src-health__lock"><FiLock size={10} /> {t('health.lockHeld')}</span>
        )}
      </div>
      <ul className="src-health__list">
        {health.sources.map(s => <HealthRow key={s.name} s={s} />)}
        {health.datasets.map(d => <DatasetRow key={d.name} d={d} />)}
      </ul>
    </div>
  )
}
