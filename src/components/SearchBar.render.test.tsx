import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchBar from './SearchBar'
import type { SearchResult } from '../types'

// The api layer pulls in axios/config; mock it so the component renders in isolation.
vi.mock('../services/api', () => ({ search: vi.fn() }))
import { search } from '../services/api'

const mockSearch = vi.mocked(search)

const entityResult = (id: string, name: string): SearchResult => ({
  type: 'Entity',
  score: 1,
  // Only the fields SearchBar reads are needed for the dropdown row.
  node: { id, name } as SearchResult['node'],
})

function resolveSearch(results: SearchResult[]) {
  mockSearch.mockResolvedValue({ data: results } as Awaited<ReturnType<typeof search>>)
}

async function type(query: string) {
  const input = screen.getByRole('combobox')
  await userEvent.type(input, query, { delay: null })
}

beforeEach(() => {
  mockSearch.mockReset()
})

describe('SearchBar (render)', () => {
  it('shows results and calls onSelect when a result is clicked', async () => {
    resolveSearch([entityResult('e1', 'Microsoft Corporation')])
    const onSelect = vi.fn()
    render(<SearchBar onSelect={onSelect} canScrape />)

    await type('microsoft')
    const row = await screen.findByText('Microsoft Corporation')
    await userEvent.click(row)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].node.id).toBe('e1')
  })

  it('offers "search sources for X" alongside results and calls onScrapeQuery', async () => {
    resolveSearch([entityResult('e1', 'Micro Focus')])
    const onScrapeQuery = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={onScrapeQuery} canScrape />)

    await type('microsoft')
    await screen.findByText('Micro Focus')            // results present
    const scrapeRow = screen.getByText(/search sources for/i)
    await userEvent.click(scrapeRow)

    expect(onScrapeQuery).toHaveBeenCalledWith('microsoft', undefined)
  })

  it('offers "search sources" when there are no results, for verified users', async () => {
    resolveSearch([])
    const onScrapeQuery = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={onScrapeQuery} canScrape />)

    await type('nonesuchco')
    const scrapeRow = await screen.findByText(/search sources for/i)
    await userEvent.click(scrapeRow)

    expect(onScrapeQuery).toHaveBeenCalledWith('nonesuchco', undefined)
  })

  it('shows a sign-in hint (no scrape) when the user cannot scrape', async () => {
    resolveSearch([])
    const onScrapeQuery = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={onScrapeQuery} canScrape={false} />)

    await type('nonesuchco')
    // Wait for the dropdown to settle, then assert the scrape action is absent.
    await waitFor(() => expect(mockSearch).toHaveBeenCalled())
    expect(screen.queryByText(/search sources for/i)).not.toBeInTheDocument()
    expect(onScrapeQuery).not.toHaveBeenCalled()
  })

  it('makes the sign-in hint clickable to open login when a login handler is given', async () => {
    resolveSearch([])
    const onRequestLogin = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={vi.fn()} onRequestLogin={onRequestLogin}
                      canScrape={false} />)

    await type('nonesuchco')
    const hint = await screen.findByText(/sign in/i)
    await userEvent.click(hint)
    expect(onRequestLogin).toHaveBeenCalledTimes(1)
  })

  // ── The affordance must exist even when a result matched ────────────────────
  //
  // Reported: searching "Alphabet" returned an unrelated "SCI LF ALPHABET" and
  // offered no way to look up the real company. The scrape row was rendered only
  // when the user could scrape, so a signed-out or unverified visitor with *some*
  // result saw nothing at all — while the empty-result branch had always shown a
  // sign-in prompt.

  it('offers to search the sources even when a result already matched', async () => {
    resolveSearch([entityResult('e1', 'SCI LF ALPHABET')])
    const onScrapeQuery = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={onScrapeQuery} canScrape />)

    await type('Alphabet')
    const row = await screen.findByText(/alphabet/i, { selector: '.search-item--scrape .search-item__name' })
    await userEvent.click(row)
    expect(onScrapeQuery).toHaveBeenCalledWith('Alphabet', undefined)
  })

  it('prompts an unverified user to sign in when a result matched', async () => {
    resolveSearch([entityResult('e1', 'SCI LF ALPHABET')])
    const onRequestLogin = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={vi.fn()} onRequestLogin={onRequestLogin}
                      canScrape={false} />)

    await type('Alphabet')
    // Previously this branch rendered nothing — the dead end being fixed.
    const hint = await screen.findByText(/sign in/i)
    await userEvent.click(hint)
    expect(onRequestLogin).toHaveBeenCalledTimes(1)
  })

  it('never starts a scrape for a user who cannot scrape, results or not', async () => {
    resolveSearch([entityResult('e1', 'SCI LF ALPHABET')])
    const onScrapeQuery = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={onScrapeQuery} onRequestLogin={vi.fn()}
                      canScrape={false} />)

    await type('Alphabet')
    await screen.findByText(/sign in/i)
    expect(onScrapeQuery).not.toHaveBeenCalled()
  })
})

