/**
 * A person's career, in order.
 *
 * The panel already lists positions and holdings; the timeline is about
 * *sequence* — Steve Jobs founding Apple in 1976, leaving the board in 1985,
 * returning in 1997. Every case below is real data from the dev graph, because
 * the awkward shapes here are the ones the sources actually produce: two spells
 * in the same job, roles with no dates at all, and holdings that never end.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import PersonTimeline, { personTimelineRows, hasDatedRows } from './PersonTimeline'
import type { PersonProfile } from '../types'

const position = (company: string, role: string, since?: string, until?: string) =>
  ({ entity: { id: company, name: company }, role: { role, since, until } })

const holding = (company: string, since?: string, pct?: number) =>
  ({ entity: { id: company, name: company },
     relationship: { since, stake_percent: pct, ownership_type: 'minority' } })

const profile = (positions: unknown[], holdings: unknown[] = []): PersonProfile =>
  ({ person: { id: 'p1', full_name: 'Test Person' }, positions, holdings } as unknown as PersonProfile)

// Steve Jobs, as the graph holds him.
const JOBS = profile([
  position('Apple Inc.', 'Founder', '1976-04-01'),
  position('Apple Inc.', 'Board Member', '1977-03-01', '1985-09-01'),
  position('Apple Inc.', 'Board Member', '1997-01-01', '2011-10-05'),
  position('Apple Inc.', 'CEO', '1997-09-01', '2011-08-23'),
])

describe('the order', () => {
  it('runs newest first', () => {
    const years = personTimelineRows(JOBS).map(r => r.since?.slice(0, 4))
    expect(years).toEqual(['1997', '1997', '1977', '1976'])
  })

  it('puts undated entries last, not first', () => {
    // "Founder of Google" has no date and never will. Sorting it as an empty
    // string would park it at the top, above everything that did happen.
    const rows = personTimelineRows(profile([
      position('Google', 'Founder'),
      position('Alphabet Inc.', 'CEO', '2015-08-10'),
    ]))
    expect(rows.map(r => r.company)).toEqual(['Alphabet Inc.', 'Google'])
  })

  it('keeps both spells of the same job', () => {
    // Larry Page was Google's CEO twice. Collapsing that is what the backend
    // dedup deliberately avoids, and the timeline is where it shows.
    const rows = personTimelineRows(profile([
      position('Google', 'CEO', '1998-01-01', '2001-01-01'),
      position('Google', 'CEO', '2011-04-04', '2015-08-10'),
    ]))
    expect(rows.filter(r => r.label === 'CEO')).toHaveLength(2)
  })

  it('carries positions and holdings in one sequence', () => {
    const rows = personTimelineRows(profile(
      [position('Alphabet Inc.', 'CEO', '2015-08-10')],
      [holding('Alphabet Inc.', '2022-02-11', 6.12)],
    ))
    expect(rows.map(r => r.kind)).toEqual(['owns', 'role'])
  })
})

describe('whether to show it at all', () => {
  it('is worth showing when something is dated', () => {
    expect(hasDatedRows(JOBS)).toBe(true)
  })

  it('is not worth showing when nothing is', () => {
    // Roughly half the people in the graph are in this state — their roles come
    // from a reverse lookup that carries no dates. A tab full of "no date
    // recorded" is worse than no tab.
    expect(hasDatedRows(profile([position('Google', 'Founder')]))).toBe(false)
  })

  it('is not worth showing for somebody with nothing at all', () => {
    expect(hasDatedRows(profile([]))).toBe(false)
    expect(hasDatedRows(null)).toBe(false)
  })
})

describe('what it draws', () => {
  it('groups by year, newest group first', () => {
    render(<PersonTimeline profile={JOBS} />)
    const years = screen.getAllByText(/^(1976|1977|1997)$/).map(e => e.textContent)
    expect(years).toEqual(['1997', '1977', '1976'])
  })

  it('marks a finished role with the year it ended', () => {
    render(<PersonTimeline profile={profile([
      position('Apple Inc.', 'CEO', '1997-09-01', '2011-08-23'),
    ])} />)
    expect(screen.getByText(/until 2011/i)).toBeInTheDocument()
  })

  it('marks an open role as active', () => {
    render(<PersonTimeline profile={profile([
      position('Alphabet Inc.', 'Board Member', '1998-01-01'),
    ])} />)
    expect(screen.getByText(/active/i)).toBeInTheDocument()
  })

  it('does not call an undated role active', () => {
    // It is not a current position — it is a position of unknown date, and
    // saying "Active" would be an assertion the sources never made.
    render(<PersonTimeline profile={profile([position('Google', 'Founder')])} />)
    expect(screen.queryByText(/active/i)).toBeNull()
    expect(screen.getByText(/no date recorded/i)).toBeInTheDocument()
  })

  it('shows the stake on a holding', () => {
    render(<PersonTimeline profile={profile([], [holding('Alphabet Inc.', '2022-02-11', 6.12)])} />)
    const group = screen.getByText('2022').closest('.tl-group') as HTMLElement
    expect(within(group).getByText(/6\.12/)).toBeInTheDocument()
  })
})
