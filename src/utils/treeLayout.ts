/**
 * Positions for the "all levels" view: the whole subsidiary tree below the
 * centre, laid out so that no two companies overlap and every company sits
 * below its parent.
 *
 * The arc layout places one ring of subsidiaries on a semi-ellipse and stacks
 * further hops under their parent at a fixed gap — fine for a node expanded by
 * hand, hopeless for a tree: neighbouring subtrees overlap, and Tenet's 772
 * companies under one parent would be one row 55,000 px wide.
 *
 * So, per parent: children that have children of their own are placed side by
 * side, each over its own subtree; children that are leaves are packed into a
 * GRID block beside them (wider than tall, because labels are). A parent is
 * centred over everything below it. Each node gets one parent — the first one
 * reached breadth-first from the centre — so a co-held company is placed once;
 * its other holder's line is still drawn, just not used for placement.
 */
import type { GraphElement } from '../types'

export const TREE_CELL_W = 150      // horizontal room per company (labels wrap)
export const TREE_CELL_H = 64       // vertical room per row inside a leaf grid
export const TREE_LEVEL_GAP = 170   // parent to its children
const BLOCK_GAP = 40                // between sibling subtrees / the leaf grid
const MAX_GRID_COLS = 12

interface Box { width: number; place: (left: number, top: number) => void }

export function computeTreePositions(
  elements: GraphElement[],
  centerId: string | null,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  if (!centerId) return pos

  const outgoers = new Map<string, string[]>()
  for (const el of elements) {
    const d = el.data
    if (!('source' in d) || d.edgeType !== 'owns') continue
    if (!outgoers.has(d.source)) outgoers.set(d.source, [])
    outgoers.get(d.source)!.push(d.target)
  }

  // One parent each: breadth-first from the centre, first reach wins.
  const children = new Map<string, string[]>()
  const seen = new Set<string>([centerId])
  const queue = [centerId]
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi]
    for (const child of outgoers.get(id) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      if (!children.has(id)) children.set(id, [])
      children.get(id)!.push(child)
      queue.push(child)
    }
  }
  if (!children.has(centerId)) return pos

  const box = (id: string): Box => {
    const kids = children.get(id) ?? []
    const branches = kids.filter(k => children.has(k)).map(k => ({ id: k, box: box(k) }))
    const leaves = kids.filter(k => !children.has(k))
    const cols = Math.min(MAX_GRID_COLS, Math.max(1, Math.ceil(Math.sqrt(leaves.length * 2.5))))
    const gridW = leaves.length ? Math.min(cols, leaves.length) * TREE_CELL_W : 0
    const branchesW = branches.reduce((w, b) => w + b.box.width, 0)
                    + Math.max(0, branches.length - 1) * BLOCK_GAP
    const below = branchesW + (branchesW && gridW ? BLOCK_GAP : 0) + gridW
    const width = Math.max(TREE_CELL_W, below)
    return {
      width,
      place(left, top) {
        pos.set(id, { x: left + width / 2, y: top })
        let x = left + (width - below) / 2
        const childTop = top + TREE_LEVEL_GAP
        for (const b of branches) {
          b.box.place(x, childTop)
          x += b.box.width + BLOCK_GAP
        }
        leaves.forEach((leaf, i) => {
          pos.set(leaf, { x: x + (i % cols) * TREE_CELL_W + TREE_CELL_W / 2,
                          y: childTop + Math.floor(i / cols) * TREE_CELL_H })
        })
      },
    }
  }

  const root = box(centerId)
  root.place(-root.width / 2, 0)        // the centre at x = 0, the tree below it
  return pos
}
