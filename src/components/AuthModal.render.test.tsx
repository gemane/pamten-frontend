import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthModal from './AuthModal'

const login = vi.fn()
const register = vi.fn()
const verifyMfa = vi.fn()
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login, register, verifyMfa }) }))
vi.mock('../services/api', () => ({
  authResendVerification: vi.fn(),
  authForgotPassword: vi.fn(),
  authResetPassword: vi.fn(),
}))

const email = () => document.querySelector('input[type="email"]') as HTMLInputElement
const password = () => document.querySelector('input[type="password"]') as HTMLInputElement
const submit = () => document.querySelector('button[type="submit"]') as HTMLButtonElement

beforeEach(() => {
  login.mockReset(); register.mockReset(); verifyMfa.mockReset()
})

describe('AuthModal (render)', () => {
  it('submits login credentials and closes on success (no MFA)', async () => {
    login.mockResolvedValue({ mfaRequired: false })
    const onClose = vi.fn()
    render(<AuthModal onClose={onClose} />)

    await userEvent.type(email(), 'me@example.com')
    await userEvent.type(password(), 'hunter2')
    await userEvent.click(submit())

    await waitFor(() => expect(login).toHaveBeenCalledWith('me@example.com', 'hunter2'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('switches to the register tab', async () => {
    render(<AuthModal onClose={vi.fn()} />)
    expect(submit()).toHaveTextContent('Sign in')

    await userEvent.click(screen.getByRole('button', { name: /Register/ }))
    expect(submit()).toHaveTextContent('Create account')
  })

  it('shows the verify-email panel after a registration that needs verification', async () => {
    register.mockResolvedValue({ verificationRequired: true })
    render(<AuthModal onClose={vi.fn()} initialMode="register" />)

    await userEvent.type(email(), 'new@example.com')
    await userEvent.type(password(), 'longenoughpw')
    await userEvent.click(submit())

    expect(await screen.findByText(/verification link to new@example.com/i)).toBeInTheDocument()
    expect(register).toHaveBeenCalledWith('new@example.com', 'longenoughpw')
  })
})