/**
 * The country the user picked has to reach the scrape, not just the database
 * query.
 *
 * Asked for "Alphabet", every source left to itself answers with Alphabet Inc of
 * Mountain View — it is the most famous company by that name. Dropping the
 * country here looks like nothing at all from the outside: the scrape succeeds,
 * and imports the wrong company under a German search.
 */
describe('the chosen country travels with the scrape', () => {
  // The country is chosen in the graph's Filters panel and handed in.
  it('hands the country to onScrapeQuery', async () => {
    resolveSearch([])
    const onScrapeQuery = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={onScrapeQuery} country="DE" canScrape />)

    await type('alphabet')
    await userEvent.click(await screen.findByText(/search .* sources for/i))

    expect(onScrapeQuery).toHaveBeenCalledWith('alphabet', 'DE')
  })

  it('names the country in the row, so an empty result reads as "not in Germany"', async () => {
    resolveSearch([])
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={vi.fn()} country="DE" canScrape />)

    await type('alphabet')
    expect(await screen.findByText(/Germany sources/i)).toBeInTheDocument()
  })

  it('says nothing about a country when none is chosen', async () => {
    resolveSearch([])
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={vi.fn()} canScrape />)

    await type('alphabet')
    const row = await screen.findByText(/search sources for/i)
    expect(row.textContent).not.toMatch(/Germany/)
    expect(document.querySelector('.search-country-chip')).toBeNull()
  })

  it('restricts the database search to it as well', async () => {
    resolveSearch([])
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={vi.fn()} country="DE" canScrape />)

    await type('alphabet')
    await waitFor(() => expect(search).toHaveBeenCalledWith('alphabet', 'DE'))
  })

  it('shows the scope as a chip in the box, and one click removes it', async () => {
    const onCountryChange = vi.fn()
    render(<SearchBar onSelect={vi.fn()} country="DE" onCountryChange={onCountryChange} canScrape />)
    const chip = screen.getByRole('button', { name: /Searching in Germany/ })
    expect(chip).toHaveTextContent('Germany')
    await userEvent.click(chip)
    expect(onCountryChange).toHaveBeenCalledWith('')
  })
})

describe('the result badge names what the node IS', () => {
  const typed = (id: string, name: string, type: string): SearchResult => ({
    type: 'Entity', score: 1,
    node: { id, name, type } as SearchResult['node'],
  })

  it('shows the specific kind, not the coarse Entity grouping', async () => {
    resolveSearch([
      typed('e1', 'Alphabet Inc.', 'company'),
      typed('e2', 'Exor N.V.', 'holding'),
      typed('e3', 'Wellcome Trust', 'foundation'),
      typed('e4', 'The Vanguard Group', 'fund'),
      typed('e5', 'Voting group · 9 parties', 'voting_group'),
    ])
    render(<SearchBar onSelect={vi.fn()} canScrape />)
    await type('alphabet')

    await screen.findByText('Alphabet Inc.')
    for (const label of ['Company', 'Holding', 'Foundation', 'Fund', 'Voting group']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.queryByText('Entity')).toBeNull()
  })

  it('still says Person for people', async () => {
    resolveSearch([{
      type: 'Person', score: 1,
      node: { id: 'p1', full_name: 'Larry Page' } as SearchResult['node'],
    }])
    render(<SearchBar onSelect={vi.fn()} canScrape />)
    await type('larry')

    await screen.findByText('Larry Page')
    expect(screen.getByText('Person')).toBeTruthy()
  })

  it('falls back to Company when the type was never inferred', async () => {
    // GLEIF imports plenty of these; the node panel shows them as Company too,
    // so the dropdown must not disagree with the panel it opens.
    resolveSearch([entityResult('e9', 'ALPHABET CAPITAL US LLC')])
    render(<SearchBar onSelect={vi.fn()} canScrape />)
    await type('alphabet')

    await screen.findByText('ALPHABET CAPITAL US LLC')
    expect(screen.getByText('Company')).toBeTruthy()
  })

  it('carries the type through to the CSS class the legend colours use', async () => {
    resolveSearch([typed('e2', 'Exor N.V.', 'holding')])
    const { container } = render(<SearchBar onSelect={vi.fn()} canScrape />)
    await type('exor')

    await screen.findByText('Exor N.V.')
    expect(container.querySelector('.node-type-badge--holding')).toBeTruthy()
  })
})

