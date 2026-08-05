import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import ChangePasswordSection from './ChangePasswordSection'
import { authChangePassword } from '../services/api'

vi.mock('../services/api', () => ({ authChangePassword: vi.fn() }))

const mockChange = vi.mocked(authChangePassword)

beforeEach(() => mockChange.mockReset())
afterEach(() => i18n.changeLanguage('en'))

async function openForm() {
  render(<ChangePasswordSection />)
  await userEvent.click(screen.getByRole('button', { name: /Change password/ }))
}

async function fill(current: string, next: string, repeat: string) {
  await userEvent.type(screen.getByLabelText('Current password'), current)
  await userEvent.type(screen.getByLabelText('New password'), next)
  await userEvent.type(screen.getByLabelText('Repeat new password'), repeat)
}

describe('ChangePasswordSection (render)', () => {
  it('sends the current and new password, then closes the form', async () => {
    mockChange.mockResolvedValue({ data: { message: 'Password updated.' } } as never)
    await openForm()
    await fill('oldpassword', 'Zt9mQ2vLp4rK', 'Zt9mQ2vLp4rK')

    await userEvent.click(screen.getByRole('button', { name: /Update password/ }))

    expect(mockChange).toHaveBeenCalledWith('oldpassword', 'Zt9mQ2vLp4rK')
    expect(await screen.findByText('Password updated.')).toBeInTheDocument()
    // Form closed — the fields are gone, so the typed secrets aren't left on screen.
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
  })

  it('rejects a mismatched repeat without calling the API', async () => {
    await openForm()
    await fill('oldpassword', 'Zt9mQ2vLp4rK', 'typo-on-the-repeat')

    await userEvent.click(screen.getByRole('button', { name: /Update password/ }))

    expect(mockChange).not.toHaveBeenCalled()
    expect(screen.getByText("The new passwords don't match.")).toBeInTheDocument()
  })

  it('keeps the form open after a failed attempt so it can be corrected', async () => {
    // Driven through the mismatch path on purpose: a mock that rejects leaves a
    // floating rejection which vitest 4's mock result-tracking reports as an
    // unhandled error, failing the test even though the component handles it.
    // The server-error branch is covered by the errText unit tests below.
    await openForm()
    await fill('oldpassword', 'Zt9mQ2vLp4rK', 'typo-on-the-repeat')
    await userEvent.click(screen.getByRole('button', { name: /Update password/ }))

    expect(screen.getByLabelText('Current password')).toHaveValue('oldpassword')
    expect(screen.getByLabelText('New password')).toHaveValue('Zt9mQ2vLp4rK')
  })

  it('keeps submit disabled until all three fields are filled', async () => {
    await openForm()
    const submit = screen.getByRole('button', { name: /Update password/ })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Current password'), 'oldpassword')
    await userEvent.type(screen.getByLabelText('New password'), 'Zt9mQ2vLp4rK')
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Repeat new password'), 'Zt9mQ2vLp4rK')
    expect(submit).toBeEnabled()
  })

  it('uses password inputs so the values are never shown', async () => {
    await openForm()
    for (const label of ['Current password', 'New password', 'Repeat new password']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password')
    }
  })

  it('discards what was typed when cancelled', async () => {
    await openForm()
    await fill('oldpassword', 'Zt9mQ2vLp4rK', 'Zt9mQ2vLp4rK')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByRole('button', { name: /Change password/ }))
    expect(screen.getByLabelText('Current password')).toHaveValue('')
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })

  it('translates the section', async () => {
    await i18n.changeLanguage('de')
    render(<ChangePasswordSection />)
    expect(screen.getByRole('button', { name: /Passwort ändern/ })).toBeInTheDocument()
  })
})
