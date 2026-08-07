/**
 * How a session survives — or doesn't — across a page load.
 *
 * The access token is deliberately not persisted, so mounting the provider is
 * the moment the app finds out whether it is still logged in: it asks the API
 * to trade the httpOnly refresh cookie for a fresh token. These tests pin that
 * behaviour, including the failure mode that matters most — logging out must
 * revoke the cookie server-side, or the next reload silently signs back in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AuthProvider, useAuth } from './AuthContext'
import { refreshSession, authLogout, setAccessToken } from '../services/api'

vi.mock('../services/api', () => ({
  refreshSession:  vi.fn(),
  authLogout:      vi.fn(),
  setAccessToken:  vi.fn(),
  authLogin:       vi.fn(),
  authRegister:    vi.fn(),
  authMfaVerify:   vi.fn(),
}))

const mockRefresh = vi.mocked(refreshSession)
const mockLogout  = vi.mocked(authLogout)
const mockSetToken = vi.mocked(setAccessToken)

const SESSION = { access_token: 'fresh', id: 'u1', email: 'user@example.com',
                  role: 'viewer', email_verified: true }

function Probe() {
  const { user, loading, logout } = useAuth()
  if (loading) return <p>loading</p>
  return (
    <div>
      <span data-testid="who">{user ? user.email : 'signed out'}</span>
      <button onClick={logout}>Log out</button>
    </div>
  )
}

const renderApp = () => render(<AuthProvider><Probe /></AuthProvider>)

beforeEach(() => {
  mockRefresh.mockReset()
  mockLogout.mockReset()
  mockSetToken.mockReset()
  mockLogout.mockResolvedValue({ data: { message: 'Logged out.' } } as never)
})

describe('restoring a session on load', () => {
  it('signs the user back in from the refresh cookie', async () => {
    mockRefresh.mockResolvedValue(SESSION as never)
    renderApp()
    expect(await screen.findByTestId('who')).toHaveTextContent('user@example.com')
  })

  it('comes up signed out when there is no session', async () => {
    mockRefresh.mockResolvedValue(null)
    renderApp()
    expect(await screen.findByTestId('who')).toHaveTextContent('signed out')
  })

  it('stops showing the loading state even if the refresh rejects', async () => {
    // refreshSession is contracted not to throw, but a hang here would leave the
    // whole app stuck behind a spinner — worth pinning.
    mockRefresh.mockRejectedValue(new Error('network down'))
    renderApp()
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
  })
})

describe('logging out', () => {
  it('revokes the session server-side, not just in this tab', async () => {
    // Clearing the in-memory token alone would leave the cookie alive, and the
    // next page load would trade it for a new token — an unlogout-able logout.
    mockRefresh.mockResolvedValue(SESSION as never)
    renderApp()
    await screen.findByTestId('who')

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(mockLogout).toHaveBeenCalled()
    expect(mockSetToken).toHaveBeenCalledWith(null)
    expect(screen.getByTestId('who')).toHaveTextContent('signed out')
  })

  it('signs out locally even when the server call fails', async () => {
    mockRefresh.mockResolvedValue(SESSION as never)
    mockLogout.mockRejectedValue(new Error('offline'))
    renderApp()
    await screen.findByTestId('who')

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(screen.getByTestId('who')).toHaveTextContent('signed out')
  })
})
