import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react'
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
  const withSubsidiary = async (sourceUrl?: string | null,
                                source?: { id: string; name: string } | null) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false } as Entity,
      owners: [], executives: [],
      subsidiaries: [{
        entity: { id: 'e2', name: 'Beta Ltd', type: 'company', verified: false } as Entity,
        relationship: { ownership_type: 'full', stake_percent: 100, source_url: sourceUrl,
                        source_id: source?.id } as never,
      }],
    } } as never)
    mockSources.mockResolvedValue({ data: source ? [{ ...source, credibility_score: 98,
                                                      type: 'official' }] : [] } as never)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)
    return await screen.findByText('Beta Ltd')
  }

  const rowOf = (el: HTMLElement) => el.closest('.rel-row') as HTMLElement

  it('opens a menu on right-click', async () => {
    const row = rowOf(await withSubsidiary('https://search.gleif.org/#/record/X'))
    fireEvent.contextMenu(row)
    expect(screen.getByText(/Report relationship/i)).toBeInTheDocument()
    expect(screen.getByText('search.gleif.org')).toBeInTheDocument()
  })

  it('offers no source when the relationship has none', async () => {
    // Omitted rather than disabled: a dead item invites a click that does nothing.
    const row = rowOf(await withSubsidiary(null))
    fireEvent.contextMenu(row)
    expect(screen.getByText(/Report relationship/i)).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /gleif|sec\.gov|View source/i })).toBeNull()
  })

  it('opens that relationship\'s record, not the company\'s', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const row = rowOf(await withSubsidiary('https://www.sec.gov/Archives/edgar/data/1/x-index.htm'))
    fireEvent.contextMenu(row)
    await userEvent.click(screen.getByText('sec.gov'))
    expect(open).toHaveBeenCalledWith(
      'https://www.sec.gov/Archives/edgar/data/1/x-index.htm', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  describe('what the menu says, and in what order', () => {
    it('names the source that asserted the relationship', async () => {
      const row = rowOf(await withSubsidiary('https://www.sec.gov/x.htm',
                                             { id: 'src-1', name: 'SEC EDGAR' }))
      fireEvent.contextMenu(row)
      expect(screen.getByText('SEC EDGAR')).toBeInTheDocument()
    })

    it('reads source, then link, then report', async () => {
      // The order you would read it in: where did this come from, let me see it,
      // this is wrong.
      const row = rowOf(await withSubsidiary('https://www.sec.gov/x.htm',
                                             { id: 'src-1', name: 'SEC EDGAR' }))
      fireEvent.contextMenu(row)
      const menu = document.querySelector('.action-menu__list') as HTMLElement
      const lines = (menu.textContent ?? '')
      expect(lines.indexOf('SEC EDGAR')).toBeLessThan(lines.indexOf('sec.gov'))
      expect(lines.indexOf('sec.gov')).toBeLessThan(lines.indexOf('Report'))
    })

    it('does not make the source name clickable', async () => {
      // It is context, not an action. A name that looks like a button and does
      // nothing is worse than a caption.
      const row = rowOf(await withSubsidiary('https://www.sec.gov/x.htm',
                                             { id: 'src-1', name: 'SEC EDGAR' }))
      fireEvent.contextMenu(row)
      expect(screen.queryByRole('menuitem', { name: 'SEC EDGAR' })).toBeNull()
      expect(document.querySelector('.action-menu__header')?.textContent).toBe('SEC EDGAR')
    })

    it('still shows the link when the source is not named', async () => {
      // An edge can cite a URL from a source the node list does not carry.
      const row = rowOf(await withSubsidiary('https://www.sec.gov/x.htm'))
      fireEvent.contextMenu(row)
      expect(document.querySelector('.action-menu__header')).toBeNull()
      expect(screen.getByText('sec.gov')).toBeInTheDocument()
    })

    it('names the source on an owner row as well as a subsidiary one', async () => {
      // Seven call sites pass this through by hand. Testing one of them proves
      // the menu works, not that the wiring is there — the owners row is the one
      // the bug was reported against.
      mockProfile.mockResolvedValue({ data: {
        entity: { id: 'e1', name: 'Alphabet Inc.', type: 'company', verified: false } as Entity,
        subsidiaries: [], executives: [],
        owners: [{
          owner: { id: 'p1', full_name: 'Larry Page' },
          relationship: { stake_percent: 6.12, ownership_type: 'minority',
                          source_url: 'https://www.wikidata.org/wiki/Q20800404',
                          source_id: 'src-w' },
        }],
      } } as never)
      mockSources.mockResolvedValue({ data: [{ id: 'src-w', name: 'Wikidata',
                                               credibility_score: 80, type: 'community' }] } as never)
      render(<NodePanel node={entityNode('e1', 'Alphabet Inc.')} refreshKey={0} />)
      const row = rowOf(await screen.findByText('Larry Page'))
      fireEvent.contextMenu(row)

      expect(document.querySelector('.action-menu__header')?.textContent).toBe('Wikidata')
      expect(screen.getByText('wikidata.org')).toBeInTheDocument()
    })

    it('names the source even when there is no record to open', async () => {
      const row = rowOf(await withSubsidiary(null, { id: 'src-1', name: 'Wikidata' }))
      fireEvent.contextMenu(row)
      expect(screen.getByText('Wikidata')).toBeInTheDocument()
      expect(screen.getByText(/Report relationship/i)).toBeInTheDocument()
    })
  })

  it('has no flag icon any more', async () => {
    const row = rowOf(await withSubsidiary('https://x.test/1'))
    expect(row.querySelector('.edge-report-btn')).toBeNull()
  })
})

