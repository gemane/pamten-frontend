/**
 * What `ensureScrape` actually puts on the wire.
 *
 * The component tests all mock this module, so the request body is the one link
 * in the chain nothing else looks at — and a country dropped here fails exactly
 * as invisibly as one dropped anywhere else: the scrape succeeds and imports
 * whichever "Alphabet" the sources liked best.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('axios', () => ({
  default: {
    create: () => ({
      post,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    }),
  },
}))

import { ensureScrape } from './api'

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: {} })
})

const body = () => post.mock.calls[0][1]

describe('ensureScrape', () => {
  it('carries the chosen country to the server', async () => {
    await ensureScrape('Alphabet', 1, true, 'DE')
    expect(post).toHaveBeenCalledWith('/scraper/ensure', expect.anything())
    expect(body()).toEqual({ query: 'Alphabet', depth: 1, force: true, country: 'DE' })
  })

  it('omits the field entirely when no country is chosen', async () => {
    // Not `country: undefined` — the endpoint validates the field as ISO-2 when
    // present, and an absent key is the honest way to say "no restriction".
    await ensureScrape('Alphabet', 1, true)
    expect(body()).toEqual({ query: 'Alphabet', depth: 1, force: true })
    expect('country' in body()).toBe(false)
  })

  it('keeps its defaults', async () => {
    await ensureScrape('Alphabet')
    expect(body()).toEqual({ query: 'Alphabet', depth: 1, force: false })
  })

  it('passes the deeper idle pass through with the same country', async () => {
    await ensureScrape('Alphabet', 2, false, 'DE')
    expect(body()).toEqual({ query: 'Alphabet', depth: 2, force: false, country: 'DE' })
  })
})
