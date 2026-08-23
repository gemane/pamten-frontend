/**
 * The trust cue on a relationship row.
 *
 * Three states and the boundaries between them are the whole component: a row
 * confirmed by two sources, a row resting on Wikidata alone, and — the case
 * that must stay silent — a register-backed row and a row with no claim data.
 * Badging the normal case would turn every row into noise, and marking
 * "no claim data" as community would be a false accusation.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CorroborationBadge, { trustLevel } from './CorroborationBadge'
import type { OwnsRelationship } from '../types'

const rel = (corroborations: number, asserted_by: string[]): OwnsRelationship =>
  ({ corroborations, asserted_by })

describe('trustLevel', () => {
  it('calls two sources corroborated', () => {
    expect(trustLevel(rel(2, ['SEC EDGAR', 'Wikidata']))).toBe('corroborated')
  })

  it('treats three the same as two', () => {
    expect(trustLevel(rel(3, ['GLEIF', 'SEC EDGAR', 'Wikidata']))).toBe('corroborated')
  })

  it('calls a lone Wikidata assertion community', () => {
    expect(trustLevel(rel(1, ['Wikidata']))).toBe('community')
  })

  it('says nothing about a lone register source', () => {
    // The normal case. A 13G-backed stake needs no defending.
    expect(trustLevel(rel(1, ['SEC EDGAR']))).toBeNull()
    expect(trustLevel(rel(1, ['GLEIF']))).toBeNull()
    expect(trustLevel(rel(1, ['UK PSC']))).toBeNull()
  })

  it('says nothing when there is no claim data at all', () => {
    // Edges predate the claims table. "We do not know" must not render as
    // "community" — that would be an accusation the data does not make.
    expect(trustLevel(rel(0, []))).toBeNull()
    expect(trustLevel(undefined)).toBeNull()
    expect(trustLevel(null)).toBeNull()
    expect(trustLevel({} as OwnsRelationship)).toBeNull()
  })
})

describe('what it renders', () => {
  it('shows the count on a corroborated row', () => {
    render(<CorroborationBadge rel={rel(2, ['SEC EDGAR', 'Wikidata'])} />)
    expect(screen.getByText(/✓\s*2/)).toBeInTheDocument()
  })

  it('names the confirming sources in the tooltip', () => {
    render(<CorroborationBadge rel={rel(2, ['SEC EDGAR', 'Wikidata'])} />)
    expect(screen.getByText(/✓\s*2/).getAttribute('title'))
      .toContain('SEC EDGAR, Wikidata')
  })

  it('marks a community-only row as such', () => {
    render(<CorroborationBadge rel={rel(1, ['Wikidata'])} />)
    const badge = screen.getByText('community')
    expect(badge.className).toContain('corroboration-badge--community')
    expect(badge.getAttribute('title')).toMatch(/no register or filing confirms/i)
  })

  it('renders nothing for the register-backed and unknown cases', () => {
    const { container: a } = render(<CorroborationBadge rel={rel(1, ['SEC EDGAR'])} />)
    const { container: b } = render(<CorroborationBadge rel={rel(0, [])} />)
    expect(a.firstChild).toBeNull()
    expect(b.firstChild).toBeNull()
  })
})
