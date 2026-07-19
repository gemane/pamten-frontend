import { useState, useEffect, useCallback } from 'react'
import { FiX, FiFlag, FiEye, FiEyeOff, FiEdit3, FiSlash, FiRotateCcw, FiLoader, FiUser, FiInbox } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import {
  getFlags, updateFlagStatus, suppressFlag,
  getSuppressions, removeSuppression, getPins, removePin,
} from '../services/api'
import type { Flag, Suppression, Pin } from '../types'
import PinModal from './PinModal'

// Human-readable target for a flag/suppression row. Exported for unit testing.
export function describeTarget(t: { target_kind: string; from_id: string; to_id: string; role: string; node_id?: string }): string {
  if (t.target_kind === 'owns') return `${t.from_id} → ${t.to_id}`
  if (t.target_kind === 'role') return `${t.from_id} → ${t.to_id}${t.role ? ` (${t.role})` : ''}`
  return t.node_id ?? ''
}

const STATUSES = ['open', 'reviewing', 'rejected', 'resolved'] as const
const SUPPRESSIONS = 'suppressions'
const PINS = 'pins'
const TABS = [...STATUSES, SUPPRESSIONS, PINS] as const

const isEdge = (f: Flag) => f.target_kind === 'owns' || f.target_kind === 'role'

export default function ModeratorQueue({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [tab,       setTab]       = useState<string>('open')
  const [flags,     setFlags]     = useState<Flag[]>([])
  const [sups,      setSups]      = useState<Suppression[]>([])
  const [pins,      setPins]      = useState<Pin[]>([])
  const [loading,   setLoading]   = useState<boolean>(true)
  const [busy,      setBusy]      = useState<string | null>(null)
  const [pinTarget, setPinTarget] = useState<{ id: string; label: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const done = () => setLoading(false)
    if (tab === SUPPRESSIONS)      getSuppressions().then(({ data }) => setSups(data)).catch(() => setSups([])).finally(done)
    else if (tab === PINS)         getPins().then(({ data }) => setPins(data)).catch(() => setPins([])).finally(done)
    else                          getFlags({ status: tab, limit: 200 }).then(({ data }) => setFlags(data)).catch(() => setFlags([])).finally(done)
  }, [tab])

  useEffect(() => { load() }, [load])

  const withBusy = async (id: string, fn: () => Promise<unknown>, drop: () => void) => {
    setBusy(id)
    try { await fn(); drop() } catch { /* leave in place on failure */ }
    finally { setBusy(null) }
  }
  const act        = (id: string, next: string) => withBusy(id, () => updateFlagStatus(id, next), () => setFlags(fs => fs.filter(f => f.id !== id)))
  const suppress   = (id: string) => withBusy(id, () => suppressFlag(id),      () => setFlags(fs => fs.filter(f => f.id !== id)))
  const unsuppress = (id: string) => withBusy(id, () => removeSuppression(id), () => setSups(ss => ss.filter(s => s.id !== id)))
  const unpin      = (id: string) => withBusy(id, () => removePin(id),         () => setPins(ps => ps.filter(p => p.id !== id)))

  const empty = tab === SUPPRESSIONS ? sups.length === 0 : tab === PINS ? pins.length === 0 : flags.length === 0
  const tabLabel = (tb: string) =>
    tb === SUPPRESSIONS ? t('modQueue.suppressionsTab') : tb === PINS ? t('modQueue.pinsTab') : t(`modQueue.status.${tb}`)
  const emptyKey = tab === SUPPRESSIONS ? 'modQueue.emptySuppressions' : tab === PINS ? 'modQueue.emptyPins' : 'modQueue.empty'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose}><FiX /></button>
        <h3 className="modal__heading"><FiFlag /> {t('modQueue.title')}</h3>

        <div className="modal__tabs">
          {TABS.map(tb => (
            <button key={tb} className={`modal__tab ${tab === tb ? 'modal__tab--active' : ''}`}
                    onClick={() => setTab(tb)}>{tabLabel(tb)}</button>
          ))}
        </div>

        {loading ? (
          <div className="report-done"><FiLoader className="spin" /></div>
        ) : empty ? (
          <div className="report-done"><FiInbox /><p>{t(emptyKey)}</p></div>
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
        ) : tab === PINS ? (
          <div className="mod-queue">
            {pins.map(p => (
              <div key={p.id} className="mod-flag">
                <div className="mod-flag__main">
                  <span className="mod-flag__target">{p.from_id} → {p.to_id}</span>
                  <span className="mod-flag__category">
                    {[p.stake_percent != null ? `${p.stake_percent}%` : null,
                      p.ownership_type ? t(`ownershipType.${p.ownership_type}`, { defaultValue: p.ownership_type }) : null]
                      .filter(Boolean).join(' · ')}
                  </span>
                  <span className="mod-flag__meta">{(p.created_at || '').slice(0, 10)}</span>
                </div>
                <div className="mod-flag__actions">
                  <button className="mod-flag__btn" disabled={busy === p.id}
                          onClick={() => unpin(p.id)} title={t('modQueue.unpinTip')}>
                    <FiRotateCcw /> {t('modQueue.unpin')}
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
                    {f.target_kind === 'owns' && (
                      <button className="mod-flag__btn mod-flag__btn--pin" disabled={busy === f.id}
                              onClick={() => setPinTarget({ id: f.id, label: describeTarget(f) })}
                              title={t('modQueue.pinTip')}>
                        <FiEdit3 /> {t('modQueue.pin')}
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

      {pinTarget && (
        <PinModal flagId={pinTarget.id} targetLabel={pinTarget.label}
                  onClose={() => setPinTarget(null)}
                  onPinned={() => setFlags(fs => fs.filter(f => f.id !== pinTarget.id))} />
      )}
    </div>
  )
}
