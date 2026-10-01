/**
 * The subsidiary tree below the centre — one level of it ("Direct") or all of
 * them ("All levels") — laid out so that no two companies overlap, every
 * company sits below its parent — and NO TWO LINES CROSS.
 *
 * The arc layout places one ring of subsidiaries on a semi-ellipse and stacks
 * further hops under their parent at a fixed gap — fine for a node expanded by
 * hand, hopeless for a tree.
 *
 * Three things keep the lines apart:
 *
 *  1. ONE PARENT: THE LARGEST HOLDER, BETWEEN EQUALS THE DEEPEST. A filer's
 *     flat subsidiary list names everything it controls at any depth —
 *     Microsoft's lists Activision's subsidiaries beside Activision — while
 *     another source says who holds them directly. Neither states a stake, so
 *     the deeper holder places the company and it sits beside the line that
 *     explains it. Where stakes ARE stated the largest places it: Chubb's
 *     99.9 % holder, not the affiliate with 0.1 % that happens to sit deeper.
 *     The backend's tree names the same parent, so the panel's list agrees.
 *  2. IMPLIED LINES ARE NOT DRAWN. Once King sits under Activision under
 *     Microsoft, Microsoft's own line to King says nothing the two lines above
 *     do not, and it would cut across the picture. Such a line — its holder is
 *     an ancestor of the company's parent and it states no stake of its own —
 *     is reported in `implied`.
 *  3. RIGHT-ANGLED ROUTES IN GUTTERS. Under each parent its children — single
 *     companies and whole sub-branches alike — are flowed into COLUMNS. A line
 *     drops from the parent to a bus, runs along it, and then either comes
 *     down onto the child (the first in its column: `top`) or runs down the
 *     gutter left of the column and in from the side (`side`: those below). The row a
 *     branch's own parent sits on holds nothing else, so the way in from the
 *     side is always free; gutters and buses belong to one parent each. A tree
 *     drawn this way is planar.
 *
 * And one keeps it readable: the NUMBER OF COLUMNS under each parent is the
 * one that makes that branch's box closest to the screen's shape. One row per
 * level (the classic tree) made Chubb's ten levels 27,000 px wide and 1,700
 * tall — lines that never cross and names nobody can read; one column would be
 * as tall. Boxes of about the screen's shape pack into a picture of about the
 * screen's shape.
 *
 * What can still cross: a genuine co-holder in ANOTHER branch (not an
 * ancestor) — Chubb has 32. Its line is real information, so it is drawn, but
 * straight and faint (`coHolders`), behind the tree rather than through it.
 * The largest stake places the company, so the faint line is always the
 * smaller holding.
 */
import type { GraphElement } from '../types'

/** Left of every company: room for its column's trunk and the stub into it. */
export const TREE_GUTTER = 34
const ROW_GAP = 12                  // under every company
/** Between a parent's bottom edge and its children's top edge; the bus runs in the middle. */
export const TREE_BUS_SPACE = 56
/** The trunk runs this far inside the left edge of a column. */
export const TREE_TRUNK_INSET = 10
/** A sub-branch sits this far inside its column, clear of the column's trunk. */
const NEST = 22
const BRANCH_GAP = 18               // under a sub-branch, before the next company in the column
/** A holding with no stated percentage (a consolidation parent, a filer's
 *  subsidiary list) counts as control when holders compete to place a company. */
const UNSTATED_STAKE = 50
/** …and a ROLE counts for less than any holding: the centred person's seat on
 *  a board places a company only where no ownership does. */
const ROLE_STAKE = -1

type EdgeLike = { source: string; target: string; edgeType?: string; stakePct?: number | null }
/** The lines a tree is built from: every holding — and, from a centred PERSON,
 *  their roles too, so the companies they run sit in the same columns as the
 *  ones they own (they were left on the old arc, in a second style, under the
 *  tree). Only from the centre: a role is not ownership, and the tree never
 *  continues through one. */
const placesFrom = (d: EdgeLike, centerId: string) =>
  d.edgeType === 'owns' || (d.edgeType === 'role' && d.source === centerId)
const stakeOfEdge = (d: EdgeLike) =>
  d.edgeType === 'role' ? ROLE_STAKE : typeof d.stakePct === 'number' ? d.stakePct : UNSTATED_STAKE
const MAX_COLUMNS = 30
/** The shape the picture should approach (a wide screen's canvas). */
const TARGET_ASPECT = 1.7

