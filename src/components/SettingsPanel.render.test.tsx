import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import SettingsPanel from './SettingsPanel'
import type { AuthUser } from '../types'

vi.mock('../services/api', () => ({
  getUsers: vi.fn().mockResolvedValue({ data: [] }),
  updateUserRole: vi.fn(),
  deleteUser: vi.fn(),
}))
vi.mock('./MfaSection', () => ({ default: () => null }))
vi.mock('./ModeratorQueue', () => ({
  default: ({ relatedTo }: { relatedTo?: string }) =>
    <div data-testid="queue" data-related-to={relatedTo ?? ''} />,
}))

const verifiedUser: AuthUser = { id: 'u1', email: 'me@example.com', role: 'viewer', email_verified: true } as AuthUser
const as = (role: string) => ({ ...verifiedUser, role } as AuthUser)
const queueButton = () => screen.queryByRole('button', { name: /Open the queue/i })

beforeEach(() => localStorage.clear())
afterEach(() => { localStorage.clear(); i18n.changeLanguage('en') })

function renderPanel(overrides: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  const props = {
    themeMode: 'system' as const, onSetThemeMode: vi.fn(),
    user: null, onLogin: vi.fn(), onLogout: vi.fn(), ...overrides,
  }
  return { props, ...render(<SettingsPanel {...props} />) }
}

describe('SettingsPanel (render)', () => {
  it('defaults the language to System and highlights the chosen one on click', async () => {
    renderPanel()
    // Both the language and the theme rows have a "System" button — the language one is first.
    expect(screen.getAllByRole('button', { name: 'System' })[0]).toHaveClass('lang-btn--active')

    await userEvent.click(screen.getByRole('button', { name: 'DE' }))
    expect(screen.getByRole('button', { name: 'DE' })).toHaveClass('lang-btn--active')
    expect(localStorage.getItem('lang')).toBe('de')
  })

  it('calls onSetThemeMode when a theme is picked', async () => {
    const { props } = renderPanel({ themeMode: 'light' })
    // The active theme reflects the prop.
    expect(screen.getByRole('button', { name: 'Light' })).toHaveClass('lang-btn--active')
    await userEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(props.onSetThemeMode).toHaveBeenCalledWith('dark')
  })

  it('shows a login button when signed out', async () => {
    const { props } = renderPanel({ user: null })
    const login = screen.getByRole('button', { name: /Login/ })
    await userEvent.click(login)
    expect(props.onLogin).toHaveBeenCalledTimes(1)
  })

  it('shows the account + logout when signed in', async () => {
    const { props } = renderPanel({ user: verifiedUser })
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Logout/ }))
    expect(props.onLogout).toHaveBeenCalledTimes(1)
  })
})

/**
 * The full moderation queue lives here, because the button under a company's
 * name only appears when that company has something waiting. Unlike that one,
 * this shows whether or not anything is queued — Settings is where you go
 * looking, so an empty queue should say so rather than vanish.
 */
describe('the moderation queue section', () => {
  it('is offered to a moderator', () => {
    renderPanel({ user: as('moderator') })
    expect(queueButton()).toBeInTheDocument()
  })

  it('is offered to an admin', () => {
    renderPanel({ user: as('admin') })
    expect(queueButton()).toBeInTheDocument()
  })

  it('is NOT offered to an ordinary user', () => {
    renderPanel({ user: verifiedUser })
    expect(screen.getByText('me@example.com')).toBeInTheDocument()   // panel did render
    expect(queueButton()).toBeNull()
  })

  it('is NOT offered to a logged-out visitor', () => {
    renderPanel({ user: null })
    expect(queueButton()).toBeNull()
  })

  it('opens the queue in a modal, unscoped — every company, not one', async () => {
    renderPanel({ user: as('moderator') })
    expect(screen.queryByTestId('queue')).toBeNull()
    await userEvent.click(queueButton()!)
    expect(screen.getByTestId('queue')).toHaveAttribute('data-related-to', '')
  })
})
