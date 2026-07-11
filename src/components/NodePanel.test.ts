import { describe, it, expect } from 'vitest'
import { pickClaim } from './NodePanel'

type Claim = { rank: string; mainsnak: { datavalue?: { value: unknown } } }

const claim = (rank: string, value: string): Claim => ({
  rank,
  mainsnak: { datavalue: { value } },
})

describe('pickClaim', () => {
  it('returns null when claims is undefined', () => {
    expect(pickClaim(undefined, 'P154')).toBeNull()
  })

  it('returns null when the property is missing', () => {
    expect(pickClaim({}, 'P154')).toBeNull()
  })

  it('returns null when the property list is empty', () => {
    expect(pickClaim({ P154: [] }, 'P154')).toBeNull()
  })

  it('picks the preferred-rank claim', () => {
    const claims = { P154: [claim('normal', 'old-logo.svg'), claim('preferred', 'current-logo.svg')] }
    expect(pickClaim(claims, 'P154')).toBe('current-logo.svg')
  })

  it('falls back to normal-rank when no preferred claim exists', () => {
    const claims = { P154: [claim('normal', 'old-logo.svg')] }
    expect(pickClaim(claims, 'P154')).toBe('old-logo.svg')
  })

  it('ignores deprecated-rank claims', () => {
    const claims = { P154: [claim('deprecated', 'very-old.svg')] }
    expect(pickClaim(claims, 'P154')).toBeNull()
  })

  it('prefers preferred over normal when both are present', () => {
    const claims = {
      P154: [
        claim('deprecated', 'oldest.svg'),
        claim('preferred', 'current.svg'),
        claim('normal', 'old.svg'),
      ],
    }
    expect(pickClaim(claims, 'P154')).toBe('current.svg')
  })

  it('returns null when mainsnak has no datavalue', () => {
    const claims = { P154: [{ rank: 'preferred', mainsnak: {} }] }
    expect(pickClaim(claims, 'P154')).toBeNull()
  })
})