export type Point = { x: number; y: number }
/** How a tree line reaches its child. `drop`: the bus, below the parent's
 *  centre. `top`: along the bus and down onto the child. `side`: along the bus
 *  to the gutter `dx` left of the child's centre, down it, and in from the left. */
export type Route = { kind: 'top'; drop: number } | { kind: 'side'; drop: number; dx: number }

export interface TreeLayout {
  positions: Map<string, Point>
  /** Tree lines by edge id: the one line that places each company. */
  routes: Map<string, Route>
  /** Edge ids the tree makes redundant (holder is an ancestor of the parent). */
  implied: Set<string>
  /** Edge ids of co-holders in another branch: real, drawn faintly, may cross. */
  coHolders: Set<string>
  /** A centred person who owns AND runs a company: the role line (key) runs
   *  along the holding's line (value) — one two-tone line, one label. */
  dual: Map<string, string>
  /** The label of each company's placing line, by the edge that shows it: its
   *  text (the roles and the stake together where both apply) and the room
   *  reserved for it above the company — on the lines themselves, labels sat
   *  across the bars and each other. */
  labels: Map<string, { text: string; w: number; h: number }>
}

/** A branch's rectangle. `place`: its own company goes in the middle of the top
 *  edge when the line to it comes from above, at the LEFT end when it comes in
 *  from the side — or that line would run the width of the branch to reach it
 *  (Chubb's INA Corporation: left to the gutter, down, and all the way back). */
interface Box { width: number; height: number; place: (left: number, top: number, leftRooted?: boolean) => void }

/** Text wrapped at `wrapAt` px: how many lines, how wide the widest. Character
 *  widths for 12 px bold, scaled. */
function wrap(text: string, wrapAt: number, scale: number): { lines: number; widest: number } {
  const charW = (c: string) => scale * (c === ' ' ? 3.6 : /[A-Z0-9&@%MWmw]/.test(c) ? 8.9 : /[a-z]/.test(c) ? 6.9
    : /[.,;:'|!()ilI-]/.test(c) ? 4.2 : 9.5)
  const width = (t: string) => [...t].reduce((w, c) => w + charW(c), 0)
  let lines = 1, line = 0, widest = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = width(word)
    if (line > 0 && line + charW(' ') + w > wrapAt) { lines++; line = 0 }
    line += (line > 0 ? charW(' ') : 0) + w
    widest = Math.max(widest, line)
  }
  return { lines, widest }
}

/** How large Cytoscape draws a company (the stylesheet's rules, in numbers):
 *  the label wrapped at 120 px, 12 px bold, inside padding that GROWS with the
 *  stake held in it — a 100 % subsidiary is 40 px wider and taller than a bare
 *  label. The layout once assumed the bare label; bend points then fell inside
 *  the boxes and Cytoscape dropped those lines altogether. Errs on the large
 *  side. `centre`: the hub's fixed, larger box. */
export function nodeSize(data: { label?: unknown; importance?: unknown }, centre = false): { w: number; h: number } {
  const [wrapAt, lineH, pad, scale] = centre ? [210, 16, 38, 16 / 12] : [120, 12,
    14 + Math.min(60, Math.max(0, typeof data.importance === 'number' ? data.importance : 0)) / 60 * 20, 1]
  const { lines, widest } = wrap(String(data.label ?? ''), wrapAt, scale)
  // A wrapped label is as wide as its widest line — up to the wrap width, and
  // guessing which line that is from character widths is how a box ended up
  // 2 px across its neighbour's trunk. So: wrapped → the full wrap width; one
  // line → the estimate with a margin; one unbreakable word → as long as it is.
  const text = lines > 1 ? Math.max(wrapAt + 2, widest) : Math.min(Math.max(wrapAt + 2, widest), widest * 1.12)
  return { w: (centre ? 240 : text) + 2 * pad + 4, h: lines * lineH + 2 * pad + 4 }
}

/** The room a line's label takes (10 px, wrapped at 120, 3 px of background
 *  around it): the stake, the roles, or both. */
export function labelSize(text: string): { w: number; h: number } {
  const { lines, widest } = wrap(text, 120, 0.72)
  return { w: Math.min(126, widest) + 6, h: lines * 11.5 + 6 }
}

/** One parent per company below the centre: its LARGEST holder and, between
 *  equals, its deepest. Breadth-first gives the shallowest holder; every
 *  holding with a larger stake — or the same and a deeper place, which is how
 *  a flat subsidiary list yields to the specific holder — moves the company,
 *  unless the holder is the company's own descendant — a cross-holding must
 *  not cut a branch off the centre. */
export function treeParents(elements: GraphElement[], centerId: string): Map<string, string> {
  const holdings: [string, string, number][] = []
  const outgoers = new Map<string, string[]>()
  for (const el of elements) {
    const d = el.data
    if (!('source' in d) || !placesFrom(d, centerId)) continue
    holdings.push([d.source, d.target, stakeOfEdge(d)])
    if (!outgoers.has(d.source)) outgoers.set(d.source, [])
    outgoers.get(d.source)!.push(d.target)
  }
  const parent = new Map<string, string>()
  const stake = new Map<string, number>()            // of the holding that places each company
  // a person may own AND run a company: two lines, the holding's stake counts
  const stakeOf = new Map<string, number>()
  for (const [s, t, pct] of holdings) stakeOf.set(`${s}\u0000${t}`, Math.max(pct, stakeOf.get(`${s}\u0000${t}`) ?? ROLE_STAKE))
  const depth = new Map<string, number>([[centerId, 0]])
  const queue = [centerId]
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi]
    for (const child of outgoers.get(id) ?? []) {
      if (depth.has(child)) continue
      depth.set(child, depth.get(id)! + 1)
      parent.set(child, id)
      stake.set(child, stakeOf.get(`${id}\u0000${child}`) ?? UNSTATED_STAKE)
      queue.push(child)
    }
  }
  const isAncestor = (candidate: string, of: string) => {
    const seen = new Set<string>()
    for (let at = of; parent.has(at) && !seen.has(at);) {
      seen.add(at)
      at = parent.get(at)!
      if (at === candidate) return true
    }
    return false
  }
  for (let round = 0, changed = true; changed && round <= parent.size + 1; round++) {
    changed = false
    for (const [holder, held, pct] of holdings) {
      if (!parent.has(held) || !depth.has(holder)) continue
      const d = depth.get(holder)! + 1
      if (parent.get(held) === holder) {            // its parent moved down: it follows
        if (d !== depth.get(held)) { depth.set(held, d); changed = true }
        continue
      }
      // the larger stake wins; between equals (two unstated: the flat list
      // and the specific holder) the deeper one does
      const better = pct > stake.get(held)! || (pct === stake.get(held)! && d > depth.get(held)!)
      if (better && !isAncestor(held, holder)) {
        parent.set(held, holder)
        stake.set(held, pct)
        depth.set(held, d)
        changed = true
      }
    }
  }
  return parent
}

