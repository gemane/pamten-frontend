// The ink tree behind the graph (public/graph-tree.png): an acacia — the
// umbrella thorn of the Sahara — which is the graph's own shape. A short
// trunk splits low into limbs that rise and fan out (the owners' lines from
// the hub) and turn flat into a wide, shallow canopy (their arc); below, the
// subsidiaries hang as a tree, level under level — deep, many-branched roots.
//
//   node scripts/graph-tree.mjs [seed] [size]        default: 23, 1400
//
// Drawn as SVG strokes from a seeded random walk (the same seed gives the same
// tree), rasterised in headless Chromium, and written as a 1-BIT greyscale PNG
// — white where the ink is. The stylesheet uses it as a luminance mask and
// paints the colour itself (ink on the light theme, chalk on the dark), so one
// 42 KB file serves both; the same picture as an RGBA PNG was 650 KB.
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const [,, seedArg = '23', sizeArg = '1400'] = process.argv
let seed = Number(seedArg) || 23
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const between = (a, b) => a + (b - a) * rnd()

// ── The drawing ───────────────────────────────────────────────────────────
const W = 1600, H = 1600
const paths = []
const pts = []   // every stroke end, for the trimmed canvas

/** A branch from (x, y) heading `angle` (radians, 0 = up), `len` long, `w`
 *  wide at the base: a tapered, slightly bowed stroke, then its children.
 *  `o`: how it grows — the spread of its children, their length as a share
 *  of this one, how bowed the stroke is. */
function branch(x, y, angle, len, w, depth, o) {
  const bend = between(-o.bow, o.bow)
  const ex = x + Math.sin(angle + bend) * len
  const ey = y - Math.cos(angle + bend) * len
  const cx = (x + ex) / 2 + Math.cos(angle) * len * between(-o.bow * 0.7, o.bow * 0.7)
  const cy = (y + ey) / 2 + Math.sin(angle) * len * between(-o.bow * 0.7, o.bow * 0.7)
  const w2 = Math.max(0.8, w * between(o.taper[0], o.taper[1]))
  pts.push([x, y], [ex, ey])
  const nx = Math.cos(angle), ny = Math.sin(angle)
  const f = v => v.toFixed(1)
  paths.push(`M${f(x - nx * w / 2)},${f(y - ny * w / 2)} Q${f(cx - nx * w / 2)},${f(cy - ny * w / 2)} ${f(ex - nx * w2 / 2)},${f(ey - ny * w2 / 2)} `
    + `L${f(ex + nx * w2 / 2)},${f(ey + ny * w2 / 2)} Q${f(cx + nx * w / 2)},${f(cy + ny * w / 2)} ${f(x + nx * w / 2)},${f(y + ny * w / 2)} Z`)
  if (depth === 0 || w2 < 1.0) return
  // two or three children fanned apart — the org chart's spread — the middle one straighter
  const n = rnd() < o.three ? 3 : 2
  const spread = between(o.spread[0], o.spread[1])
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1          // -1 … 1
    const a = angle + t * spread / 2 + between(-0.08, 0.08)
    const l = len * between(o.shorter[0], o.shorter[1]) * (Math.abs(t) > 0.5 ? 0.95 : 1)
    branch(ex, ey, a, l, w2, depth - 1, o)
  }
  // an occasional small side twig
  if (depth > 2 && rnd() < o.twig) {
    const side = rnd() < 0.5 ? -1 : 1
    branch(x + (ex - x) * 0.55, y + (ey - y) * 0.55, angle + side * between(0.7, 1.1), len * 0.4, w2 * 0.6, Math.max(0, depth - 3), o)
  }
}

