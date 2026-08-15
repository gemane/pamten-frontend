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
 * The queue button took the Report button's place. It is the only route to the
 * queue now — the header button and the floating one are gone — so it is worth
 * knowing it is reachable only while a node is open.
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
    getFlagSummary({ node_id: nodeId })
      .then(({ data }) => setOpen(data.open))
      .catch(() => { /* summary is best-effort — never block the panel */ })
  }, [nodeId])

  useEffect(() => { refresh() }, [refresh])

  if (open === 0 && !canModerate) return null

  return (
    <div className="node-flags">
      {open > 0 && (
        <span className="disputed-badge" title={t('report.disputedTip')}>
          <FiFlag size={11} /> {t('report.disputed', { count: open })}
        </span>
      )}
      {canModerate && (
        <button type="button" className="report-btn" onClick={() => setQueue(true)}
                title={t('modQueue.title')}>
          <FiFlag size={11} /> {t('modQueue.title')}
        </button>
      )}
      {queue && canModerate && <ModeratorQueue onClose={() => setQueue(false)} />}
    </div>
  )
}
