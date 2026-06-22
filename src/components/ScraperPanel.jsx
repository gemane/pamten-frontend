import { useState, useEffect } from 'react'
import { FiPlay, FiAlertCircle, FiCheckCircle, FiLoader } from 'react-icons/fi'
import { getScraperStatus, getScraperSources, toggleScraperSource, runScraper } from '../services/api'

const TYPE_COLOR = { company: '#4A90D9', brand: '#E67E22', holding: '#8E44AD' }

const SOURCE_LABEL = { wikidata: 'Wikidata' }

function SourceToggle({ source, onToggle, disabled }) {
  const [busy, setBusy] = useState(false)

  const handle = async () => {
    if (disabled || busy) return
    setBusy(true)
    try { await onToggle(source.name) }
    finally { setBusy(false) }
  }

  return (
    <div className="source-row">
      <div className="source-row__info">
        <span className="source-row__name">{SOURCE_LABEL[source.name] || source.name}</span>
        <span className="source-row__desc">{source.description}</span>
      </div>
      <button
        className={`source-toggle ${source.enabled ? 'source-toggle--on' : 'source-toggle--off'}`}
        onClick={handle}
        disabled={disabled || busy}
        title={source.enabled ? 'Disable' : 'Enable'}
      >
        <span className="source-toggle__knob" />
      </button>
    </div>
  )
}

function ResultList({ result }) {
  const byType = result.scraped.reduce((acc, e) => {
    const t = e.type || 'company'; acc[t] = (acc[t] || 0) + 1; return acc
  }, {})
  return (
    <div className="scraper-result">
      <div className="scraper-result__summary">
        <FiCheckCircle className="scraper-result__icon" />
        <span>Scraped <strong>{result.total}</strong> entities</span>
      </div>
      <div className="scraper-result__types">
        {Object.entries(byType).map(([type, count]) => (
          <span key={type} className="scraper-type-pill"
            style={{ borderColor: TYPE_COLOR[type] || '#8892a4', color: TYPE_COLOR[type] || '#8892a4' }}>
            {count} {type}
          </span>
        ))}
      </div>
      <ul className="scraper-result__list">
        {result.scraped.map((e, i) => (
          <li key={`${e.qid}-${i}`} className="scraper-result__item">
            <span className="scraper-result__dot" style={{ background: TYPE_COLOR[e.type] || '#8892a4' }} />
            <span className="scraper-result__name">{e.name || e.qid}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ScraperPanel({ onLoadIntoGraph, user }) {
  const isAdmin = user?.role === 'admin'

  const [masterStatus, setMasterStatus] = useState(null)
  const [sources,      setSources]      = useState([])
  const [query,        setQuery]        = useState('')
  const [depth,        setDepth]        = useState(2)
  const [running,      setRunning]      = useState(false)
  const [result,       setResult]       = useState(null)
  const [error,        setError]        = useState(null)

  useEffect(() => {
    getScraperStatus().then(({ data }) => setMasterStatus(data)).catch(() => setMasterStatus({ enabled: false }))
    getScraperSources().then(({ data }) => setSources(data)).catch(() => setSources([]))
  }, [])

  const handleToggleSource = async (name) => {
    const { data } = await toggleScraperSource(name)
    setSources(prev => prev.map(s => s.name === name ? { ...s, enabled: data.enabled } : s))
  }

  // A source is runnable only if the master switch AND the per-source switch are both on
  const wikidataSource   = sources.find(s => s.name === 'wikidata')
  const masterOn         = masterStatus?.enabled
  const wikidataOn       = wikidataSource?.enabled !== false
  const canRun           = isAdmin && masterOn && wikidataOn

  const handleRun = async () => {
    if (!query.trim()) return
    setRunning(true); setResult(null); setError(null)
    try {
      const { data } = await runScraper(query.trim(), depth)
      setResult(data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Scrape failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="scraper-panel">
      <div className="scraper-panel__header">
        <h3 className="scraper-panel__title">Scraper</h3>
        {masterStatus && (
          <div className={`scraper-status ${masterOn ? 'scraper-status--on' : 'scraper-status--off'}`}>
            <span className="scraper-status__dot" />
            {masterOn ? 'Master on' : 'Master off'}
          </div>
        )}
      </div>

      <p className="scraper-panel__desc">
        Import corporate ownership data from external sources into the graph.
      </p>

      {/* Auth / role guards */}
      {!user && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> Sign in as admin to use the scraper.</div>
      )}
      {user && !isAdmin && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> Only admins can run the scraper. Your role is <code>{user.role}</code>.</div>
      )}
      {isAdmin && !masterOn && masterStatus && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> Set <code>SCRAPER_ENABLED=true</code> in Render to activate.</div>
      )}

      {/* Per-source toggles — visible to admins only */}
      {isAdmin && sources.length > 0 && (
        <div className="scraper-sources">
          <div className="scraper-sources__label">Sources</div>
          {sources.map(s => (
            <SourceToggle
              key={s.name}
              source={s}
              onToggle={handleToggleSource}
              disabled={!masterOn}
            />
          ))}
        </div>
      )}

      {/* Run form */}
      <div className="scraper-form">
        <input
          className="scraper-input"
          type="text"
          placeholder="Company name (e.g. Tesla)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRun()}
          disabled={running || !canRun}
        />

        <div className="scraper-depth">
          <label className="scraper-depth__label">Depth</label>
          <div className="scraper-depth__options">
            {[1, 2, 3].map(d => (
              <button key={d}
                className={`depth-btn ${depth === d ? 'depth-btn--active' : ''}`}
                onClick={() => setDepth(d)}
                disabled={running}
                title={d === 1 ? 'Direct subsidiaries only' : d === 2 ? 'Two levels deep' : 'Three levels deep'}
              >{d}</button>
            ))}
          </div>
        </div>

        <button className="scraper-run-btn" onClick={handleRun} disabled={running || !query.trim() || !canRun}>
          {running ? <><FiLoader className="spin" /> Scraping…</> : <><FiPlay /> Run scraper</>}
        </button>
      </div>

      {error && <div className="scraper-error"><FiAlertCircle /> {error}</div>}

      {result && (
        <>
          <ResultList result={result} />
          <button className="scraper-load-btn" onClick={() => onLoadIntoGraph(result.query)}>
            Load into graph →
          </button>
        </>
      )}
    </div>
  )
}
