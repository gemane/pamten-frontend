/**
 * Boxes along a semi-ellipse, none touching.
 *
 * The arc used to hand out one slot per node, 72 px of arc apart, whatever the
 * node's size — and a company's box is 150–250 px wide, so from four owners on
 * the boxes lay over each other. Here every box takes the next free place
 * along the arc, measured against the boxes already there, and when one row
 * is full it moves out to a second or third. The arc's width is then the
 * smallest that holds them all, and the row is centred on the arc's apex.
 *
 * Geometry: a node at parameter t sits at x = a·cos t, y = sign·(b + row·step)·sin t,
 * t from `tStart` to `tEnd` (30°–150°: the ends are wide to the sides, the
 * apex straight above or below the centre). `b` may differ per node (an
 * owner's importance pulls it closer to the centre).
 */
export interface ArcSpec {
  /** vertical semi-axis per node, the nearest row — given the horizontal
   *  one, so a wide arc can be a deep one too (a flat 4,000 px band is no arc) */
  bOf: (i: number, a: number) => number
  /** −1 above the centre (owners), +1 below it */
  sign: 1 | -1
  tStart: number
  tEnd: number
  /** the horizontal semi-axis is never narrower than this */
  aMin: number
  /** how many rows the arc may use */
  rows: number
  /** clear space between neighbouring boxes; the defaults when absent */
  gapX?: number
  gapY?: number
  /** a further row sits this much further out along the vertical axis */
  rowStep?: number
}

export type Size = { w: number; h: number }
/** `row`: how far out, in rows — in quarter steps */
export type ArcPlacement = { t: number; row: number }

/** Clear space between neighbouring boxes, when the arc holds a handful. */
export const ARC_GAP_X = 18
export const ARC_GAP_Y = 14
/** A further row sits this much further out along the vertical axis. */
export const ARC_ROW_STEP = 96
/** A crowd is packed closer. */
export const CROWD_GAP_X = 8
export const CROWD_GAP_Y = 6

/** How many rows an arc of `n` boxes may use: one up to a handful, so a
 *  small graph keeps its single clean line; more for a crowd, which packed
 *  on one line would stretch past any screen. */
export const arcRows = (n: number): number => n <= 8 ? 1 : n <= 24 ? 2 : n <= 60 ? 3 : 4

/** The spacing for these boxes: airy for a handful; close for a crowd, whose
 *  rows are as far apart as its tallest box needs and no further (the quarter
 *  steps let shorter boxes nest closer in). */
export const arcSpacing = (sizes: Size[]): Pick<ArcSpec, 'rows' | 'gapX' | 'gapY' | 'rowStep'> => {
  const rows = arcRows(sizes.length)
  if (rows === 1) return { rows, gapX: ARC_GAP_X, gapY: ARC_GAP_Y, rowStep: ARC_ROW_STEP }
  const tallest = sizes.reduce((h, s) => Math.max(h, s.h), 0)
  return { rows, gapX: CROWD_GAP_X, gapY: CROWD_GAP_Y, rowStep: tallest + CROWD_GAP_Y }
}

type Placed = { x: number; y: number; w: number; h: number }
type Gaps = { gapX: number; gapY: number; rowStep: number }

const gapsOf = (spec: ArcSpec): Gaps =>
  ({ gapX: spec.gapX ?? ARC_GAP_X, gapY: spec.gapY ?? ARC_GAP_Y, rowStep: spec.rowStep ?? ARC_ROW_STEP })

const overlaps = (x: number, y: number, s: Size, p: Placed, g: Gaps) =>
  Math.abs(x - p.x) < (s.w + p.w) / 2 + g.gapX && Math.abs(y - p.y) < (s.h + p.h) / 2 + g.gapY

/** Place every box in order along the arc, at semi-axis `a`; null when they
 *  do not all fit before `tEnd`. Boxes come in display order: the first at
 *  the right end (t = tStart, cos > 0), the last at the left. */