/**
 * Refresh from sources, on a PERSON.
 *
 * People can be scraped now — their roles and holdings come from Wikidata's
 * reverse links — so the person panel needs the control the company panel always
 * had. It was missing because until recently there was nothing behind it.
 */
describe('refreshing a person', () => {
  const personNode: NodeData = {
    id: 'p1', label: 'Larry Page', nodeType: 'person',
    raw: { id: 'p1', full_name: 'Larry Page' } as never,
  }

  beforeEach(() => {
    vi.mocked(getPersonProfile).mockResolvedValue(
      { data: { person: { id: 'p1', full_name: 'Larry Page' }, positions: [], holdings: [] } } as never)
    vi.mocked(getPersonSources).mockResolvedValue({ data: [] } as never)
  })

  it('offers the refresh button when the caller can scrape', async () => {
    const onReScrape = vi.fn()
    render(<NodePanel node={personNode} onReScrape={onReScrape} />)

    await userEvent.click(await screen.findByRole('button', { name: /refresh/i }))
    expect(onReScrape).toHaveBeenCalledWith(personNode)
  })

  it('offers nothing when the caller cannot scrape', async () => {
    render(<NodePanel node={personNode} />)
    await screen.findByText('Larry Page')
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull()
  })
})

/**
 * The timeline tab on a person.
 *
 * Gated deliberately: about half the people in the graph have no dated position
 * at all, and a tab that always opens onto "no date recorded" is worse than no
 * tab. What decides is the data, not the node type.
 */
describe('the person timeline tab', () => {
  const personNode: NodeData = {
    id: 'p1', label: 'Steve Jobs', nodeType: 'person',
    raw: { id: 'p1', full_name: 'Steve Jobs' } as never,
  }

  const withPositions = (positions: unknown[]) => {
    vi.mocked(getPersonProfile).mockResolvedValue(
      { data: { person: { id: 'p1', full_name: 'Steve Jobs' }, positions, holdings: [] } } as never)
    vi.mocked(getPersonSources).mockResolvedValue({ data: [] } as never)
  }

  it('appears when the person has a dated position', async () => {
    withPositions([{ entity: { id: 'e1', name: 'Apple Inc.' },
                     role: { role: 'CEO', since: '1997-09-01', until: '2011-08-23' } }])
    render(<NodePanel node={personNode} />)
    expect(await screen.findByRole('button', { name: /timeline/i })).toBeInTheDocument()
  })

  it('stays away when nothing is dated', async () => {
    withPositions([{ entity: { id: 'e1', name: 'Google' }, role: { role: 'Founder' } }])
    render(<NodePanel node={personNode} />)
    await screen.findByText('Google')                 // the overview rendered
    expect(screen.queryByRole('button', { name: /timeline/i })).toBeNull()
  })

  it('switches the body to the timeline', async () => {
    withPositions([{ entity: { id: 'e1', name: 'Apple Inc.' },
                     role: { role: 'CEO', since: '1997-09-01', until: '2011-08-23' } }])
    render(<NodePanel node={personNode} />)
    await userEvent.click(await screen.findByRole('button', { name: /timeline/i }))
    expect(screen.getByText('1997')).toBeInTheDocument()
    expect(screen.getByText(/until 2011/i)).toBeInTheDocument()
  })

  it('swaps the whole body, the way a company panel does', async () => {
    // Tabs at the top and one view at a time. Leaving the bio above the timeline
    // made the person panel behave unlike every other panel in the app.
    withPositions([{ entity: { id: 'e1', name: 'Apple Inc.' },
                     role: { role: 'CEO', since: '1997-09-01', until: '2011-08-23' } }])
    render(<NodePanel node={personNode} />)
    await userEvent.click(await screen.findByRole('button', { name: /timeline/i }))

    expect(screen.queryByText('Steve Jobs')).toBeNull()      // bio is not underneath
    expect(screen.getByText('1997')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /overview/i }))
    expect(screen.getByText('Steve Jobs')).toBeInTheDocument()
  })

  it('puts the tab bar above the padded body, not inside it', async () => {
    // The company panel nests them this way, and the nesting is what produces
    // the spacing: inside `.panel-body` the bar is inset by that padding and
    // sits flush against the avatar beneath it.
    withPositions([{ entity: { id: 'e1', name: 'Apple Inc.' },
                     role: { role: 'CEO', since: '1997-09-01', until: '2011-08-23' } }])
    const { container } = render(<NodePanel node={personNode} />)
    await screen.findByRole('button', { name: /timeline/i })

    const tabs = container.querySelector('.panel-tabs') as HTMLElement
    const body = container.querySelector('.panel-body') as HTMLElement
    expect(body.contains(tabs)).toBe(false)
    expect(tabs.nextElementSibling).toBe(body)
  })

  it('nests them the same way on the timeline view', async () => {
    withPositions([{ entity: { id: 'e1', name: 'Apple Inc.' },
                     role: { role: 'CEO', since: '1997-09-01', until: '2011-08-23' } }])
    const { container } = render(<NodePanel node={personNode} />)
    await userEvent.click(await screen.findByRole('button', { name: /timeline/i }))

    const tabs = container.querySelector('.panel-tabs') as HTMLElement
    const body = container.querySelector('.panel-body') as HTMLElement
    expect(body.contains(tabs)).toBe(false)
    expect(tabs.nextElementSibling).toBe(body)
  })
})

/**
 * A person's history reaches the panel now — the profile no longer drops roles
 * that have ended. The two views want different slices of it: the overview says
 * what somebody does, the timeline what they have done.
 */
