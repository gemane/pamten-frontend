import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import DeleteAccountSection from './DeleteAccountSection'
import { authDeleteAccount } from '../services/api'

vi.mock('../services/api', () => ({ authDeleteAccount: vi.fn() }))

const mockDelete = vi.mocked(authDeleteAccount)

beforeEach(() => mockDelete.mockReset())
afterEach(() => i18n.changeLanguage('en'))

function renderSection() {
  const onDeleted = vi.fn()
  render(<DeleteAccountSection onDeleted={onDeleted} />)
  return { onDeleted }
}

async function openConfirm() {
  const ctx = renderSection()
  await userEvent.click(screen.getByRole('button', { name: /^Delete account$/ }))
  return ctx
}

describe('DeleteAccountSection (render)', () => {
  it('does not delete on the first click — it asks to confirm', async () => {
    const { onDeleted } = await openConfirm()
    // One click must never destroy the account.
    expect(mockDelete).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Confirm with your password')).toBeInTheDocument()
  })

  it('warns that the action is irreversible before confirming', async () => {
    await openConfirm()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('sends the password and signs the user out on success', async () => {
    mockDelete.mockResolvedValue({ data: { message: 'Your account has been deleted.' } } as never)
    const { onDeleted } = await openConfirm()

    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'oldpassword')
    await userEvent.click(screen.getByRole('button', { name: /Permanently delete my account/ }))

    expect(mockDelete).toHaveBeenCalledWith('oldpassword')
    // The token now points at an account that no longer exists.
    expect(onDeleted).toHaveBeenCalledTimes(1)
  })

  it('keeps confirm disabled until a password is entered', async () => {
    await openConfirm()
    const confirm = screen.getByRole('button', { name: /Permanently delete my account/ })
    expect(confirm).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'oldpassword')
    expect(confirm).toBeEnabled()
  })

  it('uses a password input so the value is never shown', async () => {
    await openConfirm()
    expect(screen.getByLabelText('Confirm with your password')).toHaveAttribute('type', 'password')
  })

  it('discards the typed password when cancelled', async () => {
    const { onDeleted } = await openConfirm()
    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'oldpassword')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockDelete).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /^Delete account$/ }))
    expect(screen.getByLabelText('Confirm with your password')).toHaveValue('')
  })

  it('translates the section', async () => {
    await i18n.changeLanguage('de')
    renderSection()
    expect(screen.getByRole('button', { name: /^Konto löschen$/ })).toBeInTheDocument()
  })
})
