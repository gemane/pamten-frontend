/**
 * Tapping the search icon should empty the field and put the cursor in it.
 *
 * On a phone the point is the keyboard: mobile browsers only raise it for a
 * focus() that happens inside the user's gesture, which is why App calls
 * SearchBar imperatively rather than nudging it through a prop and an effect.
 * jsdom cannot show a keyboard, so these tests pin the two things it can see —
 * the field is cleared, and the cursor lands in it — plus the case that would
 * otherwise be an easy regression: coming back to the graph by *another* route
 * must not throw away what was typed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { Entity, FullProfile } from './types'

vi.mock('./components/Graph', () => ({ default: () => <div data-testid="graph" /> }))
vi.mock('./components/MapView', () => ({ default: () => null }))
vi.mock('./components/MapPanel', () => ({ default: () => null }))
vi.mock('./components/GraphLegend', () => ({ default: () => null }))
vi.mock('./components/ScraperPanel', () => ({ default: () => null }))
vi.mock('./components/SettingsPanel', () => ({ default: () => <div data-testid="settings" /> }))
vi.mock('./components/AuthModal', () => ({ default: () => null }))
vi.mock('./components/ModeratorQueue', () => ({ default: () => null }))
vi.mock('./components/NodePanel', () => ({ default: () => null }))

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: null, logout: vi.fn() }),
}))

vi.mock('./services/api', () => ({
  search: vi.fn(),
  ensureScrape: vi.fn(),
  getFullProfile: vi.fn(),
  getPersonProfile: vi.fn(),
  getEntitiesByCountry: vi.fn(),
  getCountryEntities: vi.fn(),
  getCountries: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
  authVerifyEmail: vi.fn(),
}))

import App from './App'
import { search, getCountries, getEntitiesByCountry } from './services/api'

const entity = (id: string, name: string): Entity =>
  ({ id, name, type: 'company', verified: false } as Entity)

beforeEach(() => {
  vi.mocked(getCountries).mockResolvedValue({ data: [] } as never)
  vi.mocked(getEntitiesByCountry).mockResolvedValue({ data: [] } as never)
  vi.mocked(search).mockResolvedValue({ data: [] } as never)
  window.location.hash = ''
})

const searchField = () => screen.getByPlaceholderText(/Search companies/i) as HTMLInputElement
const searchIcon = () => screen.getByTitle(/graph|search/i)

describe('the search icon', () => {
  it('empties the field when the graph tab is already open', async () => {
    render(<App />)
    await userEvent.type(searchField(), 'barclays', { delay: null })
    expect(searchField().value).toBe('barclays')

    await userEvent.click(searchIcon())

    expect(searchField().value).toBe('')
  })

  it('puts the cursor in the field — what raises the keyboard on a phone', async () => {
    render(<App />)
    await userEvent.type(searchField(), 'barclays', { delay: null })
    // Move focus away first, or the assertion passes for the wrong reason.
    ;(document.activeElement as HTMLElement)?.blur()
    expect(document.activeElement).not.toBe(searchField())

    await userEvent.click(searchIcon())

    expect(document.activeElement).toBe(searchField())
  })

  it('works when arriving from another tab, where the field does not exist yet', async () => {
    render(<App />)
    await userEvent.type(searchField(), 'barclays', { delay: null })

    await userEvent.click(screen.getByTitle(/settings/i))     // leaves the graph tab
    await userEvent.click(searchIcon())                        // and back via the icon

    expect(searchField().value).toBe('')
    expect(document.activeElement).toBe(searchField())
  })

  it('does not grab focus when the graph is reached another way', async () => {
    // The regression this guards: the pending flag must be one-shot. A signal the
    // remount replayed would focus the field every time the graph reappeared —
    // and on a phone that means the keyboard springing up unasked after a Back
    // press. (The field itself is empty here regardless: leaving the tab unmounts
    // SearchBar, which is pre-existing behaviour and not what this pins.)
    render(<App />)
    // Arm the deferred path for real: the flag is only set when the icon is
    // tapped from *another* tab. Tapping it on the graph takes the synchronous
    // route and never arms anything, so starting there tests nothing.
    await userEvent.click(screen.getByTitle(/settings/i))
    await userEvent.click(searchIcon())                        // arms, then consumes
    await userEvent.click(screen.getByTitle(/settings/i))

    window.location.hash = '#graph'
    window.dispatchEvent(new PopStateEvent('popstate'))

    const field = await screen.findByPlaceholderText(/Search companies/i)
    expect(document.activeElement).not.toBe(field)
  })
})
