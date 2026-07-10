import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiPlay, FiAlertCircle, FiCheckCircle, FiLoader, FiAlertTriangle } from 'react-icons/fi'
import {
  getScraperStatus, getScraperSources, toggleScraperSource,
  runScraper, runScraperSecEdgar, runScraperOpenCorporates, runScraperAll,
  runBodsGleif, runBodsUkPsc,
} from '../services/api'
import type { ScraperStatus, ScraperSource, ScrapeResult, AuthUser, BodsImportResult } from '../types'

interface ScraperPanelProps {
  onLoadIntoGraph: (query: string) => void
  user: AuthUser | null
}

const TYPE_COLOR: Record<string, string> = { company: '#4A90D9', brand: '#E67E22', holding: '#8E44AD' }

const SOURCE_LABEL: Record<string, string> = {
  wikidata:       'Wikidata',
  sec_edgar:      'SEC EDGAR',
  open_corporates:'OpenCorporates',
  bods_gleif:     'GLEIF',
  bods_uk_psc:    'UK PSC',
}

// ── Source toggle ─────────────────────────────────────────────────────────────

interface SourceToggleProps {
  source: ScraperSource
  onToggle: (name: string) => Promise<void>
  disabled: boolean
}

function SourceToggle({ source, onToggle, disabled }: SourceToggleProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<boolean>(false)

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
        title={source.enabled ? t('scraper.masterOn') : t('scraper.masterOff')}
      >
        <span className="source-toggle__knob" />
      </button>
    </div>
  )
}

// ── Query-scraper result components ───────────────────────────────────────────

interface ResultData extends ScrapeResult {
  _source?: string
}

