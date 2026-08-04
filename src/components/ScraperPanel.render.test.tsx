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
vi.mock('./FederationPanel', () => ({ default: () => null }))
vi.mock('./ScraperActivity', () => ({ default: () => null }))
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
    expect(screen.getByText(/Sign in as admin/i)).toBeInTheDocument()
  })

  it('tells a non-admin they lack access', () => {
    render(<ScraperPanel user={viewer} onLoadIntoGraph={vi.fn()} />)
    expect(screen.getByText(/Only admins can run the scraper/i)).toBeInTheDocument()
  })

  it('shows the scraper controls for an admin', async () => {
    render(<ScraperPanel user={admin} onLoadIntoGraph={vi.fn()} />)
    expect(screen.getByText('Scraper')).toBeInTheDocument()
    expect(screen.queryByText(/Only admins can run/i)).toBeNull()
    // The source toggle from getScraperSources renders.
    expect(await screen.findByText('Wikidata')).toBeInTheDocument()
  })
})
