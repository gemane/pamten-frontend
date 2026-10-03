import { describe, it, expect } from 'vitest'
import { ARC_GAP_X, ARC_GAP_Y, ARC_ROW_STEP, CROWD_GAP_X, CROWD_GAP_Y, arcRows, arcSpacing, layoutArc, narrowestArc, packArc, rowCentres, type ArcSpec, type Size } from './arcPack'

const T_START = Math.PI / 6, T_END = Math.PI * 5 / 6

const owners = (rows: number, b = 300): ArcSpec =>
  ({ bOf: () => b, sign: -1, tStart: T_START, tEnd: T_END, aMin: 300, rows })

// A deterministic spread of company-sized boxes (150–250 wide, 44–90 tall).
const boxes = (n: number, seed = 1): Size[] => {
  let s = seed
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  return Array.from({ length: n }, () => ({ w: 150 + Math.round(r() * 100), h: 44 + Math.round(r() * 46) }))
}

const apart = (a: { x: number; y: number }, sa: Size, b: { x: number; y: number }, sb: Size, gx = ARC_GAP_X, gy = ARC_GAP_Y) =>
  Math.abs(a.x - b.x) >= (sa.w + sb.w) / 2 + gx - 1e-6 || Math.abs(a.y - b.y) >= (sa.h + sb.h) / 2 + gy - 1e-6

const allApart = (xy: { x: number; y: number }[], sizes: Size[], gx = ARC_GAP_X, gy = ARC_GAP_Y) =>
  xy.every((p, i) => xy.slice(0, i).every((q, j) => apart(p, sizes[i], q, sizes[j], gx, gy)))

const span = (xy: { x: number }[]) => Math.max(...xy.map(p => p.x)) - Math.min(...xy.map(p => p.x))

describe('layoutArc — boxes along the arc, none touching', () => {
  it.each([1, 2, 3, 5, 8, 9, 15, 24, 25, 60, 94, 140])('keeps %i boxes apart, with the gaps', n => {
    for (const seed of [1, 7, 23]) {
      const sizes = boxes(n, seed)
      const xy = layoutArc(sizes, owners(arcRows(n)))
      expect(xy).toHaveLength(n)
      expect(allApart(xy, sizes)).toBe(true)
    }
  })

  it('runs from the right end to the left in order: the first box at the largest x', () => {
    const sizes = boxes(30)
    const xy = layoutArc(sizes, owners(3))
    for (let i = 1; i < xy.length; i++) expect(xy[i].x).toBeLessThan(xy[i - 1].x)
  })

  it('puts a lone box straight above the centre, two symmetric about it', () => {
    const [one] = layoutArc([{ w: 160, h: 50 }], owners(1))
    expect(Math.abs(one.x)).toBeLessThan(1)
    expect(one.y).toBeCloseTo(-300, 0)                  // −b·sin 90°, above
    const two = layoutArc([{ w: 160, h: 50 }, { w: 160, h: 50 }], owners(1))
    expect(Math.abs(two[0].x + two[1].x)).toBeLessThan(1)
    expect(Math.abs(two[0].y - two[1].y)).toBeLessThan(1)
  })

  it('is centred on the apex: as much free arc before the first box as after the last', () => {
    for (const n of [3, 12, 40]) {
      const sizes = boxes(n, n)
      const xy = layoutArc(sizes, owners(arcRows(n)))
      // the ends sit at ±x symmetric within a box width
      expect(Math.abs(xy[0].x + xy[n - 1].x)).toBeLessThan(260)
    }
  })

  it('stays on the narrowest arc while the boxes fit on it, and widens only as far as needed', () => {
    const small = layoutArc(boxes(2), owners(1))
    expect(Math.max(...small.map(p => Math.abs(p.x)))).toBeLessThanOrEqual(300 * Math.cos(T_START) + 1)
    for (const [n, rows] of [[40, 1], [40, 3], [12, 2]] as const) {
      const sizes = boxes(n, n)
      const a = narrowestArc(sizes, owners(rows))
      expect(packArc(sizes, owners(rows), a)).not.toBeNull()
      expect(packArc(sizes, owners(rows), a * 0.985)).toBeNull()      // within a percent of the narrowest
      const xy = layoutArc(sizes, owners(rows))
      expect(Math.max(...xy.map(p => Math.abs(p.x)))).toBeLessThanOrEqual(a * Math.cos(T_START) + 1e-6)
    }
  })

  it('a crowd takes the further rows; a handful stays on one', () => {
    const crowd = layoutArc(boxes(60), owners(3))
    const depths = new Set(crowd.map(p => Math.round(-p.y / Math.sin(Math.PI / 2))))
    expect(depths.size).toBeGreaterThan(1)
    const few = layoutArc(boxes(5), owners(1))
    for (const p of few) expect(-p.y).toBeLessThanOrEqual(300 + 1e-6)     // never past b
  })

  it('a crowd packed close: its own gaps kept, and narrower than with the airy ones', () => {
    for (const n of [30, 94]) {
      const sizes = boxes(n, n)
      const close = layoutArc(sizes, { ...owners(1), ...arcSpacing(sizes) })
      expect(allApart(close, sizes, CROWD_GAP_X, CROWD_GAP_Y)).toBe(true)
      const airy = layoutArc(sizes, { ...owners(arcRows(n)) })
      expect(span(close)).toBeLessThan(span(airy))
    }
  })

  it('every row gets filled: four rows are not much wider than a quarter of one', () => {
    const sizes = boxes(94)
    const one = layoutArc(sizes, { ...owners(1), gapX: CROWD_GAP_X, gapY: CROWD_GAP_Y })
    const four = layoutArc(sizes, { ...owners(1), ...arcSpacing(sizes) })
    expect(arcSpacing(sizes).rows).toBe(4)
    expect(span(four)).toBeLessThan(span(one) * 0.4)
  })

  it('below the centre when sign is +1', () => {
    const xy = layoutArc(boxes(4), { ...owners(1), sign: 1 })
    for (const p of xy) expect(p.y).toBeGreaterThan(0)
  })

  it('a wide arc may be a deep one: bOf sees the horizontal semi-axis', () => {
    const seen: number[] = []
    layoutArc(boxes(40), { ...owners(2), bOf: (_, a) => { seen.push(a); return Math.max(300, a * 0.3) } })
    expect(Math.max(...seen)).toBeGreaterThan(300)
  })

  it('per-box b: a near box and a far one on the same arc', () => {
    const sizes = [{ w: 160, h: 50 }, { w: 160, h: 50 }, { w: 160, h: 50 }]
    const xy = layoutArc(sizes, { ...owners(1), bOf: i => i === 1 ? 120 : 300 })
    expect(-xy[1].y).toBeLessThan(-xy[0].y)
    expect(allApart(xy, sizes)).toBe(true)
  })

  it('nothing in, nothing out', () => {
    expect(layoutArc([], owners(1))).toEqual([])
  })
})

