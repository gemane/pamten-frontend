import { useState, useEffect } from 'react'
import { FiPlay, FiAlertCircle, FiCheckCircle, FiLoader } from 'react-icons/fi'
import {
  getScraperStatus, getScraperSources, toggleScraperSource,
  runScraper, runScraperSecEdgar, runScraperAll,
} from '../services/api'

const TYPE_COLOR   = { company: '#4A90D9', brand: '#E67E22', holding: '#8E44AD' }
const SOURCE_LABEL = { wikidata: 'Wikidata', sec_edgar: 'SEC EDGAR', open_corporates: 'OpenCorporates' }

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
        <span>Scraped <strong>{result.total}</strong> nodes</span>
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
          <li key={`${e.qid || e.name}-${i}`} className="scraper-result__item">
            <span className="scraper-result__dot" style={{ background: TYPE_COLOR[e.type] || '#8892a4' }} />
            <span className="scraper-result__name">{e.name || e.qid}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AllResultList({ result }) {
  const entries = Object.entries(result.results || {})
  const totalNodes = entries.reduce((sum, [, r]) => sum + (r.total || 0), 0)

  return (
    <div className="scraper-result">
      <div className="scraper-result__summary">
        <FiCheckCircle className="scraper-result__icon" />
        <span>All sources — <strong>{totalNodes}</strong> nodes total</span>
      </div>
      <div className="scraper-all-sources">
        {entries.map(([key, res]) => (
          <div key={key} className={`scraper-source-result scraper-source-result--${res.status}`}>
            <span className="scraper-source-result__name">{SOURCE_LABEL[key] || key}</span>
            <span className="scraper-source-result__count">
              {res.status === 'ok'       ? `${res.total} nodes`
               : res.status === 'disabled' ? 'disabled'
               : res.status === 'error'    ? 'error'
               : res.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ScraperPanel({ onLoadIntoGraph, user }) {
  const isAdmin = user?.role === 'admin'

  const [masterStatus,    setMasterStatus]    = useState(null)
  const [sources,         setSources]         = useState([])
  const [query,           setQuery]           = useState('')
  const [depth,           setDepth]           = useState(2)
  const [selectedSource,  setSelectedSource]  = useState('wikidata')
  const [running,         setRunning]         = useState(false)
  const [result,          setResult]          = useState(null)
  const [error,           setError]           = useState(null)

  useEffect(() => {
    getScraperStatus().then(({ data }) => setMasterStatus(data)).catch(() => setMasterStatus({ enabled: false }))
    getScraperSources().then(({ data }) => setSources(data)).catch(() => setSources([]))
  }, [])

  const handleToggleSource = async (name) => {
    const { data } = await toggleScraperSource(name)
    setSources(prev => prev.map(s => s.name === name ? { ...s, enabled: data.enabled } : s))
  }

  const masterOn        = masterStatus?.enabled
  const wikidataSource  = sources.find(s => s.name === 'wikidata')
  const secEdgarSource  = sources.find(s => s.name === 'sec_edgar')
  const wikidataOn      = wikidataSource?.enabled !== false
  const secEdgarOn      = secEdgarSource?.enabled !== false && masterStatus?.sec_edgar_enabled !== false

  const canRunWikidata  = isAdmin && masterOn && wikidataOn
  const canRunSecEdgar  = isAdmin && masterOn && secEdgarOn
  const canRunAll       = isAdmin && masterOn
  const canRun = selectedSource === 'wikidata'  ? canRunWikidata
               : selectedSource === 'sec_edgar' ? canRunSecEdgar
               : canRunAll

  const handleRun = async () => {
    if (!query.trim()) return
    setRunning(true); setResult(null); setError(null)
    try {
      let data
      if (selectedSource === 'wikidata') {
        ;({ data } = await runScraper(query.trim(), depth))
      } else if (selectedSource === 'sec_edgar') {
        ;({ data } = await runScraperSecEdgar(query.trim()))
      } else {
        ;({ data } = await runScraperAll(query.trim(), depth))
      }
      setResult({ ...data, _source: selectedSource })
    } catch (e) {
      setError(e.response?.data?.detail || 'Scrape failed.')
    } finally {
      setRunning(false)
    }
  }

  const runningLabel = running
    ? selectedSource === 'wikidata'  ? 'Scraping Wikidata…'
    : selectedSource === 'sec_edgar' ? 'Scraping SEC EDGAR…'
    : 'Scraping all sources…'
    : null

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

      {!user && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> Sign in as admin to use the scraper.</div>
      )}
      {user && !isAdmin && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> Only admins can run the scraper. Your role is <code>{user.role}</code>.</div>
      )}
      {isAdmin && !masterOn && masterStatus && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> Set <code>SCRAPER_ENABLED=true</code> in Render to activate.</div>
      )}

      {/* Source selector */}
      {isAdmin && (
        <div className="scraper-source-selector">
          <div className="scraper-sources__label">Run source</div>
          <div className="scraper-source-btns">
            {[
              { key: 'wikidata',  label: 'Wikidata' },
              { key: 'sec_edgar', label: 'SEC EDGAR' },
              { key: 'all',       label: 'All sources' },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`scraper-source-btn ${selectedSource === key ? 'scraper-source-btn--active' : ''}`}
                onClick={() => { setSelectedSource(key); setResult(null); setError(null) }}
                disabled={running}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Per-source toggles */}
      {isAdmin && sources.length > 0 && (
        <div className="scraper-sources">
          <div className="scraper-sources__label">Source toggles</div>
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

        {selectedSource !== 'sec_edgar' && (
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
        )}

        <button className="scraper-run-btn" onClick={handleRun} disabled={running || !query.trim() || !canRun}>
          {running
            ? <><FiLoader className="spin" /> {runningLabel}</>
            : <><FiPlay /> Run scraper</>}
        </button>
      </div>

      {error && <div className="scraper-error"><FiAlertCircle /> {error}</div>}

      {result && (
        <>
          {result._source === 'all'
            ? <AllResultList result={result} />
            : <ResultList result={result} />}
          <button className="scraper-load-btn" onClick={() => onLoadIntoGraph(result.query || result.company || query)}>
            Load into graph →
          </button>
        </>
      )}
    </div>
  )
}
