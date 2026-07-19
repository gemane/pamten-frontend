import { useState, useEffect, useCallback } from 'react'
import { FiX, FiFlag, FiEye, FiEyeOff, FiSlash, FiRotateCcw, FiLoader, FiUser, FiInbox } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { getFlags, updateFlagStatus, suppressFlag, getSuppressions, removeSuppression } from '../services/api'
import type { Flag, Suppression } from '../types'

// Human-readable target for a flag/suppression row. Exported for unit testing.
export function describeTarget(t: { target_kind: string; from_id: string; to_id: string; role: string; node_id?: string }): string {
  if (t.target_kind === 'owns') return `${t.from_id} → ${t.to_id}`
  if (t.target_kind === 'role') return `${t.from_id} → ${t.to_id}${t.role ? ` (${t.role})` : ''}`
  return t.node_id ?? ''
}

const STATUSES = ['open', 'reviewing', 'rejected', 'resolved'] as const
const SUPPRESSIONS = 'suppressions'
const TABS = [...STATUSES, SUPPRESSIONS] as const

const isEdge = (f: Flag) => f.target_kind === 'owns' || f.target_kind === 'role'

export default function ModeratorQueue({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [tab,     setTab]     = useState<string>('open')
  const [flags,   setFlags]   = useState<Flag[]>([])
  const [sups,    setSups]    = useState<Suppression[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [busy,    setBusy]    = useState<string | null>(null)   // id being acted on

  const load = useCallback(() => {
    setLoading(true)
    if (tab === SUPPRESSIONS) {
      getSuppressions()
        .then(({ data }) => setSups(data))
        .catch(() => setSups([]))
        .finally(() => setLoading(false))
    } else {
      getFlags({ status: tab, limit: 200 })
        .then(({ data }) => setFlags(data))
        .catch(() => setFlags([]))
        .finally(() => setLoading(false))
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  const withBusy = async (id: string, fn: () => Promise<unknown>, drop: () => void) => {
    setBusy(id)
    try { await fn(); drop() } catch { /* leave in place on failure */ }
    finally { setBusy(null) }
  }
  const act        = (id: string, next: string) =>
    withBusy(id, () => updateFlagStatus(id, next), () => setFlags(fs => fs.filter(f => f.id !== id)))
  const suppress   = (id: string) =>
    withBusy(id, () => suppressFlag(id), () => setFlags(fs => fs.filter(f => f.id !== id)))
  const unsuppress = (id: string) =>
    withBusy(id, () => removeSuppression(id), () => setSups(ss => ss.filter(s => s.id !== id)))

  const empty = tab === SUPPRESSIONS ? sups.length === 0 : flags.length === 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose}><FiX /></button>
        <h3 className="modal__heading"><FiFlag /> {t('modQueue.title')}</h3>

        <div className="modal__tabs">
          {TABS.map(tb => (
            <button key={tb}
              className={`modal__tab ${tab === tb ? 'modal__tab--active' : ''}`}
              onClick={() => setTab(tb)}>
              {tb === SUPPRESSIONS ? t('modQueue.suppressionsTab') : t(`modQueue.status.${tb}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="report-done"><FiLoader className="spin" /></div>
        ) : empty ? (
          <div className="report-done"><FiInbox /><p>
            {t(tab === SUPPRESSIONS ? 'modQueue.emptySuppressions' : 'modQueue.empty')}
          </p></div>
        ) : tab === SUPPRESSIONS ? (
          <div className="mod-queue">
            {sups.map(s => (
              <div key={s.id} className="mod-flag">
                <div className="mod-flag__main">
                  <span className="mod-flag__target" title={s.target_kind}>{describeTarget(s)}</span>
                  <span className="mod-flag__meta">{(s.created_at || '').slice(0, 10)}</span>
                </div>
                <div className="mod-flag__actions">
                  <button className="mod-flag__btn" disabled={busy === s.id}
                          onClick={() => unsuppress(s.id)} title={t('modQueue.unsuppressTip')}>
                    <FiRotateCcw /> {t('modQueue.unsuppress')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mod-queue">
            {flags.map(f => (
              <div key={f.id} className="mod-flag">
                <div className="mod-flag__main">
                  <span className="mod-flag__category">{t(`report.category.${f.category}`)}</span>
                  <span className="mod-flag__target" title={f.target_kind}>{describeTarget(f)}</span>
                  {f.note && <p className="mod-flag__note">{f.note}</p>}
                  <span className="mod-flag__meta">
                    <FiUser size={10} /> {t(`modQueue.reporter.${f.reporter_kind}`)}
                    {' · '}{(f.created_at || '').slice(0, 10)}
                  </span>
                </div>
                {(tab === 'open' || tab === 'reviewing') && (
                  <div className="mod-flag__actions">
                    {tab === 'open' && (
                      <button className="mod-flag__btn" disabled={busy === f.id}
                              onClick={() => act(f.id, 'reviewing')} title={t('modQueue.review')}>
                        <FiEye /> {t('modQueue.review')}
                      </button>
                    )}
                    {isEdge(f) && (
                      <button className="mod-flag__btn mod-flag__btn--suppress" disabled={busy === f.id}
                              onClick={() => suppress(f.id)} title={t('modQueue.suppressTip')}>
                        <FiEyeOff /> {t('modQueue.suppress')}
                      </button>
                    )}
                    <button className="mod-flag__btn mod-flag__btn--reject" disabled={busy === f.id}
                            onClick={() => act(f.id, 'rejected')} title={t('modQueue.reject')}>
                      <FiSlash /> {t('modQueue.reject')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