describe('current positions versus the whole career', () => {
  const personNode: NodeData = {
    id: 'p1', label: 'Steve Jobs', nodeType: 'person',
    raw: { id: 'p1', full_name: 'Steve Jobs' } as never,
  }

  const jobs = () => {
    vi.mocked(getPersonProfile).mockResolvedValue({ data: {
      person: { id: 'p1', full_name: 'Steve Jobs' },
      positions: [
        { entity: { id: 'e1', name: 'Apple Inc.' },
          role: { role: 'Board Member', since: '1977-03-01', until: '1985-09-01' } },
        { entity: { id: 'e1', name: 'Apple Inc.' },
          role: { role: 'Board Member', since: '1997-01-01', until: '2011-10-05' } },
        { entity: { id: 'e2', name: 'NeXT' }, role: { role: 'Founder' } },
      ],
      holdings: [],
    } } as never)
    vi.mocked(getPersonSources).mockResolvedValue({ data: [] } as never)
  }

  const section = (title: RegExp) =>
    screen.getByText(title).closest('.panel-section') as HTMLElement

  it('lists a current role under Positions', async () => {
    jobs()
    render(<NodePanel node={personNode} />)
    await screen.findByText('NeXT')
    expect(within(section(/^Positions$/)).getByText('NeXT')).toBeInTheDocument()
  })

  it('does not mix a finished role in with the current ones', async () => {
    // Undated and side by side, the two board spells looked like the duplicate
    // bug they are not.
    jobs()
    render(<NodePanel node={personNode} />)
    await screen.findByText('NeXT')
    expect(within(section(/^Positions$/)).queryByText('Apple Inc.')).toBeNull()
  })

  it('lists both finished spells under Former positions', async () => {
    jobs()
    render(<NodePanel node={personNode} />)
    await screen.findByText(/former positions/i)
    const former = section(/former positions/i)
    expect(within(former).getAllByText('Apple Inc.')).toHaveLength(2)
  })

  it('dates each finished spell, so the two are told apart', async () => {
    // Without the years they are two identical rows, which is exactly what the
    // duplicate-role bug looked like.
    jobs()
    render(<NodePanel node={personNode} />)
    const former = await screen.findByText(/former positions/i)
      .then(() => section(/former positions/i))
    expect(within(former).getByText(/1977\s*.\s*1985/)).toBeInTheDocument()
    expect(within(former).getByText(/1997\s*.\s*2011/)).toBeInTheDocument()
  })

  it('puts the most recent spell first', async () => {
    jobs()
    render(<NodePanel node={personNode} />)
    await screen.findByText(/former positions/i)
    const years = within(section(/former positions/i))
      .getAllByText(/\d{4}/).map(e => e.textContent)
    expect(years[0]).toMatch(/1997/)
  })

  it('shows no Former positions section when nothing has ended', async () => {
    vi.mocked(getPersonProfile).mockResolvedValue({ data: {
      person: { id: 'p1', full_name: 'Steve Jobs' },
      positions: [{ entity: { id: 'e2', name: 'NeXT' }, role: { role: 'Founder' } }],
      holdings: [],
    } } as never)
    vi.mocked(getPersonSources).mockResolvedValue({ data: [] } as never)
    render(<NodePanel node={personNode} />)
    await screen.findByText('NeXT')
    expect(screen.queryByText(/former positions/i)).toBeNull()
  })

  it('states an end year alone when the start was never recorded', async () => {
    // Reverse lookups supply plenty of these. "– 2011" would read as a typo.
    vi.mocked(getPersonProfile).mockResolvedValue({ data: {
      person: { id: 'p1', full_name: 'Steve Jobs' },
      positions: [{ entity: { id: 'e1', name: 'Apple Inc.' },
                    role: { role: 'CEO', until: '2011-08-23' } }],
      holdings: [],
    } } as never)
    vi.mocked(getPersonSources).mockResolvedValue({ data: [] } as never)
    render(<NodePanel node={personNode} />)
    expect(await screen.findByText(/until 2011/i)).toBeInTheDocument()
  })

  it('the timeline shows both spells on the same board', async () => {
    // The whole point: he joined in 1977, left in 1985, came back in 1997.
    jobs()
    render(<NodePanel node={personNode} />)
    await userEvent.click(await screen.findByRole('button', { name: /timeline/i }))

    expect(screen.getByText('1977')).toBeInTheDocument()
    expect(screen.getByText('1997')).toBeInTheDocument()
    expect(screen.getAllByText('Board Member')).toHaveLength(2)
  })
})

/**
 * Why a company reports no parent, on the panel.
 *
 * The one thing these guard above all: this is NOT a statement about owners.
 * GLEIF asks who consolidates the accounts; 53 of the 63 companies carrying a
 * reason on the dev graph also have shareholders listed, Apple with 37 of them.
 * A design that hid the section when owners existed, or that worded it as "no
 * owners", would be wrong for the large majority of the cases it exists for.
 *
 * It lives inside the collapsible "Details" section, beside the other GLEIF facts,
 * so every positive assertion here has to open that first — `CollapsibleSection`
 * unmounts its children rather than hiding them.
 */
