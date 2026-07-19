import { useState, useEffect, useCallback } from 'react'
import { FiX, FiFlag, FiEye, FiEyeOff, FiSlash, FiLoader, FiUser, FiInbox } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { getFlags, updateFlagStatus, suppressFlag } from '../services/api'
import type { Flag } from '../types'

// Human-readable target for a flag row. Exported for unit testing.
export function describeTarget(f: Flag): string {
  if (f.target_kind === 'owns')  return `${f.from_id} → ${f.to_id}`
  if (f.target_kind === 'role')  return `${f.from_id} → ${f.to_id}${f.role ? ` (${f.role})` : ''}`
  return f.node_id
}

const STATUSES = ['open', 'reviewing', 'rejected', 'resolved'] as const

const isEdge = (f: Flag) => f.target_kind === 'owns' || f.target_kind === 'role'

export default function ModeratorQueue({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [status,  setStatus]  = useState<string>('open')
  const [flags,   setFlags]   = useState<Flag[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [busy,    setBusy]    = useState<string | null>(null)   // id being acted on

  const load = useCallback(() => {
    setLoading(true)
    getFlags({ status, limit: 200 })
      .then(({ data }) => setFlags(data))
      .catch(() => setFlags([]))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(() => { load() }, [load])

  const act = async (id: string, next: string) => {
    setBusy(id)
    try {
      await updateFlagStatus(id, next)
      setFlags(fs => fs.filter(f => f.id !== id))   // drops out of the current filter
    } catch { /* leave it in place on failure */ }
    finally { setBusy(null) }
  }

  const suppress = async (id: string) => {
    setBusy(id)
    try {
      await suppressFlag(id)                          // deletes the edge + records the override
      setFlags(fs => fs.filter(f => f.id !== id))     // now resolved → leaves this filter
    } catch { /* leave it in place on failure */ }
    finally { setBusy(null) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose}><FiX /></button>
        <h3 className="modal__heading"><FiFlag /> {t('modQueue.title')}</h3>

        <div className="modal__tabs">
          {STATUSES.map(s => (
            <button key={s}
              className={`modal__tab ${status === s ? 'modal__tab--active' : ''}`}
              onClick={() => setStatus(s)}>
              {t(`modQueue.status.${s}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="report-done"><FiLoader className="spin" /></div>
        ) : flags.length === 0 ? (
          <div className="report-done"><FiInbox /><p>{t('modQueue.empty')}</p></div>
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
                {(status === 'open' || status === 'reviewing') && (
                  <div className="mod-flag__actions">
                    {status === 'open' && (
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
