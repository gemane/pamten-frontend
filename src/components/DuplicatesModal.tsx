import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FiX, FiLoader, FiAlertCircle, FiCheckCircle, FiGitMerge, FiZap, FiStar,
  FiAlertTriangle, FiUserX, FiRotateCcw,
} from 'react-icons/fi'
import {
  getPersonDuplicates, mergePersons, runDeduplicate,
  keepSeparate, undoKeepSeparate, getKeptSeparate, getMergeLog,
} from '../services/api'
import type { DuplicateGroup, KeptSeparatePair, MergeLogEntry } from '../types'

interface DuplicatesModalProps {
  onClose: () => void
  onAfterMerge?: () => void
}

type Tab = 'review' | 'merged' | 'separate'

function groupKey(g: DuplicateGroup): string {
  return g.members.map(m => m.id).sort().join('|')
}

export default function DuplicatesModal({ onClose, onAfterMerge }: DuplicatesModalProps) {
  const { t } = useTranslation()
  const [tab,     setTab]     = useState<Tab>('review')
  const [groups,  setGroups]  = useState<DuplicateGroup[]>([])
  const [merged,  setMerged]  = useState<MergeLogEntry[]>([])
  const [separate, setSeparate] = useState<KeptSeparatePair[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error,   setError]   = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [autoRun, setAutoRun] = useState<boolean>(false)
  const [notice,  setNotice]  = useState<string | null>(null)
  const [keepSel, setKeepSel] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [dups, ml, ks] = await Promise.all([getPersonDuplicates(), getMergeLog(), getKeptSeparate()])
      setGroups(dups.data.groups)
      setKeepSel(Object.fromEntries(dups.data.groups.map(g => [groupKey(g), g.suggested_keep_id])))
      setMerged(ml.data.entries)
      setSeparate(ks.data.pairs)
    } catch {
      setError(t('duplicates.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const handleMerge = async (g: DuplicateGroup) => {
    const key = groupKey(g)
    const keep = keepSel[key] || g.suggested_keep_id
    setBusyKey(key); setError(null)
    try {
      for (const m of g.members) if (m.id !== keep) await mergePersons(keep, m.id)
      setGroups(prev => prev.filter(x => groupKey(x) !== key))
      const [ml] = await Promise.all([getMergeLog()])
      setMerged(ml.data.entries)
      onAfterMerge?.()
    } catch {
      setError(t('duplicates.mergeError'))
    } finally { setBusyKey(null) }
  }

  const handleKeepSeparate = async (g: DuplicateGroup) => {
    const key = groupKey(g)
    setBusyKey(key); setError(null)
    try {
      await keepSeparate(g.members.map(m => m.id))
      setGroups(prev => prev.filter(x => groupKey(x) !== key))
      const ks = await getKeptSeparate()
      setSeparate(ks.data.pairs)
    } catch {
      setError(t('duplicates.separateError'))
    } finally { setBusyKey(null) }
  }

  const handleUndoSeparate = async (p: KeptSeparatePair) => {
    const key = `${p.a_id}|${p.b_id}`
    setBusyKey(key); setError(null)
    try {
      await undoKeepSeparate([p.a_id, p.b_id])
      setSeparate(prev => prev.filter(x => !(x.a_id === p.a_id && x.b_id === p.b_id)))
      const dups = await getPersonDuplicates()
      setGroups(dups.data.groups)
      setKeepSel(Object.fromEntries(dups.data.groups.map(g => [groupKey(g), g.suggested_keep_id])))
    } catch {
      setError(t('duplicates.separateError'))
    } finally { setBusyKey(null) }
  }

  const handleAutoDedup = async () => {
    setAutoRun(true); setError(null); setNotice(null)
    try {
      const { data } = await runDeduplicate(true)
      setNotice(t('duplicates.autoDone', { count: data.merged_count }))
      await load()
      if (data.merged_count > 0) onAfterMerge?.()
    } catch {
      setError(t('duplicates.autoError'))
    } finally { setAutoRun(false) }
  }

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'review',   label: t('duplicates.tabReview'),   n: groups.length },
    { key: 'merged',   label: t('duplicates.tabMerged'),   n: merged.length },
    { key: 'separate', label: t('duplicates.tabSeparate'), n: separate.length },
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide dup-modal" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose}><FiX /></button>

        <div className="dup-modal__head">
          <h3 className="dup-modal__title">{t('duplicates.title')}</h3>
          <p className="dup-modal__desc">{t('duplicates.desc')}</p>
        </div>

        <div className="dup-tabs">
          {tabs.map(tb => (
            <button key={tb.key}
              className={`dup-tab ${tab === tb.key ? 'dup-tab--active' : ''}`}
              onClick={() => setTab(tb.key)}>
              {tb.label} <span className="dup-tab__n">{tb.n}</span>
            </button>
          ))}
        </div>

        {tab === 'review' && (
          <div className="dup-modal__toolbar">
            <button className="dup-auto-btn" onClick={handleAutoDedup} disabled={autoRun || loading}>
              {autoRun
                ? <><FiLoader className="spin" /> {t('duplicates.autoRunning')}</>
                : <><FiZap /> {t('duplicates.autoRun')}</>}
            </button>
          </div>
        )}

        {notice && <div className="dup-notice"><FiCheckCircle /> {notice}</div>}
        {error  && <div className="scraper-error"><FiAlertCircle /> {error}</div>}

        <div className="dup-list">
          {loading && <div className="dup-empty"><FiLoader className="spin" /> {t('duplicates.loading')}</div>}

          {/* ── Review (pending duplicate groups) ─────────────────────────────── */}
          {!loading && tab === 'review' && groups.length === 0 && !error && (
            <div className="dup-empty"><FiCheckCircle /> {t('duplicates.none')}</div>
          )}
          {!loading && tab === 'review' && groups.map(g => {
            const key  = groupKey(g)
            const keep = keepSel[key] || g.suggested_keep_id
            const busy = busyKey === key
            return (
              <div key={key} className={`dup-group dup-group--${g.confidence}`}>
                <div className="dup-group__top">
                  <span className={`dup-conf dup-conf--${g.confidence}`}>{g.confidence}</span>
                  {g.likely_distinct && (
                    <span className="dup-distinct"><FiAlertTriangle /> {t('duplicates.likelyDistinct')}</span>
                  )}
                  <span className="dup-group__reason">{g.reason}</span>
                </div>
                <div className="dup-group__members">
                  {g.members.map(m => (
                    <button key={m.id}
                      className={`dup-member ${m.id === keep ? 'dup-member--keep' : ''}`}
                      onClick={() => setKeepSel(s => ({ ...s, [key]: m.id }))}
                      disabled={busy} title={t('duplicates.chooseKeep')}>
                      {m.id === keep && <FiStar className="dup-member__star" />}
                      <span className="dup-member__name">{m.full_name}</span>
                      {m.wikidata_id && <span className="dup-member__wd">WD</span>}
                      {typeof m.connected === 'number' && <span className="dup-member__links">{m.connected}</span>}
                    </button>
                  ))}
                </div>
                <div className="dup-group__actions">
                  <span className="dup-group__hint">{t('duplicates.keepHint')}</span>
                  <button className="dup-sep-btn" onClick={() => handleKeepSeparate(g)} disabled={busy}
                    title={t('duplicates.keepSeparateHint')}>
                    <FiUserX /> {t('duplicates.keepSeparate')}
                  </button>
                  <button className="dup-merge-btn" onClick={() => handleMerge(g)} disabled={busy}>
                    {busy
                      ? <><FiLoader className="spin" /> {t('duplicates.merging')}</>
                      : <><FiGitMerge /> {t('duplicates.merge')}</>}
                  </button>
                </div>
              </div>
            )
          })}

          {/* ── Merged (history) ──────────────────────────────────────────────── */}
          {!loading && tab === 'merged' && merged.length === 0 && (
            <div className="dup-empty">{t('duplicates.noneMerged')}</div>
          )}
          {!loading && tab === 'merged' && merged.map(e => (
            <div key={e.id} className="dup-row">
              <FiGitMerge className="dup-row__icon dup-row__icon--merged" />
              <span className="dup-row__from">{e.dup_name}</span>
              <span className="dup-row__arrow">→</span>
              <span className="dup-row__to">{e.keep_name}</span>
              {e.count && e.count > 1 && <span className="dup-row__badge">×{e.count}</span>}
            </div>
          ))}

          {/* ── Kept separate (not to be merged) ──────────────────────────────── */}
          {!loading && tab === 'separate' && separate.length === 0 && (
            <div className="dup-empty">{t('duplicates.noneSeparate')}</div>
          )}
          {!loading && tab === 'separate' && separate.map(p => {
            const key = `${p.a_id}|${p.b_id}`
            return (
              <div key={key} className="dup-row">
                <FiUserX className="dup-row__icon dup-row__icon--sep" />
                <span className="dup-row__to">{p.a_name}</span>
                <span className="dup-row__arrow">≠</span>
                <span className="dup-row__to">{p.b_name}</span>
                <button className="dup-undo-btn" onClick={() => handleUndoSeparate(p)}
                  disabled={busyKey === key} title={t('duplicates.undoSeparate')}>
                  <FiRotateCcw /> {t('duplicates.undo')}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
