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
  const input = screen.getByRole('textbox')
  await userEvent.type(input, query, { delay: null })
}

beforeEach(() => {
  mockSearch.mockReset()
})

describe('SearchBar (render)', () => {
  it('shows results and calls onSelect when a result is clicked', async () => {
    resolveSearch([entityResult('e1', 'Microsoft Corporation')])
    const onSelect = vi.fn()
    render(<SearchBar onSelect={onSelect} countries={[]} canScrape />)

    await type('microsoft')
    const row = await screen.findByText('Microsoft Corporation')
    await userEvent.click(row)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].node.id).toBe('e1')
  })

  it('offers "search sources for X" alongside results and calls onScrapeQuery', async () => {
    resolveSearch([entityResult('e1', 'Micro Focus')])
    const onScrapeQuery = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={onScrapeQuery} countries={[]} canScrape />)

    await type('microsoft')
    await screen.findByText('Micro Focus')            // results present
    const scrapeRow = screen.getByText(/search sources for/i)
    await userEvent.click(scrapeRow)

    expect(onScrapeQuery).toHaveBeenCalledWith('microsoft')
  })

  it('offers "search sources" when there are no results, for verified users', async () => {
    resolveSearch([])
    const onScrapeQuery = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={onScrapeQuery} countries={[]} canScrape />)

    await type('nonesuchco')
    const scrapeRow = await screen.findByText(/search sources for/i)
    await userEvent.click(scrapeRow)

    expect(onScrapeQuery).toHaveBeenCalledWith('nonesuchco')
  })

  it('shows a sign-in hint (no scrape) when the user cannot scrape', async () => {
    resolveSearch([])
    const onScrapeQuery = vi.fn()
    render(<SearchBar onSelect={vi.fn()} onScrapeQuery={onScrapeQuery} countries={[]} canScrape={false} />)

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
                      countries={[]} canScrape={false} />)

    await type('nonesuchco')
    const hint = await screen.findByText(/sign in/i)
    await userEvent.click(hint)
    expect(onRequestLogin).toHaveBeenCalledTimes(1)
  })
})
