import { useState, useEffect, useCallback } from 'react'
import { FiX, FiFlag, FiEye, FiEyeOff, FiEdit3, FiSlash, FiRotateCcw, FiLoader, FiInbox, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import {
  getFlags, getFlagGroups, updateFlagStatus, suppressFlag,
  getSuppressions, removeSuppression, getPins, removePin,
} from '../services/api'
import type { Flag, FlagGroup, Suppression, Pin } from '../types'
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

/** How many individual reports a page of the full queue holds. */
export const PAGE_SIZE = 25

/** A single report, shaped like a group of one — so the paged list and the
 *  grouped list share one row renderer and one set of actions. */
const asGroup = (f: Flag): FlagGroup => ({ ...f, count: 1, flag_ids: [f.id] })

/**
 * The moderation queue, in two modes.
 *
 * **Scoped** (`relatedTo`) — one company or person and everything reported about
 * it, grouped. That is the button under a node's name, which promised exactly
 * this and until now opened every flag in the system.
 *
 * **Everything** (no `relatedTo`) — the full queue, from Settings, paged.
 *
 * Grouping is deliberately only for the scoped mode: the server collapses groups
 * in Python over a fetched window, so paging groups would cut one in half and
 * report a wrong count at the page edge. A single company never has enough
 * reports to need a page; the full queue lists individual reports, where skip
 * and total are exact.
 */
export default function ModeratorQueue({ onClose, relatedTo }: { onClose: () => void; relatedTo?: string }) {
  const { t } = useTranslation()
  const [tab,       setTab]       = useState<string>('open')
  const [groups,    setGroups]    = useState<FlagGroup[]>([])
  const [sups,      setSups]      = useState<Suppression[]>([])
  const [pins,      setPins]      = useState<Pin[]>([])
  const [loading,   setLoading]   = useState<boolean>(true)
  const [busy,      setBusy]      = useState<string | null>(null)
  const [pinTarget, setPinTarget] = useState<FlagGroup | null>(null)
  const [page,      setPage]      = useState<number>(0)
  const [total,     setTotal]     = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const done = () => setLoading(false)
    if (tab === SUPPRESSIONS)      getSuppressions().then(({ data }) => setSups(data)).catch(() => setSups([])).finally(done)
    else if (tab === PINS)         getPins().then(({ data }) => setPins(data)).catch(() => setPins([])).finally(done)
    else if (relatedTo)            getFlagGroups({ status: tab, related_to: relatedTo })
                                     .then(({ data }) => setGroups(data)).catch(() => setGroups([])).finally(done)
    else                           getFlags({ status: tab, skip: page * PAGE_SIZE, limit: PAGE_SIZE })
                                     .then(({ data, headers }) => {
                                       setGroups(data.map(asGroup))
                                       // No header ⇒ take what came back as the whole of it, which
                                       // hides the pager rather than inventing a page that is not there.
                                       const n = Number(headers?.['x-total-count'])
                                       setTotal(Number.isFinite(n) && headers?.['x-total-count'] != null ? n : data.length)
                                     })
                                     .catch(() => { setGroups([]); setTotal(0) }).finally(done)
  }, [tab, page, relatedTo])

  useEffect(() => { load() }, [load])

  const withBusy = async (id: string, fn: () => Promise<unknown>, drop: () => void) => {
    setBusy(id)
    try { await fn(); drop() } catch { /* leave in place on failure */ }
    finally { setBusy(null) }
  }
  // Acting on a row removes it, so the total has to follow or the range lies.
  const dropGroup  = (g: FlagGroup) => {
    setGroups(gs => gs.filter(x => gid(x) !== gid(g)))
    setTotal(n => (n === null ? null : Math.max(0, n - 1)))
  }
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
                    onClick={() => { setTab(tb); setPage(0) }}>{tabLabel(tb)}</button>
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

        {!relatedTo && total !== null && total > PAGE_SIZE && (
          <div className="mod-queue__pager">
            <button className="mod-flag__btn" disabled={page === 0 || loading}
                    onClick={() => setPage(p => Math.max(0, p - 1))}>
              <FiChevronLeft /> {t('modQueue.prev')}
            </button>
            <span className="mod-queue__range">
              {t('modQueue.range', {
                from: page * PAGE_SIZE + 1,
                to: Math.min((page + 1) * PAGE_SIZE, total),
                total,
              })}
            </span>
            <button className="mod-flag__btn" disabled={(page + 1) * PAGE_SIZE >= total || loading}
                    onClick={() => setPage(p => p + 1)}>
              {t('modQueue.next')} <FiChevronRight />
            </button>
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
