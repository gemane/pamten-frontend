import { useState } from 'react'
import { FiX, FiLogIn, FiUserPlus, FiAlertCircle, FiLoader } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

interface AuthModalProps {
  onClose: () => void
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { t } = useTranslation()
  const { login, register } = useAuth()
  const [mode,     setMode]     = useState<'login' | 'register'>('login')
  const [email,    setEmail]    = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState<boolean>(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password)
      }
      onClose()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setError(axiosErr.response?.data?.detail || t('auth.genericError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose}><FiX /></button>

        <div className="modal__tabs">
          <button
            className={`modal__tab ${mode === 'login' ? 'modal__tab--active' : ''}`}
            onClick={() => { setMode('login'); setError(null) }}
          >
            <FiLogIn /> {t('auth.signIn')}
          </button>
          <button
            className={`modal__tab ${mode === 'register' ? 'modal__tab--active' : ''}`}
            onClick={() => { setMode('register'); setError(null) }}
          >
            <FiUserPlus /> {t('auth.register')}
          </button>
        </div>

        <form className="modal__form" onSubmit={handleSubmit}>
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

          <label className="modal__label">{t('auth.password')}</label>
          <input
            className="modal__input"
            type="password"
            placeholder={mode === 'register' ? t('auth.passwordPlaceholderRegister') : '••••••••'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {error && (
            <div className="modal__error">
              <FiAlertCircle /> {error}
            </div>
          )}

          {mode === 'register' && (
            <p className="modal__note">
              {t('auth.firstAdminNote')}
            </p>
          )}

          <button className="modal__submit" type="submit" disabled={loading}>
            {loading
              ? <><FiLoader className="spin" /> {t('auth.working')}</>
              : mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
          </button>
        </form>
      </div>
    </div>
  )
}
