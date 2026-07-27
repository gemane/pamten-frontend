import { describe, it, expect } from 'vitest'
import { isSpecialVoting } from './OwnershipBadge'

describe('isSpecialVoting', () => {
  it('flags voting far above the economic stake (golden share)', () => {
    expect(isSpecialVoting(0.01, 51)).toBe(true)   // tiny stake, majority votes
    expect(isSpecialVoting(10, 40)).toBe(true)      // 30pt gap
  })

  it('flags high voting with no disclosed stake', () => {
    expect(isSpecialVoting(null, 30)).toBe(true)
    expect(isSpecialVoting(null, 10)).toBe(false)   // below threshold
  })

  it('does not flag when voting tracks the stake', () => {
    expect(isSpecialVoting(50, 50)).toBe(false)
    expect(isSpecialVoting(50, 60)).toBe(false)     // only 10pt gap
    expect(isSpecialVoting(30, null)).toBe(false)   // no voting info
    expect(isSpecialVoting(null, null)).toBe(false)
  })
})
