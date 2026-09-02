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
vi.mock('./components/NodePanel', () => ({
  default: ({ node, onReScrape }: { node?: { label: string } | null
                                    onReScrape?: (n: unknown) => void }) => (
    <div data-testid="node-panel">
      {/* The real Refresh button lives deep in the panel; this stands in for it so
          App's own handler — including which country it scopes the refresh to —
          is the code under test. */}
      {onReScrape && node && (
        <button onClick={() => onReScrape(node)}>refresh-from-sources</button>
      )}
    </div>
  ),
}))

// Signed-in, email-verified user so on-demand scraping is allowed. The role is
// mutable so a test can be a contributor (the 13F follow-up is role-gated).
const auth = vi.hoisted(() => ({ role: 'viewer' }))
vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: 'u1', email: 'x@example.com', role: auth.role, email_verified: true },
    logout: vi.fn(),
  }),
}))

vi.mock('./services/api', () => ({
  // Measurement is fire-and-forget; the factory is exhaustive, so an
  // un-stubbed export throws inside the handler that calls it.
  reportEvent: vi.fn(),
  search: vi.fn(),
  ensureScrape: vi.fn(),
  runSec13f: vi.fn(),
  getFullProfile: vi.fn(),
  getPersonProfile: vi.fn(),
  getEntitiesByCountry: vi.fn(),
  getCountryEntities: vi.fn(),
  getCountries: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
  authVerifyEmail: vi.fn(),
}))

import App from './App'
import { search, ensureScrape, getFullProfile, getCountries, runSec13f } from './services/api'

const mockSearch = vi.mocked(search)
const mockEnsure = vi.mocked(ensureScrape)
const mockProfile = vi.mocked(getFullProfile)
const mock13f = vi.mocked(runSec13f)

const entity = (id: string, name: string, country?: string): Entity =>
  ({ id, name, type: 'company', verified: false, ...(country ? { country } : {}) } as Entity)
const fullProfile = (id: string, name: string): FullProfile => ({
  entity: entity(id, name), owners: [], subsidiaries: [], executives: [],
})
const result = (id: string, name: string, country?: string): SearchResult =>
  ({ type: 'Entity', score: 1, node: entity(id, name, country) })

