import { useState, useEffect, useCallback } from 'react'
import { FiLogIn, FiLogOut, FiUser, FiTrash2, FiChevronDown } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import ThemeToggle from './ThemeToggle'
import type { Theme } from '../hooks/useTheme'
import type { AuthUser } from '../types'
import { getUsers, updateUserRole, deleteUser } from '../services/api'
import type { UserRecord } from '../services/api'

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'es', label: 'ES' },
]

const ROLES = ['admin', 'contributor', 'viewer'] as const

interface SettingsPanelProps {
  theme: Theme
  onToggleTheme: () => void
  user: AuthUser | null
  onLogin: () => void
  onLogout: () => void
}

function UserRow({ u, currentId, onRoleChange, onDelete }: {
  u: UserRecord
  currentId: string
  onRoleChange: (id: string, role: string) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="user-row">
      <span className="user-row__email">{u.email}</span>
      <div className="user-row__actions">
        <div className="user-row__select-wrap">
          <select
            className="user-row__role-select"
            value={u.role}
            onChange={e => onRoleChange(u.id, e.target.value)}
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <FiChevronDown className="user-row__select-icon" />
        </div>
        {u.id !== currentId && (
          <button className="user-row__delete" onClick={() => onDelete(u.id)} title={t('settings.deleteUser')}>
            <FiTrash2 />
          </button>
        )}
      </div>
    </div>
  )
}

export default function SettingsPanel({ theme, onToggleTheme, user, onLogin, onLogout }: SettingsPanelProps) {
  const { t, i18n } = useTranslation()
  const [users,    setUsers]    = useState<UserRecord[]>([])
  const [usersErr, setUsersErr] = useState<string | null>(null)

  const loadUsers = useCallback(() => {
    if (user?.role !== 'admin') return
    getUsers()
      .then(({ data }) => { setUsers(data); setUsersErr(null) })
      .catch(() => setUsersErr(t('settings.usersLoadError')))
  }, [user?.role, t])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleRoleChange = async (id: string, role: string) => {
    try {
      await updateUserRole(id, role)
      setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u))
      setUsersErr(null)
    } catch {
      setUsersErr(t('settings.roleUpdateError'))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteUser(id)
      setUsers(prev => prev.filter(u => u.id !== id))
      setUsersErr(null)
    } catch {
      setUsersErr(t('settings.deleteUserError'))
    }
  }

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <h4 className="settings-section__title">{t('settings.language')}</h4>
        <div className="lang-switcher">
          {LANGS.map(l => (
            <button
              key={l.code}
              className={`lang-btn ${i18n.language === l.code ? 'lang-btn--active' : ''}`}
              onClick={() => { i18n.changeLanguage(l.code); localStorage.setItem('lang', l.code) }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h4 className="settings-section__title">{t('settings.theme')}</h4>
        <div className="settings-theme-row">
          <span className="settings-theme-label">
            {theme === 'dark' ? t('settings.dark') : t('settings.light')}
          </span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>

      <div className="settings-section">
        <h4 className="settings-section__title">{t('settings.account')}</h4>
        {user ? (
          <div className="settings-account">
            <div className="settings-account__info">
              <FiUser />
              <span className="settings-account__email">{user.email}</span>
              <span className={`user-badge__role user-badge__role--${user.role}`}>{user.role}</span>
            </div>
            <button className="settings-logout-btn" onClick={onLogout}>
              <FiLogOut /> {t('nav.logout')}
            </button>
          </div>
        ) : (
          <button className="login-btn" onClick={onLogin}>
            <FiLogIn /> {t('nav.login')}
          </button>
        )}
      </div>

      {user?.role === 'admin' && (
        <div className="settings-section">
          <h4 className="settings-section__title">{t('settings.users')}</h4>
          {usersErr && <p className="settings-error">{usersErr}</p>}
          <div className="user-list">
            {users.map(u => (
              <UserRow
                key={u.id}
                u={u}
                currentId={user.id}
                onRoleChange={handleRoleChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