describe('the keyboard walks the dropdown', () => {
  const three = [entityResult('e1', 'Alpha AG'), entityResult('e2', 'Alpha Beta GmbH'), entityResult('e3', 'Alpha Gamma SE')]
  const highlighted = () => document.querySelector('.search-item--active')?.textContent ?? null
  const input = () => screen.getByRole('combobox')

  it('ArrowDown highlights the first row, then the next; ArrowUp goes back up', async () => {
    resolveSearch(three)
    render(<SearchBar onSelect={vi.fn()} />)
    await type('alpha')
    await screen.findByText('Alpha Gamma SE')
    expect(highlighted()).toBeNull()
    await userEvent.keyboard('{ArrowDown}')
    expect(highlighted()).toContain('Alpha AG')
    expect(input().getAttribute('aria-activedescendant')).toBe('search-option-0')
    await userEvent.keyboard('{ArrowDown}')
    expect(highlighted()).toContain('Alpha Beta GmbH')
    await userEvent.keyboard('{ArrowUp}')
    expect(highlighted()).toContain('Alpha AG')
    await userEvent.keyboard('{ArrowUp}')
    expect(highlighted()).toBeNull()                       // back to the box itself
  })

  it('Enter takes the highlighted row, with its rank', async () => {
    resolveSearch(three)
    const onSelect = vi.fn()
    render(<SearchBar onSelect={onSelect} />)
    await type('alpha')
    await screen.findByText('Alpha Gamma SE')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].node.id).toBe('e2')
    expect(screen.queryByText('Alpha Gamma SE')).toBeNull()   // the dropdown closed
    expect(input()).toHaveValue('Alpha Beta GmbH')
  })

  it('Enter with nothing highlighted takes nothing — the first hit may be a namesake', async () => {
    resolveSearch(three)
    const onSelect = vi.fn()
    render(<SearchBar onSelect={onSelect} />)
    await type('alpha')
    await screen.findByText('Alpha Gamma SE')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await userEvent.keyboard('{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByText('Alpha Gamma SE')).toBeInTheDocument()
    expect(errors).not.toHaveBeenCalled()                   // and nothing blew up on the way
    errors.mockRestore()
  })

  it('walks on to the "search the sources" row and stops there; Enter runs it', async () => {
    resolveSearch(three)
    const onScrapeQuery = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={onScrapeQuery} canScrape />)
    await type('alpha')
    await screen.findByText('Alpha Gamma SE')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(highlighted()).toMatch(/search sources for/i)
    await userEvent.keyboard('{Enter}')
    expect(onScrapeQuery).toHaveBeenCalledWith('alpha', undefined)
  })

  it('stops at the last result when the sources row cannot be taken', async () => {
    resolveSearch(three)
    render(<SearchBar onSelect={vi.fn()} />)          // no scrape, no login: a bare hint
    await type('alpha')
    await screen.findByText('Alpha Gamma SE')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(highlighted()).toContain('Alpha Gamma SE')
  })

  it('forgets the highlight when the results change', async () => {
    resolveSearch(three)
    render(<SearchBar onSelect={vi.fn()} />)
    await type('alpha')
    await screen.findByText('Alpha Gamma SE')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(highlighted()).toContain('Alpha Beta GmbH')
    // two rows again, so a stale index would land on a different company
    resolveSearch([entityResult('e9', 'Alphabet Inc.'), entityResult('e10', 'Alphabet Holdings LLC')])
    await userEvent.type(input(), 'bet', { delay: null })
    await screen.findByText('Alphabet Holdings LLC')
    expect(highlighted()).toBeNull()
  })

  it('the mouse moves the highlight too, so there is never a second one', async () => {
    resolveSearch(three)
    render(<SearchBar onSelect={vi.fn()} />)
    await type('alpha')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.hover(await screen.findByText('Alpha Gamma SE'))
    expect(document.querySelectorAll('.search-item--active')).toHaveLength(1)
    expect(highlighted()).toContain('Alpha Gamma SE')
  })
})
