import { useState, useEffect } from 'react'
import { FiPlay, FiAlertCircle, FiCheckCircle, FiLoader } from 'react-icons/fi'
import { getScraperStatus, runScraper } from '../services/api'

const TYPE_COLOR = {
  company: '#4A90D9',
  brand:   '#E67E22',
  holding: '#8E44AD',
}

function StatusBadge({ enabled }) {
  return (
    <div className={`scraper-status ${enabled ? 'scraper-status--on' : 'scraper-status--off'}`}>
      <span className="scraper-status__dot" />
      {enabled ? 'Scraper enabled' : 'Scraper disabled'}
    </div>
  )
}

function ResultList({ result }) {
  const byType = result.scraped.reduce((acc, e) => {
    const t = e.type || 'company'
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})

  return (
    <div className="scraper-result">
      <div className="scraper-result__summary">
        <FiCheckCircle className="scraper-result__icon" />
        <span>Scraped <strong>{result.total}</strong> entities</span>
      </div>

      <div className="scraper-result__types">
        {Object.entries(byType).map(([type, count]) => (
          <span
            key={type}
            className="scraper-type-pill"
            style={{ borderColor: TYPE_COLOR[type] || '#8892a4', color: TYPE_COLOR[type] || '#8892a4' }}
          >
            {count} {type}
          </span>
        ))}
      </div>

      <ul className="scraper-result__list">
        {result.scraped.map((e, i) => (
          <li key={`${e.qid}-${i}`} className="scraper-result__item">
            <span
              className="scraper-result__dot"
              style={{ background: TYPE_COLOR[e.type] || '#8892a4' }}
            />
            <span className="scraper-result__name">{e.name || e.qid}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ScraperPanel({ onLoadIntoGraph }) {
  const [status,  setStatus]  = useState(null)
  const [query,   setQuery]   = useState('')
  const [depth,   setDepth]   = useState(2)
  const [running, setRunning] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    getScraperStatus()
      .then(({ data }) => setStatus(data))
      .catch(() => setStatus({ enabled: false }))
  }, [])

  const handleRun = async () => {
    if (!query.trim()) return
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const { data } = await runScraper(query.trim(), depth)
      setResult(data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Scrape failed. Check that SCRAPER_ENABLED=true on Render.')
    } finally {
      setRunning(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleRun()
  }

  return (
    <div className="scraper-panel">
      <div className="scraper-panel__header">
        <h3 className="scraper-panel__title">Wikidata Scraper</h3>
        {status && <StatusBadge enabled={status.enabled} />}
      </div>

      <p className="scraper-panel__desc">
        Search Wikidata for a company and import its ownership structure into the graph.
      </p>

      {status && !status.enabled && (
        <div className="scraper-disabled-msg">
          <FiAlertCircle />
          Set <code>SCRAPER_ENABLED=true</code> in Render to activate.
        </div>
      )}

      <div className="scraper-form">
        <input
          className="scraper-input"
          type="text"
          placeholder="Company name (e.g. Tesla)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={running || (status && !status.enabled)}
        />

        <div className="scraper-depth">
          <label className="scraper-depth__label">Depth</label>
          <div className="scraper-depth__options">
            {[1, 2, 3].map(d => (
              <button
                key={d}
                className={`depth-btn ${depth === d ? 'depth-btn--active' : ''}`}
                onClick={() => setDepth(d)}
                disabled={running}
                title={d === 1 ? 'Direct subsidiaries only' : d === 2 ? 'Subsidiaries + their subsidiaries' : 'Three levels deep'}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <button
          className="scraper-run-btn"
          onClick={handleRun}
          disabled={running || !query.trim() || (status && !status.enabled)}
        >
          {running
            ? <><FiLoader className="spin" /> Scraping…</>
            : <><FiPlay /> Run scraper</>}
        </button>
      </div>

      {error && (
        <div className="scraper-error">
          <FiAlertCircle /> {error}
        </div>
      )}

      {result && (
        <>
          <ResultList result={result} />
          <button
            className="scraper-load-btn"
            onClick={() => onLoadIntoGraph(result.query)}
          >
            Load into graph →
          </button>
        </>
      )}
    </div>
  )
}
