import { useState, useEffect, useCallback } from 'react'
import { FiFlag } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { getFlagSummary } from '../services/api'
import { useAuth } from '../context/AuthContext'
import ModeratorQueue from './ModeratorQueue'
import type { FlagTargetKind } from '../types'

/**
 * What sits under a node's name: whether the record is disputed, and — for a
 * moderator — the way into the queue.
 *
 * Reporting is not here any more; it moved into the ⋮ menu beside the name,
 * with sharing. What stayed is the badge, because it is *information* rather
 * than an action: it tells any reader that somebody has challenged this record.
 *
 * The queue button took the Report button's place, and shows only when this
 * node actually has something waiting: a moderator reading a clean company sees
 * nothing, and a button that is there means there is work behind it. The full
 * queue lives in Settings for when you go looking.
 *
 * Badge and button count the same thing — `related_to`, meaning the node *and*
 * every relationship at either end of it. A report filed by right-clicking a
 * subsidiary row belongs to the panel it was filed from, so "Disputed (2)" and
 * the two rows in the queue are the same two.
 */
export default function NodeFlags({ nodeId, targetKind: _targetKind, label: _label }: {
  nodeId: string
  targetKind: Extract<FlagTargetKind, 'entity' | 'person'>
  label: string
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [open, setOpen] = useState<number>(0)
  const [queue, setQueue] = useState<boolean>(false)
  const canModerate = user?.role === 'moderator' || user?.role === 'admin'

  const refresh = useCallback(() => {
    getFlagSummary({ related_to: nodeId })
      .then(({ data }) => setOpen(data.open))
      .catch(() => { /* summary is best-effort — never block the panel */ })
  }, [nodeId])

  useEffect(() => { refresh() }, [refresh])

  if (open === 0) return null      // nothing disputed here, for anybody

  return (
    <div className="node-flags">
      <span className="disputed-badge" title={t('report.disputedTip')}>
        <FiFlag size={11} /> {t('report.disputed', { count: open })}
      </span>
      {canModerate && (
        <button type="button" className="report-btn" onClick={() => setQueue(true)}
                title={t('modQueue.title')}>
          <FiFlag size={11} /> {t('modQueue.title')}
        </button>
      )}
      {queue && canModerate && (
        <ModeratorQueue relatedTo={nodeId} onClose={() => setQueue(false)} />
      )}
    </div>
  )
}
