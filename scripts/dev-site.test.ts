/** devSiteHtmlPlugin (vite.config.ts): the dev site's tab title and noindex. */
import { describe, it, expect } from 'vitest'

const HTML = '<head>\n    <title>Owlgraph – Corporate Ownership Map</title>\n  </head>'

describe('devSiteHtmlPlugin', () => {
  const transform = async (env: string | undefined) => {
    const { devSiteHtmlPlugin } = await import('../vite.config')
    return (devSiteHtmlPlugin(env) as { transformIndexHtml: (h: string) => string }).transformIndexHtml(HTML)
  }

  it('marks the title and asks not to be indexed on the dev site', async () => {
    const html = await transform('development')
    expect(html).toContain('<title>DEV · Owlgraph – Corporate Ownership Map</title>')
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
  })

  it.each([undefined, '', 'production'])('leaves index.html untouched for %s', async (env) => {
    expect(await transform(env)).toBe(HTML)
  })
})
