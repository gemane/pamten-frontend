import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UpdateGate from './UpdateGate'
import { dismissKey, NO_UPDATE } from '../utils/appVersionCheck'

const STORE = 'https://play.google.com/store/apps/details?id=org.owlgraph.app'

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('UpdateGate', () => {
  it('shows nothing when no update is due', () => {
    const { container } = render(<UpdateGate state={NO_UPDATE} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('required: a blocking screen with no way past it, and the store button', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<UpdateGate state={{ kind: 'required', storeUrl: STORE, message: null }} />)
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('Update required')
    expect(dialog).toHaveTextContent('no longer supported')
    expect(screen.queryByText('Later')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(open).toHaveBeenCalledWith(STORE, '_blank', 'noopener,noreferrer')
  })

  it('required without a store link still explains, and the policy message replaces the default', () => {
    render(<UpdateGate state={{ kind: 'required', storeUrl: null, message: 'Please reinstall from the Play Store.' }} />)
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Please reinstall from the Play Store.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('available: a banner that "Later" dismisses for that version only', async () => {
    const { unmount } = render(<UpdateGate state={{ kind: 'available', storeUrl: STORE, message: null, latest: '1.4.0' }} />)
    expect(screen.getByRole('status')).toHaveTextContent('A new version of the app is available.')
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(localStorage.getItem(dismissKey('1.4.0'))).toBe('1')
    unmount()
    // the same version stays dismissed…
    const { unmount: u2 } = render(<UpdateGate state={{ kind: 'available', storeUrl: STORE, message: null, latest: '1.4.0' }} />)
    expect(screen.queryByRole('status')).toBeNull()
    u2()
    // …a newer one asks again
    render(<UpdateGate state={{ kind: 'available', storeUrl: STORE, message: null, latest: '1.5.0' }} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
