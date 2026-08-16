/**
 * What the search box reports, and — mostly — what it does not.
 *
 * The box queries every 300ms while typing, from two characters. Reporting those
 * would record "mi", "mic", "micr": useless as demand data, and a sharper picture
 * of someone's typing than of their intent. So a search is reported **once, when
 * it settles** — a result was taken, or the user gave up on it.
 *
 * The first test here is the whole design in one assertion. If it ever fails, the
 * product report is measuring keystrokes and the privacy notice is describing
 * something the app no longer does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchBar from './SearchBar'
import type { SearchResult } from '../types'

vi.mock('../services/api', () => ({ search: vi.fn(), reportEvent: vi.fn() }))
import { search, reportEvent } from '../services/api'

const mockSearch = vi.mocked(search)
const mockReport = vi.mocked(reportEvent)

const hit = (id: string, name: string): SearchResult =>
  ({ type: 'Entity', score: 1, node: { id, name } as SearchResult['node'] })

const resolves = (results: SearchResult[]) =>
  mockSearch.mockResolvedValue({ data: results } as Awaited<ReturnType<typeof search>>)

const type = (q: string) => userEvent.type(screen.getByRole('textbox'), q, { delay: null })

const searchEvents = () => mockReport.mock.calls.map(c => c[0]).filter(e => e.kind === 'search')

beforeEach(() => {
  mockSearch.mockReset()
  mockReport.mockReset()
})

const show = (countries: { country: string; count: number }[] = []) =>
  render(<SearchBar onSelect={vi.fn()} countries={countries} canScrape />)

describe('a search is reported once, when it settles', () => {
  it('reports NOTHING while the user is still typing', async () => {
    // "microsoft" is nine debounced requests' worth of prefixes.
    resolves([hit('e1', 'Microsoft Corporation')])
    show()
    await type('microsoft')
    await waitFor(() => expect(search).toHaveBeenCalled())
    expect(mockReport).not.toHaveBeenCalled()
  })

  it('reports exactly one event when a result is taken', async () => {
    resolves([hit('e1', 'Microsoft Corporation')])
    show()
    await type('microsoft')
    await userEvent.click(await screen.findByText('Microsoft Corporation'))

    expect(searchEvents()).toHaveLength(1)
    expect(searchEvents()[0]).toMatchObject({ outcome: 'selected', query: 'microsoft' })
  })

  it('reports the query whose results were actually used', async () => {
    // Not "the last thing typed" but "the search these results came from". Typing
    // on and then taking a result from the older list settles the older query —
    // that is the one that answered, and pretending otherwise would attribute the
    // success to a search that never returned it.
    resolves([hit('e1', 'Microsoft Corporation')])
    show()
    await type('micro')
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    await type('soft')
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2))
    await userEvent.click(await screen.findByText('Microsoft Corporation'))

    expect(searchEvents()[0].query).toBe('microsoft')
  })

  it('carries the clicked position', async () => {
    resolves([hit('e1', 'Micro Focus'), hit('e2', 'Microsoft Corporation')])
    show()
    await type('microsoft')
    await userEvent.click(await screen.findByText('Microsoft Corporation'))

    expect(searchEvents()[0]).toMatchObject({ outcome: 'selected', rank: 1 })
  })

  it('carries the country when one is chosen', async () => {
    resolves([hit('e1', 'Alphabet GmbH')])
    show([{ country: 'DE', count: 3 }])
    await userEvent.click(screen.getByRole('button', { name: /All countries/i }))
    await userEvent.click(await screen.findByText('Germany'))
    await type('alphabet')
    await userEvent.click(await screen.findByText('Alphabet GmbH'))

    expect(searchEvents()[0]).toMatchObject({ country: 'DE', outcome: 'selected' })
  })
})

describe('a search nobody took', () => {
  it('is reported as zero when there was nothing to take', async () => {
    // The most valuable row in the whole store: demand the graph cannot answer.
    resolves([])
    show()
    await type('nonesuchco')
    await waitFor(() => expect(search).toHaveBeenCalled())
    await userEvent.click(document.body)

    expect(searchEvents()).toHaveLength(1)
    expect(searchEvents()[0]).toMatchObject({ outcome: 'zero', query: 'nonesuchco' })
  })

  it('is reported as abandoned when results were shown and ignored', async () => {
    // Different fact from "nothing found": the graph had an answer and it was not
    // the one wanted, which is a ranking problem rather than a data gap.
    resolves([hit('e1', 'Something Else')])
    show()
    await type('microsoft')
    await waitFor(() => expect(search).toHaveBeenCalled())
    await userEvent.click(document.body)

    expect(searchEvents()[0]).toMatchObject({ outcome: 'abandoned' })
  })

  it('is reported when the box is cleared', async () => {
    resolves([])
    show()
    await type('nonesuchco')
    await waitFor(() => expect(search).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: /clear/i }))

    expect(searchEvents()).toHaveLength(1)
  })

  it('is reported only once, however many times the user dismisses it', async () => {
    resolves([])
    show()
    await type('nonesuchco')
    await waitFor(() => expect(search).toHaveBeenCalled())
    await userEvent.click(document.body)
    await userEvent.click(document.body)

    expect(searchEvents()).toHaveLength(1)
  })
})

describe('measurement never gets in the way', () => {
  it('a failing report does not break selection', async () => {
    mockReport.mockImplementation(() => { throw new Error('offline') })
    resolves([hit('e1', 'Microsoft Corporation')])
    const onSelect = vi.fn()
    render(<SearchBar onSelect={onSelect} countries={[]} canScrape />)
    await type('microsoft')

    // The click must still select, even though reporting threw.
    await userEvent.click(await screen.findByText('Microsoft Corporation'))
      .catch(() => { /* the throw is the point */ })
    expect(onSelect).toHaveBeenCalled()
  })
})