// ── The tree: an acacia, the graph's own shape ────────────────────────────
// The umbrella thorn of the Sahara: a short trunk that splits low into limbs
// rising and fanning out — the owners' lines from the hub — then turning flat
// into a dense canopy, wide and shallow, like the owners' arc; below, the
// subsidiaries' tree as deep roots.
const GROUND = H * 0.8
const HUB = H * 0.6                  // where the trunk splits: the company
const CANOPY = H * 0.34              // the canopy's underside at the middle
const TOP = H * 0.22                 // its top
const HALF = W * 0.49                // its half width
// the crown's outline: a flat ellipse whose top is TOP, centred on the
// underside, so its edge droops at the sides as the umbrella thorn's does
const EA = HALF, EB = CANOPY - TOP
const outside = (x, y) => Math.abs((x - W / 2) / EA) ** 2.6 + Math.abs((y - CANOPY) / EB) ** 2.6 > 1   // a superellipse: flatter on top
const twig = { bow: 0.25, taper: [0.55, 0.7], three: 0.4, spread: [0.9, 1.4], shorter: [0.5, 0.7], twig: 0 }

/** A limb of the acacia: rises from (x, y) at `angle`; as it nears the canopy
 *  its children turn towards the horizontal and shorten, so the crown ends
 *  flat; nothing grows past the crown's outline; inside the canopy every tip
 *  spreads a lace of fine twigs. */
function limb(x, y, angle, len, w, depth) {
  const bend = between(-0.1, 0.1)
  let ex = x + Math.sin(angle + bend) * len
  let ey = y - Math.cos(angle + bend) * len
  // shorten to the outline: the top, or the ellipse when the end is in its reach
  if (ey < TOP) { const k = (y - TOP) / (y - ey); ex = x + (ex - x) * k; ey = y + (ey - y) * k; len *= k }
  if (ey < CANOPY + EB && outside(ex, ey)) {
    let lo = 0, hi = 1
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (outside(x + (ex - x) * m, y + (ey - y) * m)) hi = m; else lo = m }
    ex = x + (ex - x) * lo; ey = y + (ey - y) * lo; len *= lo
  }
  if (len < 3) return
  const w2 = Math.max(0.8, w * between(0.66, 0.8))
  pts.push([x, y], [ex, ey])
  const nx = Math.cos(angle), ny = Math.sin(angle)
  const cx = (x + ex) / 2 + nx * len * between(-0.08, 0.08), cy = (y + ey) / 2 + ny * len * between(-0.08, 0.08)
  const f = v => v.toFixed(1)
  paths.push(`M${f(x - nx * w / 2)},${f(y - ny * w / 2)} Q${f(cx - nx * w / 2)},${f(cy - ny * w / 2)} ${f(ex - nx * w2 / 2)},${f(ey - ny * w2 / 2)} `
    + `L${f(ex + nx * w2 / 2)},${f(ey + ny * w2 / 2)} Q${f(cx + nx * w / 2)},${f(cy + ny * w / 2)} ${f(x + nx * w / 2)},${f(y + ny * w / 2)} Z`)
  const side = angle >= 0 ? 1 : -1
  if (ey < CANOPY + 25) {
    // the lace: fine twigs out to both sides and a few up, each forking once
    const n = 2 + Math.floor(between(0, 3))
    for (let i = 0; i < n; i++) {
      const dir = rnd() < 0.7 ? side : -side
      branch(ex, ey, dir * between(0.8, 1.55) * (rnd() < 0.25 ? 0.35 : 1), between(8, 20), between(0.9, 1.6), 1, twig)
    }
  }
  if (depth === 0 || w2 < 1.0) return
  // nearing the canopy, the children lean towards the horizontal and shorten
  const nearness = Math.max(0, Math.min(1, (CANOPY + 110 - ey) / 200))
  const flat = side * between(1.15, 1.45)
  const n = rnd() < (nearness > 0.4 ? 0.6 : 0.4) ? 3 : 2
  const spread = between(0.45, 0.8) * (1 - 0.35 * nearness)
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1
    const own = angle + t * spread / 2 + between(-0.08, 0.08)
    const a = own * (1 - nearness * 0.7) + flat * nearness * 0.7
    const l = len * between(0.66, 0.84) * (1 - 0.3 * nearness)
    limb(ex, ey, a, l, w2, depth - 1)
  }
  if (depth > 1 && rnd() < 0.35) limb(x + (ex - x) * 0.6, y + (ey - y) * 0.6, angle + side * between(0.45, 0.85), len * 0.5, w2 * 0.55, Math.max(0, depth - 2))
}

