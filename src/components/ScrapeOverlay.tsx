import { useTranslation } from 'react-i18next'

// A prominent, centered "scraping…" overlay shown over the graph while a NEW company is
// being scraped (the graph is otherwise empty and the scrape takes a few seconds). The
// bar is indeterminate — a scrape is one request with no progress events.
export default function ScrapeOverlay({ company, fullscreen = false }: { company: string; fullscreen?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={`scrape-overlay${fullscreen ? ' scrape-overlay--fullscreen' : ''}`}
         role="status" aria-live="polite">
      <div className="scrape-overlay__card">
        <div className="scrape-overlay__title">{t('scrape.title', { company })}</div>
        <div className="scrape-overlay__hint">{t('scrape.hint')}</div>
        <div className="scrape-overlay__bar"><span /></div>
      </div>
    </div>
  )
}
