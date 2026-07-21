import { describe, it, expect } from 'vitest'
import { pickClaim, formatProvenanceDate, entityToNode, personToNode, ownerToNode, personDisplayDetails, byStakeDesc, byRoleImportance, roleRank } from './NodePanel'
import type { Entity, Person } from '../types'

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

describe('formatProvenanceDate', () => {
  it('returns null for empty / missing input', () => {
    expect(formatProvenanceDate(undefined)).toBeNull()
    expect(formatProvenanceDate(null)).toBeNull()
    expect(formatProvenanceDate('')).toBeNull()
  })

  it('formats a plain YYYY-MM-DD date', () => {
    expect(formatProvenanceDate('2025-02-14')).toBe('Feb 14, 2025')
  })

  it('formats a full ISO timestamp by its date part (timezone-independent)', () => {
    expect(formatProvenanceDate('2026-07-12T09:00:00+00:00')).toBe('Jul 12, 2026')
  })

  it('strips a leading zero from the day', () => {
    expect(formatProvenanceDate('2025-12-03')).toBe('Dec 3, 2025')
  })

  it('returns null for unparseable input or an invalid month', () => {
    expect(formatProvenanceDate('not-a-date')).toBeNull()
    expect(formatProvenanceDate('2025-13-01')).toBeNull()
  })
})

describe('rel-row node mappers', () => {
  const entity = { id: 'e1', name: 'Acme Corp', type: 'company' } as Entity
  const person = { id: 'p1', full_name: 'Jane Doe' } as Person

  it('maps an entity to an entity NodeData with subtype', () => {
    const n = entityToNode(entity)
    expect(n).toMatchObject({ id: 'e1', label: 'Acme Corp', nodeType: 'entity', entitySubtype: 'company' })
    expect(n.raw).toBe(entity)
  })

  it('maps a person to a person NodeData', () => {
    const n = personToNode(person)
    expect(n).toMatchObject({ id: 'p1', label: 'Jane Doe', nodeType: 'person' })
    expect(n.raw).toBe(person)
  })

  it('ownerToNode picks entity vs person by shape', () => {
    expect(ownerToNode(entity).nodeType).toBe('entity')   // has `name`
    expect(ownerToNode(person).nodeType).toBe('person')   // has `full_name`
    expect(ownerToNode(person).label).toBe('Jane Doe')
  })
})

describe('personDisplayDetails', () => {
  const base: Person = {
    id: 'p1', first_name: 'Elon', last_name: 'Musk', full_name: 'Elon Musk',
    verified: false,
  }

  it('formats birth and death dates', () => {
    const d = personDisplayDetails({ ...base, birth_date: '1971-06-28', death_date: '2099-01-02' }, 'en')
    expect(d.born).toBe('Jun 28, 1971')
    expect(d.died).toBe('Jan 2, 2099')
  })

  it('returns null dates when absent', () => {
    const d = personDisplayDetails(base, 'en')
    expect(d.born).toBeNull()
    expect(d.died).toBeNull()
  })

  it('surfaces aliases (nicknames), filtering blanks', () => {
    const d = personDisplayDetails({ ...base, alias: ['Elon', '', 'Technoking'] }, 'en')
    expect(d.aka).toEqual(['Elon', 'Technoking'])
  })

  it('empty aliases yield an empty list', () => {
    expect(personDisplayDetails(base, 'en').aka).toEqual([])
  })

  it('uses the nationalities list when present, resolving each to a name', () => {
    const d = personDisplayDetails({ ...base, nationalities: ['US', 'CA'] }, 'en')
    expect(d.nationalities).toHaveLength(2)
    // codes resolve to human-readable names (not the raw ISO-2 code)
    expect(d.nationalities[0]).not.toBe('US')
    expect(d.nationalities[0].length).toBeGreaterThan(2)
  })

  it('falls back to the single nationality field when the list is empty', () => {
    const d = personDisplayDetails({ ...base, nationality: 'GB' }, 'en')
    expect(d.nationalities).toHaveLength(1)
  })
})

describe('byStakeDesc', () => {
  const stake = (n: number | null | undefined, name: string) => ({ s: n, name })
  const cmp = byStakeDesc<{ s: number | null | undefined; name: string }>(x => x.s, x => x.name)

  it('sorts by stake descending', () => {
    const out = [stake(10, 'B'), stake(55, 'A'), stake(30, 'C')].sort(cmp)
    expect(out.map(x => x.name)).toEqual(['A', 'C', 'B'])
  })

  it('puts unknown stakes last', () => {
    const out = [stake(null, 'A'), stake(20, 'B')].sort(cmp)
    expect(out.map(x => x.name)).toEqual(['B', 'A'])
  })

  it('falls back to alphabetical when stakes are equal/absent', () => {
    const out = [stake(null, 'Zeta'), stake(null, 'Alpha'), stake(null, 'Mu')].sort(cmp)
    expect(out.map(x => x.name)).toEqual(['Alpha', 'Mu', 'Zeta'])
  })
})

describe('roleRank / byRoleImportance', () => {
  it('ranks CEO above CFO above board member', () => {
    expect(roleRank('CEO')).toBeLessThan(roleRank('CFO'))
    expect(roleRank('Chief Financial Officer')).toBeLessThan(roleRank('Board Member'))
  })

  it('ranks unknown roles last', () => {
    expect(roleRank('Wizard')).toBeGreaterThan(roleRank('Board Member'))
    expect(roleRank(null)).toBeGreaterThan(roleRank('Director'))
  })

  it('sorts executives by role importance, then alphabetically', () => {
    const e = (role: string, name: string) => ({ role, name })
    const cmp = byRoleImportance<{ role: string; name: string }>(x => x.role, x => x.name)
    const out = [
      e('Board Member', 'Zoe'),
      e('Board Member', 'Amy'),
      e('CEO', 'Uli'),
      e('CEO', 'Phil'),
      e('CFO', 'Sam'),
    ].sort(cmp)
    expect(out.map(x => x.name)).toEqual(['Phil', 'Uli', 'Sam', 'Amy', 'Zoe'])
  })

  it('groups board members and directors by title, each alphabetical', () => {
    const e = (role: string, name: string) => ({ role, name })
    const cmp = byRoleImportance<{ role: string; name: string }>(x => x.role, x => x.name)
    // interleaved input; both roles share the same rank (7)
    const out = [
      e('Director', 'Carol'),
      e('Board Member', 'Bob'),
      e('Director', 'Alice'),
      e('Board Member', 'Dave'),
    ].sort(cmp)
    // Board Member group (alpha) then Director group (alpha)
    expect(out.map(x => `${x.role}:${x.name}`)).toEqual([
      'Board Member:Bob', 'Board Member:Dave', 'Director:Alice', 'Director:Carol',
    ])
  })
})
