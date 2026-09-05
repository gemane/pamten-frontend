import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiPlay, FiAlertCircle, FiCheckCircle, FiLoader, FiUsers } from 'react-icons/fi'
import {
  getScraperStatus, getScraperSources, toggleScraperSource, setScraperSourceMode,
  runScraper, runScraperSecEdgar, runScraperOpenCorporates, runScraperAll,
} from '../services/api'
import type { ScraperStatus, ScraperSource, ScrapeResult, AuthUser } from '../types'
import DuplicatesModal from './DuplicatesModal'
import FederationPanel from './FederationPanel'
import ScraperActivity from './ScraperActivity'
import SourceHealth from './SourceHealth'
import { canManageScrapes, canAdministerScrapes } from '../utils/scrapeAccess'
import { colorFor } from '../utils/entityColors'

interface ScraperPanelProps {
  onLoadIntoGraph: (query: string) => void
  user: AuthUser | null
}

// Was a three-entry copy of the palette, so funds, foundations, governments
// and nonprofits all rendered neutral grey. colorFor knows all eight.
const typeColor = (type?: string | null) => colorFor('entity', type).fill

const SOURCE_LABEL: Record<string, string> = {
  wikidata:       'Wikidata',
  sec_edgar:      'SEC EDGAR',
  open_corporates:'OpenCorporates',
  bods_gleif:     'GLEIF',
  bods_uk_psc:    'UK PSC',
}

// Env var that gates each single-source run (checked by the backend + status).
const SOURCE_ENV_VAR: Record<string, string> = {
  wikidata:        'SCRAPER_WIKIDATA_ENABLED',
  sec_edgar:       'SCRAPER_SEC_EDGAR_ENABLED',
  open_corporates: 'SCRAPER_OPENCORPORATES_ENABLED',
}

// ── Source toggle ─────────────────────────────────────────────────────────────

interface SourceToggleProps {
  source: ScraperSource
  onToggle: (name: string) => Promise<void>
  onSetMode: (name: string, mode: 'full' | 'claims_only') => Promise<void>
  disabled: boolean
}