// the trunk: short, a slight lean, splitting low
const lean = between(-0.08, 0.08)
branch(W / 2, GROUND, lean, GROUND - HUB, 40, 0, { bow: 0.05, taper: [0.8, 0.88], three: 0, spread: [0, 0], shorter: [1, 1], twig: 0 })
const hubX = W / 2 + Math.sin(lean) * (GROUND - HUB)
// the limbs: fanned wide, the outer ones longer, so the crown is as wide as it is flat
const LIMBS = 9
for (let i = 0; i < LIMBS; i++) {
  const theta = -1.1 + (2.2 * (i + 0.5)) / LIMBS + between(-0.05, 0.05)
  const reach = 1 + 0.7 * Math.abs(Math.sin(theta))
  limb(hubX + Math.sin(theta) * 10, HUB - Math.cos(theta) * 8 + between(-6, 6), theta, (HUB - CANOPY) * 0.5 * reach, 11 + 5 * Math.cos(theta), 8)
}

// the roots: many, long, splitting like the subsidiaries' columns
const root = { bow: 0.12, taper: [0.62, 0.74], three: 0.5, spread: [0.7, 1.1], shorter: [0.62, 0.8], twig: 0.3 }
const ROOTS = 9
for (let i = 0; i < ROOTS; i++) {
  const theta = Math.PI + (-1.25 + (2.5 * (i + 0.5)) / ROOTS) + between(-0.06, 0.06)   // fanned below the ground line
  const depthShare = 0.6 + 0.4 * Math.abs(Math.cos(theta))                           // the middle ones go deepest
  branch(W / 2 + between(-22, 22), GROUND, theta, H * 0.1 * depthShare, 16 + 6 * Math.abs(Math.cos(theta)), 4, root)
}

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
const pad = 60
const bx = Math.floor(minX - pad), by = Math.floor(minY - pad)
const bw = Math.ceil(maxX + pad) - bx, bh = Math.ceil(maxY + pad) - by
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bx} ${by} ${bw} ${bh}" width="${bw}" height="${bh}">`
  + `<g fill="#000" stroke="#000" stroke-width="0.6" stroke-linejoin="round">${paths.map(d => `<path d="${d}"/>`).join('')}</g></svg>`

// ── The 1-bit PNG ─────────────────────────────────────────────────────────
const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', '--use-gl=swiftshader'] })
const page = await browser.newPage()
const { w, h, bits } = await page.evaluate(async ([svg, size]) => {
  const img = new Image()
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
  await img.decode()
  const scale = size / Math.max(img.width, img.height)
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height)
  const a = ctx.getImageData(0, 0, c.width, c.height).data
  const bits = []
  for (let i = 3; i < a.length; i += 4) bits.push(a[i] > 110 ? 1 : 0)
  return { w: c.width, h: c.height, bits }
}, [svg, Number(sizeArg) || 1400])
await browser.close()

const rowBytes = Math.ceil(w / 8)
const raw = Buffer.alloc((rowBytes + 1) * h)                                // a filter byte (0) before every row
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++)
    if (bits[y * w + x]) raw[y * (rowBytes + 1) + 1 + (x >> 3)] |= 0x80 >> (x & 7)
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
ihdr[8] = 1                                                                 // bit depth 1, greyscale, no interlace
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
                           chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'graph-tree.png')
writeFileSync(out, png)
console.log(`${out}: seed ${seedArg}, ${paths.length} strokes, ${w}×${h}, ${png.length} bytes`)
