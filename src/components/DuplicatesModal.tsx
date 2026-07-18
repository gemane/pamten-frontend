import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FiX, FiLoader, FiAlertCircle, FiCheckCircle, FiGitMerge, FiZap, FiStar, FiAlertTriangle,
} from 'react-icons/fi'
import { getPersonDuplicates, mergePersons, runDeduplicate } from '../services/api'
import type { DuplicateGroup } from '../types'

interface DuplicatesModalProps {
  onClose: () => void
  onAfterMerge?: () => void
}

const CONF_LABEL: Record<string, string> = { high: 'high', medium: 'medium', low: 'low' }

function groupKey(g: DuplicateGroup): string {
  return g.members.map(m => m.id).sort().join('|')
}

export default function DuplicatesModal({ onClose, onAfterMerge }: DuplicatesModalProps) {
  const { t } = useTranslation()
  const [groups,  setGroups]  = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error,   setError]   = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [autoRun, setAutoRun] = useState<boolean>(false)
  const [notice,  setNotice]  = useState<string | null>(null)
  // Which node to keep per group (defaults to the backend's suggestion).
  const [keepSel, setKeepSel] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data } = await getPersonDuplicates()
      setGroups(data.groups)
      setKeepSel(Object.fromEntries(data.groups.map(g => [groupKey(g), g.suggested_keep_id])))
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
      for (const m of g.members) {
        if (m.id !== keep) await mergePersons(keep, m.id)
      }
      setGroups(prev => prev.filter(x => groupKey(x) !== key))
      onAfterMerge?.()
    } catch {
      setError(t('duplicates.mergeError'))
    } finally {
      setBusyKey(null)
    }
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
    } finally {
      setAutoRun(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide dup-modal" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose}><FiX /></button>

        <div className="dup-modal__head">
          <h3 className="dup-modal__title">{t('duplicates.title')}</h3>
          <p className="dup-modal__desc">{t('duplicates.desc')}</p>
        </div>

        <div className="dup-modal__toolbar">
          <button className="dup-auto-btn" onClick={handleAutoDedup} disabled={autoRun || loading}>
            {autoRun
              ? <><FiLoader className="spin" /> {t('duplicates.autoRunning')}</>
              : <><FiZap /> {t('duplicates.autoRun')}</>}
          </button>
          <span className="dup-modal__count">
            {loading ? '' : t('duplicates.count', { count: groups.length })}
          </span>
        </div>

        {notice && <div className="dup-notice"><FiCheckCircle /> {notice}</div>}
        {error  && <div className="scraper-error"><FiAlertCircle /> {error}</div>}

        <div className="dup-list">
          {loading && <div className="dup-empty"><FiLoader className="spin" /> {t('duplicates.loading')}</div>}
          {!loading && groups.length === 0 && !error && (
            <div className="dup-empty"><FiCheckCircle /> {t('duplicates.none')}</div>
          )}

          {groups.map(g => {
            const key  = groupKey(g)
            const keep = keepSel[key] || g.suggested_keep_id
            const busy = busyKey === key
            return (
              <div key={key} className={`dup-group dup-group--${g.confidence}`}>
                <div className="dup-group__top">
                  <span className={`dup-conf dup-conf--${g.confidence}`}>{CONF_LABEL[g.confidence]}</span>
                  {g.likely_distinct && (
                    <span className="dup-distinct"><FiAlertTriangle /> {t('duplicates.likelyDistinct')}</span>
                  )}
                  <span className="dup-group__reason">{g.reason}</span>
                </div>

                <div className="dup-group__members">
                  {g.members.map(m => (
                    <button
                      key={m.id}
                      className={`dup-member ${m.id === keep ? 'dup-member--keep' : ''}`}
                      onClick={() => setKeepSel(s => ({ ...s, [key]: m.id }))}
                      disabled={busy}
                      title={t('duplicates.chooseKeep')}
                    >
                      {m.id === keep && <FiStar className="dup-member__star" />}
                      <span className="dup-member__name">{m.full_name}</span>
                      {m.wikidata_id && <span className="dup-member__wd">WD</span>}
                      {typeof m.connected === 'number' && (
                        <span className="dup-member__links">{m.connected}</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="dup-group__actions">
                  <span className="dup-group__hint">{t('duplicates.keepHint')}</span>
                  <button className="dup-merge-btn" onClick={() => handleMerge(g)} disabled={busy}>
                    {busy
                      ? <><FiLoader className="spin" /> {t('duplicates.merging')}</>
                      : <><FiGitMerge /> {t('duplicates.merge')}</>}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
