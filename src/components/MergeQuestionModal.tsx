import { useState } from 'react'
import { FiX, FiGitMerge, FiRotateCcw, FiEyeOff, FiAlertCircle, FiLoader, FiCheck } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../utils/dates'
import { undoPersonMerge } from '../services/api'
import type { MergedPersonQuestion, MergeUndoReport } from '../types'

interface MergeQuestionModalProps {
  /** What the server answered instead of suppressing: the merges this person is made of. */
  question: MergedPersonQuestion
  targetLabel: string
  onClose: () => void
  /** "The merge is right": go ahead with the suppression. */
  onConfirm: () => Promise<void>
  /** A merge was undone: the report no longer describes what is on screen. */
  onUndone: () => void
}

/**
 * The question a removal asks first.
 *
 * A seat or a person reported as "not mine" on a person made by merging two
 * may simply be the other person's — then the fix is to undo the merge, and
 * suppressing would hide something that is right for somebody else. So the
 * server stops the suppress action and this dialog shows why: who was merged
 * with whom, when, on what ground, and which of the two brought the thing
 * being suppressed. The moderator has the report in front of them, which is
 * the only moment the answer is known.
 */
export default function MergeQuestionModal({ question, targetLabel, onClose, onConfirm, onUndone }: MergeQuestionModalProps) {
  const { t, i18n } = useTranslation()
  const [busy,   setBusy]   = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)
  const [undone, setUndone] = useState<MergeUndoReport | null>(null)

  const undo = async (snapshotId: string) => {
    setBusy(snapshotId)
    setError(null)
    try {
      const { data } = await undoPersonMerge(snapshotId)
      setUndone(data)
      onUndone()
    } catch {
      setError(t('mergeQuestion.undoError'))
    } finally {
      setBusy(null)
    }
  }

  const confirm = async () => {
    setBusy('confirm')
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch {
      setError(t('mergeQuestion.confirmError'))
      setBusy(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label={t('mergeQuestion.close')}><FiX /></button>
        <h3 className="modal__heading"><FiGitMerge /> {t('mergeQuestion.title')}</h3>

        {undone ? (
          <>
            <p className="modal__note"><FiCheck /> {t('mergeQuestion.undone')}</p>
            {undone.held_back.length > 0 && (
              <p className="modal__note">{t('mergeQuestion.heldBack', { count: undone.held_back.length })}</p>
            )}
            {undone.written_since.length > 0 && (
              <p className="modal__note">{t('mergeQuestion.writtenSince', { count: undone.written_since.length })}</p>
            )}
            <p className="modal__note">{t('mergeQuestion.reportStays')}</p>
            <button className="modal__submit" onClick={onClose}>{t('mergeQuestion.close')}</button>
          </>
        ) : (
          <>
            <p className="modal__note">{t('mergeQuestion.intro', { name: targetLabel })}</p>

            <div className="merge-question">
              {question.merges.map(m => (
                <div key={m.snapshot_id} className="merge-question__merge">
                  <div className="merge-question__names">
                    <strong>{m.keep_name}</strong> + <strong>{m.dup_name}</strong>
                  </div>
                  <div className="merge-question__meta">
                    {[m.at ? formatDate(m.at, i18n.language) : null, m.reason].filter(Boolean).join(' · ')}
                  </div>
                  {m.link && (
                    <div className="merge-question__whose">
                      {t(`mergeQuestion.whose.${m.link}`, { kept: m.keep_name, duplicate: m.dup_name })}
                    </div>
                  )}
                  <button className="dup-undo-btn" disabled={busy !== null} onClick={() => undo(m.snapshot_id)}>
                    {busy === m.snapshot_id ? <FiLoader className="spin" /> : <FiRotateCcw />} {t('mergeQuestion.undo')}
                  </button>
                </div>
              ))}
            </div>

            {error && <div className="modal__error"><FiAlertCircle /> {error}</div>}

            <button className="modal__submit" disabled={busy !== null} onClick={confirm}>
              {busy === 'confirm' ? <FiLoader className="spin" /> : <FiEyeOff />} {t('mergeQuestion.confirm')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
