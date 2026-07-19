import { useState, useEffect, useCallback } from 'react'
import { FiFlag } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { getFlagSummary } from '../services/api'
import ReportModal from './ReportModal'
import type { FlagTargetKind } from '../types'

// The "disputed" badge + a ⚑ Report control for a node. Anyone can report
// (works logged-out); the badge shows the open-flag count from /flags/summary.
export default function NodeFlags({ nodeId, targetKind, label }: {
  nodeId: string
  targetKind: Extract<FlagTargetKind, 'entity' | 'person'>
  label: string
}) {
  const { t } = useTranslation()
  const [open,  setOpen]  = useState<number>(0)
  const [modal, setModal] = useState<boolean>(false)

  const refresh = useCallback(() => {
    getFlagSummary({ node_id: nodeId })
      .then(({ data }) => setOpen(data.open))
      .catch(() => { /* summary is best-effort — never block the panel */ })
  }, [nodeId])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div className="node-flags">
      {open > 0 && (
        <span className="disputed-badge" title={t('report.disputedTip')}>
          <FiFlag size={11} /> {t('report.disputed', { count: open })}
        </span>
      )}
      <button type="button" className="report-btn" onClick={() => setModal(true)}>
        <FiFlag size={11} /> {t('report.button')}
      </button>
      {modal && (
        <ReportModal
          targetKind={targetKind}
          targetLabel={label}
          nodeId={nodeId}
          onClose={() => setModal(false)}
          onReported={refresh}
        />
      )}
    </div>
  )
}
