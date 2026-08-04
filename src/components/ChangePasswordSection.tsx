import { useState } from 'react'
import { FiKey, FiCheckCircle, FiAlertCircle, FiLoader } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { authChangePassword } from '../services/api'

// Exported for unit testing: the backend's `detail` is the useful message ("Current
// password is incorrect", the specific policy rule that failed), so prefer it and fall
// back only when the failure carries none (a network error, say).
export function errText(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === 'string' ? d : fallback
}

export default function ChangePasswordSection() {
  const { t } = useTranslation()
  const [open,    setOpen]    = useState<boolean>(false)
  const [current, setCurrent] = useState<string>('')
  const [next,    setNext]    = useState<string>('')
  const [repeat,  setRepeat]  = useState<string>('')
  const [error,   setError]   = useState<string | null>(null)
  const [done,    setDone]    = useState<boolean>(false)
  const [busy,    setBusy]    = useState<boolean>(false)

  const reset = () => {
    setOpen(false); setCurrent(''); setNext(''); setRepeat(''); setError(null); setBusy(false)
  }

  const submit = async () => {
    // Catch the mismatch here rather than at the API — the server only ever sees
    // one new password, so it cannot tell a typo on the repeat from a deliberate choice.
    if (next !== repeat) { setError(t('settings.password.mismatch')); return }
    setBusy(true); setError(null)
    try {
      await authChangePassword(current, next)
      reset()
      setDone(true)
    } catch (err) {
      // The backend's message is the useful one ("Current password is incorrect",
      // the specific policy violation) — show it rather than a generic fallback.
      setError(errText(err, t('settings.password.error')))
    } finally { setBusy(false) }
  }

  return (
    <div className="settings-section">
      <h4 className="settings-section__title">
        <FiKey style={{ marginRight: 6, verticalAlign: '-2px' }} />
        {t('settings.password.title')}
      </h4>

      {!open && (
        <div className="mfa-box">
          <p className="mfa-box__desc">{t('settings.password.desc')}</p>
          {done && (
            <p className="mfa-box__status"><FiCheckCircle /> {t('settings.password.changed')}</p>
          )}
          <button className="mfa-btn" onClick={() => { setOpen(true); setDone(false) }}>
            <FiKey /> {t('settings.password.change')}
          </button>
        </div>
      )}

      {open && (
        <div className="mfa-box">
          <label className="modal__label" htmlFor="cp-current">{t('settings.password.current')}</label>
          <input
            className="modal__input" id="cp-current" type="password" autoComplete="current-password"
            value={current} onChange={e => setCurrent(e.target.value)} autoFocus
          />

          <label className="modal__label" htmlFor="cp-new">{t('settings.password.new')}</label>
          <input
            className="modal__input" id="cp-new" type="password" autoComplete="new-password"
            value={next} onChange={e => setNext(e.target.value)}
          />

          <label className="modal__label" htmlFor="cp-repeat">{t('settings.password.repeat')}</label>
          <input
            className="modal__input" id="cp-repeat" type="password" autoComplete="new-password"
            value={repeat} onChange={e => setRepeat(e.target.value)}
          />

          <p className="mfa-box__desc">{t('settings.password.hint')}</p>
          {error && <div className="modal__error"><FiAlertCircle /> {error}</div>}

          <div className="mfa-actions">
            <button
              className="mfa-btn"
              onClick={submit}
              disabled={busy || !current || !next || !repeat}
            >
              {busy ? <FiLoader className="spin" /> : <FiCheckCircle />} {t('settings.password.save')}
            </button>
            <button className="modal__linkbtn modal__linkbtn--muted" onClick={reset}>
              {t('settings.password.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
