/**
 * The search icon takes two taps from another tab, on purpose.
 *
 * From elsewhere it only navigates: raising the keyboard there would cover the
 * graph the tap just asked to see. Once the graph is showing, a tap empties the
 * field and opens the keyboard.
 *
 * jsdom cannot show a keyboard, so these tests use focus as its proxy — which is
 * accurate, because the keyboard is precisely what focus-during-a-gesture buys.
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
  // Measurement is fire-and-forget; the factory is exhaustive, so an
  // un-stubbed export throws inside the handler that calls it.
  reportEvent: vi.fn(),
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

  it('only navigates when arriving from another tab — no keyboard over the graph', async () => {
    // The whole reason for two taps. Focusing here pops the keyboard straight
    // over the panel the tap just asked to look at.
    render(<App />)
    await userEvent.click(screen.getByTitle(/settings/i))

    await userEvent.click(searchIcon())

    expect(screen.getByTestId('graph')).toBeInTheDocument()   // it did navigate
    expect(document.activeElement).not.toBe(searchField())    // but did not grab focus
  })

  it('opens the keyboard on the second tap, once the graph is showing', async () => {
    render(<App />)
    await userEvent.click(screen.getByTitle(/settings/i))

    await userEvent.click(searchIcon())    // first: navigate only
    await userEvent.click(searchIcon())    // second: now the field exists

    expect(document.activeElement).toBe(searchField())
  })

  it('does not grab focus when the graph is reached another way', async () => {
    // Browser Back, a deep link, the bottom nav: none of these are the search
    // icon, and none should pop the keyboard.
    render(<App />)
    await userEvent.click(screen.getByTitle(/settings/i))

    window.location.hash = '#graph'
    window.dispatchEvent(new PopStateEvent('popstate'))

    const field = await screen.findByPlaceholderText(/Search companies/i)
    expect(document.activeElement).not.toBe(field)
  })
})
