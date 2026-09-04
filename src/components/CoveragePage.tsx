import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiExternalLink } from 'react-icons/fi'
import { getScraperSources, getScraperHealth, getStats } from '../services/api'
import { ago } from '../utils/relativeTime'
import type { ScraperSource, ScraperHealth } from '../types'

/** The public coverage page — the OpenCorporates lesson, second half: state
 *  plainly what data is in here, from which sources, what each is
 *  authoritative for, and how fresh it is. Everything rendered is public
 *  data assembled from three public endpoints; no role gating anywhere. */

interface Stats { companies: number; people: number; relationships: number; sources: number }

function Freshness({ source, health }: { source: ScraperSource; health: ScraperHealth | null }) {
  const { t } = useTranslation()
  if (!health) return null
  if (source.kind === 'bulk') {
    const ds = health.datasets.find(d => d.name === source.name)
    const asOf = ds?.snapshot_date || (ds?.last_publish_date || '').slice(0, 10) || null
    if (!asOf) return <span className="coverage__fresh coverage__fresh--muted">{t('health.notLoaded')}</span>
    return (
      <span className="coverage__fresh">
        {t('health.dataAsOf', { date: asOf })}
        {ds?.behind_days != null && ds.behind_days > 0 && <>{' · '}{t('health.behindDays', { count: ds.behind_days })}</>}
        {ds?.scope && <>{' · '}{t(`health.scope.${ds.scope}`, { defaultValue: ds.scope })}</>}
      </span>
    )
  }
  const h = health.sources.find(s => s.name === source.name)
  if (!h?.last_ok_at) return <span className="coverage__fresh coverage__fresh--muted">{t('health.neverRan')}</span>
  return <span className="coverage__fresh">{t('coverage.lastSuccess', { when: ago(h.last_ok_at, t) })}</span>
}

export default function CoveragePage() {
  const { t } = useTranslation()
  const [sources, setSources] = useState<ScraperSource[]>([])
  const [health, setHealth] = useState<ScraperHealth | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    getScraperSources().then(({ data }) => setSources(data)).catch(() => {})
    getScraperHealth().then(({ data }) => setHealth(data)).catch(() => {})
    getStats().then(({ data }) => setStats(data as Stats)).catch(() => {})
  }, [])

  const ordered = [...sources].sort((a, b) => (b.credibility ?? 0) - (a.credibility ?? 0))

  return (
    <div className="coverage">
      <h2 className="coverage__title">{t('coverage.title')}</h2>
      <p className="coverage__intro">{t('coverage.intro')}</p>

      {stats && (
        <div className="coverage__stats">
          <div><strong>{stats.companies.toLocaleString()}</strong> {t('graph.statCompanies')}</div>
          <div><strong>{stats.people.toLocaleString()}</strong> {t('graph.statPeople')}</div>
          <div><strong>{stats.relationships.toLocaleString()}</strong> {t('graph.statRelationships')}</div>
          <div><strong>{stats.sources.toLocaleString()}</strong> {t('graph.statSources')}</div>
        </div>
      )}

      <div className="coverage__cards">
        {ordered.map(s => (
          <div key={s.name} className="coverage__card">
            <div className="coverage__card-head">
              <span className="coverage__name">{s.label || s.name}</span>
              {s.region && <span className="coverage__region">{s.region}</span>}
              {s.url && (
                <a className="coverage__link" href={s.url} target="_blank" rel="noreferrer"
                   aria-label={s.label || s.name}>
                  <FiExternalLink size={12} />
                </a>
              )}
            </div>
            {s.coverage && <p className="coverage__what">{s.coverage}</p>}
            <div className="coverage__meta">
              {s.quality && (
                <span className="coverage__quality">
                  {t(`scraper.quality.${s.quality}`, { defaultValue: s.quality })}
                  {s.credibility != null && <span className="coverage__score"> · {s.credibility}</span>}
                </span>
              )}
              {s.kind && <span className="coverage__kind">{t(`scraper.sourceKind.${s.kind}`, { defaultValue: s.kind })}</span>}
              <Freshness source={s} health={health} />
            </div>
          </div>
        ))}
      </div>

      <p className="coverage__note">{t('coverage.note')}</p>
    </div>
  )
}
