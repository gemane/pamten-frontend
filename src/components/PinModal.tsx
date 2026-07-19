import { useState } from 'react'
import { FiX, FiEdit3, FiAlertCircle, FiLoader } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { pinFlag } from '../services/api'

const OWNERSHIP_TYPES = ['majority', 'minority', 'controlling', 'full']

interface PinModalProps {
  flagId: string
  targetLabel: string
  onClose: () => void
  onPinned?: () => void
}

export default function PinModal({ flagId, targetLabel, onClose, onPinned }: PinModalProps) {
  const { t } = useTranslation()
  const [stake,   setStake]   = useState<string>('')
  const [otype,   setOtype]   = useState<string>('')
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const stakeNum = stake.trim() === '' ? undefined : Number(stake)
  const stakeValid = stakeNum !== undefined && !Number.isNaN(stakeNum) && stakeNum >= 0 && stakeNum <= 100
  const canSubmit = stakeValid || otype !== ''   // backend needs at least one field

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body: { stake_percent?: number; ownership_type?: string } = {}
      if (stakeValid) body.stake_percent = stakeNum
      if (otype) body.ownership_type = otype
      await pinFlag(flagId, body)
      onPinned?.()
      onClose()
    } catch {
      setError(t('pin.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose}><FiX /></button>
        <h3 className="modal__heading"><FiEdit3 /> {t('pin.title')}</h3>
        <p className="modal__note">{t('pin.subtitle', { name: targetLabel })}</p>

        <form className="modal__form" onSubmit={submit}>
          <label className="modal__label">{t('pin.stake')}</label>
          <input className="modal__input" type="number" min={0} max={100} step="0.1"
                 placeholder={t('pin.stakePlaceholder')}
                 value={stake} onChange={e => setStake(e.target.value)} />

          <label className="modal__label">{t('pin.type')}</label>
          <select className="modal__input" value={otype} onChange={e => setOtype(e.target.value)}>
            <option value="">{t('pin.typeUnchanged')}</option>
            {OWNERSHIP_TYPES.map(o => (
              <option key={o} value={o}>{t(`ownershipType.${o}`)}</option>
            ))}
          </select>

          {error && <div className="modal__error"><FiAlertCircle /> {error}</div>}

          <button className="modal__submit" type="submit" disabled={loading || !canSubmit}>
            {loading ? <><FiLoader className="spin" /> {t('pin.saving')}</> : t('pin.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