/** The size a company is drawn at, when the caller can measure it (the graph
 *  asks Cytoscape); undefined → `nodeSize`'s estimate. */
export type Measure = (id: string) => { w: number; h: number } | undefined

export function computeTreeLayout(elements: GraphElement[], centerId: string | null, measure?: Measure): TreeLayout {
  const pos = new Map<string, Point>()
  const routes = new Map<string, Route>()
  const implied = new Set<string>()
  const coHolders = new Set<string>()
  const dual = new Map<string, string>()
  const labels = new Map<string, { text: string; w: number; h: number }>()
  const layout = { positions: pos, routes, implied, coHolders, dual, labels }
  if (!centerId) return layout

  const parent = treeParents(elements, centerId)
  if (parent.size === 0) return layout
  // Children in element order (the profile's: largest stake first).
  const children = new Map<string, string[]>()
  const owned = new Set<string>()                    // placed by a holding, not only by a role
  const lineLabel = new Map<string, { role: string; holding: string; edge: string }>()
  const route = new Map<string, Route>()             // by child id
  const sizes = new Map<string, { w: number; h: number }>()
  for (const el of elements) {
    const d = el.data
    if ('source' in d) continue
    // Measured where possible: with the estimate (which errs wide) every box
    // sat centred in a slot wider than itself, so the left edges of a column
    // were ragged although its lines all come in from the left.
    const m = measure?.(d.id)
    sizes.set(d.id, m && m.w > 0 && m.h > 0 ? m : nodeSize(d, d.id === centerId))
  }
  const size = (id: string) => sizes.get(id) ?? { w: 152, h: 60 }
  for (const el of elements) {
    const d = el.data
    if (!('source' in d) || !placesFrom(d, centerId) || parent.get(d.target) !== d.source) continue
    if (!children.has(d.source)) children.set(d.source, [])
    if (!children.get(d.source)!.includes(d.target)) children.get(d.source)!.push(d.target)
    if (d.edgeType === 'owns') owned.add(d.target)
    // one label per company: what the parent IS there (roles), then what it holds
    const said = lineLabel.get(d.target) ?? { role: '', holding: '', edge: d.id }
    if (d.edgeType === 'owns') { said.holding ||= String(d.label ?? ''); said.edge = d.id }
    else said.role ||= String(d.label ?? '')
    lineLabel.set(d.target, said)
  }
  const labelOf = new Map<string, { text: string; w: number; h: number; edge: string }>()   // by child id
  for (const [child, said] of lineLabel) {
    const text = [said.role, said.holding].filter(Boolean).join(' · ')
    if (text) labelOf.set(child, { text, ...labelSize(text), edge: said.edge })
  }
  const LABEL_GAP = 4
  const labelRoom = (id: string) => labelOf.has(id) ? labelOf.get(id)!.h + LABEL_GAP : 0
  // How far the picture must shrink to show a box of this size.
  const cost = (w: number, h: number) => Math.max(w, h * TARGET_ASPECT)

  const box = (id: string): Box => {
    // Narrow before wide (otherwise in the profile's order, largest stake
    // first): a wide sub-branch placed first pushes its small siblings a
    // whole branch-width away from their parent — Huatai sat 7,000 px from
    // Chubb INA Holdings, behind INA Corporation's sub-tree.
    const kids = (children.get(id) ?? []).map(k => ({ id: k, box: box(k), branch: children.has(k) }))
      .map((k, i) => ({ k, i, roleOnly: owned.has(k.id) ? 0 : 1 }))
      // …and what a person owns before what they only run
      .sort((a, b) => a.roleOnly - b.roleOnly || a.k.box.width - b.k.box.width || a.i - b.i).map(x => x.k)
    const { w: w0, h: h0 } = size(id)
    const cellW = TREE_GUTTER + w0
    if (kids.length === 0) {
      return { width: cellW, height: h0 + ROW_GAP,
               place(left, top) { pos.set(id, { x: left + TREE_GUTTER + w0 / 2, y: top + h0 / 2 }) } }
    }
    const slot = (k: typeof kids[number]) => ({
      w: k.box.width + (k.branch ? NEST : 0),
      h: labelRoom(k.id) + k.box.height + (k.branch ? BRANCH_GAP : 0),
    })
    const total = kids.reduce((h, k) => h + slot(k).h, 0)

    // Flow the children, in order, into `n` columns of about equal height.
    const flow = (n: number) => {
      const columns: (typeof kids)[] = [[]]
      let h = 0, done = 0
      for (const k of kids) {
        const col = columns.length
        // start the next column once this one holds its share of what is left
        if (columns[col - 1].length > 0 && col < n && h + slot(k).h / 2 > (total - done) / (n - col + 1)) {
          done += h
          h = 0
          columns.push([])
        }
        columns[columns.length - 1].push(k)
        h += slot(k).h
      }
      const widths = columns.map(c => Math.max(...c.map(k => slot(k).w)))
      const heights = columns.map(c => c.reduce((s, k) => s + slot(k).h, 0))
      return { columns, widths, width: widths.reduce((a, b) => a + b, 0), height: Math.max(...heights) }
    }
    // the whole branch — its own company and the bus included, or two children
    // would stack in a column where a row reads as a tree
    const shrink = (f: { width: number; height: number }) => cost(Math.max(cellW, f.width), h0 + TREE_BUS_SPACE + f.height)
    let best = flow(1)
    for (let n = 2; n <= Math.min(kids.length, MAX_COLUMNS); n++) {
      const f = flow(n)
      // ties go to more columns: a single row of children reads as a tree
      if (shrink(f) <= shrink(best)) best = f
    }
    const width = Math.max(cellW, best.width)
    const drop = h0 / 2 + TREE_BUS_SPACE / 2
    return {
      width,
      height: h0 + TREE_BUS_SPACE + best.height,
      place(left, top, leftRooted = false) {
        const leftmost = left + TREE_GUTTER + w0 / 2
        pos.set(id, { x: leftmost, y: top + h0 / 2 })
        let x = left + (width - best.width) / 2
        best.columns.forEach((column, c) => {
          let y = top + h0 + TREE_BUS_SPACE
          for (const k of column) {
            const kLeft = x + (k.branch ? NEST : 0)
            // The top of a column is open to the bus: its first company is
            // reached from above. Only those under it need the gutter.
            const fromTop = k === column[0]
            // …and a branch that itself sits at the left end keeps its column
            // heads at the left too, right under it: centred over a wide
            // sub-tree, Chubb INA Holdings' first child was 3,500 px away.
            k.box.place(kLeft, y + labelRoom(k.id), !fromTop || leftRooted)
            route.set(k.id, fromTop ? { kind: 'top', drop }
              : { kind: 'side', drop, dx: pos.get(k.id)!.x - (x + TREE_TRUNK_INSET) })
            y += slot(k).h
          }
          x += best.widths[c]
        })
        // Reached from above, a parent sits over the middle of its column
        // HEADS — the companies its bus actually reaches. Over the middle of
        // its box it sat alone above empty space whenever one column was a wide
        // sub-branch whose own companies start at its left (Chubb Group
        // Holdings, far right of everything it holds).
        if (!leftRooted) {
          const heads = best.columns.map(col => pos.get(col[0].id)!.x)
          pos.get(id)!.x = Math.min(left + width - w0 / 2,
            Math.max(leftmost, (Math.min(...heads) + Math.max(...heads)) / 2))
        }
      },
    }
  }

  const root = box(centerId)
  root.place(0, 0)
  const at = pos.get(centerId)!                     // the centre at the origin, the tree below it
  const shift = { x: at.x, y: at.y }
  for (const p of pos.values()) { p.x -= shift.x; p.y -= shift.y }

  const holdingLine = new Map<string, string>()      // source+target → the routed holding's edge id
  const roleLines: [string, string][] = []
  const isAncestor = (candidate: string, of: string) => {
    for (let at = parent.get(of), n = 0; at !== undefined && n <= parent.size; at = parent.get(at), n++)
      if (at === candidate) return true
    return false
  }
  for (const el of elements) {
    const d = el.data
    if (!('source' in d) || !placesFrom(d, centerId) || !parent.has(d.target)) continue
    if (parent.get(d.target) === d.source) {
      routes.set(d.id, route.get(d.target)!)
      const pair = `${d.source}\u0000${d.target}`
      if (d.edgeType === 'owns') holdingLine.set(pair, d.id)
      else roleLines.push([d.id, pair])
    } else if (d.edgeType === 'role') continue       // run by the centre, held by someone below: its own straight line
    // a line from further up the same branch says nothing new — unless it
    // states a stake of its own: then it is a holding, not a repetition
    else if (isAncestor(d.source, d.target) && typeof d.stakePct !== 'number') implied.add(d.id)
    else if (pos.has(d.source)) coHolders.add(d.id)
  }
  for (const [id, pair] of roleLines) if (holdingLine.has(pair)) dual.set(id, holdingLine.get(pair)!)
  for (const { text, w, h, edge } of labelOf.values()) if (routes.has(edge)) labels.set(edge, { text, w, h })
  return layout
}

