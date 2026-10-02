/**
 * The graph's Filters button and panel: every control over WHAT the graph
 * shows, behind one button — so the canvas, on a phone above all, is the graph.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GraphFilters, { activeFilterCount, yearOptions, DEFAULT_YEARS_BACK } from './GraphFilters'
import { getHistory } from '../services/api'

vi.mock('../services/api', () => ({ getHistory: vi.fn() }))
const history = vi.mocked(getHistory)
const THIS_YEAR = new Date().getFullYear()
beforeEach(() => { history.mockReset(); history.mockResolvedValue({ data: [] } as never) })
import { ANY_STAKE, DEFAULT_STAKE, STAKE_FILTERS } from './GraphStakeFilter'

const COUNTRIES = [{ country: 'DE', count: 12 }, { country: 'GB', count: 3400 }]

const show = (over: Partial<Parameters<typeof GraphFilters>[0]> = {}) => {
  const props = {
    hasGraph: true, stake: DEFAULT_STAKE, onStakeChange: vi.fn(), stated: 26, total: 115,
    allLevels: false, onAllLevelsChange: vi.fn(), asOf: null, onAsOfChange: vi.fn(), centerId: 'nc',
    country: '', onCountryChange: vi.fn(), countries: COUNTRIES, ...over,
  }
  render(<GraphFilters {...props} />)
  return props
}
const button = () => screen.getByRole('button', { name: /^Filters/ })
const open = async () => { await userEvent.click(button()); return screen.getByRole('dialog', { name: 'Filters' }) }

describe('the button', () => {
  it('starts closed and says nothing more when every filter is at its default', () => {
    show()
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button().textContent).toBe('Filters')
  })

  it('counts the filters that are off their default', () => {
    show({ stake: STAKE_FILTERS[3], allLevels: true, country: 'DE', asOf: '2019-12-31' })
    expect(screen.getByLabelText('4 filters active')).toHaveTextContent('4')
  })

  it('names the year when the graph shows the past: a past graph must not look like the present', () => {
    show({ asOf: '2019-12-31' })
    expect(button()).toHaveTextContent('Filters · 2019')
    expect(screen.getByLabelText('1 filter active')).toBeInTheDocument()
  })

  it('the default stake band (≥1%) is not counted, any other is — "Any" too', () => {
    const base = { hasGraph: true, allLevels: false, asOf: null, country: '' }
    expect(activeFilterCount({ ...base, stake: DEFAULT_STAKE })).toBe(0)
    expect(activeFilterCount({ ...base, stake: ANY_STAKE })).toBe(1)
    expect(activeFilterCount({ ...base, stake: STAKE_FILTERS[4] })).toBe(1)
  })

  it('without a graph only the country counts: nothing else is in force', () => {
    expect(activeFilterCount({ hasGraph: false, stake: STAKE_FILTERS[4], allLevels: true,
                               asOf: '2019-12-31', country: 'DE' })).toBe(1)
  })
})

describe('the panel', () => {
  it('offers the six stake bands in order and reports the chosen one', async () => {
    const p = show()
    const panel = await open()
    const stake = within(panel).getByRole('radiogroup', { name: 'Minimum stake' })
    expect(within(stake).getAllByRole('radio').map(r => r.textContent))
      .toEqual(['Any', '≥1%', '≥5%', '≥25%', '>50%', '>75%'])
    expect(within(stake).getByRole('radio', { name: '≥1%' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(stake).getByRole('radio', { name: '>50%' }))
    expect(p.onStakeChange).toHaveBeenCalledWith(STAKE_FILTERS[4])
  })

  it('admits how much of the graph the stake filter cannot judge', async () => {
    show({ stated: 26, total: 115 })
    expect(await open()).toHaveTextContent('26 of 115 ownership links state a percentage')
  })

  it('switches between direct subsidiaries and all levels', async () => {
    const p = show()
    const levels = async () => within(await open()).getByRole('radiogroup', { name: 'Subsidiaries' })
    const direct = within(await levels()).getByRole('radio', { name: 'Direct' })
    expect(direct).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(direct)
    expect(p.onAllLevelsChange).not.toHaveBeenCalled()             // already on
    await userEvent.click(within(await levels()).getByRole('radio', { name: 'All levels' }))
    expect(p.onAllLevelsChange).toHaveBeenCalledWith(true)
  })

  it('offers the years back to the earliest the company\'s history mentions, newest first', async () => {
    history.mockResolvedValue({ data: [{ since: '2019-04-00' }, { since: null, until: '2016-12-31' }, { since: '2023-06-30' }] } as never)
    const p = show()
    const year = within(await open()).getByRole('combobox', { name: 'Year' }) as HTMLSelectElement
    await within(year).findByRole('option', { name: '2016' })
    const options = within(year).getAllByRole('option').map(o => o.textContent)
    expect(options[0]).toBe('Present')
    expect(options.slice(1)).toEqual(yearOptions(['2016'], THIS_YEAR).map(String))
    expect(options[options.length - 1]).toBe('2016')              // not older than the history
    expect(year.value).toBe('')
    expect(history).toHaveBeenCalledWith('nc')

    await userEvent.selectOptions(year, '2019')
    expect(p.onAsOfChange).toHaveBeenCalledWith('2019-12-31')     // a year means its 31 December
    expect(screen.queryByRole('dialog')).toBeNull()               // a choice closes the panel
  })

  it('shows the chosen year with the way back and what the dimmed lines mean', async () => {
    const p = show({ asOf: '2019-12-31' })
    const panel = await open()
    expect((within(panel).getByRole('combobox', { name: 'Year' }) as HTMLSelectElement).value).toBe('2019')
    expect(within(panel).getByRole('status')).toHaveTextContent('Dashed and faded')
    await userEvent.click(within(panel).getByRole('button', { name: 'Show the present' }))
    expect(p.onAsOfChange).toHaveBeenCalledWith(null)
  })

  it('choosing Present goes back as well', async () => {
    const p = show({ asOf: '2019-12-31' })
    await userEvent.selectOptions(within(await open()).getByRole('combobox', { name: 'Year' }), 'Present')
    expect(p.onAsOfChange).toHaveBeenCalledWith(null)
  })

  it('a year from a shared link that the list does not reach stays selected', async () => {
    history.mockResolvedValue({ data: [{ since: '2020-01-01' }] } as never)
    show({ asOf: '1999-12-31' })
    const year = within(await open()).getByRole('combobox', { name: 'Year' }) as HTMLSelectElement
    expect(year.value).toBe('1999')
  })

  it('falls back to a default span when the history is empty or cannot be read', async () => {
    history.mockRejectedValue(new Error('404'))
    show({ centerId: 'a-person' })
    const year = within(await open()).getByRole('combobox', { name: 'Year' })
    const options = within(year).getAllByRole('option')
    expect(options).toHaveLength(1 + DEFAULT_YEARS_BACK + 1)      // Present + this year back 25
    expect(yearOptions([], 2026)).toEqual(Array.from({ length: 26 }, (_, i) => 2026 - i))
    expect(yearOptions(['2031-01-01', 'garbage', null, '2024-05-01'], 2026)).toEqual([2026, 2025, 2024])
  })

  it('in the present it says what the year does', async () => {
    show()
    const panel = await open()
    expect(panel).toHaveTextContent('as it stood at the end of a year')
    expect(within(panel).queryByRole('status')).toBeNull()
  })

  it('picks the country the search is scoped to, searchable, and clears it', async () => {
    const p = show()
    const panel = await open()
    await userEvent.click(within(panel).getByRole('button', { name: 'All countries' }))
    await userEvent.type(within(panel).getByPlaceholderText(/countries/i), 'king')
    expect(within(panel).queryByText('Germany')).toBeNull()
    await userEvent.click(within(panel).getByRole('button', { name: /United Kingdom/ }))
    expect(p.onCountryChange).toHaveBeenCalledWith('GB')
  })

  it('a chosen country is shown with a clear button', async () => {
    const p = show({ country: 'DE' })
    const panel = await open()
    expect(within(panel).getByRole('button', { name: 'Germany' })).toBeInTheDocument()
    await userEvent.click(within(panel).getAllByRole('button', { name: 'All countries' })[0])
    expect(p.onCountryChange).toHaveBeenCalledWith('')
  })
})

describe('without a graph', () => {
  it('offers the country alone — it scopes the search, which starts on the empty canvas', async () => {
    show({ hasGraph: false })
    const panel = await open()
    expect(within(panel).queryByRole('radiogroup')).toBeNull()
    expect(panel).not.toHaveTextContent('Year')
    expect(within(panel).getByRole('button', { name: 'All countries' })).toBeInTheDocument()
  })

  it('is not there at all when there is no country to choose either', () => {
    show({ hasGraph: false, countries: [] })
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull()
  })
})

describe('dismissal', () => {
  it('closes on a click elsewhere, a tap elsewhere and Escape — not on a click inside', async () => {
    show()
    const panel = await open()
    await userEvent.click(within(panel).getByText('Minimum stake'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()

    await open()
    fireEvent.touchStart(document.body, { touches: [{ target: document.body }] })
    expect(screen.queryByRole('dialog')).toBeNull()

    await open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('every choice closes the panel: the graph it changed is what one wants to see', async () => {
    const p = show({ asOf: '2019-12-31', country: 'DE' })
    await userEvent.click(within(await open()).getByRole('radio', { name: '≥25%' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(within(await open()).getByRole('radio', { name: 'All levels' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(within(await open()).getByRole('button', { name: 'Show the present' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(p.onAsOfChange).toHaveBeenCalledWith(null)

    const panel = await open()
    await userEvent.click(within(panel).getByRole('button', { name: 'Germany' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()           // opening the country list is not a choice
    await userEvent.click(within(panel).getByRole('button', { name: /United Kingdom/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(p.onCountryChange).toHaveBeenCalledWith('GB')
  })
})

describe('on a phone', () => {
  it('the panel is laid over the page under the button, not inside the short canvas', async () => {
    const width = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    try {
      show()
      const panel = await open()
      expect(panel.className).toContain('graph-filters__panel--sheet')
      expect(panel.style.top).toMatch(/px$/)
      expect(panel.style.maxHeight).toContain('100dvh')
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    }
  })

  it('on a desktop it is a plain popover', async () => {
    show()
    expect((await open()).className).not.toContain('--sheet')
  })
})
