import { describe, it, expect } from 'vitest'
import { withLineLabels } from './lineLabels'
import type { GraphElement, EdgeData } from '../types'

const below = (n: number) => `${n} subsidiaries`
const edge = (over: Partial<EdgeData>): GraphElement =>
  ({ data: { id: 'a__owns__b', source: 'a', target: 'b', label: '60%', edgeType: 'owns', edgeDir: 'out', ...over } })
const label = (els: GraphElement[]) => (els[0].data as EdgeData).label

describe('withLineLabels — what hangs below, on the line\'s own label', () => {
  it('adds the subsidiaries to the stake, in the words it is given', () => {
    expect(label(withLineLabels([edge({ descendants: 12 })], below))).toBe('60% · 12 subsidiaries')
  })

  it('says only the count where no stake is stated', () => {
    expect(label(withLineLabels([edge({ label: '', descendants: 3 })], below))).toBe('3 subsidiaries')
  })

  it('leaves a line alone when nothing is below, or nothing is known', () => {
    for (const over of [{ descendants: 0 }, { descendants: null }, {}]) {
      const els = [edge(over)]
      const out = withLineLabels(els, below)
      expect(label(out)).toBe('60%')
      expect(out[0]).toBe(els[0])                         // the same object: memoised layouts stay valid
    }
  })

  it('touches only holdings — a role or a node is passed through', () => {
    const role = edge({ id: 'p__role__b', edgeType: 'role', label: 'CEO', descendants: 5 })
    const node: GraphElement = { data: { id: 'b', label: 'B', nodeType: 'entity', raw: {} as never } }
    const out = withLineLabels([role, node], below)
    expect(out[0]).toBe(role)
    expect(out[1]).toBe(node)
  })
})