describe('packArc', () => {
  it('returns null when the boxes do not fit before the end', () => {
    expect(packArc(boxes(10), owners(1), 300)).toBeNull()
    expect(packArc(boxes(10), owners(1), 5000)).not.toBeNull()
  })

  it('a further row is ARC_ROW_STEP further out', () => {
    const sizes = boxes(40)
    const fit = packArc(sizes, owners(3), 3000)!
    const rows = new Set(fit.map(p => p.row))
    expect(rows.size).toBeGreaterThan(1)
    for (const p of fit) expect(p.row).toBeLessThan(3)
    const y = (p: { t: number; row: number }) => (300 + p.row * ARC_ROW_STEP) * Math.sin(p.t)
    const outer = fit.find(p => p.row === 1)!, inner = fit.find(p => p.row === 0)!
    expect(y(outer) / Math.sin(outer.t) - y(inner) / Math.sin(inner.t)).toBeCloseTo(ARC_ROW_STEP, 6)
  })

  it('interleaves the rows like bricks instead of stacking a column', () => {
    const sizes = Array.from({ length: 20 }, () => ({ w: 160, h: 50 }))
    const fit = packArc(sizes, owners(2), 3000)!
    // consecutive boxes are never at (nearly) the same x
    for (let i = 1; i < fit.length; i++) {
      expect(3000 * (Math.cos(fit[i - 1].t) - Math.cos(fit[i].t))).toBeGreaterThanOrEqual(160 / 2 + ARC_GAP_X - 1)
    }
  })
})

describe('arcRows / arcSpacing', () => {
  it('one row up to eight, two to twenty-four, three to sixty, four beyond', () => {
    expect(arcRows(1)).toBe(1); expect(arcRows(8)).toBe(1)
    expect(arcRows(9)).toBe(2); expect(arcRows(24)).toBe(2)
    expect(arcRows(25)).toBe(3); expect(arcRows(60)).toBe(3)
    expect(arcRows(61)).toBe(4); expect(arcRows(200)).toBe(4)
  })
  it('a handful is spaced airily, a crowd close, its rows a tallest box apart', () => {
    expect(arcSpacing(boxes(8))).toEqual({ rows: 1, gapX: ARC_GAP_X, gapY: ARC_GAP_Y, rowStep: ARC_ROW_STEP })
    const nine = boxes(9)
    expect(arcSpacing(nine)).toEqual({ rows: 2, gapX: CROWD_GAP_X, gapY: CROWD_GAP_Y,
                                       rowStep: Math.max(...nine.map(s => s.h)) + CROWD_GAP_Y })
    expect(CROWD_GAP_X).toBeLessThan(ARC_GAP_X); expect(CROWD_GAP_Y).toBeLessThan(ARC_GAP_Y)
  })
})

describe('rowCentres — a row of boxes side by side', () => {
  it('centres the row on x with the gap between the boxes', () => {
    const c = rowCentres([100, 200, 100], 50)
    expect(c[1] - c[0]).toBe(150 + ARC_GAP_X)
    expect(c[2] - c[1]).toBe(150 + ARC_GAP_X)
    expect((c[0] - 50 + c[2] + 50) / 2).toBeCloseTo(50, 6)       // outer edges symmetric about x
  })
  it('one box sits on x; none is none', () => {
    expect(rowCentres([120], 7)).toEqual([7])
    expect(rowCentres([], 7)).toEqual([])
  })
})
