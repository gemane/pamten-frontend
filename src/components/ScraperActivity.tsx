import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FiLoader, FiCheckCircle, FiAlertTriangle, FiClock, FiActivity } from 'react-icons/fi'
import { getScraperRuns } from '../services/api'
import type { ScrapeRun } from '../types'

const SOURCE_LABEL: Record<string, string> = {
  wikidata: 'Wikidata', sec_edgar: 'SEC EDGAR', open_corporates: 'OpenCorporates', all: 'All sources',
}

function ago(iso: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return t('activity.secondsAgo', { count: s })
  if (s < 3600) return t('activity.minutesAgo', { count: Math.round(s / 60) })
  if (s < 86400) return t('activity.hoursAgo', { count: Math.round(s / 3600) })
  return t('activity.daysAgo', { count: Math.round(s / 86400) })
}

export default function ScraperActivity() {
  const { t } = useTranslation()
  const [runs, setRuns] = useState<ScrapeRun[]>([])
  const [loaded, setLoaded] = useState<boolean>(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await getScraperRuns(30)
      setRuns(data.runs)
    } catch { /* keep last snapshot on transient errors */ }
    finally { setLoaded(true) }
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(load, 6000)   // light poll so in-progress runs update live
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [load])

  if (loaded && runs.length === 0) return null   // nothing to show yet

  const runningCount = runs.filter(r => r.status === 'running' && !r.stale).length

  return (
    <div className="scr-activity">
      <div className="scr-activity__head">
        <FiActivity className="scr-activity__icon" />
        <span className="scr-activity__title">{t('activity.title')}</span>
        {runningCount > 0 && <span className="scr-activity__live">{t('activity.running', { count: runningCount })}</span>}
      </div>
      <ul className="scr-activity__list">
        {runs.map(r => {
          const failed = r.status === 'failed'
          const running = r.status === 'running' && !r.stale
          const stale = r.status === 'running' && r.stale
          return (
            <li key={r.id} className={`scr-run scr-run--${stale ? 'stale' : r.status}`}>
              <span className="scr-run__status">
                {running ? <FiLoader className="spin" />
                  : failed ? <FiAlertTriangle />
                  : stale ? <FiClock />
                  : <FiCheckCircle />}
              </span>
              <span className="scr-run__src">{SOURCE_LABEL[r.source] || r.source}</span>
              <span className="scr-run__target">{r.target}</span>
              <span className="scr-run__meta">
                {running ? t('activity.inProgress')
                  : stale ? t('activity.stale')
                  : failed ? t('activity.failed')
                  : t('activity.nodes', { count: r.total })}
                {' · '}{ago(r.started_at, t)}
              </span>
              {failed && r.error && <span className="scr-run__error">{r.error}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
