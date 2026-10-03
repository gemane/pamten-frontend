/**
 * The ink tree behind the graph: the asset the stylesheet masks with, and the
 * contract between them. A missing or wrongly-encoded picture shows as nothing
 * at all (a mask of nothing paints nothing), so it is checked here.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const css = readFileSync(join(root, 'src', 'index.css'), 'utf-8')
const graphTsx = readFileSync(join(root, 'src', 'components', 'Graph.tsx'), 'utf-8')
const png = readFileSync(join(root, 'public', 'graph-tree.png'))

const rule = (selector: string) => {
  const m = new RegExp(selector.replace(/[.[\]"=]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css)
  return m ? m[1] : ''
}

describe('public/graph-tree.png — the picture', () => {
  it('is a PNG, 1-bit greyscale (white = ink), landscape-ish, and small', () => {
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(png.subarray(12, 16).toString()).toBe('IHDR')
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
    expect(width).toBeGreaterThanOrEqual(1200)
    expect(height).toBeGreaterThanOrEqual(1000)
    expect(png[24]).toBe(1)                       // bit depth: one bit a pixel
    expect(png[25]).toBe(0)                       // colour type: greyscale, no alpha — a luminance mask
    expect(statSync(join(root, 'public', 'graph-tree.png')).size).toBeLessThan(120_000)
  })
})

describe('.graph-backdrop — how it is shown', () => {
  it('is rendered under the canvas, decorative and out of the pointer\'s way', () => {
    expect(graphTsx).toMatch(/<div className="graph-backdrop" aria-hidden="true" \/>\s*<div ref=\{containerRef\} className="graph-canvas"/)
    const r = rule('.graph-backdrop')
    expect(r).toMatch(/position:\s*absolute/)
    expect(r).toMatch(/pointer-events:\s*none/)
    expect(rule('.graph-canvas')).toMatch(/position:\s*relative/)   // the canvas above it
  })

  it('masks with the picture as luminance and paints the colour per theme, faintly', () => {
    const r = rule('.graph-backdrop')
    expect(r).toMatch(/mask:\s*url\('\/graph-tree\.png'\) center \/ contain no-repeat/)
    expect(r).toMatch(/-webkit-mask:\s*url\('\/graph-tree\.png'\)/)
    expect(r).toMatch(/mask-mode:\s*luminance/)
    expect(r).toMatch(/background-color:\s*#fff/)                   // chalk on the dark theme
    const light = rule('[data-theme="light"] .graph-backdrop')
    expect(light).toMatch(/background-color:\s*#000/)               // ink on the light one
    for (const block of [r, light]) {
      const opacity = Number(/opacity:\s*([\d.]+)/.exec(block)?.[1])
      expect(opacity).toBeGreaterThan(0)
      expect(opacity).toBeLessThanOrEqual(0.1)                      // a backdrop, not a picture
    }
  })
})
