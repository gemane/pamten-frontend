/**
 * The stake filter above the ⓘ.
 *
 * Two things it must not get wrong. **Undisclosed stays visible**: most
 * ownership links state no percentage, and hiding them would delete most of the
 * graph while presenting the remainder as the whole picture. And **the
 * boundaries mean what they say** — "≥25%" includes 25, ">50%" does not include
 * 50 — because those thresholds come from the rules the data is reported under,
 * and an off-by-one there is a silently wrong answer to a legal question.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GraphStakeFilter, {
  STAKE_FILTERS, ANY_STAKE, DEFAULT_STAKE, keepsEdge, effectiveStakePct, filterLabel,
} from './GraphStakeFilter'

const byId = (id: string) => STAKE_FILTERS.find(f => f.id === id)!

describe('which relationships survive', () => {
  it('keeps an undisclosed stake under every band', () => {
    for (const f of STAKE_FILTERS) {
      expect(keepsEdge(null, f), f.id).toBe(true)
      expect(keepsEdge(undefined, f), f.id).toBe(true)
    }
  })

  it('keeps everything stated under Any', () => {
    expect(keepsEdge(0, ANY_STAKE)).toBe(true)
    expect(keepsEdge(0.5, ANY_STAKE)).toBe(true)
    expect(keepsEdge(100, ANY_STAKE)).toBe(true)
  })

  it('includes the boundary where the band says "≥"', () => {
    expect(keepsEdge(25, byId('gte25'))).toBe(true)
    expect(keepsEdge(24.9, byId('gte25'))).toBe(false)
    expect(keepsEdge(5, byId('gte5'))).toBe(true)
    expect(keepsEdge(4.9, byId('gte5'))).toBe(false)
  })

  it('excludes the boundary where the band says ">"', () => {
    // A holder of exactly half does not hold "more than 50%".
    expect(keepsEdge(50, byId('gt50'))).toBe(false)
    expect(keepsEdge(50.01, byId('gt50'))).toBe(true)
    expect(keepsEdge(75, byId('gt75'))).toBe(false)
    expect(keepsEdge(100, byId('gt75'))).toBe(true)
  })
})

describe('how a band is written', () => {
  it('names the open band rather than showing 0%', () => {
    expect(filterLabel(ANY_STAKE, 'Any')).toBe('Any')
  })

  it('writes the comparison the band actually uses', () => {
    expect(filterLabel(byId('gte5'), 'Any')).toBe('≥5%')
    expect(filterLabel(byId('gte25'), 'Any')).toBe('≥25%')
    expect(filterLabel(byId('gt50'), 'Any')).toBe('>50%')
    expect(filterLabel(byId('gt75'), 'Any')).toBe('>75%')
  })
})

const show = (value = ANY_STAKE, onChange = vi.fn(), stated = 26, total = 115) => {
  render(<GraphStakeFilter value={value} onChange={onChange} stated={stated} total={total} />)
  return onChange
}
const button = () => screen.getByRole('button', { name: /Minimum stake/i })

describe('the control', () => {
  it('starts closed', () => {
    show()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('an effective stake is computed from shares when the stake is null', () => {
    // A below-precision-floor 13F holder: 5,000 of 12.23bn shares. Null stake,
    // but knowably tiny — must be computed so the ≥1% filter can hide it.
    expect(effectiveStakePct(null, 5000, 12_230_000_000)).toBeCloseTo(0.00004, 5)
    expect(keepsEdge(effectiveStakePct(null, 5000, 12_230_000_000), DEFAULT_STAKE)).toBe(false)
    // A genuine 4.7% holder stored with shares: computed, kept.
    expect(effectiveStakePct(null, 8_593_355, 182_981_979)).toBeCloseTo(4.7, 1)
    // A stored stake always wins; a truly undisclosed edge stays null (kept).
    expect(effectiveStakePct(2.5, 999, 1000)).toBe(2.5)
    expect(effectiveStakePct(null, null, null)).toBeNull()
    expect(keepsEdge(effectiveStakePct(null, null, null), DEFAULT_STAKE)).toBe(true)
  })

  it('the default band is ≥1% and trims only smaller DISCLOSED stakes', () => {
    expect(DEFAULT_STAKE.id).toBe('gte1')
    expect(keepsEdge(0.9, DEFAULT_STAKE)).toBe(false)   // Nvidia's 0.9% of SpaceX
    expect(keepsEdge(1, DEFAULT_STAKE)).toBe(true)
    expect(keepsEdge(null, DEFAULT_STAKE)).toBe(true)   // undisclosed always kept
  })

  it('offers the six bands, in order', async () => {
    show()
    await userEvent.click(button())
    expect(screen.getAllByRole('menuitemradio').map(o => o.textContent))
      .toEqual(['Any', '≥1%', '≥5%', '≥25%', '>50%', '>75%'])
  })

  it('reports the chosen band and closes', async () => {
    const onChange = show()
    await userEvent.click(button())
    await userEvent.click(screen.getByRole('menuitemradio', { name: '>50%' }))
    expect(onChange).toHaveBeenCalledWith(byId('gt50'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('marks the band in force', async () => {
    show(byId('gte25'))
    await userEvent.click(button())
    expect(screen.getByRole('menuitemradio', { name: '≥25%' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'Any' })).toHaveAttribute('aria-checked', 'false')
  })

  it('shows the band on the button, so a filtered graph never looks whole', () => {
    show(byId('gt75'))
    expect(button()).toHaveTextContent('>75%')
  })

  it('says nothing on the button when nothing is filtered', () => {
    show(ANY_STAKE)
    expect(button()).not.toHaveTextContent('%')
  })

  it('admits how much of the graph it cannot judge', async () => {
    show(ANY_STAKE, vi.fn(), 26, 115)
    await userEvent.click(button())
    expect(screen.getByText(/26 of 115/)).toBeInTheDocument()
    expect(screen.getByText(/always shown/i)).toBeInTheDocument()
  })

  it('breaks that note over two lines rather than one long one', async () => {
    // A single sentence set the panel's width from its max-content, leaving the
    // band rows trailing empty space. Where it breaks is fixed here rather than
    // left to the wrap point, which differs per language.
    show(ANY_STAKE, vi.fn(), 26, 115)
    await userEvent.click(button())
    const note = screen.getByText(/26 of 115/).parentElement!
    expect(note.querySelectorAll('p')).toHaveLength(2)
  })
})

describe('dismissal', () => {
  const open = async () => {
    show()
    await userEvent.click(button())
    expect(screen.getByRole('menu')).toBeInTheDocument()
  }

  it('closes on a click elsewhere', async () => {
    await open()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on a tap elsewhere', async () => {
    await open()
    fireEvent.touchStart(document.body, { touches: [{ target: document.body }] })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape', async () => {
    await open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('stays open when the click is inside it', async () => {
    await open()
    fireEvent.mouseDown(screen.getByRole('menuitemradio', { name: 'Any' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
