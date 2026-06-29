import { describe, it, expect } from 'vitest'
import { buildCsvContent } from './exportCsv'
import type { GraphElement } from '../types'

const TRANSLATIONS: Record<string, string> = {
  'csv.name': 'Name', 'csv.type': 'Type', 'csv.subtype': 'Sub-type',
  'csv.country': 'Country', 'csv.founded': 'Founded', 'csv.revenue': 'Revenue',
  'csv.from': 'From', 'csv.to': 'To', 'csv.relationship': 'Relationship',
  'csv.ownershipType': 'Ownership type', 'csv.stakePct': 'Stake %', 'csv.votingPct': 'Voting %',
  'csv.relOwnership': 'Ownership', 'csv.relVoting': 'Voting power', 'csv.relRole': 'Role',
  'legend.person': 'Person', 'legend.company': 'Company', 'legend.holding': 'Holding',
  'ownershipType.majority': 'majority', 'ownershipType.minority': 'minority',
  'ownershipType.controlling': 'controlling', 'ownershipType.full': 'full',
}

const t = (key: string, opts?: Record<string, unknown>): string =>
  TRANSLATIONS[key] ?? (opts?.defaultValue as string | undefined) ?? ''

const node = (overrides: Record<string, unknown>): GraphElement => ({
  data: { nodeType: 'entity', entitySubtype: 'company', ...overrides } as never,
})

const edge = (overrides: Record<string, unknown>): GraphElement => ({
  data: { source: 'a', target: 'b', edgeType: 'owns', ...overrides } as never,
})

const parse = (csv: string) => {
  const [nodeSection, edgeSection] = csv.split('\n\n')
  const rows = (s: string) => s.split('\n').map(r => r.split(',').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"')))
  return { nodes: rows(nodeSection), edges: rows(edgeSection) }
}

describe('buildCsvContent', () => {
  it('produces node and edge header rows when elements is empty', () => {
    const csv = buildCsvContent([], t)
    const { nodes, edges } = parse(csv)
    expect(nodes).toHaveLength(1)
    expect(edges).toHaveLength(1)
    expect(nodes[0]).toContain('Name')
    expect(edges[0]).toContain('From')
  })

  it('writes a company node row with label, type, country, founded, revenue', () => {
    const el = node({
      id: '1', label: 'Acme Corp',
      raw: { country: 'DE', founded: 1990, revenue: 5_000_000_000 },
    })
    const { nodes } = parse(buildCsvContent([el], t))
    const row = nodes[1]
    expect(row[0]).toBe('Acme Corp')
    expect(row[1]).toBe('Company')
    expect(row[3]).toBe('DE')
    expect(row[4]).toBe('1990')
    expect(row[5]).toBe('$5.0B')
  })

  it('writes a person node row with type "person" and no revenue', () => {
    const el = node({ id: '2', label: 'Jane Doe', nodeType: 'person', raw: { nationality: 'US' } })
    const { nodes } = parse(buildCsvContent([el], t))
    expect(nodes[1][1]).toBe('Person')
    expect(nodes[1][5]).toBe('')
  })

  it('omits revenue field when raw.revenue is null', () => {
    const el = node({ id: '3', label: 'Shell Co', raw: { revenue: null } })
    const { nodes } = parse(buildCsvContent([el], t))
    expect(nodes[1][5]).toBe('')
  })

  it('writes an ownership edge with stake% and ownershipType', () => {
    const elA = node({ id: 'a', label: 'Parent' })
    const elB = node({ id: 'b', label: 'Child' })
    const elE = edge({ edgeType: 'owns', ownershipType: 'majority', stakePct: 75, votingPowerPct: null })
    const { edges } = parse(buildCsvContent([elA, elB, elE], t))
    const row = edges[1]
    expect(row[0]).toBe('Parent')
    expect(row[1]).toBe('Child')
    expect(row[2]).toBe('Ownership')
    expect(row[3]).toBe('majority')
    expect(row[4]).toBe('75%')
    expect(row[5]).toBe('')
  })

  it('writes a role edge with edgeType label and empty ownership fields', () => {
    const elA = node({ id: 'a', label: 'Person' })
    const elB = node({ id: 'b', label: 'Company' })
    const elE = edge({ edgeType: 'role', ownershipType: null, stakePct: null, votingPowerPct: null })
    const { edges } = parse(buildCsvContent([elA, elB, elE], t))
    expect(edges[1][2]).toBe('Role')
    expect(edges[1][3]).toBe('')
    expect(edges[1][4]).toBe('')
  })

  it('escapes double-quotes in node names', () => {
    const el = node({ id: '1', label: 'He said "hello"', raw: {} })
    const csv = buildCsvContent([el], t)
    expect(csv).toContain('"He said ""hello"""')
  })

  it('falls back to source/target id when node not in nameOf map', () => {
    const elE = edge({ source: 'unknown-x', target: 'unknown-y', edgeType: 'owns' })
    const { edges } = parse(buildCsvContent([elE], t))
    expect(edges[1][0]).toBe('unknown-x')
    expect(edges[1][1]).toBe('unknown-y')
  })

  it('capitalises unknown edgeType values', () => {
    const elE = edge({ edgeType: 'custom' })
    const { edges } = parse(buildCsvContent([elE], t))
    expect(edges[1][2]).toBe('Custom')
  })

  it('includes votingPowerPct% for vote edges', () => {
    const elE = edge({ edgeType: 'votes', stakePct: null, votingPowerPct: 33.3 })
    const { edges } = parse(buildCsvContent([elE], t))
    expect(edges[1][5]).toBe('33.3%')
  })
})
