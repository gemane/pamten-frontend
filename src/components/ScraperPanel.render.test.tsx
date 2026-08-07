import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScraperPanel from './ScraperPanel'
import type { AuthUser, ScraperStatus, ScraperSource } from '../types'

vi.mock('../services/api', () => ({
  getScraperStatus: vi.fn(),
  getScraperSources: vi.fn(),
  toggleScraperSource: vi.fn(),
  runScraper: vi.fn(),
  runScraperSecEdgar: vi.fn(),
  runScraperOpenCorporates: vi.fn(),
  runScraperAll: vi.fn(),
}))
// The embedded sub-panels do their own fetching — stub them out.
vi.mock('./DuplicatesModal', () => ({ default: () => null }))
vi.mock('./FederationPanel', () => ({ default: () => <div data-testid="federation" /> }))
vi.mock('./ScraperActivity', () => ({ default: () => <div data-testid="activity" /> }))
import { getScraperStatus, getScraperSources } from '../services/api'

const status: ScraperStatus = { enabled: true, sec_edgar_enabled: false, open_corporates_enabled: false }
const source = (name: string): ScraperSource => ({ name, description: 'a source', enabled: true })

const admin: AuthUser = { id: 'a1', email: 'a@example.com', role: 'admin', email_verified: true } as AuthUser
const viewer: AuthUser = { id: 'v1', email: 'v@example.com', role: 'viewer', email_verified: true } as AuthUser

beforeEach(() => {
  vi.mocked(getScraperStatus).mockResolvedValue({ data: status } as never)
  vi.mocked(getScraperSources).mockResolvedValue({ data: [source('wikidata')] } as never)
})

describe('ScraperPanel (render)', () => {
  it('prompts to sign in when there is no user', () => {
    render(<ScraperPanel user={null} onLoadIntoGraph={vi.fn()} />)
    expect(screen.getByText(/Sign in as a contributor or admin/i)).toBeInTheDocument()
  })

  it('tells a non-contributor they lack access', () => {
    render(<ScraperPanel user={viewer} onLoadIntoGraph={vi.fn()} />)
    expect(screen.getByText(/Only contributors and admins can run/i)).toBeInTheDocument()
  })

  it('shows the scraper controls for an admin', async () => {
    render(<ScraperPanel user={admin} onLoadIntoGraph={vi.fn()} />)
    expect(screen.getByText('Scraper')).toBeInTheDocument()
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

  it('gives an admin everything', async () => {
    render(<ScraperPanel user={admin} onLoadIntoGraph={vi.fn()} />)
    expect(await screen.findByPlaceholderText(/Company name/i)).toBeInTheDocument()
    expect(dupButton()).toBeInTheDocument()
    expect(federation()).toBeInTheDocument()
    expect(activity()).toBeInTheDocument()
  })
})