describe('why a company reports no parent', () => {
  /** Render, then open Details — the statement lives inside it and
   *  `CollapsibleSection` unmounts its children rather than hiding them. */
  const withEntity = async (extra: Partial<Entity>, owners: unknown[] = []) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false, ...extra } as Entity,
      owners, subsidiaries: [], executives: [],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)
    await screen.findByText('Acme Corp')
    const toggle = screen.queryByText(/^Details$/)
    if (toggle) await userEvent.click(toggle)
  }

  const owner = (name: string, pct: number) =>
    ({ owner: { id: name, name, type: 'company' }, relationship: { stake_percent: pct } })

  const detailsSection = () =>
    screen.getByText(/^Details$/).closest('.panel-section') as HTMLElement

  it('shows the reason even when the company has shareholders', async () => {
    // The Apple case, which is the majority case.
    await withEntity({ no_direct_parent_reason: 'NATURAL_PERSONS' },
                     [owner('Vanguard Group', 8.3), owner('BlackRock', 6.7)])
    expect(screen.getByText('Vanguard Group')).toBeInTheDocument()
    expect(screen.getByText('Parent company')).toBeInTheDocument()
    expect(screen.getByText(/controlled by natural persons/)).toBeInTheDocument()
  })

  it('never says the company has no owners', async () => {
    await withEntity({ no_direct_parent_reason: 'NATURAL_PERSONS' }, [owner('Vanguard Group', 8.3)])
    expect(screen.queryByText(/no owners/i)).toBeNull()
    expect(screen.queryByText(/no shareholders/i)).toBeNull()
  })

  it('lives inside Details, not in the Owned by section', async () => {
    await withEntity({ no_direct_parent_reason: 'NATURAL_PERSONS' }, [owner('Vanguard Group', 8.3)])
    expect(within(detailsSection()).getByText(/controlled by natural persons/)).toBeInTheDocument()
    const ownedBy = screen.getByText('Owned by').closest('.panel-section') as HTMLElement
    expect(within(ownedBy).queryByText(/controlled by natural persons/)).toBeNull()
  })

  it('spans the panel rather than sitting in the value column', async () => {
    // A reason runs to a line and a half. Inside `.panel-meta` it would be squeezed
    // into the value column beside a 70px label — the whole point of the move.
    await withEntity({ no_direct_parent_reason: 'NATURAL_PERSONS', legal_form: 'Corporation' })
    const meta = detailsSection().querySelector('.panel-meta') as HTMLElement
    expect(within(meta).getByText('Corporation')).toBeInTheDocument()   // the table is there
    expect(within(meta).queryByText(/controlled by natural persons/)).toBeNull()
  })

  it('stays behind the Details toggle until it is opened', async () => {
    // The cost of the move, asserted rather than assumed: CollapsibleSection
    // unmounts its children, so nothing about the parent is in the DOM until asked.
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Acme Corp', type: 'company', verified: false,
                no_direct_parent_reason: 'NATURAL_PERSONS' } as Entity,
      owners: [], subsidiaries: [], executives: [],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Acme Corp')} refreshKey={0} />)
    await screen.findByText('Acme Corp')

    expect(screen.queryByText(/controlled by natural persons/)).toBeNull()
    await userEvent.click(screen.getByText(/^Details$/))
    expect(screen.getByText(/controlled by natural persons/)).toBeInTheDocument()
  })

  it('opens a Details section for a company that has no other detail fields', async () => {
    // Every one of these fixtures is that shape: no legal form, no registration, no
    // address. Details used to render nothing at all for them, which would have
    // swallowed the statement entirely.
    await withEntity({ no_direct_parent_reason: 'NO_KNOWN_PERSON' })
    expect(screen.getByText('Parent company')).toBeInTheDocument()
  })

  it('says the shareholders are a separate question when there are some', async () => {
    await withEntity({ no_direct_parent_reason: 'NATURAL_PERSONS' }, [owner('Vanguard Group', 8.3)])
    expect(screen.getByText(/shareholders listed on this panel are a separate question/)).toBeInTheDocument()
  })

  it('drops that sentence when there are none', async () => {
    await withEntity({ no_direct_parent_reason: 'NO_KNOWN_PERSON' })
    expect(screen.getByText(/who consolidates this company's accounts/)).toBeInTheDocument()
    expect(screen.queryByText(/listed on this panel/)).toBeNull()
  })

  it('still shows the section when the company has no owners at all', async () => {
    // Fevertree: no owner edges, NO_KNOWN_PERSON. The "Owned by" heading is absent,
    // so a footnote there would have had nothing to attach to.
    await withEntity({ no_direct_parent_reason: 'NO_KNOWN_PERSON' })
    expect(screen.getByText('Parent company')).toBeInTheDocument()
    expect(screen.queryByText('Owned by')).toBeNull()
  })

  it('says nothing at all when the company filed no exception', async () => {
    // And does not conjure an empty Details section to say it in: the guard widened
    // to include the statement, not to always render.
    await withEntity({}, [owner('Vanguard Group', 8.3)])
    expect(screen.queryByText('Parent company')).toBeNull()
    expect(screen.queryByText(/^Details$/)).toBeNull()
  })

  it('states both answers when they differ', async () => {
    await withEntity({ no_direct_parent_reason: 'NO_LEI',
                       no_ultimate_parent_reason: 'NON_CONSOLIDATING' })
    expect(screen.getByText(/Reports no direct parent/)).toBeInTheDocument()
    expect(screen.getByText(/Reports no ultimate parent/)).toBeInTheDocument()
  })

  it('states one answer when both questions got the same one', async () => {
    await withEntity({ no_direct_parent_reason: 'NATURAL_PERSONS',
                       no_ultimate_parent_reason: 'NATURAL_PERSONS' })
    expect(screen.getByText(/Reports no direct or ultimate parent/)).toBeInTheDocument()
    expect(screen.queryByText(/Reports no direct parent/)).toBeNull()
  })

  it('reads a code it has no copy for, rather than leaking a key', async () => {
    await withEntity({ no_direct_parent_reason: 'WHOLLY_NEW_REASON' })
    expect(screen.getByText(/wholly new reason/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('parentReason.')
  })

  it('links a reference that is a real URL', async () => {
    await withEntity({ no_direct_parent_reason: 'NO_LEI',
                       no_direct_parent_reason_reference: 'https://example.test/register/1' })
    const link = screen.getByRole('link', { name: /view reference/i })
    expect(link).toHaveAttribute('href', 'https://example.test/register/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('shows a reference that is not a URL as plain text', async () => {
    await withEntity({ no_direct_parent_reason: 'NO_LEI',
                       no_direct_parent_reason_reference: 'Companies House filing 12345' })
    expect(screen.getByText(/Companies House filing 12345/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /view reference/i })).toBeNull()
  })

  it('describes NO_LEI as a refusal, not an absence', async () => {
    // GLEIF's definition is "The parent does not consent to have an LEI" — the
    // code name invites the other reading and our own docs made that mistake.
    await withEntity({ no_direct_parent_reason: 'NO_LEI' })
    expect(screen.getByText(/does not consent to having an LEI/)).toBeInTheDocument()
  })
})


describe('the trust cue on an owner row', () => {
  const withOwner = async (relationship: Record<string, unknown>) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Alphabet Inc.', type: 'company', verified: false } as Entity,
      subsidiaries: [], executives: [],
      owners: [{ owner: { id: 'p1', full_name: 'Sergey Brin' },
                 relationship: { stake_percent: 6.16, ownership_type: 'minority',
                                 ...relationship } }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Alphabet Inc.')} refreshKey={0} />)
    await screen.findByText('Sergey Brin')
  }

  it('marks a corroborated holding with its count', async () => {
    await withOwner({ corroborations: 2, asserted_by: ['SEC EDGAR', 'Wikidata'] })
    expect(screen.getByText(/✓\s*2/)).toBeInTheDocument()
  })

  it('marks a Wikidata-only holding as community', async () => {
    await withOwner({ corroborations: 1, asserted_by: ['Wikidata'] })
    expect(screen.getByText('community')).toBeInTheDocument()
  })

  it('stays silent on a register-backed holding', async () => {
    // The normal case must not grow a badge, or every row becomes noise.
    await withOwner({ corroborations: 1, asserted_by: ['SEC EDGAR'] })
    expect(screen.queryByText('community')).toBeNull()
    expect(screen.queryByText(/✓/)).toBeNull()
  })

  it('stays silent when the backend sent no claim data', async () => {
    await withOwner({})
    expect(screen.queryByText('community')).toBeNull()
  })

  it('lists every asserting source in the row menu header', async () => {
    // "SEC EDGAR + Wikidata" answers the trust question better than either name
    // alone — and better than the edge's single attributed source.
    await withOwner({ corroborations: 2, asserted_by: ['SEC EDGAR', 'Wikidata'],
                      source_id: 'src-sec', source_url: 'https://www.sec.gov/f/1' })
    const row = screen.getByText('Sergey Brin').closest('.rel-row') as HTMLElement
    fireEvent.contextMenu(row)
    expect(document.querySelector('.action-menu__header')?.textContent)
      .toBe('SEC EDGAR + Wikidata')
  })
})


describe('a stale community assertion', () => {
  const withOwnerRel = async (relationship: Record<string, unknown>) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Held Co', type: 'company', verified: false } as Entity,
      subsidiaries: [], executives: [],
      owners: [{ owner: { id: 'o1', name: 'Community Holdings', type: 'company' },
                 relationship }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Held Co')} refreshKey={0} />)
    return (await screen.findByText('Community Holdings')).closest('.rel-item') as HTMLElement
  }

  it('is dimmed, with the reason on hover', async () => {
    const row = await withOwnerRel({ stale: true })
    expect(row.className).toContain('rel-item--stale')
    expect(row.getAttribute('title')).toMatch(/not confirmed by any source/i)
  })

  it('is still there and still navigable', async () => {
    // Dimming is a statement about confidence, not a removal: nobody stated the
    // relationship ended, so nothing may act as though it did.
    const onNavigate = vi.fn()
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Held Co', type: 'company', verified: false } as Entity,
      subsidiaries: [], executives: [],
      owners: [{ owner: { id: 'o1', name: 'Community Holdings', type: 'company' },
                 relationship: { stale: true } }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Held Co')} onNavigate={onNavigate} refreshKey={0} />)
    await userEvent.click(await screen.findByText('Community Holdings'))
    expect(onNavigate).toHaveBeenCalled()
  })

  it('an ordinary row is not dimmed', async () => {
    const row = await withOwnerRel({ stale: false })
    expect(row.className).not.toContain('rel-item--stale')
    expect(row.getAttribute('title')).toBeNull()
  })

  it('an unmarked row is not dimmed either', async () => {
    // Absent means the pass has not judged it — not that it is stale.
    const row = await withOwnerRel({})
    expect(row.className).not.toContain('rel-item--stale')
  })
})


describe('a company whose filings measure different securities', () => {
  const withSummary = async (ownership: Record<string, unknown>, rel = {}) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Grupo Televisa', type: 'company', verified: false } as Entity,
      subsidiaries: [], executives: [],
      owners: [{ owner: { id: 'o1', name: 'Fintech Latam', type: 'company' },
                 relationship: { stake_percent: 9.7, ...rel } }],
      ownership,
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Grupo Televisa')} refreshKey={0} />)
    await screen.findByText('Fintech Latam')
  }

  it('says why there is no total, in place of the total', async () => {
    // Televisa's filers report 22.3% of its A/B/Preferred shares beside 9.7%
    // of its CPOs; added together that was 115.9% of the company.
    await withSummary({ disclosed_pct: null, multi_class: true, unknown_owners: 0,
                        exceeds_100: false })
    expect(screen.getByText(/different securities/i)).toBeInTheDocument()
  })

  it('does not list the classes', async () => {
    // Normalisation over-splits on purpose (Televisa names its CPOs four ways),
    // so a list reads as more classes than the company has. The class belongs
    // on the relationship's own menu instead.
    await withSummary({
      disclosed_pct: null, multi_class: true, unknown_owners: 0, exceeds_100: false,
      by_class: [{ share_class: 'CPOs', disclosed_pct: 9.7, owners: 1 },
                 { share_class: null, disclosed_pct: 44.2, owners: 1 }],
    })
    expect(document.querySelector('.share-classes')).toBeNull()
    expect(screen.queryByText('44.2%')).toBeNull()
  })

  it('stays silent for an ordinary single-class company', async () => {
    await withSummary({ disclosed_pct: 12, free_float_pct: 88, multi_class: false,
                        unknown_owners: 0, exceeds_100: false })
    expect(document.querySelector('.ownership-note')).toBeNull()
  })
})

describe("a relationship's own facts, in its menu", () => {
  const openMenuFor = async (relationship: Record<string, unknown>) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Grupo Televisa', type: 'company', verified: false } as Entity,
      subsidiaries: [], executives: [],
      owners: [{ owner: { id: 'o1', name: 'Fintech Latam', type: 'company' },
                 relationship }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Grupo Televisa')} refreshKey={0} />)
    const row = (await screen.findByText('Fintech Latam')).closest('.rel-row') as HTMLElement
    fireEvent.contextMenu(row)
    return document.querySelector('.action-menu__details')
  }

  it('names the security the percentage measures', async () => {
    const d = await openMenuFor({ stake_percent: 9.7,
      share_class: 'Certificados de Participacion Ordinarios (CPOs) and Global D Shares' })
    expect(d?.textContent).toContain('Certificados de Participacion Ordinarios')
    expect(d?.textContent).toContain('9.7%')
  })

  it('lets a long class title wrap instead of truncating it', async () => {
    // The header above is nowrap with an ellipsis; half a class title is worse
    // than none, so these rows must not inherit that.
    const d = await openMenuFor({ stake_percent: 9.7, share_class: 'A very long class title' })
    const dd = d?.querySelector('dd') as HTMLElement
    expect(getComputedStyle(dd).whiteSpace).not.toBe('nowrap')
  })

  it('shows a voting bloc when it differs from the stake', async () => {
    // Altria's shape: 8.1% owned, 51.9% voted under a shareholders' agreement.
    const d = await openMenuFor({ stake_percent: 8.1, voting_power_pct: 51.9 })
    expect(d?.textContent).toContain('8.1%')
    expect(d?.textContent).toContain('51.9%')
  })

  it('says what the row\'s ⚡ marker stands for', async () => {
    // The row shows a bolt and no figures, so the comparison has to be here.
    const d = await openMenuFor({ stake_percent: 8.1, voting_power_pct: 51.9 })
    expect(d?.textContent).toMatch(/more than the 8\.1% held/i)
  })

  it('states a lower voting figure plainly, without the comparison', async () => {
    // Voting below the stake is not the ⚡ case and must not borrow its wording.
    const d = await openMenuFor({ stake_percent: 30, voting_power_pct: 10 })
    expect(d?.textContent).toContain('10%')
    expect(d?.textContent).not.toMatch(/more than/i)
  })

  it('does not repeat the same number as a voting bloc', async () => {
    // A lone filer votes exactly what it owns; printing it twice would imply a
    // distinction that isn't there. One render per test — two in the same test
    // leaves the first menu in the DOM for querySelector to find.
    const d = await openMenuFor({ stake_percent: 5.7, voting_power_pct: 5.7 })
    expect(d?.textContent?.match(/5\.7%/g) ?? []).toHaveLength(1)
  })

  it('shows the filing date without its timestamp', async () => {
    const d = await openMenuFor({ stake_percent: 9.7, source_date: '2025-02-14T00:00:00Z' })
    expect(d?.textContent).toContain('2025-02-14')
    expect(d?.textContent).not.toContain('T00:00')
  })

  it('adds nothing for a relationship with no such facts', async () => {
    // A Wikidata edge states none of this; its menu must look as it always did.
    expect(await openMenuFor({})).toBeNull()
  })
})


describe('a voting group', () => {
  const render_ = async (type: string, extra: Record<string, unknown> = {}) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'g1', name: 'Voting group · 9 parties', type, verified: false } as Entity,
      owners: [], executives: [],
      subsidiaries: [{ entity: { id: 'abi', name: 'Anheuser-Busch InBev', type: 'company' },
                       relationship: { voting_power_pct: 52.3 } }],
      group_members: [
        { kind: 'entity', party: { id: 'm1', name: 'Stichting Anheuser-Busch InBev',
                                   type: 'nonprofit' } },
        { kind: 'person', party: { id: 'm2', full_name: 'Jorge Paulo Lemann' } },
      ],
      ...extra,
    } } as never)
    render(<NodePanel node={entityNode('g1', 'Voting group · 9 parties')} refreshKey={0} />)
    await screen.findByText('Anheuser-Busch InBev')
  }

  it('lists the parties to the agreement', async () => {
    // They join over RELATED_TO, so the owners query cannot see them — this
    // section shipped empty the first time for exactly that reason.
    await render_('voting_group')
    expect(screen.getByText(/Parties to the agreement/i)).toBeInTheDocument()
    expect(screen.getByText('Stichting Anheuser-Busch InBev')).toBeInTheDocument()
    expect(screen.getByText('Jorge Paulo Lemann')).toBeInTheDocument()
  })

  it('calls what it holds "Controls", not subsidiaries', async () => {
    await render_('voting_group')
    expect(screen.getByText(/^Controls$/i)).toBeInTheDocument()
  })

  it('leaves an ordinary company alone', async () => {
    await render_('company')
    expect(screen.queryByText(/Parties to the agreement/i)).toBeNull()
    expect(screen.queryByText(/^Controls$/i)).toBeNull()
  })

  it('does not flag a voting group for voting', async () => {
    // "This voting group votes more than it owns" is what a voting group is.
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Anheuser-Busch InBev', type: 'company',
                verified: false } as Entity,
      subsidiaries: [], executives: [],
      owners: [{ owner: { id: 'g1', name: 'Voting group · 9 parties', type: 'voting_group' },
                 relationship: { voting_power_pct: 52.3 } }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Anheuser-Busch InBev')} refreshKey={0} />)
    await screen.findByText('Voting group · 9 parties')
    expect(screen.queryByLabelText(/Special voting/i)).toBeNull()
  })

  it('still flags an ordinary holder whose votes outrun its shares', async () => {
    // Altria: 8.1% owned, 51.9% voted. The marker earns its place there.
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Anheuser-Busch InBev', type: 'company',
                verified: false } as Entity,
      subsidiaries: [], executives: [],
      owners: [{ owner: { id: 'a1', name: 'Altria', type: 'company' },
                 relationship: { stake_percent: 8.1, voting_power_pct: 51.9 } }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Anheuser-Busch InBev')} refreshKey={0} />)
    await screen.findByText('Altria')
    expect(screen.getByLabelText(/Special voting/i)).toBeInTheDocument()
  })
})

