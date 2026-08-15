import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NodePanel from './NodePanel'
import type { NodeData, FullProfile, Entity } from '../types'

// Mock the api + the children that do their own fetching, so the test isolates NodePanel's
// own load/refresh behaviour.
vi.mock('../services/api', () => ({
  getFullProfile: vi.fn(),
  getEntitySources: vi.fn(),
  getPersonProfile: vi.fn(),
  getPersonSources: vi.fn(),
}))
vi.mock('./NodeFlags', () => ({ default: () => null }))
vi.mock('./TimelinePanel', () => ({ default: () => null }))

import { getFullProfile, getEntitySources, getPersonProfile, getPersonSources } from '../services/api'

const mockProfile = vi.mocked(getFullProfile)
const mockSources = vi.mocked(getEntitySources)

const entityNode = (id: string, label: string): NodeData => ({ id, label, nodeType: 'entity', raw: {} as Entity })

const profile = (id: string, name: string): FullProfile => ({
  entity: { id, name, type: 'company', verified: false } as Entity,
  owners: [], subsidiaries: [], executives: [],
})

beforeEach(() => {
  mockProfile.mockReset()
  mockSources.mockReset()
  mockSources.mockResolvedValue({ data: [] } as never)
})

describe('NodePanel (render)', () => {
  it('loads and shows the selected entity profile', async () => {
    mockProfile.mockResolvedValue({ data: profile('e1', 'Acme Corp') } as Awaited<ReturnType<typeof getFullProfile>>)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)

    expect(await screen.findByText('Acme Corp')).toBeInTheDocument()
    expect(mockProfile).toHaveBeenCalledTimes(1)
    expect(mockProfile).toHaveBeenCalledWith('e1')
  })

  it('refetches the SAME node when refreshKey bumps (enrichment landed)', async () => {
    mockProfile.mockResolvedValue({ data: profile('e1', 'Sparse Co') } as Awaited<ReturnType<typeof getFullProfile>>)
    const node = entityNode('e1', 'Sparse Co')
    const { rerender } = render(<NodePanel node={node} refreshKey={0} />)
    await screen.findByText('Sparse Co')

    // A scrape enriched the company → App bumps refreshKey; the panel must refetch in place.
    mockProfile.mockResolvedValue({ data: profile('e1', 'Enriched Co') } as Awaited<ReturnType<typeof getFullProfile>>)
    rerender(<NodePanel node={node} refreshKey={1} />)

    // Silent refresh: no spinner flash, the previous content stays until the new data lands.
    expect(document.querySelector('.panel-spinner')).toBeNull()
    expect(await screen.findByText('Enriched Co')).toBeInTheDocument()
    expect(mockProfile).toHaveBeenCalledTimes(2)
  })

  it('does not refetch when neither node nor refreshKey changes', async () => {
    mockProfile.mockResolvedValue({ data: profile('e1', 'Acme Corp') } as Awaited<ReturnType<typeof getFullProfile>>)
    const node = entityNode('e1', 'Acme Corp')
    const { rerender } = render(<NodePanel node={node} refreshKey={3} />)
    await screen.findByText('Acme Corp')

    rerender(<NodePanel node={node} refreshKey={3} />)   // unrelated re-render
    await waitFor(() => expect(mockProfile).toHaveBeenCalledTimes(1))
  })

  it('fetches the new profile when a different node is selected', async () => {
    mockProfile.mockResolvedValue({ data: profile('e1', 'First Co') } as Awaited<ReturnType<typeof getFullProfile>>)
    const { rerender } = render(<NodePanel node={entityNode('e1', 'First Co')} refreshKey={0} />)
    await screen.findByText('First Co')

    mockProfile.mockResolvedValue({ data: profile('e2', 'Second Co') } as Awaited<ReturnType<typeof getFullProfile>>)
    rerender(<NodePanel node={entityNode('e2', 'Second Co')} refreshKey={0} />)

    expect(await screen.findByText('Second Co')).toBeInTheDocument()
    expect(mockProfile).toHaveBeenCalledWith('e2')
  })
})

// The profile used to carry a `headquarters` Location node, preferred over these
// fields with them as a fallback. The node is gone and the entity's own values
// are the only path, so they had better actually render.

