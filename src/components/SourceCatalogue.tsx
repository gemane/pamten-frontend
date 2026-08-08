import { useTranslation } from 'react-i18next'
import { FiExternalLink } from 'react-icons/fi'
import type { ScraperSource } from '../types'

/**
 * What the platform draws on, and how far to trust each of it.
 *
 * Shown to everyone, signed in or not: where the data comes from is the case for
 * the whole project, not an operational detail to keep behind a login.
 *
 * On the reliability figure — the number alone means nothing to a reader, so the
 * band carries the explanation and the score is the tie-breaker behind it. These
 * are hand-assigned rankings used to resolve conflicting claims (see the
 * backend's app/claims.py), not measurements of anything, which is why the band
 * leads and the number follows in smaller type.
 */

/** Highest reliability first — the ordering is itself information. */
function byCredibilityDesc(a: ScraperSource, b: ScraperSource): number {
  return (b.credibility ?? 0) - (a.credibility ?? 0)
}

export default function SourceCatalogue({ sources }: { sources: ScraperSource[] }) {
  const { t } = useTranslation()
  if (sources.length === 0) return null

  return (
    <div className="source-cat">
      <h4 className="source-cat__title">{t('scraper.sourcesTitle')}</h4>
      <p className="source-cat__intro">{t('scraper.sourcesIntro')}</p>

      {[...sources].sort(byCredibilityDesc).map(s => (
        <div className="source-cat__item" key={s.name}>
          <div className="source-cat__head">
            <span className="source-cat__name">{s.label || s.name}</span>
            {s.url && (
              <a className="source-cat__link" href={s.url}
                 target="_blank" rel="noopener noreferrer"
                 aria-label={s.label || s.name} title={s.url}>
                <FiExternalLink aria-hidden="true" />
              </a>
            )}
          </div>

          <p className="source-cat__desc">{s.description}</p>

          <div className="source-cat__meta">
            {s.quality && (
              <span className="source-cat__quality" title={t('scraper.qualityLabel')}>
                {t(`scraper.quality.${s.quality}`, { defaultValue: s.quality })}
                {s.credibility != null && (
                  <span className="source-cat__score"> · {s.credibility}</span>
                )}
              </span>
            )}
            {s.kind && (
              <span className="source-cat__kind">
                {t(`scraper.sourceKind.${s.kind}`, { defaultValue: s.kind })}
              </span>
            )}
            {/* Only meaningful for on-demand sources. A bulk source's toggle governs
                whether new imports run — its data is loaded and in use regardless, so
                calling it "off" here would tell the reader the opposite of the truth. */}
            {s.kind === 'instant' && !s.enabled && (
              <span className="source-cat__paused">{t('scraper.sourcePaused')}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