describe('the voting marker on what an owner holds', () => {
  const withSubsidiary = async (entityType: string, relationship: Record<string, unknown>) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Altria', type: entityType, verified: false } as Entity,
      owners: [], executives: [],
      subsidiaries: [{ entity: { id: 'abi', name: 'Anheuser-Busch InBev', type: 'company' },
                       relationship }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Altria')} refreshKey={0} />)
    await screen.findByText('Anheuser-Busch InBev')
  }

  it('flags a holding whose votes outrun the shares', async () => {
    // Altria's own panel: 8.1% held, 51.9% voted. Without this the
    // disproportion was visible only from AB InBev's side.
    await withSubsidiary('company', { stake_percent: 8.1, voting_power_pct: 51.9 })
    expect(screen.getByLabelText(/Special voting/i)).toBeInTheDocument()
  })

  it('stays quiet when the holding votes what it owns', async () => {
    await withSubsidiary('company', { stake_percent: 5.7, voting_power_pct: 5.7 })
    expect(screen.queryByLabelText(/Special voting/i)).toBeNull()
  })

  it('stays quiet on a voting group, whose control is voting by definition', async () => {
    await withSubsidiary('voting_group', { stake_percent: null, voting_power_pct: 52.3 })
    expect(screen.queryByLabelText(/Special voting/i)).toBeNull()
  })
})

