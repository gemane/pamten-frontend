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

  it('renders a voting badge when votingPct is given', () => {
    render(<OwnershipBadge type="majority" percent={51} votingPct={60} />)
    expect(screen.getByText('Majority · 51%')).toBeInTheDocument()
    expect(screen.getByText(/60%/)).toBeInTheDocument()
  })

  it('flags disproportionate voting power (golden share)', () => {
    // 0.01% owned but 51% of the votes → special-voting badge.
    render(<OwnershipBadge type="minority" percent={0.01} votingPct={51} />)
    expect(screen.getByText(/Special voting/)).toBeInTheDocument()
  })

  it('does NOT flag special voting when stake and votes are aligned', () => {
    render(<OwnershipBadge type="majority" percent={55} votingPct={55} />)
    expect(screen.queryByText(/Special voting/)).not.toBeInTheDocument()
  })
})