describe('NodePanel HQ from the entity itself', () => {
  const withHq = (over: Partial<Entity>): FullProfile => ({
    entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false, ...over } as Entity,
    owners: [], subsidiaries: [], executives: [],
  })

  const show = async (over: Partial<Entity>) => {
    mockProfile.mockResolvedValue({ data: withHq(over) } as Awaited<ReturnType<typeof getFullProfile>>)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)
    await screen.findByText('Acme Corp')
  }

  it('shows the city and country from the entity', async () => {
    await show({ hq_city: 'Vienna', hq_country: 'AT' })
    expect(screen.getByText(/Vienna/)).toBeInTheDocument()
  })

  it('shows the full address from hq_address', async () => {
    await show({ hq_city: 'Vienna', hq_country: 'AT', hq_address: '1 Ringstrasse, 1010 Vienna, AT' })
    expect(screen.getByText('1 Ringstrasse, 1010 Vienna, AT')).toBeInTheDocument()
  })

  it('renders without an address at all', async () => {
    // Most entities have no HQ recorded; the panel must not break on it.
    await show({})
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })
})

// ── Type markers in the relationship lists ────────────────────────────────────
//
// The graph tells a fund from a holding from a person by colour; the panel's
// lists used to render every row as a bare name. These pin the marker's colour
// against the shared palette, and its shape — round for a person — which is what
// carries the distinction for anyone who cannot separate the person-green from
// the government-red.

describe('NodePanel type markers', () => {
  const withOwners = (owners: unknown[]): FullProfile => ({
    entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false } as Entity,
    owners: owners as never, subsidiaries: [], executives: [],
  })

  const show = async (owners: unknown[]) => {
    mockProfile.mockResolvedValue({ data: withOwners(owners) } as Awaited<ReturnType<typeof getFullProfile>>)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)
    await screen.findByText('Acme Corp')
  }

  const owner = (o: Record<string, unknown>) => ({ owner: o, relationship: {} })

  it('marks a person row with the person colour, round', async () => {
    await show([owner({ id: 'p1', full_name: 'Satya Nadella' })])
    const marker = screen.getByTestId('type-marker')
    expect(marker).toHaveStyle({ background: '#27AE60' })
    expect(marker.className).toContain('rel-item__marker--person')
  })

  it('marks a company row with the company colour, not round', async () => {
    await show([owner({ id: 'c1', name: 'BlackRock Inc', type: 'company' })])
    const marker = screen.getByTestId('type-marker')
    expect(marker).toHaveStyle({ background: '#4A90D9' })
    expect(marker.className).not.toContain('rel-item__marker--person')
  })

  it('colours a fund distinctly', async () => {
    // The type class ScraperPanel and MapPanel used to miss entirely — their
    // three-entry palettes rendered anything beyond company/brand/holding grey.
    await show([owner({ id: 'f1', name: 'Norges Bank', type: 'fund' })])
    expect(screen.getByTestId('type-marker')).toHaveStyle({ background: '#B7950B' })
  })

  it('gives each marker a readable label, not colour alone', async () => {
    await show([owner({ id: 'f1', name: 'Norges Bank', type: 'fund' })])
    expect(screen.getByTestId('type-marker')).toHaveAttribute('title', 'Fund')
  })

  it('distinguishes a person from a company in the same list', async () => {
    await show([
      owner({ id: 'p1', full_name: 'Satya Nadella' }),
      owner({ id: 'c1', name: 'BlackRock Inc', type: 'company' }),
    ])
    const markers = screen.getAllByTestId('type-marker')
    expect(markers).toHaveLength(2)
    expect(markers[0].className).not.toBe(markers[1].className)
  })
})

// ── Long subsidiary lists ─────────────────────────────────────────────────────
//
// Barclays has 118 subsidiaries and Unilever 112 in the test subset alone, all
// rendered as one flat unlabelled list with no count. Grouping by the structural
// relationship the data records makes them readable; the count comes from the
// server because the section is capped and an array length is a lower bound.