describe('the counts behind a percentage', () => {
  const openMenu = async (relationship: Record<string, unknown>) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Anheuser-Busch InBev', type: 'company',
                verified: false } as Entity,
      subsidiaries: [], executives: [],
      owners: [{ owner: { id: 'a1', name: 'Altria', type: 'company' }, relationship }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Anheuser-Busch InBev')} refreshKey={0} />)
    const row = (await screen.findByText('Altria')).closest('.rel-row') as HTMLElement
    fireEvent.contextMenu(row)
    return document.querySelector('.action-menu__details')
  }

  it('shows the holding and the total it is a fraction of', async () => {
    // So the 8.05% above can be checked rather than taken on trust.
    const d = await openMenu({ stake_percent: 8.0534, shares: 159121937,
                               shares_outstanding: 1975847422 })
    expect(d?.textContent).toContain('159,121,937')
    expect(d?.textContent).toContain('1,975,847,422')
  })

  it('shows the holding alone when no total was stated', async () => {
    const d = await openMenu({ stake_percent: null, shares: 771096582 })
    expect(d?.textContent).toContain('771,096,582')
    expect(d?.textContent).not.toMatch(/\bof\b/)
  })

  it('says nothing when the filing gave no count', async () => {
    const d = await openMenu({ stake_percent: 5.9 })
    expect(d?.textContent ?? '').not.toMatch(/Shares/i)
  })
})

