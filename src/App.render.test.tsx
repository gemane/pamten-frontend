import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { FullProfile, Entity, SearchResult } from './types'

// Canvas / heavy / fetching children — stub so App renders in jsdom and we can drive the
// search → select → enrich flow without cytoscape, leaflet, or real network.
vi.mock('./components/Graph', () => ({ default: () => <div data-testid="graph" /> }))
vi.mock('./components/MapView', () => ({ default: () => null }))
vi.mock('./components/MapPanel', () => ({ default: () => null }))
vi.mock('./components/GraphLegend', () => ({ default: () => null }))
vi.mock('./components/ScraperPanel', () => ({ default: () => null }))
vi.mock('./components/SettingsPanel', () => ({ default: () => null }))
vi.mock('./components/AuthModal', () => ({ default: () => null }))
vi.mock('./components/ModeratorQueue', () => ({ default: () => null }))
vi.mock('./components/NodePanel', () => ({ default: () => <div data-testid="node-panel" /> }))

// Signed-in, email-verified user so on-demand scraping is allowed.
vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: 'u1', email: 'x@example.com', role: 'viewer', email_verified: true },
    logout: vi.fn(),
  }),
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
import { search, ensureScrape, getFullProfile, getCountries } from './services/api'

const mockSearch = vi.mocked(search)
const mockEnsure = vi.mocked(ensureScrape)
const mockProfile = vi.mocked(getFullProfile)

const entity = (id: string, name: string): Entity => ({ id, name, type: 'company', verified: false } as Entity)
const fullProfile = (id: string, name: string): FullProfile => ({
  entity: entity(id, name), owners: [], subsidiaries: [], executives: [],
})
const result = (id: string, name: string): SearchResult => ({ type: 'Entity', score: 1, node: entity(id, name) })

beforeEach(() => {
  vi.mocked(getCountries).mockResolvedValue({ data: [] } as never)
  mockSearch.mockReset()
  mockEnsure.mockReset()
  mockProfile.mockReset()
  mockProfile.mockResolvedValue({ data: fullProfile('e1', 'Microsoft Corporation') } as never)
  mockEnsure.mockResolvedValue({
    data: { scraped: false, reason: 'fresh', entity_id: 'e1', depth_reached: 1, sources_run: [], profile: null },
  } as never)
})

describe('App on-demand enrich flow', () => {
  it('clicking a search result enriches WITHOUT the prominent overlay (passive, force=false)', async () => {
    mockSearch.mockResolvedValue({ data: [result('e1', 'Microsoft Corporation')] } as never)
    render(<App />)

    const input = screen.getByPlaceholderText(/Search companies/i)
    await userEvent.type(input, 'microsoft', { delay: null })
    const row = await screen.findByText('Microsoft Corporation')
    await userEvent.click(row)

    // The passive enrich fires with force=false and no country: this one came from
    // clicking a DB result, which already IS a particular company — the country
    // filter only has a job when a name still has to be resolved to one.
    await waitFor(() => expect(mockEnsure).toHaveBeenCalled())
    expect(mockEnsure).toHaveBeenCalledWith('Microsoft Corporation', 1, false, undefined)

    // …and the prominent "Searching sources for X…" overlay must NOT appear (regression #103).
    await new Promise(r => setTimeout(r, 350))   // past the 250ms overlay delay
    expect(screen.queryByText(/Searching sources for/i)).not.toBeInTheDocument()
  })

  it('the "search sources for X" action DOES show the prominent overlay', async () => {
    mockSearch.mockResolvedValue({ data: [] } as never)   // no DB match → the scrape prompt
    // Keep the scrape pending so the overlay is observable mid-flight.
    let finish!: (v: unknown) => void
    mockEnsure.mockImplementation(
      () => new Promise<never>(res => { finish = res as unknown as (v: unknown) => void }),
    )
    render(<App />)

    const input = screen.getByPlaceholderText(/Search companies/i)
    await userEvent.type(input, 'nonesuchco', { delay: null })
    const scrapeRow = await screen.findByText(/search sources for/i)
    await userEvent.click(scrapeRow)

    // handleScrapeQuery shows the overlay immediately (no delay) while the scrape runs.
    expect(await screen.findByText(/Searching sources for/i)).toBeInTheDocument()

    finish({ data: { scraped: false, reason: 'fresh', entity_id: null, depth_reached: 0, sources_run: [], profile: null } })
    await waitFor(() => expect(screen.queryByText(/Searching sources for/i)).not.toBeInTheDocument())
  })
})
