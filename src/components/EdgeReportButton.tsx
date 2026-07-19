import { useState } from 'react'
import { FiFlag } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import ReportModal from './ReportModal'

// A compact ⚑ button to report a relationship (an OWNS or HAS_ROLE edge),
// addressed by its natural key (from_id → to_id [+ role]) — the same key the
// backend reconciles on, so the flag survives re-scrapes.
export default function EdgeReportButton({ targetKind, fromId, toId, role, label }: {
  targetKind: 'owns' | 'role'
  fromId: string
  toId: string
  role?: string
  label: string
}) {
  const { t } = useTranslation()
  const [modal, setModal] = useState<boolean>(false)

  // Both endpoints must be known to address the edge.
  if (!fromId || !toId) return null

  return (
    <>
      <button type="button" className="edge-report-btn"
              title={t('report.button')} aria-label={t('report.button')}
              onClick={() => setModal(true)}>
        <FiFlag size={10} />
      </button>
      {modal && (
        <ReportModal
          targetKind={targetKind}
          targetLabel={label}
          fromId={fromId}
          toId={toId}
          role={role}
          onClose={() => setModal(false)}
        />
      )}
    </>
  )
}