describe('the count behind a voting bloc', () => {
  const openMenu = async (relationship: Record<string, unknown>) => {
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Anheuser-Busch InBev', type: 'company',
                verified: false } as Entity,
      subsidiaries: [], executives: [],
      owners: [{ owner: { id: 'a1', name: 'Altria', type: 'company' }, relationship }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Anheuser-Busch InBev')} refreshKey={0} />)
    const row = (await screen.findByText('Altria')).closest('.rel-row') as HTMLElement
    fireEvent.contextMenu(row)
    return document.querySelector('.action-menu__details')
  }

  it('shows the bloc count beside its percentage', async () => {
    const d = await openMenu({ stake_percent: 8.05, shares: 159121937,
                               voting_power_pct: 51.9, voting_shares: 1020598157 })
    expect(d?.textContent).toContain('1,020,598,157')
    expect(d?.textContent).toContain('51.9%')
  })

  it('distinguishes the holding from the bloc', async () => {
    // Both numbers on one filing, and they are not the same fact: 159 million
    // owned, a billion voted.
    const d = await openMenu({ stake_percent: 8.05, shares: 159121937,
                               voting_power_pct: 51.9, voting_shares: 1020598157 })
    expect(d?.textContent).toContain('159,121,937')
    expect(d?.textContent).toContain('1,020,598,157')
  })

  it('shows nothing for a lone filer with no bloc', async () => {
    const d = await openMenu({ stake_percent: 5.7, shares: 32416315 })
    expect(d?.textContent ?? '').not.toMatch(/Voted shares/i)
  })
})