function SourceToggle({ source, onToggle, onSetMode, disabled }: SourceToggleProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<boolean>(false)
  const claimsOnly = source.data_mode === 'claims_only'

  const handle = async () => {
    if (disabled || busy) return
    setBusy(true)
    try { await onToggle(source.name) }
    finally { setBusy(false) }
  }

  const flipMode = async () => {
    if (busy) return
    setBusy(true)
    try { await onSetMode(source.name, claimsOnly ? 'full' : 'claims_only') }
    finally { setBusy(false) }
  }

  return (
    <div className="source-row">
      <div className="source-row__info">
        <span className="source-row__name">{SOURCE_LABEL[source.name] || source.name}</span>
        <span className="source-row__desc">{source.description}</span>
      </div>
      {/* Mode: full draws edges, claims-only asserts without drawing. */}
      <button
        className={`source-mode ${claimsOnly ? 'source-mode--claims' : 'source-mode--full'}`}
        onClick={flipMode}
        disabled={busy}
        title={t('scraper.mode.hint')}
      >
        {claimsOnly ? t('scraper.mode.claims_only') : t('scraper.mode.full')}
      </button>
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
            style={{ borderColor: typeColor(type), color: typeColor(type) }}>
            {count} {type}
          </span>
        ))}
      </div>
      <ul className="scraper-result__list">
        {result.scraped.map((e, i) => (
          <li key={`${'qid' in e ? (e as { qid?: string }).qid || e.name : e.name}-${i}`} className="scraper-result__item">
            <span className="scraper-result__dot" style={{ background: typeColor(e.type) }} />
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

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ScraperPanel({ onLoadIntoGraph, user }: ScraperPanelProps) {
  const { t } = useTranslation()
  // The panel is graduated rather than all-or-nothing: the status header and the
  // activity feed are public, `canManage` gates the things that write data, and
  // `canAdminister` gates the admin-only corners. See utils/scrapeAccess.ts for
  // which backend guard each one mirrors.
  const canManage     = canManageScrapes(user)
  const canAdminister = canAdministerScrapes(user)

  const [masterStatus,   setMasterStatus]   = useState<ScraperStatus | null>(null)
  const [sources,        setSources]        = useState<ScraperSource[]>([])
  const [query,          setQuery]          = useState<string>('')
  const [depth,          setDepth]          = useState<number>(2)
  const [selectedSource, setSelectedSource] = useState<string>('wikidata')
  const [running,        setRunning]        = useState<boolean>(false)
  const [result,         setResult]         = useState<(ResultData & AllResultData) | null>(null)
  const [error,          setError]          = useState<string | null>(null)
  const [showDuplicates, setShowDuplicates] = useState<boolean>(false)

  useEffect(() => {
    getScraperStatus().then(({ data }) => setMasterStatus(data))
      .catch(() => setMasterStatus({ enabled: false, sec_edgar_enabled: false, open_corporates_enabled: false }))
    getScraperSources().then(({ data }) => setSources(data)).catch(() => setSources([]))
  }, [])

  const handleSetMode = async (name: string, mode: 'full' | 'claims_only') => {
    const { data } = await setScraperSourceMode(name, mode)
    setSources(prev => prev.map(s => s.name === name
      ? { ...s, data_mode: (data as { data_mode?: 'full' | 'claims_only' }).data_mode }
      : s))
  }

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

  const canRunWikidata        = canManage && masterOn && wikidataOn
  const canRunSecEdgar        = canManage && masterOn && secEdgarOn
  const canRunOpenCorporates  = canManage && masterOn && openCorporatesOn
  const canRunAll             = canManage && masterOn
  const canRun = selectedSource === 'wikidata'          ? canRunWikidata
               : selectedSource === 'sec_edgar'         ? canRunSecEdgar
               : selectedSource === 'open_corporates'   ? canRunOpenCorporates
               : canRunAll

  // When admin + master are fine but the *selected* single source is off, explain
  // why the run form is disabled instead of silently greying it out.
  const selectedSourceObj = sources.find(s => s.name === selectedSource)
  const selectedEnvOff =
      selectedSource === 'sec_edgar'       ? masterStatus?.sec_edgar_enabled === false
    : selectedSource === 'open_corporates' ? masterStatus?.open_corporates_enabled === false
    : selectedSource === 'wikidata'        ? masterStatus?.wikidata_enabled === false
    : false
  const disabledReason =
    !canManage || !masterOn || canRun || selectedSource === 'all'
      ? null
      : selectedEnvOff
        ? t('scraper.sourceDisabledEnv', {
            source: SOURCE_LABEL[selectedSource] || selectedSource,
            envVar: SOURCE_ENV_VAR[selectedSource],
          })
        : selectedSourceObj?.enabled === false
          ? t('scraper.sourceDisabledToggle', {
              source: SOURCE_LABEL[selectedSource] || selectedSource,
            })
          : null

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

      {/* Two different intros for two different readers. The signed-in one
          describes an action ("import data into the graph") that only these
          roles can take; to a visitor that is a non-sequitur, so they get a
          plain description of what the project is instead. */}
      {canManage
        ? <p className="scraper-panel__desc">{t('scraper.description')}</p>
        : <p className="scraper-panel__desc">{t('scraper.publicIntro')}</p>}

      {canManage && (
        <button className="scraper-dup-link" onClick={() => setShowDuplicates(true)}>
          <FiUsers /> {t('duplicates.open')}
          {masterStatus?.autodedup_enabled && (
            <span className="scraper-dup-link__badge">{t('duplicates.autoOn')}</span>
          )}
        </button>
      )}

      {showDuplicates && <DuplicatesModal onClose={() => setShowDuplicates(false)} />}

      {user && !canManage && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> {t('scraper.adminRequired', { role: user.role })}</div>
      )}
      {/* ── Recent scrape activity (live) ─────────────────────────────────────
          Public: what the platform ingests is the sort of thing an ownership
          transparency project should be open about. The backend redacts the
          exception text for non-contributors, so this renders for everyone. */}
      <ScraperActivity />

      {/* The catalogue lives on the Data tab (region, coverage, freshness);
          this panel is the OPERATIONAL view — and the Data tab links here,
          not the other way round: readers land there, operators come here. */}
      <SourceHealth />

      {canManage && !masterOn && masterStatus && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> {t('scraper.enableRequired')}</div>
      )}

      {/* Source selector */}
      {canManage && (
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

      {/* Why the run form is disabled for the selected single source */}
      {disabledReason && (
        <div className="scraper-disabled-msg"><FiAlertCircle /> {disabledReason}</div>
      )}

      {/* Per-source toggles + data mode — admin only: the PATCH endpoints
          are require_admin, so a contributor seeing these got a silent 403. */}
      {canAdminister && sources.length > 0 && (
        <div className="scraper-sources">
          <div className="scraper-sources__label">{t('scraper.sourceToggles')}</div>
          {sources.map(s => (
            <SourceToggle
              key={s.name}
              source={s}
              onToggle={handleToggleSource}
              onSetMode={handleSetMode}
              disabled={!masterOn}
            />
          ))}
        </div>
      )}

      {/* Query run form — hidden outright rather than rendered disabled for those
          who cannot run it. A greyed-out form advertises a capability the API
          would refuse. `canRun` still gates it for those who *can*, since the
          master switch or the selected source may be off. */}
      {canManage && (
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
      )}

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

      {/* ── Bulk ownership datasets (imported server-side, not from the UI) ──── */}
      {canAdminister && (
        <div className="scraper-bods">
          <div className="scraper-bods__divider" />

          <div className="scraper-bods__header">
            <h4 className="scraper-bods__title">{t('scraper.bods.title')}</h4>
            <p className="scraper-bods__subtitle">{t('scraper.bods.subtitle')}</p>
          </div>

          <p className="scraper-bods__note">{t('scraper.bods.cliNote')}</p>
        </div>
      )}

      {/* ── Trusted-peer federation ──────────────────────────────────────────── */}
      {canAdminister && (
        <div className="scraper-bods">
          <div className="scraper-bods__divider" />
          <FederationPanel />
        </div>
      )}
    </div>
  )
}
