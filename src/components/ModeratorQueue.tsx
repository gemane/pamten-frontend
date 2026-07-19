import { useState, useEffect, useCallback } from 'react'
import { FiX, FiFlag, FiEye, FiEyeOff, FiEdit3, FiSlash, FiRotateCcw, FiLoader, FiInbox } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import {
  getFlagGroups, updateFlagStatus, suppressFlag,
  getSuppressions, removeSuppression, getPins, removePin,
} from '../services/api'
import type { FlagGroup, Suppression, Pin } from '../types'
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

const gid = (g: FlagGroup) => g.flag_ids[0]   // stable client-side key for a group

export default function ModeratorQueue({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [tab,       setTab]       = useState<string>('open')
  const [groups,    setGroups]    = useState<FlagGroup[]>([])
  const [sups,      setSups]      = useState<Suppression[]>([])
  const [pins,      setPins]      = useState<Pin[]>([])
  const [loading,   setLoading]   = useState<boolean>(true)
  const [busy,      setBusy]      = useState<string | null>(null)
  const [pinTarget, setPinTarget] = useState<FlagGroup | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const done = () => setLoading(false)
    if (tab === SUPPRESSIONS)      getSuppressions().then(({ data }) => setSups(data)).catch(() => setSups([])).finally(done)
    else if (tab === PINS)         getPins().then(({ data }) => setPins(data)).catch(() => setPins([])).finally(done)
    else                          getFlagGroups({ status: tab }).then(({ data }) => setGroups(data)).catch(() => setGroups([])).finally(done)
  }, [tab])

  useEffect(() => { load() }, [load])

  const withBusy = async (id: string, fn: () => Promise<unknown>, drop: () => void) => {
    setBusy(id)
    try { await fn(); drop() } catch { /* leave in place on failure */ }
    finally { setBusy(null) }
  }
  const dropGroup  = (g: FlagGroup) => setGroups(gs => gs.filter(x => gid(x) !== gid(g)))
  // Reject/reviewing apply to every flag in the group; suppress cascades server-side.
  const act        = (g: FlagGroup, next: string) => withBusy(gid(g), () => Promise.all(g.flag_ids.map(id => updateFlagStatus(id, next))), () => dropGroup(g))
  const suppress   = (g: FlagGroup) => withBusy(gid(g), () => suppressFlag(g.flag_ids[0]), () => dropGroup(g))
  const unsuppress = (id: string) => withBusy(id, () => removeSuppression(id), () => setSups(ss => ss.filter(s => s.id !== id)))
  const unpin      = (id: string) => withBusy(id, () => removePin(id),         () => setPins(ps => ps.filter(p => p.id !== id)))

  const empty = tab === SUPPRESSIONS ? sups.length === 0 : tab === PINS ? pins.length === 0 : groups.length === 0
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
            {groups.map(g => (
              <div key={gid(g)} className="mod-flag">
                <div className="mod-flag__main">
                  <span className="mod-flag__category">
                    {t(`report.category.${g.category}`)}
                    {g.count > 1 && <span className="mod-flag__count">{t('modQueue.reports', { count: g.count })}</span>}
                  </span>
                  <span className="mod-flag__target" title={g.target_kind}>{describeTarget(g)}</span>
                  {g.note && <p className="mod-flag__note">{g.note}</p>}
                  <span className="mod-flag__meta">{(g.created_at || '').slice(0, 10)}</span>
                </div>
                {(tab === 'open' || tab === 'reviewing') && (
                  <div className="mod-flag__actions">
                    {tab === 'open' && (
                      <button className="mod-flag__btn" disabled={busy === gid(g)}
                              onClick={() => act(g, 'reviewing')} title={t('modQueue.review')}>
                        <FiEye /> {t('modQueue.review')}
                      </button>
                    )}
                    {g.target_kind === 'owns' && (
                      <button className="mod-flag__btn mod-flag__btn--pin" disabled={busy === gid(g)}
                              onClick={() => setPinTarget(g)} title={t('modQueue.pinTip')}>
                        <FiEdit3 /> {t('modQueue.pin')}
                      </button>
                    )}
                    <button className="mod-flag__btn mod-flag__btn--suppress" disabled={busy === gid(g)}
                            onClick={() => suppress(g)} title={t('modQueue.suppressTip')}>
                      <FiEyeOff /> {t('modQueue.suppress')}
                    </button>
                    <button className="mod-flag__btn mod-flag__btn--reject" disabled={busy === gid(g)}
                            onClick={() => act(g, 'rejected')} title={t('modQueue.reject')}>
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
        <PinModal flagId={pinTarget.flag_ids[0]} targetLabel={describeTarget(pinTarget)}
                  onClose={() => setPinTarget(null)}
                  onPinned={() => dropGroup(pinTarget)} />
      )}
    </div>
  )
}