describe("a person's own page shows the bloc they vote in", () => {
  // Three of AB InBev's nine parties are people. PersonView is a separate
  // component from EntityOverview and had no group section at all — the fifth
  // and sixth places this same field had to be added.
  const node: NodeData = {
    id: 'p1', label: 'Jorge Paulo Lemann', nodeType: 'person',
    raw: { id: 'p1', full_name: 'Jorge Paulo Lemann' } as never,
  }

  const renderPerson = async (voting_groups: unknown[]) => {
    vi.mocked(getPersonProfile).mockResolvedValue({ data: {
      person: { id: 'p1', full_name: 'Jorge Paulo Lemann' },
      positions: [], holdings: [], voting_groups,
    } } as never)
    vi.mocked(getPersonSources).mockResolvedValue({ data: [] } as never)
    render(<NodePanel node={node} />)
    await screen.findByText('Jorge Paulo Lemann')
  }

  it('lists the group', async () => {
    await renderPerson([{ group: { id: 'g1', name: 'Voting group · 9 parties',
                                   type: 'voting_group' } }])
    expect(await screen.findByText('Voting group · 9 parties')).toBeInTheDocument()
  })

  it('shows no section for someone in no group', async () => {
    await renderPerson([])
    expect(screen.queryByText(/Votes in/i)).toBeNull()
  })
})

describe('one relationship reads the same from every section', () => {
  // The panel parity test. Seven hand-copied rel={} literals drifted — the
  // holdings copy lost `assertedBy`, so a person's rows never showed the
  // multi-source header. One mapper now feeds all of them, and this pins it:
  // the same relationship rendered through owners, subsidiaries and holdings
  // must produce byte-identical menu content.
  const REL = {
    stake_percent: 8.05, voting_power_pct: 51.9, ownership_type: 'minority',
    share_class: 'Ordinary Shares', shares: 159121937,
    shares_outstanding: 1975847422, voting_shares: 1020598157,
    source_url: 'https://sec.example.test/f1', source_id: 'src-1',
    source_date: '2025-02-07', asserted_by: ['SEC EDGAR', 'Wikidata'],
    corroborations: 2,
  }

  const menuText = async (kind: 'owners' | 'subsidiaries' | 'holdings') => {
    cleanup()
    if (kind === 'holdings') {
      vi.mocked(getPersonProfile).mockResolvedValue({ data: {
        person: { id: 'p1', full_name: 'Somebody' },
        positions: [],
        holdings: [{ entity: { id: 'x', name: 'Target Co', type: 'company' },
                     relationship: REL }],
      } } as never)
      vi.mocked(getPersonSources).mockResolvedValue({ data: [] } as never)
      render(<NodePanel node={{ id: 'p1', label: 'Somebody', nodeType: 'person',
                                raw: { id: 'p1', full_name: 'Somebody' } as never }} />)
    } else {
      mockProfile.mockResolvedValue({ data: {
        entity: { id: 'e1', name: 'Centre', type: 'company', verified: false } as Entity,
        owners: kind === 'owners'
          ? [{ owner: { id: 'x', name: 'Target Co', type: 'company' }, relationship: REL }] : [],
        subsidiaries: kind === 'subsidiaries'
          ? [{ entity: { id: 'x', name: 'Target Co', type: 'company' }, relationship: REL }] : [],
        executives: [],
      } } as never)
      render(<NodePanel node={entityNode('e1', 'Centre')} refreshKey={0} />)
    }
    const row = (await screen.findByText('Target Co')).closest('.rel-row') as HTMLElement
    fireEvent.contextMenu(row)
    const details = document.querySelector('.action-menu__details')?.textContent ?? ''
    const header = document.querySelector('.action-menu__header')?.textContent ?? ''
    return { details, header }
  }

  it('menu details are identical across the three sections', async () => {
    const owners = await menuText('owners')
    const subs = await menuText('subsidiaries')
    const holdings = await menuText('holdings')
    expect(subs.details).toBe(owners.details)
    expect(holdings.details, 'holdings drifted from owners once already')
      .toBe(owners.details)
  })

  it('the multi-source header shows in all three', async () => {
    for (const kind of ['owners', 'subsidiaries', 'holdings'] as const) {
      const { header } = await menuText(kind)
      expect(header, `${kind}`).toBe('SEC EDGAR + Wikidata')
    }
  })
})

describe('a role row carries its sources too', () => {
  it('shows the multi-source header on an executive row', async () => {
    // The four role literals all omitted assertedBy and stale, although
    // RoleRelationship carries both — so a corroborated role could never show
    // its sources. The shared mapper fixed it; this keeps it fixed.
    mockProfile.mockResolvedValue({ data: {
      entity: { id: 'e1', name: 'Centre', type: 'company', verified: false } as Entity,
      owners: [], subsidiaries: [],
      executives: [{ person: { id: 'p1', full_name: 'A Boss' },
                     role: { role: 'CEO', source_id: 'src-1',
                             asserted_by: ['SEC EDGAR', 'Wikidata'],
                             corroborations: 2 } }],
    } } as never)
    render(<NodePanel node={entityNode('e1', 'Centre')} refreshKey={0} />)
    const row = (await screen.findByText('A Boss')).closest('.rel-row') as HTMLElement
    fireEvent.contextMenu(row)
    expect(document.querySelector('.action-menu__header')?.textContent)
      .toBe('SEC EDGAR + Wikidata')
  })
})
