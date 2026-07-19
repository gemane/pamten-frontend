import { useState } from 'react'
import { FiX, FiFlag, FiAlertCircle, FiLoader, FiCheck } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { createFlag } from '../services/api'
import type { FlagCategory, FlagTargetKind, FlagCreatePayload } from '../types'

// Which report categories make sense for each target kind. Node targets can't be
// "wrong percent/role/owner" — those describe an edge.
const NODE_CATEGORIES: FlagCategory[] = ['not-real', 'outdated', 'duplicate', 'other']
const EDGE_CATEGORIES: FlagCategory[] = ['wrong-owner', 'wrong-percent', 'wrong-role', 'outdated', 'other']

export function categoriesFor(kind: FlagTargetKind): FlagCategory[] {
  return kind === 'owns' || kind === 'role' ? EDGE_CATEGORIES : NODE_CATEGORIES
}

interface ReportModalProps {
  targetKind: FlagTargetKind
  targetLabel: string
  // node target
  nodeId?: string
  // edge target
  fromId?: string
  toId?: string
  role?: string
  onClose: () => void
  onReported?: () => void
}

export default function ReportModal(props: ReportModalProps) {
  const { targetKind, targetLabel, nodeId, fromId, toId, role, onClose, onReported } = props
  const { t } = useTranslation()
  const categories = categoriesFor(targetKind)
  const [category, setCategory] = useState<FlagCategory>(categories[0])
  const [note,     setNote]     = useState<string>('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState<boolean>(false)
  const [done,     setDone]     = useState<null | 'open' | 'duplicate'>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload: FlagCreatePayload = { target_kind: targetKind, category, note: note.trim() || undefined }
      if (nodeId) payload.node_id = nodeId
      if (fromId) payload.from_id = fromId
      if (toId)   payload.to_id   = toId
      if (role)   payload.role    = role
      const { data } = await createFlag(payload)
      setDone(data.status)
      onReported?.()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status
      setError(status === 429 ? t('report.rateLimited') : t('report.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose}><FiX /></button>
        <h3 className="modal__heading"><FiFlag /> {t('report.title')}</h3>
        <p className="modal__note">{t('report.subtitle', { name: targetLabel })}</p>

        {done ? (
          <div className="report-done">
            <FiCheck />
            <p>{done === 'duplicate' ? t('report.alreadyReported') : t('report.thanks')}</p>
            <button className="modal__submit" onClick={onClose}>{t('report.close')}</button>
          </div>
        ) : (
          <form className="modal__form" onSubmit={submit}>
            <label className="modal__label">{t('report.reason')}</label>
            <select className="modal__input" value={category}
                    onChange={e => setCategory(e.target.value as FlagCategory)}>
              {categories.map(c => (
                <option key={c} value={c}>{t(`report.category.${c}`)}</option>
              ))}
            </select>

            <label className="modal__label">{t('report.note')}</label>
            <textarea className="modal__input" rows={3} maxLength={1000}
                      placeholder={t('report.notePlaceholder')}
                      value={note} onChange={e => setNote(e.target.value)} />

            {error && <div className="modal__error"><FiAlertCircle /> {error}</div>}

            <button className="modal__submit" type="submit" disabled={loading}>
              {loading ? <><FiLoader className="spin" /> {t('report.sending')}</> : t('report.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
