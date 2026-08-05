import { useState } from 'react'
import { FiAlertTriangle, FiAlertCircle, FiLoader, FiTrash2 } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { authDeleteAccount } from '../services/api'
import { errText } from '../utils/apiError'

interface DeleteAccountSectionProps {
  /** Called after the account is gone — clears the stored token and signed-in user. */
  onDeleted: () => void
}

export default function DeleteAccountSection({ onDeleted }: DeleteAccountSectionProps) {
  const { t } = useTranslation()
  const [open,     setOpen]     = useState<boolean>(false)
  const [password, setPassword] = useState<string>('')
  const [error,    setError]    = useState<string | null>(null)
  const [busy,     setBusy]     = useState<boolean>(false)

  const cancel = () => { setOpen(false); setPassword(''); setError(null) }

  const confirm = async () => {
    setBusy(true); setError(null)
    try {
      await authDeleteAccount(password)
      setPassword('')
      // The token now belongs to an account that no longer exists — drop it
      // rather than leave the UI in a signed-in state that 401s on every call.
      onDeleted()
    } catch (err) {
      // Show the backend's reason verbatim: the refusals ("provisioned from
      // ADMIN_EMAIL…", "you are the only admin…") tell the user what to do next.
      setError(errText(err, t('settings.deleteAccount.error')))
    } finally { setBusy(false) }
  }

  return (
    <div className="settings-section">
      <h4 className="settings-section__title">
        <FiAlertTriangle style={{ marginRight: 6, verticalAlign: '-2px' }} />
        {t('settings.deleteAccount.title')}
      </h4>

      {!open && (
        <div className="mfa-box">
          <p className="mfa-box__desc">{t('settings.deleteAccount.desc')}</p>
          <button className="mfa-btn mfa-btn--danger" onClick={() => setOpen(true)}>
            <FiTrash2 /> {t('settings.deleteAccount.start')}
          </button>
        </div>
      )}

      {open && (
        <div className="mfa-box">
          <p className="mfa-box__desc mfa-box__desc--warn">
            {t('settings.deleteAccount.warning')}
          </p>

          <label className="modal__label" htmlFor="da-password">
            {t('settings.deleteAccount.password')}
          </label>
          <input
            className="modal__input" id="da-password" type="password"
            autoComplete="current-password" value={password}
            onChange={e => setPassword(e.target.value)} autoFocus
          />

          {error && <div className="modal__error"><FiAlertCircle /> {error}</div>}

          <div className="mfa-actions">
            <button
              className="mfa-btn mfa-btn--danger"
              onClick={confirm}
              disabled={busy || !password}
            >
              {busy ? <FiLoader className="spin" /> : <FiTrash2 />} {t('settings.deleteAccount.confirm')}
            </button>
            <button className="modal__linkbtn modal__linkbtn--muted" onClick={cancel}>
              {t('settings.deleteAccount.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
