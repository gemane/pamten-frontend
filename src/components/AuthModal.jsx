import { useState } from 'react'
import { FiX, FiLogIn, FiUserPlus, FiAlertCircle, FiLoader } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'

export default function AuthModal({ onClose }) {
  const { login, register } = useAuth()
  const [mode,     setMode]     = useState('login')   // 'login' | 'register'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e) => {
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
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.')
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
            <FiLogIn /> Sign in
          </button>
          <button
            className={`modal__tab ${mode === 'register' ? 'modal__tab--active' : ''}`}
            onClick={() => { setMode('register'); setError(null) }}
          >
            <FiUserPlus /> Register
          </button>
        </div>

        <form className="modal__form" onSubmit={handleSubmit}>
          <label className="modal__label">Email</label>
          <input
            className="modal__input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />

          <label className="modal__label">Password</label>
          <input
            className="modal__input"
            type="password"
            placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
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
              The first registered account becomes admin. Subsequent accounts start as viewer.
            </p>
          )}

          <button className="modal__submit" type="submit" disabled={loading}>
            {loading
              ? <><FiLoader className="spin" /> Working…</>
              : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