describe('NodePanel subsidiary grouping', () => {
  const sub = (id: string, doi?: string) => ({
    entity: { id, name: `Sub ${id}`, type: 'company' },
    relationship: doi ? { direct_or_indirect: doi } : {},
  })

  const show = async (subsidiaries: unknown[], counts?: Record<string, number>) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false } as Entity,
      owners: [], executives: [], subsidiaries, ...(counts ? { counts } : {}),
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)
    await screen.findByText('Acme Corp')
  }

  const many = (n: number, doi: string) =>
    Array.from({ length: n }, (_, i) => sub(`${doi}${i}`, doi))

  it('shows the true count from the server, not the number of rows', async () => {
    // The list is capped at 200; the count must survive that.
    await show(many(3, 'direct'), { subsidiaries: 118 })
    expect(screen.getByText('118')).toBeInTheDocument()
  })

  it('sets the indirect holdings apart and leaves the rest unlabelled', async () => {
    // A subsidiary listed under a company is a holding of that company; only
    // "held indirectly" says something the list does not already say.
    await show([...many(10, 'direct'), ...many(10, 'indirect')])
    expect(screen.getByText(/Held indirectly/i)).toBeInTheDocument()
    expect(screen.queryByText(/Direct holdings/i)).toBeNull()
  })

  it('shows the direct holdings immediately, without expanding anything', async () => {
    await show([...many(10, 'direct'), ...many(10, 'indirect')])
    expect(screen.getByText('Sub direct0')).toBeInTheDocument()   // in the main list
    expect(screen.queryByText('Sub indirect0')).toBeNull()        // behind the heading
  })

  it('expands the indirect group on request', async () => {
    await show([...many(10, 'direct'), ...many(10, 'indirect')])
    await userEvent.click(screen.getByText(/Held indirectly/i))
    expect(screen.getByText('Sub indirect0')).toBeInTheDocument()
  })

  it('leaves a short list flat', async () => {
    // Two subsidiaries do not need a heading.
    await show([sub('a', 'direct'), sub('b', 'indirect')])
    expect(screen.queryByText(/Held indirectly/i)).toBeNull()
    expect(screen.getByText('Sub a')).toBeInTheDocument()
    expect(screen.getByText('Sub b')).toBeInTheDocument()
  })

  it('leaves a long list with nothing indirect flat', async () => {
    await show(many(20, 'direct'))
    expect(screen.queryByText(/Held indirectly/i)).toBeNull()
    expect(screen.getByText('Sub direct0')).toBeInTheDocument()
  })

  it('leaves a wholly indirect list flat rather than retitling the section', async () => {
    // With nothing left outside it, the heading would just rename "Subsidiaries"
    // — and hide every row behind a collapsed group.
    await show(many(20, 'indirect'))
    expect(screen.queryByText(/Held indirectly/i)).toBeNull()
    expect(screen.getByText('Sub indirect0')).toBeInTheDocument()
  })

  it('keeps relationships the source never stated visible in the main list', async () => {
    // Wikidata and SEC never record the distinction. They belong in the list,
    // where nothing claims they are direct — a "Direct holdings" heading above
    // them would have.
    await show([...many(10, 'direct'), sub('u1'), sub('u2'), ...many(3, 'indirect')])
    expect(screen.getByText('Sub u1')).toBeInTheDocument()
    expect(screen.getByText('Sub u2')).toBeInTheDocument()
  })
})

describe('where a company is registered', () => {
  const withEntity = async (extra: Partial<Entity>) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false, ...extra } as Entity,
      owners: [], subsidiaries: [], executives: [],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)
    await screen.findByText('Acme Corp')
  }

  it('names the subdivision a company is registered in', async () => {
    // The country row says "United States", which is true of 47 companies here
    // and interesting about none of them. Delaware is the fact.
    await withEntity({ country: 'US', jurisdiction_code: 'US-DE' })
    expect(screen.getByText('Registered in')).toBeInTheDocument()
    expect(screen.getByText('Delaware')).toBeInTheDocument()
  })

  it('says nothing when the source stated no subdivision', async () => {
    // Sparse by nature — about 1% of GLEIF records carry one. An empty or
    // "unknown" row on every other company would be noise.
    await withEntity({ country: 'GB' })
    expect(screen.queryByText('Registered in')).toBeNull()
  })

  it('ignores a value that is not a subdivision code', async () => {
    await withEntity({ country: 'US', jurisdiction_code: 'US' })
    expect(screen.queryByText('Registered in')).toBeNull()
  })
})

