import { useState, useEffect, useCallback } from 'react'
import { FiLogIn, FiLogOut, FiUser, FiTrash2, FiChevronDown } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import MfaSection from './MfaSection'
import ChangePasswordSection from './ChangePasswordSection'
import DeleteAccountSection from './DeleteAccountSection'
import type { ThemeMode } from '../hooks/useTheme'
import type { AuthUser } from '../types'
import { systemLanguage } from '../utils/systemLanguage'
import { getUsers, updateUserRole, deleteUser } from '../services/api'
import type { UserRecord } from '../services/api'

// 'system' follows the OS/browser setting; the rest are explicit choices.
const LANGS: { code: string; label?: string; labelKey?: string }[] = [
  { code: 'system', labelKey: 'settings.system' },
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'es', label: 'ES' },
]

const THEME_MODES: { mode: ThemeMode; labelKey: string }[] = [
  { mode: 'system', labelKey: 'settings.system' },
  { mode: 'light',  labelKey: 'settings.light' },
  { mode: 'dark',   labelKey: 'settings.dark' },
]

const ROLES = ['admin', 'contributor', 'viewer'] as const

interface SettingsPanelProps {
  themeMode: ThemeMode
  onSetThemeMode: (mode: ThemeMode) => void
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

export default function SettingsPanel({ themeMode, onSetThemeMode, user, onLogin, onLogout }: SettingsPanelProps) {
  const { t, i18n } = useTranslation()
  const [users,    setUsers]    = useState<UserRecord[]>([])
  const [usersErr, setUsersErr] = useState<string | null>(null)
  // The saved language PREFERENCE ('system' or a code) — distinct from the resolved
  // i18n.language, so "System" stays highlighted even though the UI shows e.g. German.
  const [langPref, setLangPref] = useState<string>(() => localStorage.getItem('lang') || 'system')

  const applyLang = (code: string) => {
    setLangPref(code)
    localStorage.setItem('lang', code)
    i18n.changeLanguage(code === 'system' ? systemLanguage() : code)
  }

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
              className={`lang-btn ${langPref === l.code ? 'lang-btn--active' : ''}`}
              onClick={() => applyLang(l.code)}
            >
              {l.label ?? t(l.labelKey!)}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h4 className="settings-section__title">{t('settings.theme')}</h4>
        <div className="lang-switcher">
          {THEME_MODES.map(m => (
            <button
              key={m.mode}
              className={`lang-btn ${themeMode === m.mode ? 'lang-btn--active' : ''}`}
              onClick={() => onSetThemeMode(m.mode)}
            >
              {t(m.labelKey)}
            </button>
          ))}
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

      {user && <ChangePasswordSection />}

      {user && <MfaSection />}

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

      {/* Last, and after the admin panel: destructive and irreversible. */}
      {user && <DeleteAccountSection onDeleted={onLogout} />}
    </div>
  )
}
