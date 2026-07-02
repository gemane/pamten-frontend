import { FiLogIn, FiLogOut, FiUser } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import ThemeToggle from './ThemeToggle'
import type { Theme } from '../hooks/useTheme'
import type { AuthUser } from '../types'

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'es', label: 'ES' },
]

interface SettingsPanelProps {
  theme: Theme
  onToggleTheme: () => void
  user: AuthUser | null
  onLogin: () => void
  onLogout: () => void
}

export default function SettingsPanel({ theme, onToggleTheme, user, onLogin, onLogout }: SettingsPanelProps) {
  const { t, i18n } = useTranslation()
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
    </div>
  )
}
