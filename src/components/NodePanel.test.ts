import { describe, it, expect } from 'vitest'
import { pickClaim, formatProvenanceDate, entityToNode, personToNode, ownerToNode, personDisplayDetails, byStakeDesc, byRoleImportance, roleRank, showSourceStatements, entityDetailRows, tenure, byTenureDesc, parentExceptionLines, linkHost, sourceNames } from './NodePanel'
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

describe('showSourceStatements', () => {
  it('hides for a single or missing statement (opaque id = noise)', () => {
    expect(showSourceStatements(undefined)).toBe(false)
    expect(showSourceStatements([])).toBe(false)
    expect(showSourceStatements(['GB-COH-ENT-A'])).toBe(false)
  })

  it('shows once several filings collapsed into one node', () => {
    expect(showSourceStatements(['GB-COH-ENT-A', 'GB-COH-ENT-B'])).toBe(true)
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

describe('entityDetailRows', () => {
  const base = { id: 'lei:1', name: 'Co', type: 'company', verified: false } as Entity

  it('returns no rows when the entity has no detail fields', () => {
    expect(entityDetailRows(base)).toEqual([])
  })

  it('surfaces legal form, registered-at (authority · number), founded date and address in order', () => {
    const rows = entityDetailRows({
      ...base,
      legal_form: 'Private Limited Company',
      registration_authority: 'Companies Register',
      registration_number: '07428111',
      founded_date: '2010-11-09',
      address: '1 Example Street, London, EC1A 1BB, GB',
    })
    expect(rows.map(r => [r.labelKey, r.value])).toEqual([
      ['panel.legalForm', 'Private Limited Company'],
      ['panel.registeredAt', 'Companies Register · 07428111'],
      ['panel.founded', '2010-11-09'],
      ['panel.regAddress', '1 Example Street, London, EC1A 1BB, GB'],
    ])
  })

  it('shows the registration number alone when the authority is unknown', () => {
    const rows = entityDetailRows({ ...base, registration_number: '07428111' })
    expect(rows).toHaveLength(1)
    expect(rows[0].labelKey).toBe('panel.registeredAt')
    expect(rows[0].value).toBe('07428111')
  })

  it('skips fields that are absent', () => {
    const rows = entityDetailRows({ ...base, legal_form: 'Fund' })
    expect(rows.map(r => r.labelKey)).toEqual(['panel.legalForm'])
  })
})

/**
 * A finished role's years.
 *
 * The panel splits a person's positions into what they do and what they did,
 * and the years are what make the second list readable: Steve Jobs has two
 * board seats at Apple, and undated they are two identical rows.
 */
describe('tenure', () => {
  const t = (key: string, o?: Record<string, unknown>) =>
    key === 'timeline.until' ? `until ${o?.year}` : key

  const role = (since?: string | null, until?: string | null) => ({ since, until })

  it('states a closed span as years', () => {
    expect(tenure(role('1977-03-01', '1985-09-01'), t)).toBe('1977 \u2013 1985')
  })

  it('never shows the day or the month', () => {
    // The same rule the timeline and the record of processing hold to.
    expect(tenure(role('1977-03-01', '1985-09-01'), t)).not.toMatch(/03|09/)
  })

  it('states the end alone when the start was never recorded', () => {
    // Common from reverse lookups. A leading dash would read as a typo, and an
    // invented start year would be worse.
    expect(tenure(role(null, '2011-08-23'), t)).toBe('until 2011')
  })

  it('says nothing about a role that has not ended', () => {
    // The section it belongs to only holds ended roles, but the helper is
    // exported: an open role must not be given a span it does not have.
    expect(tenure(role('1976-04-01', null), t)).toBe('')
    expect(tenure(role(null, null), t)).toBe('')
    expect(tenure(null, t)).toBe('')
  })
})

describe('byTenureDesc', () => {
  const spell = (since?: string | null, until?: string | null) => ({ role: { since, until } })

  it('puts the most recent spell first', () => {
    const out = [spell('1977-03-01', '1985-09-01'), spell('1997-01-01', '2011-10-05')]
      .sort(byTenureDesc)
    expect(out[0].role.since).toBe('1997-01-01')
  })

  it('ranks a role still running above one that ended earlier', () => {
    // Sorted on the end date where there is one, the start otherwise.
    const out = [spell('1985-01-01', '1990-01-01'), spell('2020-01-01', null)].sort(byTenureDesc)
    expect(out[0].role.since).toBe('2020-01-01')
  })

  it('orders by when a role ended, not when it began', () => {
    // A long spell that ran to 2025 is more recent than a short one that
    // started later and finished in 2005 — "most recent" means last held.
    const out = [spell('2000-01-01', '2005-01-01'), spell('1990-01-01', '2025-01-01')]
      .sort(byTenureDesc)
    expect(out[0].role.until).toBe('2025-01-01')
  })

  it('leaves undated roles last, whichever way round they arrive', () => {
    // Both branches of the comparator: a sort of two elements only asks once.
    const dated = spell('1977-03-01', '1985-09-01')
    expect([spell(null, null), dated].sort(byTenureDesc)[0]).toBe(dated)
    expect([dated, spell(null, null)].sort(byTenureDesc)[0]).toBe(dated)
  })
})

/**
 * Why a company reports no parent.
 *
 * GLEIF asks who **consolidates the accounts**, not who holds the shares, so a
 * company can have a long shareholder list and still report no parent — Apple
 * lists 37 owners and reports NATURAL_PERSONS. Everything here is about turning
 * one or two published enum fields into what the panel should say, without
 * overstating it.
 */
describe('parentExceptionLines', () => {
  const entity = (extra: Partial<Entity>) => ({ id: 'e1', name: 'X', ...extra }) as Entity

  it('says nothing when the company filed nothing', () => {
    expect(parentExceptionLines(entity({}))).toEqual([])
  })

  it('says nothing for empty or whitespace fields', () => {
    expect(parentExceptionLines(entity({
      no_direct_parent_reason: '', no_ultimate_parent_reason: '   ',
    }))).toEqual([])
  })

  it('reports a direct-only answer', () => {
    // The commonest shape by far: 47 of the 63 on the dev graph.
    const [line] = parentExceptionLines(entity({ no_direct_parent_reason: 'NO_LEI' }))
    expect(line.scope).toBe('direct')
    expect(line.reasons.map(r => r.key)).toEqual(['NO_LEI'])
  })

  it('reports an ultimate-only answer', () => {
    const [line] = parentExceptionLines(entity({ no_ultimate_parent_reason: 'NON_PUBLIC' }))
    expect(line.scope).toBe('ultimate')
  })

  it('collapses a pair that answers both questions the same way', () => {
    // Saying it twice, identically, reads as a bug rather than as two answers.
    const lines = parentExceptionLines(entity({
      no_direct_parent_reason: 'NATURAL_PERSONS',
      no_ultimate_parent_reason: 'NATURAL_PERSONS',
    }))
    expect(lines).toHaveLength(1)
    expect(lines[0].scope).toBe('both')
  })

  it('collapses regardless of the order the reasons were listed in', () => {
    const lines = parentExceptionLines(entity({
      no_direct_parent_reason: 'NO_LEI,NON_PUBLIC',
      no_ultimate_parent_reason: 'NON_PUBLIC,NO_LEI',
    }))
    expect(lines).toHaveLength(1)
    // Displayed in the order the direct field gave them, not re-sorted.
    expect(lines[0].reasons.map(r => r.key)).toEqual(['NO_LEI', 'NON_PUBLIC'])
  })

  it('keeps two lines when the same reason carries different references', () => {
    // Two pointers are two statements, however alike the reasons: collapsing
    // would silently drop one of the company's own citations.
    const lines = parentExceptionLines(entity({
      no_direct_parent_reason: 'NO_LEI',
      no_ultimate_parent_reason: 'NO_LEI',
      no_direct_parent_reason_reference: 'https://example.test/a',
      no_ultimate_parent_reason_reference: 'https://example.test/b',
    }))
    expect(lines).toHaveLength(2)
  })

  it('keeps two lines when the answers differ, direct first', () => {
    const lines = parentExceptionLines(entity({
      no_direct_parent_reason: 'NO_LEI',
      no_ultimate_parent_reason: 'NON_CONSOLIDATING',
    }))
    expect(lines.map(l => l.scope)).toEqual(['direct', 'ultimate'])
  })

  it('trims, drops empties and de-duplicates a multi-reason field', () => {
    const [line] = parentExceptionLines(entity({
      no_direct_parent_reason: ' NO_LEI , ,NON_PUBLIC, NO_LEI ,',
    }))
    expect(line.reasons.map(r => r.key)).toEqual(['NO_LEI', 'NON_PUBLIC'])
  })

  it('normalises a lower-case token to the translation key', () => {
    const [line] = parentExceptionLines(entity({ no_direct_parent_reason: 'natural_persons' }))
    expect(line.reasons[0].key).toBe('NATURAL_PERSONS')
  })

  it('keeps a code it does not recognise, and humanises it', () => {
    // GLEIF has changed this list in both directions. A reason we have no copy
    // for is still one the company reported, and the sentence around it stays true.
    const [line] = parentExceptionLines(entity({ no_direct_parent_reason: 'WHOLLY_NEW_REASON' }))
    expect(line.reasons[0]).toEqual({ key: 'WHOLLY_NEW_REASON', fallback: 'wholly new reason' })
  })

  describe('the reference the filer points at', () => {
    const ref = (reference: string) =>
      parentExceptionLines(entity({
        no_direct_parent_reason: 'NO_LEI', no_direct_parent_reason_reference: reference }))[0]

    it('links an http(s) URL', () => {
      expect(ref('https://example.test/company/1').href).toBe('https://example.test/company/1')
      expect(ref('http://example.test/company/1').href).toBe('http://example.test/company/1')
    })

    it('refuses to link a javascript: URL but still reports it', () => {
      const line = ref('javascript:alert(1)')
      expect(line.href).toBeNull()
      expect(line.reference).toBe('javascript:alert(1)')
    })

    it('does not guess a scheme for a bare host', () => {
      // Prepending https:// to a register's free text fabricates a destination
      // nobody gave us.
      expect(ref('www.example.test/company/1').href).toBeNull()
    })

    it('shows prose as prose', () => {
      const line = ref('Companies House filing 12345')
      expect(line.href).toBeNull()
      expect(line.reference).toBe('Companies House filing 12345')
    })

    it('treats a blank reference as none', () => {
      const line = ref('   ')
      expect(line.reference).toBeNull()
      expect(line.href).toBeNull()
    })
  })
})


describe('linkHost', () => {
  // The relationship menu labels its link with where the link goes. Menus are
  // narrow and a filing URL is not, so the host stands in for the whole thing.

  it('strips the scheme and www', () => {
    expect(linkHost('https://www.sec.gov/Archives/edgar/data/1/x-index.htm')).toBe('sec.gov')
  })

  it('keeps a meaningful subdomain', () => {
    // `search.gleif.org` says more about where you are going than `gleif.org`.
    expect(linkHost('https://search.gleif.org/#/record/X')).toBe('search.gleif.org')
  })

  it('handles a port', () => {
    expect(linkHost('http://localhost:8000/x')).toBe('localhost:8000')
  })

  it('gives nothing back for a non-URL, so the caller can fall back', () => {
    expect(linkHost('Companies House filing 12345')).toBeNull()
    expect(linkHost('')).toBeNull()
    expect(linkHost(null)).toBeNull()
    expect(linkHost(undefined)).toBeNull()
  })
})

describe('sourceNames', () => {
  it('maps an id to its name', () => {
    const m = sourceNames([{ id: 'a', name: 'SEC EDGAR' }, { id: 'b', name: 'Wikidata' }])
    expect(m.get('a')).toBe('SEC EDGAR')
    expect(m.get('b')).toBe('Wikidata')
  })

  it('returns undefined for a source the node does not list', () => {
    // An edge is attributed to whoever created it, which need not be among the
    // sources the node itself carries — better no name than the wrong one.
    expect(sourceNames([{ id: 'a', name: 'SEC EDGAR' }]).get('zzz')).toBeUndefined()
  })

  it('copes with an empty list', () => {
    expect(sourceNames([]).size).toBe(0)
  })
})

describe('byStakeDesc with the shares tier', () => {
  type Row = { s: number | null; sh: number | null; name: string }
  const cmp = byStakeDesc<Row>(x => x.s, x => x.name, x => x.sh)

  it('percent rows come first, then shares-only rows by size, then names', () => {
    const rows: Row[] = [
      { s: null, sh: null,      name: 'Nameless Co' },
      { s: null, sh: 707796,    name: 'BNP' },
      { s: 0.93, sh: 122764805, name: 'Nvidia' },
      { s: null, sh: 171826745, name: 'Gigafund' },
      { s: 4.18, sh: 551189500, name: 'Alphabet' },
    ]
    expect([...rows].sort(cmp).map(r => r.name))
      .toEqual(['Alphabet', 'Nvidia', 'Gigafund', 'BNP', 'Nameless Co'])
  })

  it('a percent always outranks a bigger bare count — no denominator, no comparison', () => {
    const rows: Row[] = [
      { s: null, sh: 9_999_999_999, name: 'Huge Count' },
      { s: 0.0001, sh: null,        name: 'Tiny Percent' },
    ]
    expect([...rows].sort(cmp).map(r => r.name)).toEqual(['Tiny Percent', 'Huge Count'])
  })

  it('without a shares accessor it behaves exactly as before', () => {
    const plain = byStakeDesc<Row>(x => x.s, x => x.name)
    const rows: Row[] = [{ s: null, sh: 5, name: 'B' }, { s: null, sh: 9, name: 'A' }]
    expect([...rows].sort(plain).map(r => r.name)).toEqual(['A', 'B'])
  })
})
