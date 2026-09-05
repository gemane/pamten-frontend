import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScraperPanel from './ScraperPanel'
import type { AuthUser, ScraperStatus, ScraperSource } from '../types'

vi.mock('../services/api', () => ({
  getScraperStatus: vi.fn(),
  getScraperSources: vi.fn(),
  toggleScraperSource: vi.fn(),
  setScraperSourceMode: vi.fn(),
  runScraper: vi.fn(),
  runScraperSecEdgar: vi.fn(),
  runScraperOpenCorporates: vi.fn(),
  runScraperAll: vi.fn(),
}))
// The embedded sub-panels do their own fetching — stub them out.
vi.mock('./DuplicatesModal', () => ({ default: () => null }))
vi.mock('./FederationPanel', () => ({ default: () => <div data-testid="federation" /> }))
vi.mock('./ScraperActivity', () => ({ default: () => <div data-testid="activity" /> }))
vi.mock('./SourceHealth', () => ({ default: () => <div data-testid="health" /> }))
import { getScraperStatus, getScraperSources, setScraperSourceMode } from '../services/api'

const status: ScraperStatus = { enabled: true, sec_edgar_enabled: false, open_corporates_enabled: false }
const source = (name: string): ScraperSource => ({ name, description: 'a source', enabled: true })

const admin: AuthUser = { id: 'a1', email: 'a@example.com', role: 'admin', email_verified: true } as AuthUser
const viewer: AuthUser = { id: 'v1', email: 'v@example.com', role: 'viewer', email_verified: true } as AuthUser

beforeEach(() => {
  vi.mocked(getScraperStatus).mockResolvedValue({ data: status } as never)
  vi.mocked(getScraperSources).mockResolvedValue({ data: [source('wikidata')] } as never)
})

describe('ScraperPanel (render)', () => {
  it('does not nag an anonymous visitor to sign in', () => {
    // For a visitor the tab is a read-only activity view, not a broken scraper —
    // there is nothing missing to explain, so there is no notice.
    render(<ScraperPanel user={null} onLoadIntoGraph={vi.fn()} />)
    expect(screen.queryByText(/sign in/i)).toBeNull()
  })

  it('omits the "import ownership data" blurb for those who cannot import', () => {
    render(<ScraperPanel user={null} onLoadIntoGraph={vi.fn()} />)
    expect(screen.queryByText(/Import corporate ownership data/i)).toBeNull()
  })

  it('keeps the blurb for a contributor', async () => {
    render(<ScraperPanel user={contributor} onLoadIntoGraph={vi.fn()} />)
    expect(await screen.findByText(/Import corporate ownership data/i)).toBeInTheDocument()
  })

  it('tells a non-contributor they lack access', () => {
    render(<ScraperPanel user={viewer} onLoadIntoGraph={vi.fn()} />)
    expect(screen.getByText(/Only contributors and admins can run/i)).toBeInTheDocument()
  })

  it('shows the scraper controls for an admin', async () => {
    render(<ScraperPanel user={admin} onLoadIntoGraph={vi.fn()} />)
    expect(screen.getByText('Scraper Status')).toBeInTheDocument()
    expect(screen.queryByText(/Only contributors and admins can run/i)).toBeNull()
    // The source toggle from getScraperSources renders.
    expect(await screen.findByText('Wikidata')).toBeInTheDocument()
  })
})

// ── Who sees what ─────────────────────────────────────────────────────────────
//
// The panel is graduated rather than all-or-nothing. Each tier mirrors a backend
// guard (see utils/scrapeAccess.ts); these tests are what stops the UI drifting
// into offering an action the API would refuse.

const contributor: AuthUser =
  { id: 'c1', email: 'c@example.com', role: 'contributor', email_verified: true } as AuthUser

const runForm    = () => screen.queryByPlaceholderText(/Company name/i)
const dupButton  = () => screen.queryByText(/Review duplicate persons/i)
const federation = () => screen.queryByTestId('federation')
const activity   = () => screen.queryByTestId('activity')