export const computeTreePositions = (elements: GraphElement[], centerId: string | null, measure?: Measure) =>
  computeTreeLayout(elements, centerId, measure).positions

/** The corners of a tree line between a parent and a child at these positions.
 *  From the positions and the route's own offsets, so a dragged node's lines
 *  can be re-routed. */
export function routePoints(parent: Point, child: Point, route: Route): Point[] {
  const busY = parent.y + route.drop
  if (route.kind === 'top')
    return Math.abs(child.x - parent.x) < 0.5 ? [] : [{ x: parent.x, y: busY }, { x: child.x, y: busY }]
  const trunkX = child.x - route.dx
  return [{ x: parent.x, y: busY }, { x: trunkX, y: busY }, { x: trunkX, y: child.y }]
}

/** Those corners in Cytoscape's terms (`segment-weights` / `segment-distances`
 *  with `edge-distances: node-position`): each point as a fraction along the
 *  source→target line plus a perpendicular offset, the perpendicular being
 *  (-dy, dx). Null when the two ends coincide. */
export function segmentStyle(source: Point, target: Point, points: Point[]):
  { weights: number[]; distances: number[] } | null {
  const dx = target.x - source.x, dy = target.y - source.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6 || points.length === 0) return null
  const len = Math.sqrt(len2)
  return {
    weights: points.map(p => ((p.x - source.x) * dx + (p.y - source.y) * dy) / len2),
    distances: points.map(p => ((p.x - source.x) * -dy + (p.y - source.y) * dx) / len),
  }
}
