import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/** The production CSP lives in vite.config.ts and is invisible to the app's
 *  own tests — which is how every person photo went blank for weeks when
 *  Wikipedia moved its summary thumbnails to thumb.wikimedia.org: nothing
 *  failed, images just stopped loading. This pins the image hosts the app
 *  actually loads from, so a host change is a red test, not a blank panel. */
// vitest runs from the project root (vite.config.ts is what starts it)
const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
const imgSrc = config.match(/"img-src ([^"]+)"/)?.[1] ?? ''

describe('the production Content-Security-Policy', () => {
  it('allows every host images are actually loaded from', () => {
    // person photos: Wikipedia REST summary → thumb.wikimedia.org
    expect(imgSrc).toContain('https://thumb.wikimedia.org')
    // entity logos stored on the node: upload.wikimedia.org (+ commons for redirects)
    expect(imgSrc).toContain('https://upload.wikimedia.org')
    expect(imgSrc).toContain('https://commons.wikimedia.org')
    // detail-map tiles
    expect(imgSrc).toContain('https://*.basemaps.cartocdn.com')
  })

  it('lets the person-photo lookup reach Wikipedia', () => {
    const connectSrc = config.match(/`connect-src ([^`]+)`/)?.[1] ?? ''
    expect(connectSrc).toContain('https://en.wikipedia.org')
  })
})
