/**
 * The rule that separates a long press from a scroll.
 *
 * The rows this is attached to live in a panel that scrolls vertically, so
 * without the movement cancel every drag past a relationship would pop a menu.
 * The timing itself is left to setTimeout; what is worth pinning is the
 * tolerance, because getting it wrong is the difference between "unusable on a
 * phone" and "fine", and neither is visible in code review.
 */
import { describe, it, expect } from 'vitest'
import { withinSlop, LONG_PRESS_SLOP, LONG_PRESS_MS } from './useLongPress'

describe('withinSlop', () => {
  it('allows a finger that barely moves', () => {
    expect(withinSlop(0, 0)).toBe(true)
    expect(withinSlop(3, -4)).toBe(true)
  })

  it('allows movement right up to the limit', () => {
    expect(withinSlop(LONG_PRESS_SLOP, LONG_PRESS_SLOP)).toBe(true)
  })

  it('rejects a scroll', () => {
    // The case that matters: a vertical drag through the list.
    expect(withinSlop(0, LONG_PRESS_SLOP + 1)).toBe(false)
  })

  it('rejects movement in either axis, and in either direction', () => {
    expect(withinSlop(LONG_PRESS_SLOP + 1, 0)).toBe(false)
    expect(withinSlop(-(LONG_PRESS_SLOP + 1), 0)).toBe(false)
    expect(withinSlop(0, -(LONG_PRESS_SLOP + 1))).toBe(false)
  })

  it('takes a caller-supplied tolerance', () => {
    expect(withinSlop(20, 0, 25)).toBe(true)
    expect(withinSlop(20, 0, 5)).toBe(false)
  })
})

describe('the constants', () => {
  it('holds long enough not to fire on a tap, briefly enough not to feel broken', () => {
    expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(400)
    expect(LONG_PRESS_MS).toBeLessThanOrEqual(800)
  })

  it('tolerates about a fingertip of drift', () => {
    expect(LONG_PRESS_SLOP).toBeGreaterThan(4)
    expect(LONG_PRESS_SLOP).toBeLessThan(20)
  })
})
