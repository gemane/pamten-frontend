// The ink tree behind the graph (public/graph-tree.png): the graph's own
// shape drawn as a tree. Above the company its owners stand on a wide,
// shallow arc, each on its own line from the hub — here an umbrella crown of
// long radial branches ending on a flat ellipse. Below it the subsidiaries
// hang as a tree, level under level — here deep, many-branched roots.
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

// ── The tree: the graph's own shape ───────────────────────────────────────
// Above the company its owners stand on a wide, shallow arc, each on its own
// straight line from the hub — an umbrella of rays. Below it the
// subsidiaries hang as a tree, level under level. So: a short trunk, a crown
// of many long radial branches ending on a flat ellipse, and deep roots.
const TOP = { x: W / 2, y: H * 0.56 }                                       // where the trunk ends: the hub
const trunkTop = { x: TOP.x, y: TOP.y }

// the trunk: from the ground line up to the hub
branch(W / 2, H * 0.78, between(-0.03, 0.03), H * 0.22, 60, 0, { bow: 0.06, taper: [0.72, 0.8], three: 0, spread: [0, 0], shorter: [1, 1], twig: 0 })

// the crown: rays from the hub to a wide ellipse (a = half the width, b = the
// height above the hub), the spacing jittered so it reads drawn, not plotted;
// each ray splits a few times near its end, in a narrow fan, like the twigs
// of a winter tree
const A = W * 0.49, B = H * 0.29
const RAYS = 58
const ray = { bow: 0.07, taper: [0.64, 0.76], three: 0.45, spread: [0.28, 0.5], shorter: [0.4, 0.55], twig: 0.3 }
for (let i = 0; i < RAYS; i++) {
  const theta = -1.45 + (2.9 * (i + 0.5)) / RAYS + between(-0.025, 0.025)  // −83° … 83° from up
  const r = (1 / Math.sqrt((Math.sin(theta) / A) ** 2 + (Math.cos(theta) / B) ** 2)) * between(0.9, 1.08)
  const w = 4 + 7 * Math.cos(theta)                                           // thicker towards the middle
  branch(trunkTop.x + Math.sin(theta) * 10, trunkTop.y - Math.cos(theta) * 6, theta, r * 0.6, w, 4, ray)
}

// the roots: many, long, splitting like the subsidiaries' columns
const root = { bow: 0.12, taper: [0.62, 0.74], three: 0.5, spread: [0.7, 1.1], shorter: [0.62, 0.8], twig: 0.3 }
const ROOTS = 9
for (let i = 0; i < ROOTS; i++) {
  const theta = Math.PI + (-1.25 + (2.5 * (i + 0.5)) / ROOTS) + between(-0.06, 0.06)   // fanned below the ground line
  const depthShare = 0.6 + 0.4 * Math.abs(Math.cos(theta))                           // the middle ones go deepest
  branch(W / 2 + between(-22, 22), H * 0.78, theta, H * 0.1 * depthShare, 16 + 6 * Math.abs(Math.cos(theta)), 4, root)
}

const xs = pts.map(q => q[0]), ys = pts.map(q => q[1])
const pad = 60
const bx = Math.floor(Math.min(...xs) - pad), by = Math.floor(Math.min(...ys) - pad)
const bw = Math.ceil(Math.max(...xs) + pad) - bx, bh = Math.ceil(Math.max(...ys) + pad) - by
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