beforeEach(() => {
  vi.mocked(getCountries).mockResolvedValue({ data: [] } as never)
  mockSearch.mockReset()
  mockEnsure.mockReset()
  mockProfile.mockReset()
  mock13f.mockReset()
  mock13f.mockResolvedValue({ data: { status: 'fresh', total: 0 } } as never)
  auth.role = 'viewer'
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

/**
 * Refresh from sources, on a company already in the graph.
 *
 * It is the other way a scrape starts, and it takes its country from the company
 * itself rather than the search box — a refresh must not walk off to a same-named
 * company somewhere else, which is exactly what the sources would hand over if
 * asked bare. Nothing else covers this wiring, and losing it looks like a
 * perfectly ordinary refresh.
 */
describe('refreshing a company from its panel', () => {
  const openAndRefresh = async (res: SearchResult) => {
    mockSearch.mockResolvedValue({ data: [res] } as never)
    render(<App />)
    await userEvent.type(screen.getByPlaceholderText(/Search companies/i), 'acme', { delay: null })
    await userEvent.click(await screen.findByText((res.node as Entity).name))
    await waitFor(() => expect(mockEnsure).toHaveBeenCalled())
    mockEnsure.mockClear()                       // drop the passive enrich on select
    await userEvent.click(await screen.findByRole('button', { name: 'refresh-from-sources' }))
    await waitFor(() => expect(mockEnsure).toHaveBeenCalled())
  }

  it('scopes the refresh to the company own country', async () => {
    await openAndRefresh(result('e1', 'Acme GmbH', 'DE'))
    expect(mockEnsure).toHaveBeenCalledWith('Acme GmbH', 1, true, 'DE')
  })

  it('leaves it unrestricted when the company has no country recorded', async () => {
    // A tenth of the graph has none. Refusing to refresh those would be worse
    // than refreshing them unrestricted, which is what always happened.
    await openAndRefresh(result('e1', 'Acme Anywhere'))
    expect(mockEnsure).toHaveBeenCalledWith('Acme Anywhere', 1, true, undefined)
  })

  it('forces the scrape, unlike the passive enrich on select', async () => {
    await openAndRefresh(result('e1', 'Acme GmbH', 'DE'))
    expect(mockEnsure.mock.calls[0][2]).toBe(true)
  })
})

/**
 * A search the server refused to repeat.
 *
 * "Alphabet" in France has no answer, and asking twice does not produce one. The
 * server remembers the miss and declines to ask the sources again — so the UI
 * must not report "nothing found" as though it had looked. Same words for two
 * different events is how a working guard gets mistaken for a broken search.
 */
describe('a search that was already tried', () => {
  const scrapeFor = async (query: string, reason: string) => {
    mockSearch.mockResolvedValue({ data: [] } as never)          // nothing in the DB
    mockEnsure.mockResolvedValue({
      data: { scraped: false, reason, entity_id: null, depth_reached: 0,
              sources_run: [], profile: null, missed_at: '2026-08-16T10:00:00Z' },
    } as never)
    render(<App />)
    await userEvent.type(screen.getByPlaceholderText(/Search companies/i), query, { delay: null })
    await userEvent.click(await screen.findByText(/search sources for/i))
    await waitFor(() => expect(mockEnsure).toHaveBeenCalled())
  }

  it('says the sources were already asked, not that nothing was found', async () => {
    await scrapeFor('alphabet', 'recently_missed')
    expect(await screen.findByText(/Already searched/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Nothing found in the sources/i)).toBeNull()
  })

  it('still says "nothing found" when the sources really were asked', async () => {
    await scrapeFor('alphabet', 'absent')
    expect(await screen.findByText(/Nothing found/i)).toBeInTheDocument()
    expect(screen.queryByText(/Already searched/i)).toBeNull()
  })
})

/**
 * Searching a person's name.
 *
 * It used to do something worse than nothing: the top Wikidata hit for "Larry
 * Page" is the man, and he was written into the graph as a company. The backend
 * scrapes people properly now and says which it found; the UI has to build the
 * graph around the person rather than reaching for `profile.entity`, which a
 * person profile does not have.
 */
describe('a search that turns out to be a person', () => {
  const personProfile = {
    person: { id: 'p1', full_name: 'Larry Page', nodeType: 'person' },
    positions: [{ entity: { id: 'e1', name: 'Alphabet Inc.', type: 'company' },
                  relationship: { role: 'Founder' } }],
    holdings: [{ entity: { id: 'e1', name: 'Alphabet Inc.', type: 'company' },
                 relationship: {} }],
  }

  it('renders the person rather than crashing on a missing entity', async () => {
    mockSearch.mockResolvedValue({ data: [] } as never)
    mockEnsure.mockResolvedValue({
      data: { scraped: true, reason: 'absent', kind: 'person', entity_id: null,
              person_id: 'p1', depth_reached: 1, sources_run: ['wikidata'],
              profile: personProfile },
    } as never)
    render(<App />)

    await userEvent.type(screen.getByPlaceholderText(/Search companies/i), 'larry page',
                         { delay: null })
    await userEvent.click(await screen.findByText(/search sources for/i))
    await waitFor(() => expect(mockEnsure).toHaveBeenCalled())

    // The node panel opens for the person, and no "nothing found" toast appears:
    // something WAS found, it simply was not a company.
    await waitFor(() => expect(screen.getByTestId('node-panel')).toBeInTheDocument())
    expect(screen.queryByText(/Nothing found/i)).toBeNull()
  })

  it('does not chase a deeper pass for a person', async () => {
    // The depth-2 enrich exists to walk a company's ownership; a person has no
    // deeper level, and appendProfile would be handed the wrong shape.
    mockSearch.mockResolvedValue({ data: [] } as never)
    mockEnsure.mockResolvedValue({
      data: { scraped: true, reason: 'absent', kind: 'person', entity_id: null,
              person_id: 'p1', depth_reached: 1, sources_run: ['wikidata'],
              profile: personProfile },
    } as never)
    render(<App />)

    await userEvent.type(screen.getByPlaceholderText(/Search companies/i), 'larry page',
                         { delay: null })
    await userEvent.click(await screen.findByText(/search sources for/i))
    await waitFor(() => expect(mockEnsure).toHaveBeenCalledTimes(1))

    // The idle pass lands on a 1.5s fallback timer in jsdom (utils/idle.ts), so a
    // shorter wait would pass whether or not it was scheduled.
    await new Promise(r => setTimeout(r, 1800))
    expect(mockEnsure.mock.calls.every(c => c[1] !== 2)).toBe(true)
  })
})


describe('the explicit refresh brings the 13F holders along', () => {
  const openAndRefresh = async (res: SearchResult) => {
    mockSearch.mockResolvedValue({ data: [res] } as never)
    render(<App />)
    await userEvent.type(screen.getByPlaceholderText(/Search companies/i), 'acme', { delay: null })
    await userEvent.click(await screen.findByText((res.node as Entity).name))
    await waitFor(() => expect(mockEnsure).toHaveBeenCalled())
    mockEnsure.mockClear()
    await userEvent.click(await screen.findByRole('button', { name: 'refresh-from-sources' }))
    await waitFor(() => expect(mockEnsure).toHaveBeenCalled())
  }

  it('a viewer refresh never touches the contributor endpoint', async () => {
    await openAndRefresh(result('e1', 'Acme GmbH', 'DE'))
    expect(mock13f).not.toHaveBeenCalled()
  })

  it('a contributor refresh runs 13F and pulls the fresh profile in', async () => {
    auth.role = 'contributor'
    mock13f.mockResolvedValue({ data: { status: 'ok', total: 89 } } as never)
    await openAndRefresh(result('e1', 'Acme GmbH', 'DE'))
    await waitFor(() => expect(mock13f).toHaveBeenCalledWith('Acme GmbH'))
    // The holders were written server-side; the profile is re-read WITHOUT
    // force so the new edges appear with no second scrape.
    await waitFor(() => expect(mockEnsure).toHaveBeenCalledWith('Acme GmbH', 1, false, 'DE'))
  })

  it('a fresh quarter answer changes nothing and re-reads nothing', async () => {
    auth.role = 'contributor'
    mock13f.mockResolvedValue({ data: { status: 'fresh', total: 0 } } as never)
    await openAndRefresh(result('e1', 'Acme GmbH', 'DE'))
    await waitFor(() => expect(mock13f).toHaveBeenCalled())
    expect(mockEnsure.mock.calls.filter(c => c[2] === false)).toHaveLength(0)
  })
})
