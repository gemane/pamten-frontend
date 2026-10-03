// The ink tree behind the graph (public/graph-tree.png): a company structure
// drawn the way nature draws one — a trunk that splits in two or three, level
// by level, every branch thinner than the one it grew from.
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
 *  wide at the base: a tapered, slightly bowed stroke, then its children. */
function branch(x, y, angle, len, w, depth) {
  const bend = between(-0.18, 0.18)
  const ex = x + Math.sin(angle + bend) * len
  const ey = y - Math.cos(angle + bend) * len
  const cx = (x + ex) / 2 + Math.cos(angle) * len * between(-0.12, 0.12)
  const cy = (y + ey) / 2 + Math.sin(angle) * len * between(-0.12, 0.12)
  const w2 = Math.max(0.8, w * between(0.6, 0.76))
  pts.push([x, y], [ex, ey])
  const nx = Math.cos(angle), ny = Math.sin(angle)
  const f = v => v.toFixed(1)
  paths.push(`M${f(x - nx * w / 2)},${f(y - ny * w / 2)} Q${f(cx - nx * w / 2)},${f(cy - ny * w / 2)} ${f(ex - nx * w2 / 2)},${f(ey - ny * w2 / 2)} `
    + `L${f(ex + nx * w2 / 2)},${f(ey + ny * w2 / 2)} Q${f(cx + nx * w / 2)},${f(cy + ny * w / 2)} ${f(x + nx * w / 2)},${f(y + ny * w / 2)} Z`)
  if (depth === 0 || w2 < 1.2) return
  // two or three children fanned apart — the org chart's spread — the middle one straighter
  const n = depth > 6 ? (rnd() < 0.45 ? 3 : 2) : (rnd() < 0.6 ? 3 : 2)
  const spread = between(0.8, 1.25) * (depth > 7 ? 0.85 : 1)
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1          // -1 … 1
    const a = angle + t * spread / 2 + between(-0.1, 0.1)
    const l = len * between(0.7, 0.88) * (Math.abs(t) > 0.5 ? 0.95 : 1)
    branch(ex, ey, a, l, w2, depth - 1)
  }
  // an occasional small side twig
  if (depth > 2 && rnd() < 0.35) {
    const side = rnd() < 0.5 ? -1 : 1
    branch(x + (ex - x) * 0.55, y + (ey - y) * 0.55, angle + side * between(0.7, 1.1), len * 0.4, w2 * 0.6, Math.max(0, depth - 3))
  }
}

branch(W / 2, H * 0.93, between(-0.05, 0.05), H * 0.17, 64, 10)           // the trunk, with a slight lean
for (let i = 0; i < 5; i++)                                                 // roots into the ground line
  branch(W / 2 + between(-18, 18), H * 0.93, Math.PI + between(-1.1, 1.1), H * between(0.03, 0.06), 14, 1)

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
