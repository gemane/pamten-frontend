/**
 * Every icon the app promises actually exists.
 *
 * A missing icon is uniquely invisible: nothing throws, no test fails, the dev
 * server serves the page happily, and the only symptom is a blank square in a
 * browser tab or on someone's home screen — usually noticed by a user, months
 * later. Since the references live in static HTML and JSON that no other test
 * reads, they are checked here against the filesystem.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const publicFile = (href: string) => join(root, 'public', href.replace(/^\//, ''))

const indexHtml = readFileSync(join(root, 'index.html'), 'utf-8')
const manifest = JSON.parse(readFileSync(join(root, 'public', 'manifest.json'), 'utf-8'))

/** Every `href` on a <link rel="icon|apple-touch-icon|manifest">. */
const linkedHrefs = [...indexHtml.matchAll(/<link\s+rel="(icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)]
  .map(m => m[2])

describe('the icons referenced in index.html', () => {
  it('are all present in public/', () => {
    expect(linkedHrefs.length).toBeGreaterThan(0)
    const missing = linkedHrefs.filter(href => !existsSync(publicFile(href)))
    expect(missing, `referenced but not in public/: ${missing.join(', ')}`).toEqual([])
  })

  it('include a favicon at the root, where a browser looks unasked', () => {
    // Requested with no <link> at all by some browsers and most crawlers.
    expect(existsSync(join(root, 'public', 'favicon.ico'))).toBe(true)
  })

  it('offer an SVG, so the tab icon is sharp at any scale', () => {
    expect(linkedHrefs).toContain('/icons/logo.svg')
  })

  it('include the apple-touch-icon iOS uses for a home-screen tile', () => {
    expect(indexHtml).toMatch(/rel="apple-touch-icon"/)
  })
})

describe('the web manifest', () => {
  it('is linked from the page', () => {
    expect(linkedHrefs).toContain('/manifest.json')
  })

  it('names the app for a home screen', () => {
    expect(manifest.name).toBeTruthy()
    // Truncated under an icon at about a dozen characters.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
  })

  it('carries the two sizes an installable app needs', () => {
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('offers a maskable icon, so Android does not letterbox it', () => {
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  })

  it('points only at files that exist', () => {
    const missing = manifest.icons
      .map((i: { src: string }) => i.src)
      .filter((src: string) => !existsSync(publicFile(src)))
    expect(missing, `manifest icons missing: ${missing.join(', ')}`).toEqual([])
  })

  it('matches the page background, so no white flash on launch', () => {
    // Both the splash and the browser chrome read this; a mismatch shows as a
    // pale frame around a dark app.
    expect(manifest.background_color).toBe('#1a1a2e')
    expect(indexHtml).toMatch(/<meta name="theme-color" content="#1a1a2e"/)
  })
})

describe('the mark inside the app', () => {
  const app = readFileSync(join(root, 'src', 'App.tsx'), 'utf-8')
  const graph = readFileSync(join(root, 'src', 'components', 'Graph.tsx'), 'utf-8')

  it('is decorative in both places it appears', () => {
    // The wordmark beside it already says "Owlgraph"; a screen reader announcing
    // the image as well reads the brand out twice.
    for (const [name, src] of [['App', app], ['Graph', graph]] as const) {
      const img = src.match(/<img className="(?:logo-mark|graph-welcome__mark)"[\s\S]*?\/>/)
      expect(img, `no mark found in ${name}`).toBeTruthy()
      expect(img![0], `${name}: mark should be decorative`).toMatch(/alt=""/)
      expect(img![0], `${name}: mark should be hidden from screen readers`).toMatch(/aria-hidden/)
    }
  })

  it('is sized in the markup, so the layout does not jump while it loads', () => {
    expect(app).toMatch(/className="logo-mark"[\s\S]*?width=\{\d+\} height=\{\d+\}/)
    expect(graph).toMatch(/className="graph-welcome__mark"[\s\S]*?width=\{\d+\} height=\{\d+\}/)
  })
})
