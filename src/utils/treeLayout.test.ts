import { describe, it, expect } from 'vitest'
import { computeTreePositions, TREE_CELL_H, TREE_CELL_W, TREE_LEVEL_GAP } from './treeLayout'
import type { GraphElement } from '../types'

const node = (id: string) => ({ data: { id, label: id, nodeType: 'entity', raw: {} } }) as unknown as GraphElement
const owns = (s: string, t: string) =>
  ({ data: { id: `${s}__owns__${t}`, source: s, target: t, label: '', edgeType: 'owns', edgeDir: 'out', stakePct: null } }) as unknown as GraphElement

const tree = (edges: [string, string][]) => {
  const ids = [...new Set(edges.flat())]
  return [...ids.map(node), ...edges.map(([s, t]) => owns(s, t))]
}

const overlaps = (pos: Map<string, { x: number; y: number }>) => {
  const pts = [...pos.values()]
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      if (Math.abs(pts[i].x - pts[j].x) < TREE_CELL_W - 1 && Math.abs(pts[i].y - pts[j].y) < TREE_CELL_H - 1) return true
  return false
}

describe('computeTreePositions', () => {
  it('puts the centre at the origin and every company below its parent', () => {
    const els = tree([['c', 'a'], ['c', 'b'], ['a', 'a1'], ['a', 'a2'], ['a1', 'deep']])
    const pos = computeTreePositions(els, 'c')
    expect(pos.get('c')).toEqual({ x: 0, y: 0 })
    for (const [p, k] of [['c', 'a'], ['c', 'b'], ['a', 'a1'], ['a', 'a2'], ['a1', 'deep']])
      expect(pos.get(k)!.y).toBeGreaterThan(pos.get(p)!.y)
    expect(pos.get('a')!.y).toBe(TREE_LEVEL_GAP)
    expect(overlaps(pos)).toBe(false)
  })

  it('centres a parent over its subtree and keeps sibling subtrees apart', () => {
    const els = tree([['c', 'l'], ['c', 'r'], ['l', 'l1'], ['l', 'l2'], ['l', 'l3'], ['r', 'r1'], ['r', 'r2'], ['r', 'r3']])
    const pos = computeTreePositions(els, 'c')
    const xs = (ids: string[]) => ids.map(i => pos.get(i)!.x)
    expect(Math.max(...xs(['l1', 'l2', 'l3']))).toBeLessThan(Math.min(...xs(['r1', 'r2', 'r3'])))
    const mid = (ids: string[]) => (Math.min(...xs(ids)) + Math.max(...xs(ids))) / 2
    expect(pos.get('l')!.x).toBeCloseTo(mid(['l1', 'l2', 'l3']))
    expect(overlaps(pos)).toBe(false)
  })

  it('packs many leaves under one parent into a grid, not one endless row', () => {
    const leaves = Array.from({ length: 772 }, (_, i) => `leaf${i}`)
    const els = tree([['c', 'uspi'], ['c', 'other'], ...leaves.map(l => ['uspi', l] as [string, string])])
    const pos = computeTreePositions(els, 'c')
    const xs = leaves.map(l => pos.get(l)!.x), ys = leaves.map(l => pos.get(l)!.y)
    expect(new Set(ys).size).toBeGreaterThan(10)                       // many rows
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(13 * TREE_CELL_W)   // not 772 columns
    expect(overlaps(pos)).toBe(false)
  })

  it('places a co-held company once, under the holder reached first', () => {
    const els = tree([['c', 'a'], ['c', 'b'], ['a', 'shared'], ['b', 'shared']])
    const pos = computeTreePositions(els, 'c')
    expect(pos.size).toBe(4)
    expect(pos.get('shared')!.y).toBe(2 * TREE_LEVEL_GAP)
  })

  it('survives a cycle and ignores owners above the centre', () => {
    const els = [...tree([['c', 'a'], ['a', 'c']]), node('owner'), owns('owner', 'c')]
    const pos = computeTreePositions(els, 'c')
    expect([...pos.keys()].sort()).toEqual(['a', 'c'])
  })

  it('returns nothing when the centre has no subsidiaries', () => {
    expect(computeTreePositions([node('c')], 'c').size).toBe(0)
    expect(computeTreePositions([], null).size).toBe(0)
  })
})
