import { useState } from 'react'
import { FiX, FiLogIn, FiUserPlus, FiAlertCircle, FiLoader, FiCheckCircle, FiMail, FiShield } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { authResendVerification, authForgotPassword, authResetPassword } from '../services/api'

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'mfa'

interface AuthModalProps {
  onClose: () => void
  initialMode?: Mode
  resetToken?: string
}

// `detail` is a string for most errors but an object ({code, message}) for the
// "email not verified" 403 — normalise both to a message (+ optional code).
export function extractError(err: unknown, fallback: string): { text: string; code?: string } {
  const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
  if (typeof detail === 'string') return { text: detail }
  if (detail && typeof detail === 'object') {
    const d = detail as { code?: string; message?: string }
    return { text: d.message || fallback, code: d.code }
  }
  return { text: fallback }
}

export default function AuthModal({ onClose, initialMode = 'login', resetToken }: AuthModalProps) {
  const { t } = useTranslation()
  const { login, verifyMfa, register } = useAuth()
  const [mode,       setMode]       = useState<Mode>(initialMode)
  const [email,      setEmail]      = useState<string>('')
  const [password,   setPassword]   = useState<string>('')
  const [code,       setCode]       = useState<string>('')            // 2FA code
  const [mfaToken,   setMfaToken]   = useState<string>('')            // login-issued pending token
  const [error,      setError]      = useState<string | null>(null)
  const [info,       setInfo]       = useState<string | null>(null)   // success panel
  const [unverified, setUnverified] = useState<boolean>(false)        // show resend action
  const [loading,    setLoading]    = useState<boolean>(false)

  const switchMode = (m: Mode) => {
    setMode(m); setError(null); setInfo(null); setUnverified(false); setCode('')
  }

  const handleResend = async () => {
    setLoading(true); setError(null)
    try {
      await authResendVerification(email)
      setUnverified(false)
      setInfo(t('auth.resendSent'))
    } catch (err) {
      setError(extractError(err, t('auth.genericError')).text)
    } finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setInfo(null); setUnverified(false); setLoading(true)
    try {
      if (mode === 'login') {
        const { mfaRequired, mfaToken: tok } = await login(email, password)
        if (mfaRequired) { setMfaToken(tok || ''); setMode('mfa') }
        else onClose()
      } else if (mode === 'mfa') {
        await verifyMfa(mfaToken, code); onClose()
      } else if (mode === 'register') {
        const { verificationRequired } = await register(email, password)
        if (verificationRequired) setInfo(t('auth.verifyEmailSent', { email }))
        else onClose()
      } else if (mode === 'forgot') {
        await authForgotPassword(email); setInfo(t('auth.resetSent'))
      } else if (mode === 'reset') {
        await authResetPassword(resetToken || '', password); setInfo(t('auth.resetDone'))
      }
    } catch (err) {
      const { text, code } = extractError(err, t('auth.genericError'))
      if (code === 'email_not_verified') { setUnverified(true); setError(t('auth.unverified')) }
      else setError(text)
    } finally { setLoading(false) }
  }

  const showTabs   = mode === 'login' || mode === 'register'
  const needsEmail = mode === 'login' || mode === 'register' || mode === 'forgot'
  const needsPw    = mode === 'login' || mode === 'register' || mode === 'reset'
  const needsCode  = mode === 'mfa'

  const title =
    mode === 'forgot' ? t('auth.forgotTitle')
    : mode === 'reset' ? t('auth.resetTitle')
    : mode === 'mfa'   ? t('auth.mfaTitle')
    : mode === 'login' ? t('auth.signIn') : t('auth.createAccount')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose}><FiX /></button>

        {showTabs && (
          <div className="modal__tabs">
            <button
              className={`modal__tab ${mode === 'login' ? 'modal__tab--active' : ''}`}
              onClick={() => switchMode('login')}
            >
              <FiLogIn /> {t('auth.signIn')}
            </button>
            <button
              className={`modal__tab ${mode === 'register' ? 'modal__tab--active' : ''}`}
              onClick={() => switchMode('register')}
            >
              <FiUserPlus /> {t('auth.register')}
            </button>
          </div>
        )}

        {!showTabs && (
          <h3 className="modal__title">
            {mode === 'mfa' && <FiShield style={{ marginRight: 6, verticalAlign: '-2px' }} />}
            {title}
          </h3>
        )}

        {info ? (
          <div className="modal__success">
            <FiCheckCircle className="modal__success-icon" />
            <p>{info}</p>
            <button className="modal__linkbtn" onClick={() => switchMode('login')}>
              {t('auth.backToLogin')}
            </button>
          </div>
        ) : (
          <form className="modal__form" onSubmit={handleSubmit}>
            {needsEmail && (
              <>
                <label className="modal__label">{t('auth.email')}</label>
                <input
                  className="modal__input"
                  type="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </>
            )}

            {needsPw && (
              <>
                <label className="modal__label">
                  {mode === 'reset' ? t('auth.newPassword') : t('auth.password')}
                </label>
                <input
                  className="modal__input"
                  type="password"
                  placeholder={mode === 'login' ? '••••••••' : t('auth.passwordPlaceholderRegister')}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoFocus={mode === 'reset'}
                />
              </>
            )}

            {needsCode && (
              <>
                <p className="modal__note">{t('auth.mfaPrompt')}</p>
                <label className="modal__label">{t('auth.mfaCode')}</label>
                <input
                  className="modal__input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={t('auth.mfaCodePlaceholder')}
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  required
                  autoFocus
                />
              </>
            )}

            {error && (
              <div className="modal__error">
                <FiAlertCircle /> {error}
              </div>
            )}

            {unverified && (
              <button type="button" className="modal__linkbtn" onClick={handleResend} disabled={loading}>
                <FiMail /> {t('auth.resend')}
              </button>
            )}

            {mode === 'login' && (
              <button type="button" className="modal__linkbtn modal__linkbtn--muted"
                      onClick={() => switchMode('forgot')}>
                {t('auth.forgotPassword')}
              </button>
            )}

            {mode === 'register' && (
              <p className="modal__note">{t('auth.firstAdminNote')}</p>
            )}

            <button className="modal__submit" type="submit" disabled={loading}>
              {loading
                ? <><FiLoader className="spin" /> {t('auth.working')}</>
                : mode === 'login'   ? t('auth.signIn')
                : mode === 'register'? t('auth.createAccount')
                : mode === 'forgot'  ? t('auth.forgotSubmit')
                : mode === 'mfa'     ? t('auth.mfaSubmit')
                : t('auth.resetSubmit')}
            </button>

            {(mode === 'forgot' || mode === 'reset' || mode === 'mfa') && (
              <button type="button" className="modal__linkbtn modal__linkbtn--muted"
                      onClick={() => switchMode('login')}>
                {t('auth.backToLogin')}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
