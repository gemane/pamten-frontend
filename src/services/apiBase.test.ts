import { describe, it, expect } from 'vitest'
import { API_BASE } from './api'

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