describe('a person: age while living, dates once dead', () => {
  const person = (extra: Record<string, unknown>) => ({
    id: 'p1', first_name: 'A', last_name: 'B', full_name: 'A B', verified: false, ...extra,
  })

  const show = async (extra: Record<string, unknown>) => {
    mockProfile.mockResolvedValue({ data: {} } as never)
    vi.mocked(getPersonProfile).mockResolvedValue({ data: { person: person(extra), positions: [], holdings: [] } } as never)
    vi.mocked(getPersonSources).mockResolvedValue({ data: [] } as never)
    render(<NodePanel node={{ id: 'p1', label: 'A B', nodeType: 'person',
                              raw: person(extra) as never }} refreshKey={0} />)
    await screen.findByText('A B')
  }

  const text = () => document.querySelector('.panel-meta')?.textContent ?? ''

  it('shows a living person an age and no date at all', async () => {
    // The point of the change: the date is still stored and still returned by the
    // API, but it is not what the panel puts in front of a reader.
    await show({ birth_date: '1971-07-14' })
    expect(text()).toMatch(/Age/)
    expect(text()).toMatch(/\d+ years/)
    expect(text()).not.toMatch(/1971/)
  })

  it('shows a deceased person both dates and no age', async () => {
    // Their dates bound the period in which they could have held control, which
    // is what an ownership record is read for. An age cannot answer that.
    await show({ birth_date: '1917-08-04', death_date: '2015-05-31' })
    expect(text()).toMatch(/Born/)
    expect(text()).toMatch(/1917/)
    expect(text()).toMatch(/2015/)
    expect(text()).not.toMatch(/Age/)
  })

  it('works from a month and year, which is all Companies House publishes', async () => {
    await show({ birth_date: '1951-08' })
    expect(text()).toMatch(/\d+ years/)
    expect(text()).not.toMatch(/1951/)
  })

  it('shows neither row when there is no birth date', async () => {
    await show({ nationality: 'AT' })
    expect(text()).not.toMatch(/Age/)
    expect(text()).not.toMatch(/Born/)
  })
})

describe('the \u22ee beside the name', () => {
  const openEntity = async (over: Record<string, unknown> = {}) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false } as Entity,
      owners: [], subsidiaries: [], executives: [],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} {...over} />)
    await screen.findByText('Acme Corp')
  }

  it('offers share and report', async () => {
    await openEntity({ onShare: vi.fn() })
    await userEvent.click(screen.getByRole('button', { name: /Actions/i }))
    expect(screen.getByText('Share')).toBeInTheDocument()
    expect(screen.getByText('Report')).toBeInTheDocument()
  })

  it('shares through the handler App gave it', async () => {
    const onShare = vi.fn()
    await openEntity({ onShare })
    await userEvent.click(screen.getByRole('button', { name: /Actions/i }))
    await userEvent.click(screen.getByText('Share'))
    expect(onShare).toHaveBeenCalledTimes(1)
  })

  it('omits share when there is no handler, rather than showing a dead item', async () => {
    await openEntity()
    await userEvent.click(screen.getByRole('button', { name: /Actions/i }))
    expect(screen.queryByText('Share')).toBeNull()
    expect(screen.getByText('Report')).toBeInTheDocument()
  })

  it('opens the report dialog', async () => {
    await openEntity({ onShare: vi.fn() })
    await userEvent.click(screen.getByRole('button', { name: /Actions/i }))
    await userEvent.click(screen.getByText('Report'))
    expect(await screen.findByText('Report a problem')).toBeInTheDocument()
    // …and it is about this company: the subtitle names it.
    expect(screen.getByText(/Tell us what looks wrong about Acme Corp/)).toBeInTheDocument()
  })
})

describe('a relationship row', () => {
  const withSubsidiary = async (sourceUrl?: string | null) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false } as Entity,
      owners: [], executives: [],
      subsidiaries: [{
        entity: { id: 'e2', name: 'Beta Ltd', type: 'company', verified: false } as Entity,
        relationship: { ownership_type: 'full', stake_percent: 100, source_url: sourceUrl } as never,
      }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)
    return await screen.findByText('Beta Ltd')
  }

  const rowOf = (el: HTMLElement) => el.closest('.rel-row') as HTMLElement

  it('opens a menu on right-click', async () => {
    const row = rowOf(await withSubsidiary('https://search.gleif.org/#/record/X'))
    fireEvent.contextMenu(row)
    expect(screen.getByText(/Report relationship/i)).toBeInTheDocument()
    expect(screen.getByText(/View source/i)).toBeInTheDocument()
  })

  it('offers no source when the relationship has none', async () => {
    // Omitted rather than disabled: a dead item invites a click that does nothing.
    const row = rowOf(await withSubsidiary(null))
    fireEvent.contextMenu(row)
    expect(screen.getByText(/Report relationship/i)).toBeInTheDocument()
    expect(screen.queryByText(/View source/i)).toBeNull()
  })

  it('opens that relationship\'s record, not the company\'s', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const row = rowOf(await withSubsidiary('https://www.sec.gov/Archives/edgar/data/1/x-index.htm'))
    fireEvent.contextMenu(row)
    await userEvent.click(screen.getByText(/View source/i))
    expect(open).toHaveBeenCalledWith(
      'https://www.sec.gov/Archives/edgar/data/1/x-index.htm', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('has no flag icon any more', async () => {
    const row = rowOf(await withSubsidiary('https://x.test/1'))
    expect(row.querySelector('.edge-report-btn')).toBeNull()
  })
})