function ResultList({ result }: { result: ResultData }) {
  const { t } = useTranslation()
  const byType = result.scraped.reduce<Record<string, number>>((acc, e) => {
    const tp = e.type || 'company'; acc[tp] = (acc[tp] || 0) + 1; return acc
  }, {})
  return (
    <div className="scraper-result">
      <div className="scraper-result__summary">
        <FiCheckCircle className="scraper-result__icon" />
        <span>{t('scraper.scraped', { count: result.total }).replace('<1>', '').replace('</1>', '')}</span>
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
          <li key={`${'qid' in e ? (e as { qid?: string }).qid || e.name : e.name}-${i}`} className="scraper-result__item">
            <span className="scraper-result__dot" style={{ background: TYPE_COLOR[e.type] || '#8892a4' }} />
            <span className="scraper-result__name">{e.name || ('qid' in e ? (e as { qid?: string }).qid : '')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface AllResultEntry { status: string; total?: number }
interface AllResultData  { results?: Record<string, AllResultEntry>; _source?: string }

function AllResultList({ result }: { result: AllResultData }) {
  const { t } = useTranslation()
  const entries    = Object.entries(result.results || {})
  const totalNodes = entries.reduce((sum, [, r]) => sum + (r.total || 0), 0)
  return (
    <div className="scraper-result">
      <div className="scraper-result__summary">
        <FiCheckCircle className="scraper-result__icon" />
        <span>{t('scraper.allTotal', { count: totalNodes }).replace('<1>', '').replace('</1>', '')}</span>
      </div>
      <div className="scraper-all-sources">
        {entries.map(([key, res]) => (
          <div key={key} className={`scraper-source-result scraper-source-result--${res.status}`}>
            <span className="scraper-source-result__name">{SOURCE_LABEL[key] || key}</span>
            <span className="scraper-source-result__count">
              {res.status === 'ok'       ? `${res.total} nodes`
               : res.status === 'disabled' ? t('scraper.statusDisabled')
               : res.status === 'error'    ? t('scraper.statusError')
               : res.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── BODS import card ──────────────────────────────────────────────────────────

interface BodsImportCardProps {
  sourceKey:        'bods_gleif' | 'bods_uk_psc'
  title:            string
  descKey:          string
  enabled:          boolean
  showJurisdiction: boolean
  onRun: (params: {
    limit?: number
    filter_jurisdiction?: string
    local_file?: string
  }) => Promise<BodsImportResult>
}

function BodsImportCard({
  sourceKey, title, descKey, enabled, showJurisdiction, onRun,
}: BodsImportCardProps) {
  const { t } = useTranslation()

  const [limit,        setLimit]        = useState<string>('')
  const [jurisdiction, setJurisdiction] = useState<string>('')
  const [localFile,    setLocalFile]    = useState<string>('')
  const [running,      setRunning]      = useState<boolean>(false)
  const [result,       setResult]       = useState<BodsImportResult | null>(null)
  const [error,        setError]        = useState<string | null>(null)

  const handleRun = async () => {
    setRunning(true); setResult(null); setError(null)
    try {
      const params: { limit?: number; filter_jurisdiction?: string; local_file?: string } = {}
      if (limit.trim())        params.limit               = parseInt(limit, 10)
      if (jurisdiction.trim()) params.filter_jurisdiction = jurisdiction.trim().toUpperCase()
      if (localFile.trim())    params.local_file          = localFile.trim()
      const res = await onRun(params)
      setResult(res)
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { detail?: string } } }
      setError(axiosErr.response?.data?.detail || t('scraper.failed'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className={`scraper-bods-card ${!enabled ? 'scraper-bods-card--disabled' : ''}`}>
      <div className="scraper-bods-card__header">
        <span className="scraper-bods-card__name">{title}</span>
        <span className={`scraper-bods-card__badge ${enabled ? 'scraper-bods-card__badge--on' : 'scraper-bods-card__badge--off'}`}>
          {enabled ? t('scraper.masterOn') : t('scraper.masterOff')}
        </span>
      </div>
      <p className="scraper-bods-card__desc">{t(descKey)}</p>

      <div className="scraper-bods-card__params">
        <div className="scraper-bods-card__field">
          <label className="scraper-bods-card__label">{t('scraper.bods.limit')}</label>
          <input
            className="scraper-bods-card__input"
            type="number"
            min={1}
            placeholder={t('scraper.bods.limitHint')}
            value={limit}
            onChange={e => setLimit(e.target.value)}
            disabled={running || !enabled}
          />
        </div>

        {showJurisdiction && (
          <div className="scraper-bods-card__field">
            <label className="scraper-bods-card__label">{t('scraper.bods.jurisdiction')}</label>
            <input
              className="scraper-bods-card__input scraper-bods-card__input--short"
              type="text"
              maxLength={2}
              placeholder={t('scraper.bods.jurisdictionHint')}
              value={jurisdiction}
              onChange={e => setJurisdiction(e.target.value)}
              disabled={running || !enabled}
            />
          </div>
        )}

        <div className="scraper-bods-card__field scraper-bods-card__field--wide">
          <label className="scraper-bods-card__label">{t('scraper.bods.localFile')}</label>
          <input
            className="scraper-bods-card__input"
            type="text"
            placeholder={t('scraper.bods.localFileHint')}
            value={localFile}
            onChange={e => setLocalFile(e.target.value)}
            disabled={running || !enabled}
          />
        </div>
      </div>

      <button
        className="scraper-bods-card__run"
        onClick={handleRun}
        disabled={running || !enabled}
      >
        {running
          ? <><FiLoader className="spin" /> {t('scraper.bods.running')}</>
          : <><FiPlay /> {t('scraper.bods.run')}</>}
      </button>

      {error && (
        <div className="scraper-error scraper-bods-card__error">
          <FiAlertCircle /> {error}
        </div>
      )}

      {result && (
        <div className="scraper-bods-card__result">
          <FiCheckCircle className="scraper-bods-card__result-icon" />
          <div>
            <div className="scraper-bods-card__result-line">
              {t('scraper.bods.result', {
                entities:      result.entities,
                persons:       result.persons,
                relationships: result.relationships,
              })}
            </div>
            {(result.skipped > 0 || result.errors > 0) && (
              <div className="scraper-bods-card__result-meta">
                {result.skipped > 0 && (
                  <span>{t('scraper.bods.skipped', { count: result.skipped })}</span>
                )}
                {result.errors > 0 && (
                  <span className="scraper-bods-card__result-errors">
                    {t('scraper.bods.errors', { count: result.errors })}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ScraperPanel({ onLoadIntoGraph, user }: ScraperPanelProps) {
  const { t } = useTranslation()
  const isAdmin = user?.role === 'admin' || user?.role === 'contributor'

  const [masterStatus,   setMasterStatus]   = useState<ScraperStatus | null>(null)
  const [sources,        setSources]        = useState<ScraperSource[]>([])
  const [query,          setQuery]          = useState<string>('')
  const [depth,          setDepth]          = useState<number>(2)
  const [selectedSource, setSelectedSource] = useState<string>('wikidata')
  const [running,        setRunning]        = useState<boolean>(false)
  const [result,         setResult]         = useState<(ResultData & AllResultData) | null>(null)
  const [error,          setError]          = useState<string | null>(null)

  useEffect(() => {
    getScraperStatus().then(({ data }) => setMasterStatus(data))
      .catch(() => setMasterStatus({ enabled: false, sec_edgar_enabled: false, open_corporates_enabled: false }))
    getScraperSources().then(({ data }) => setSources(data)).catch(() => setSources([]))
  }, [])

  const handleToggleSource = async (name: string) => {
    const { data } = await toggleScraperSource(name)
    setSources(prev => prev.map(s => s.name === name ? { ...s, enabled: data.enabled } : s))
  }

  const masterOn              = masterStatus?.enabled
  const wikidataSource        = sources.find(s => s.name === 'wikidata')
  const secEdgarSource        = sources.find(s => s.name === 'sec_edgar')
  const openCorporatesSource  = sources.find(s => s.name === 'open_corporates')
  const wikidataOn            = wikidataSource?.enabled !== false
  const secEdgarOn            = secEdgarSource?.enabled !== false && masterStatus?.sec_edgar_enabled !== false
  const openCorporatesOn      = openCorporatesSource?.enabled !== false && masterStatus?.open_corporates_enabled !== false

  const canRunWikidata        = isAdmin && masterOn && wikidataOn
  const canRunSecEdgar        = isAdmin && masterOn && secEdgarOn
  const canRunOpenCorporates  = isAdmin && masterOn && openCorporatesOn
  const canRunAll             = isAdmin && masterOn
  const canRun = selectedSource === 'wikidata'          ? canRunWikidata
               : selectedSource === 'sec_edgar'         ? canRunSecEdgar
               : selectedSource === 'open_corporates'   ? canRunOpenCorporates
               : canRunAll

  const gleifSource  = sources.find(s => s.name === 'bods_gleif')
  const ukPscSource  = sources.find(s => s.name === 'bods_uk_psc')
  const gleifEnabled = !!masterOn && !!masterStatus?.bods_gleif_enabled && gleifSource?.enabled !== false
  const ukPscEnabled = !!masterOn && !!masterStatus?.bods_uk_psc_enabled && ukPscSource?.enabled !== false

  const handleRun = async () => {
    if (!query.trim()) return
    setRunning(true); setResult(null); setError(null)
    try {
      let data: unknown
      if (selectedSource === 'wikidata') {
        ;({ data } = await runScraper(query.trim(), depth))
      } else if (selectedSource === 'sec_edgar') {
        ;({ data } = await runScraperSecEdgar(query.trim()))
      } else if (selectedSource === 'open_corporates') {
        ;({ data } = await runScraperOpenCorporates(query.trim()))
      } else {
        ;({ data } = await runScraperAll(query.trim(), depth))
      }
      setResult({ ...(data as ResultData & AllResultData), _source: selectedSource })
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { detail?: string } } }
      setError(axiosErr.response?.data?.detail || t('scraper.failed'))
    } finally {
      setRunning(false)
    }
  }

  const runningLabel = running
    ? selectedSource === 'wikidata'        ? t('scraper.runningWikidata')
    : selectedSource === 'sec_edgar'       ? t('scraper.runningSecEdgar')
    : selectedSource === 'open_corporates' ? t('scraper.runningOpenCorporates')
    : t('scraper.runningAll')
    : null

  return (
    <div className="scraper-panel">
      <div className="scraper-panel__header">
        <h3 className="scraper-panel__title">{t('scraper.title')}</h3>
        {masterStatus && (
          <div className={`scraper-status ${masterOn ? 'scraper-status--on' : 'scraper-status--off'}`}>
            <span className="scraper-status__dot" />
            {masterOn ? t('scraper.masterOn') : t('scraper.masterOff')}
          </div>
        )}
        {masterStatus && (
          <div className={`scraper-status ${masterStatus.geocoding_enabled ? 'scraper-status--on' : 'scraper-status--off'}`}>
            <span className="scraper-status__dot" />
            {masterStatus.geocoding_enabled ? t('scraper.geocodingOn') : t('scraper.geocodingOff')}
          </div>
        )}
      </div>

      <p className="scraper-panel__desc">{t('scraper.description')}</p>

      {!user && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> {t('scraper.signInRequired')}</div>
      )}
      {user && !isAdmin && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> {t('scraper.adminRequired', { role: user.role })}</div>
      )}
      {isAdmin && !masterOn && masterStatus && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> {t('scraper.enableRequired')}</div>
      )}

      {/* Source selector */}
      {isAdmin && (
        <div className="scraper-source-selector">
          <div className="scraper-sources__label">{t('scraper.runSource')}</div>
          <div className="scraper-source-btns">
            {[
              { key: 'wikidata',         label: 'Wikidata' },
              { key: 'sec_edgar',        label: 'SEC EDGAR' },
              { key: 'open_corporates',  label: 'OpenCorporates' },
              { key: 'all',              label: t('scraper.allSources') },
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
          <div className="scraper-sources__label">{t('scraper.sourceToggles')}</div>
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

      {/* Query run form */}
      <div className="scraper-form">
        <input
          className="scraper-input"
          type="text"
          placeholder={t('scraper.placeholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRun()}
          disabled={running || !canRun}
        />

        {selectedSource !== 'sec_edgar' && selectedSource !== 'open_corporates' && (
          <div className="scraper-depth">
            <label className="scraper-depth__label">{t('scraper.depth')}</label>
            <div className="scraper-depth__options">
              {[1, 2, 3].map(d => (
                <button key={d}
                  className={`depth-btn ${depth === d ? 'depth-btn--active' : ''}`}
                  onClick={() => setDepth(d)}
                  disabled={running}
                >{d}</button>
              ))}
            </div>
          </div>
        )}

        <button className="scraper-run-btn" onClick={handleRun} disabled={running || !query.trim() || !canRun}>
          {running
            ? <><FiLoader className="spin" /> {runningLabel}</>
            : <><FiPlay /> {t('scraper.run')}</>}
        </button>
      </div>

      {error && <div className="scraper-error"><FiAlertCircle /> {error}</div>}

      {result && (
        <>
          {result._source === 'all'
            ? <AllResultList result={result} />
            : <ResultList result={result} />}
          <button className="scraper-load-btn" onClick={() => onLoadIntoGraph(result.query || result.company || query)}>
            {t('scraper.loadIntoGraph')}
          </button>
        </>
      )}

      {/* ── BODS bulk import ─────────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="scraper-bods">
          <div className="scraper-bods__divider" />

          <div className="scraper-bods__header">
            <h4 className="scraper-bods__title">{t('scraper.bods.title')}</h4>
            <p className="scraper-bods__subtitle">{t('scraper.bods.subtitle')}</p>
          </div>

          <div className="scraper-bods__warning">
            <FiAlertTriangle className="scraper-bods__warning-icon" />
            {t('scraper.bods.warning')}
          </div>

          <BodsImportCard
            sourceKey="bods_gleif"
            title="GLEIF"
            descKey="scraper.bods.gleifDesc"
            enabled={gleifEnabled}
            showJurisdiction
            onRun={params => runBodsGleif(params).then(r => r.data)}
          />

          <BodsImportCard
            sourceKey="bods_uk_psc"
            title="UK PSC"
            descKey="scraper.bods.ukPscDesc"
            enabled={ukPscEnabled}
            showJurisdiction={false}
            onRun={params => runBodsUkPsc(params).then(r => r.data)}
          />
        </div>
      )}
    </div>
  )
}
