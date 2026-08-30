import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OwnershipBadge from './OwnershipBadge'

describe('OwnershipBadge (render)', () => {
  it('shows the type label and percent', () => {
    render(<OwnershipBadge type="minority" percent={12} />)
    expect(screen.getByText('Minority · 12%')).toBeInTheDocument()
  })

  it('falls back to the neutral "Owned" label for unknown/absent type', () => {
    render(<OwnershipBadge type="unknown" />)
    expect(screen.getByText('Owned')).toBeInTheDocument()
  })

  it('does not print the voting figure on the row', () => {
    // It is in the relationship's menu, beside Stake, where it can be compared.
    // Printing it here too crowded the row with the menu's own content.
    render(<OwnershipBadge type="majority" percent={51} votingPct={60} />)
    expect(screen.getByText('Majority · 51%')).toBeInTheDocument()
    expect(screen.queryByText(/60%/)).not.toBeInTheDocument()
  })

  it('marks an owner whose votes outrun its shareholding', () => {
    // 0.01% owned, 51% voted. A mark, not a reading: enough to notice while
    // scanning, with the figures one press away.
    render(<OwnershipBadge type="minority" percent={0.01} votingPct={51} />)
    const marker = screen.getByLabelText(/Special voting/i)
    expect(marker.textContent).toBe('⚡')
    expect(marker.getAttribute('title')).toMatch(/voting agreement with other shareholders/i)
  })

  it('leaves an aligned holder unmarked', () => {
    render(<OwnershipBadge type="majority" percent={55} votingPct={55} />)
    expect(screen.queryByLabelText(/Special voting/i)).not.toBeInTheDocument()
  })

  it('leaves a holder with no voting figure unmarked', () => {
    render(<OwnershipBadge type="minority" percent={5.9} votingPct={null} />)
    expect(screen.queryByLabelText(/Special voting/i)).not.toBeInTheDocument()
  })
})

describe('a voting bloc', () => {
  it('marks Altria, whose 8.05% holding votes a 51.7% bloc', () => {
    // Not a golden share — the hint must not claim one specific cause.
    render(<OwnershipBadge type="minority" percent={8.05} votingPct={51.7} />)
    expect(screen.getByText(/8.05%/)).toBeInTheDocument()
    const marker = screen.getByLabelText(/Special voting/i)
    expect(marker.getAttribute('title')).toMatch(/voting agreement with other shareholders/i)
  })

  it('marks a bloc voter with no attributable stake', () => {
    // BRC can dispose of nothing alone, yet votes a 52.3% bloc.
    render(<OwnershipBadge type={null} percent={null} votingPct={52.3} />)
    expect(screen.getByLabelText(/Special voting/i)).toBeInTheDocument()
  })

  it('stays quiet when voting matches the stake', () => {
    render(<OwnershipBadge type="minority" percent={5.9} votingPct={null} />)
    expect(screen.queryByLabelText(/Special voting/i)).toBeNull()
  })
})

describe('badge order', () => {
  it('puts the voting marker before the stake it qualifies', () => {
    // "⚡ 8.1%" reads as "votes more than this"; "8.1% ⚡" states the figure and
    // qualifies it as an afterthought.
    const { container } = render(
      <OwnershipBadge type="minority" percent={8.1} votingPct={51.9} />)
    const text = (container.textContent ?? '')
    expect(text.indexOf('⚡')).toBeLessThan(text.indexOf('8.1'))
  })
})

describe('a countable holding with no statable percentage', () => {
  // The 13F path: a private issuer has no XBRL shares outstanding, so the edge
  // knows exactly how many shares are held but honestly no percent — and a
  // badge saying just "Minority" reads as missing data, which is how the gap
  // was reported.
  it('shows a compact share count when percent is absent', () => {
    render(<OwnershipBadge type="minority" percent={null} shares={3365400} />)
    expect(screen.getByText(/3\.4\s?M shares/i)).toBeTruthy()
  })

  it('the percentage always wins when both are known', () => {
    render(<OwnershipBadge type="minority" percent={8.05} shares={159121937} />)
    expect(screen.getByText(/8\.05%/)).toBeTruthy()
    expect(screen.queryByText(/shares/i)).toBeNull()
  })

  it('neither known still shows the plain type label', () => {
    render(<OwnershipBadge type="minority" percent={null} shares={null} />)
    expect(screen.getByText('Minority')).toBeTruthy()
    expect(screen.queryByText(/shares/i)).toBeNull()
  })

  it('small counts are not compacted into nonsense', () => {
    render(<OwnershipBadge type="minority" percent={null} shares={250} />)
    expect(screen.getByText(/250 shares/)).toBeTruthy()
  })
})

describe('the display floor', () => {
  // "the presentation with shares should already start with a percentage less
  // than 0.001%" — a figure like 0.0001% says less than the count behind it.
  it('a sub-floor percent with a known count shows the count', () => {
    render(<OwnershipBadge type="minority" percent={0.0009} shares={120000} />)
    expect(screen.getByText(/120\s?K shares/i)).toBeTruthy()
    expect(screen.queryByText(/0\.0009%/)).toBeNull()
  })

  it('exactly at the floor the percent still shows', () => {
    render(<OwnershipBadge type="minority" percent={0.001} shares={120000} />)
    expect(screen.getByText(/0\.001%/)).toBeTruthy()
  })

  it('a sub-floor percent with NO count keeps the percent — a number beats nothing', () => {
    render(<OwnershipBadge type="minority" percent={0.0009} shares={null} />)
    expect(screen.getByText(/0\.0009%/)).toBeTruthy()
  })
})
