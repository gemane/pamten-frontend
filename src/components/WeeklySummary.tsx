import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiChevronLeft, FiChevronRight, FiLoader } from 'react-icons/fi'
import { getWeeklyReport } from '../services/api'
import type { WeeklyReport } from '../types'

/** "Weekly report" — the same digest the Monday email carries, on the Scraper tab.
 *  Admin only: the endpoint is require_admin, and the panel that mounts this
 *  gates it the same way. The last completed week by default, with ‹ › to
 *  walk back (and forward again, up to that week). */

function shiftWeek(weekId: string, by: number): string {
  const [y, w] = weekId.split('-W').map(Number)
  // ISO weeks: build the Monday of the given week, move by 7·by days, re-read.
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (w - 1) * 7 * 86400000)
  const d = new Date(monday.getTime() + by * 7 * 86400000)
  // ISO week of d
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - day + 3)
  const isoYear = t.getUTCFullYear()
  const firstThu = new Date(Date.UTC(isoYear, 0, 4))
  const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

const delta = (n: number | undefined | null) =>
  n == null ? '' : ` (${n >= 0 ? '+' : ''}${n.toLocaleString()})`

export default function WeeklySummary() {
  const { t } = useTranslation()
  const [week, setWeek] = useState<string | null>(null)      // null = server default
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [latest, setLatest] = useState<string | null>(null)   // the newest week we may show
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(false)
    getWeeklyReport(week ?? undefined)
      .then(({ data }) => {
        if (!alive) return
        setReport(data)
        if (!week) setLatest(data.week)
      })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [week])

  const shown = report?.week ?? week
  const canForward = !!shown && !!latest && shown < latest

  return (
    <div className="weekly" data-testid="weekly-summary">
      <div className="weekly__head">
        <button type="button" className="weekly__nav" aria-label={t('weekly.previous')}
                disabled={!shown} onClick={() => shown && setWeek(shiftWeek(shown, -1))}>
          <FiChevronLeft />
        </button>
        <div className="weekly__title">
          {t('weekly.title')}
          {report && <span className="weekly__label"> · {report.label}</span>}
        </div>
        <button type="button" className="weekly__nav" aria-label={t('weekly.next')}
                disabled={!canForward} onClick={() => shown && setWeek(shiftWeek(shown, 1))}>
          <FiChevronRight />
        </button>
      </div>

      {loading && <div className="weekly__loading"><FiLoader className="spin" /> {t('weekly.loading')}</div>}
      {error && !loading && <div className="weekly__error">{t('weekly.error')}</div>}

      {report && !loading && (
        <div className="weekly__grid">
          <section className="weekly__block">
            <h4>{t('weekly.searches')}</h4>
            <div className="weekly__big">{report.searches.total.toLocaleString()}</div>
            <div className="weekly__sub">
              {t('weekly.searchesSub', { queries: report.searches.distinct_queries,
                                         zero: report.searches.zero_results })}
            </div>
            {report.searches.top.length > 0 && (
              <ol className="weekly__list">
                {report.searches.top.slice(0, 5).map(q => (
                  <li key={`${q.query}|${q.country ?? ''}`}>
                    <span className="weekly__n">{q.searches}</span> {q.query}
                    {q.country && <span className="weekly__tag">{q.country}</span>}
                    {q.zero_results > 0 && <span className="weekly__tag weekly__tag--zero">{t('weekly.noResult')}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="weekly__block">
            <h4>{t('weekly.scrapes')}</h4>
            <div className="weekly__big">{report.scrapes.runs.toLocaleString()}</div>
            <div className="weekly__sub">
              {t('weekly.scrapesSub', { records: report.scrapes.records_written,
                                        failures: report.scrapes.failures.length })}
            </div>
            {report.scrapes.first_scrapes.length > 0 && (
              <>
                <div className="weekly__caption">{t('weekly.firstScrapes', { count: report.scrapes.first_scrapes.length })}</div>
                <ul className="weekly__list">
                  {report.scrapes.first_scrapes.slice(0, 5).map(d => (
                    <li key={d.entity_id}>{d.name} <span className="weekly__n weekly__n--right">{d.records}</span></li>
                  ))}
                </ul>
              </>
            )}
            {report.scrapes.refreshed.length > 0 && (
              <>
                <div className="weekly__caption">{t('weekly.refreshed', { count: report.scrapes.refreshed.length })}</div>
                <ul className="weekly__list">
                  {report.scrapes.refreshed.slice(0, 5).map(d => (
                    <li key={d.entity_id}>{d.name} <span className="weekly__n weekly__n--right">{d.records}</span></li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="weekly__block">
            <h4>{t('weekly.imports')}</h4>
            {Object.keys(report.imports).length === 0
              ? <div className="weekly__sub">{t('weekly.none')}</div>
              : Object.entries(report.imports).map(([src, d]) => (
                  <div key={src} className="weekly__row">
                    <span>{src}</span>
                    <span className="weekly__n">{t('weekly.importRow', { runs: d.runs, records: d.records, failed: d.failed })}</span>
                  </div>
                ))}
          </section>

          <section className="weekly__block">
            <h4>{t('weekly.graph')}{report.graph.since && <span className="weekly__label"> · {t('weekly.since', { week: report.graph.since })}</span>}</h4>
            {(['companies', 'people', 'relationships', 'roles'] as const).map(k => (
              <div key={k} className="weekly__row">
                <span>{t(`weekly.total.${k}`)}</span>
                <span className="weekly__n">
                  {(report.graph.totals[k] ?? 0).toLocaleString()}
                  <span className="weekly__delta">{delta(report.graph.delta?.[k])}</span>
                </span>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}
