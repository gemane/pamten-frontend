import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/** The production CSP lives in vite.config.ts and is invisible to the app's
 *  own tests — which is how every person photo went blank for weeks when
 *  Wikipedia moved its summary thumbnails to thumb.wikimedia.org: nothing
 *  failed, images just stopped loading. This pins the hosts the app actually
 *  loads from, so a host change is a red test, not a blank panel. Since the
 *  images come through our own API (which in production is another origin
 *  than the site), that origin is the one img-src must name — and no
 *  Wikimedia host may creep back in, because the browser never talks to one. */
// vitest runs from the project root (vite.config.ts is what starts it)
const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
const imgSrc = config.match(/`img-src ([^`]+)`/)?.[1] ?? ''
const connectSrc = config.match(/`connect-src ([^`]+)`/)?.[1] ?? ''

describe('the production Content-Security-Policy', () => {
  it('lets images load from our API origin, where logos and portraits are served', () => {
    expect(imgSrc).toContain("'self'")
    expect(imgSrc).toContain('${apiOrigin')                       // the API origin, built from VITE_API_URL
  })

  it('names no Wikimedia or Wikipedia host: the browser never fetches from them any more', () => {
    for (const directive of [imgSrc, connectSrc]) {
      expect(directive).not.toMatch(/wikimedia|wikipedia|wikidata/)
    }
  })

  it('lets the detail map fetch its style, tiles, sprites and glyphs from OpenFreeMap, and start its workers', () => {
    expect(connectSrc).toContain('https://tiles.openfreemap.org')
    expect(config).toMatch(/"worker-src 'self' blob:"/)
    expect(imgSrc).not.toContain('cartocdn')                       // the keyless CARTO tiles went grey in 2026
  })
})