describe('ScraperPanel visibility by role', () => {
  it('shows recent activity to everyone, including logged-out visitors', () => {
    // Public on purpose: what the platform ingests is worth being open about.
    render(<ScraperPanel user={null} onLoadIntoGraph={vi.fn()} />)
    expect(activity()).toBeInTheDocument()
  })

  it('hides the run form from anonymous visitors rather than disabling it', () => {
    // A greyed-out form advertises a capability the API would refuse.
    render(<ScraperPanel user={null} onLoadIntoGraph={vi.fn()} />)
    expect(runForm()).toBeNull()
    expect(dupButton()).toBeNull()
    expect(federation()).toBeNull()
  })

  it('gives a viewer no more than an anonymous visitor', () => {
    render(<ScraperPanel user={viewer} onLoadIntoGraph={vi.fn()} />)
    expect(activity()).toBeInTheDocument()
    expect(runForm()).toBeNull()
    expect(dupButton()).toBeNull()
  })

  it('gives a contributor the run form and duplicate review', async () => {
    render(<ScraperPanel user={contributor} onLoadIntoGraph={vi.fn()} />)
    expect(await screen.findByPlaceholderText(/Company name/i)).toBeInTheDocument()
    expect(dupButton()).toBeInTheDocument()
    expect(activity()).toBeInTheDocument()
  })

  it('withholds federation from a contributor — its actions are admin-only', async () => {
    render(<ScraperPanel user={contributor} onLoadIntoGraph={vi.fn()} />)
    await screen.findByPlaceholderText(/Company name/i)
    expect(federation()).toBeNull()
  })

  it('puts recent activity above the run controls', async () => {
    // Read-only content the whole audience can use comes first; the controls
    // follow. DOCUMENT_POSITION_FOLLOWING = the form comes after the feed.
    render(<ScraperPanel user={admin} onLoadIntoGraph={vi.fn()} />)
    const form = await screen.findByPlaceholderText(/Company name/i)
    const feed = screen.getByTestId('activity')
    expect(feed.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('puts source health after the activity feed, before the run form', async () => {
    // Operational reading order: what ran, how the sources are doing, then
    // the controls. The catalogue itself lives on the Data tab.
    render(<ScraperPanel user={admin} onLoadIntoGraph={vi.fn()} />)
    const feed = await screen.findByTestId('activity')
    const health = screen.getByTestId('health')
    expect(feed.compareDocumentPosition(health) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const form = screen.getByPlaceholderText(/Company name/i)
    expect(health.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('puts the run controls above the admin-only bulk datasets', async () => {
    render(<ScraperPanel user={admin} onLoadIntoGraph={vi.fn()} />)
    const form = await screen.findByPlaceholderText(/Company name/i)
    const bulk = screen.getByText(/Bulk ownership datasets/i)
    expect(form.compareDocumentPosition(bulk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('gives an admin everything', async () => {
    render(<ScraperPanel user={admin} onLoadIntoGraph={vi.fn()} />)
    expect(await screen.findByPlaceholderText(/Company name/i)).toBeInTheDocument()
    expect(dupButton()).toBeInTheDocument()
    expect(federation()).toBeInTheDocument()
    expect(activity()).toBeInTheDocument()
  })
})


// ── The visitor's view ────────────────────────────────────────────────────────
//
// The signed-in blurb describes an action ("import ownership data into the
// graph") that a visitor cannot take, so it read as a non-sequitur to them.
// They get a description of the project instead, plus the source catalogue —
// where the data comes from is the case for the whole platform.

describe('ScraperPanel intro and sources', () => {
  it('gives a visitor a description of the project, not of the importer', async () => {
    render(<ScraperPanel user={null} onLoadIntoGraph={vi.fn()} />)
    expect(await screen.findByText(/maps who ultimately owns and controls/i)).toBeInTheDocument()
    expect(screen.queryByText(/Import corporate ownership data/i)).toBeNull()
  })

  it('keeps the importer blurb for someone who can import', async () => {
    render(<ScraperPanel user={contributor} onLoadIntoGraph={vi.fn()} />)
    expect(await screen.findByText(/Import corporate ownership data/i)).toBeInTheDocument()
    expect(screen.queryByText(/maps who ultimately owns and controls/i)).toBeNull()
  })

  it('carries no catalogue at all — the Data tab owns it, and links HERE', async () => {
    render(<ScraperPanel user={null} onLoadIntoGraph={vi.fn()} />)
    await screen.findByTestId('activity')
    expect(screen.queryByText(/Where the data comes from/i)).toBeNull()
  })
})

describe('per-source data mode (admin)', () => {
  beforeEach(() => {
    vi.mocked(setScraperSourceMode).mockResolvedValue(
      { data: { name: 'wikidata', data_mode: 'claims_only' } } as never)
  })

  it('flips a full source to claims-only and merges the result', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<ScraperPanel user={admin} onLoadIntoGraph={vi.fn()} />)
    // the mode chip shows "edges" for a full source
    const chip = await screen.findByText(/Mode: edges/)
    await userEvent.click(chip)
    expect(setScraperSourceMode).toHaveBeenCalledWith('wikidata', 'claims_only')
    // optimistic merge → the chip now reads "claims only"
    expect(await screen.findByText(/Mode: claims only/)).toBeInTheDocument()
  })

  it('a viewer sees no source toggles at all (admin-only)', async () => {
    render(<ScraperPanel user={viewer} onLoadIntoGraph={vi.fn()} />)
    await screen.findByTestId('activity')   // the public feed always renders
    expect(screen.queryByText(/Mode: edges/)).toBeNull()
  })
})

describe('connection gating', () => {
  it('hides federation when the backend status could not be loaded', async () => {
    vi.mocked(getScraperStatus).mockRejectedValueOnce(new Error('offline'))
    render(<ScraperPanel user={admin} onLoadIntoGraph={vi.fn()} />)
    await screen.findByTestId('activity')   // the public feed still renders
    expect(federation()).toBeNull()          // …but the admin corner does not
  })
})
