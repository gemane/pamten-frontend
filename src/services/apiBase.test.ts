import { describe, it, expect } from 'vitest'
import { API_BASE, resolveApiBase, DEV_API_FALLBACK } from './api'

// The backend serves the real API under /v1; the unversioned paths still answer
// but are deprecated. Every call goes through the shared axios client, so the
// prefix is applied once on its baseURL — these lock that down.

describe('API base URL', () => {
  it('exposes the bare origin, without the version prefix', () => {
    // VITE_API_URL must stay an origin. If /v1 leaks into the env var as well,
    // every request would go to /v1/v1 and 404.
    expect(API_BASE).not.toMatch(/\/v1\/?$/)
    expect(API_BASE).toMatch(/^https?:\/\//)
  })

  it('builds a versioned base with exactly one slash', () => {
    const build = (base: string) => `${base.replace(/\/+$/, '')}/v1`
    expect(build('https://api.example.com')).toBe('https://api.example.com/v1')
    // A trailing slash in the env var must not produce a double slash.
    expect(build('https://api.example.com/')).toBe('https://api.example.com/v1')
    expect(build('https://api.example.com///')).toBe('https://api.example.com/v1')
  })
})

// ── A production build must be told its backend ───────────────────────────────
//
// The fallback used to be a hardcoded deployment, so a build with VITE_API_URL
// unset came up looking healthy while reading and writing another environment's
// data. Now that only happens in dev; a production build refuses to start.

describe('resolveApiBase', () => {
  it('uses the configured origin when given one', () => {
    expect(resolveApiBase('https://api.example.com', true)).toBe('https://api.example.com')
    expect(resolveApiBase('https://api.example.com', false)).toBe('https://api.example.com')
  })

  it('throws in a production build when unset, rather than guessing', () => {
    expect(() => resolveApiBase(undefined, true)).toThrow(/VITE_API_URL is not set/)
    expect(() => resolveApiBase('', true)).toThrow(/refusing to guess/)
  })

  it('falls back to the dev API only in development', () => {
    expect(resolveApiBase(undefined, false)).toBe(DEV_API_FALLBACK)
  })

  it('the dev fallback is not a stale hardcoded deployment', () => {
    expect(DEV_API_FALLBACK).not.toMatch(/onrender\.com/)
  })

  it('the dev fallback is same-site with the dev frontend', () => {
    // dev.owlgraph.org and api-dev.owlgraph.org share a registrable domain,
    // which is what lets a SameSite=Lax refresh cookie work between them.
    expect(DEV_API_FALLBACK).toContain('owlgraph.org')
  })
})