export function packArc(sizes: Size[], spec: ArcSpec, a: number, start = spec.tStart): ArcPlacement[] | null {
  const out: ArcPlacement[] = []
  const placed: Placed[] = []
  const g = gapsOf(spec)
  let t = start
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i]
    if (i > 0) {
      // A brick's lead: start at least a share of both boxes past the last
      // one's centre — half on one row, a quarter on two, … — so the rows
      // interleave instead of stacking a column, and every row gets filled.
      const lead = (sizes[i - 1].w + s.w) / (2 * spec.rows) + g.gapX
      const xMax = placed[i - 1].x - lead
      if (xMax < -a) return null
      t = Math.max(t, Math.acos(xMax / a))
    }
    let done = false
    while (t <= spec.tEnd) {
      const x = a * Math.cos(t)
      // the rows in quarter steps, from the inside out: a tall box (a
      // four-line name) takes a row and a quarter instead of blocking the
      // whole next row, and a short one sits as close in as it can
      for (let row = 0; row <= spec.rows - 1 + 1e-9; row += 0.25) {
        const y = spec.sign * (spec.bOf(i, a) + row * g.rowStep) * Math.sin(t)
        if (collides(x, y, s, placed, g)) continue
        out.push({ t, row }); placed.push({ x, y, w: s.w, h: s.h }); done = true
        break
      }
      if (done) break
      // on by about three pixels of arc
      t += 3 / Math.hypot(a * Math.sin(t), spec.bOf(i, a) * Math.cos(t))
    }
    if (!done) return null
  }
  return out
}

/** Against the boxes already there — the last few only: x only ever
 *  decreases along the arc, so a box far to the right cannot be in the way. */
function collides(x: number, y: number, s: Size, placed: Placed[], g: Gaps): boolean {
  for (let j = placed.length - 1; j >= 0; j--) {
    const p = placed[j]
    if (p.x - p.w / 2 > x + s.w / 2 + g.gapX + 400) break
    if (overlaps(x, y, s, p, g)) return true
  }
  return false
}

const positionsOf = (places: ArcPlacement[], spec: ArcSpec, a: number) =>
  places.map((p, i) => ({
    x: a * Math.cos(p.t),
    y: spec.sign * (spec.bOf(i, a) + p.row * gapsOf(spec).rowStep) * Math.sin(p.t),
  }))

/** Where each box goes: the narrowest arc (within a percent) that holds
 *  them, the run of boxes centred on the apex. */
/** The narrowest horizontal semi-axis (within a percent) the boxes fit on:
 *  the floor if they do, else found by bisection. */
export function narrowestArc(sizes: Size[], spec: ArcSpec): number {
  let lo = spec.aMin, hi = spec.aMin
  let fit = packArc(sizes, spec, hi)
  if (fit) return hi
  for (let k = 0; !fit && k < 40; k++) { lo = hi; hi *= 1.5; fit = packArc(sizes, spec, hi) }
  if (!fit) throw new Error('arc: boxes do not fit')
  while (hi / lo > 1.01) {
    const mid = (lo + hi) / 2
    if (packArc(sizes, spec, mid)) hi = mid; else lo = mid
  }
  return hi
}

export function layoutArc(sizes: Size[], spec: ArcSpec): { x: number; y: number }[] {
  if (sizes.length === 0) return []
  const a = narrowestArc(sizes, spec)
  let fit = packArc(sizes, spec, a)!
  // Centre the run on the apex: pack again from a start that leaves as much
  // arc free before the first box as after the last — a few times over, as
  // the arc bends differently where the run now lies. A start that no longer
  // fits is not taken; the last that did stands.
  let start = spec.tStart
  for (let k = 0; k < 8; k++) {
    const before = start - spec.tStart, after = spec.tEnd - fit[fit.length - 1].t
    const next = start + (after - before) / 2
    if (Math.abs(next - start) < 0.001) break
    const f = packArc(sizes, spec, a, next)
    if (!f) break
    fit = f; start = next
  }
  return positionsOf(fit, spec, a)
}

/** Boxes in a row, side by side, centred on `x` with `gap` between: where
 *  each box's centre goes. (The stacks beyond the first hop.) */
export function rowCentres(widths: number[], x: number, gap = ARC_GAP_X): number[] {
  const total = widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, widths.length - 1)
  let left = x - total / 2
  return widths.map(w => { const c = left + w / 2; left += w + gap; return c })
}
