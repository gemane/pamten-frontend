import { describe, it, expect } from 'vitest'
import { shouldNotifyUnauthorized } from './api'

describe('shouldNotifyUnauthorized', () => {
  it('fires for a 401 on a normal (protected) endpoint — real session expiry', () => {
    expect(shouldNotifyUnauthorized(401, '/scraper/run')).toBe(true)
    expect(shouldNotifyUnauthorized(401, '/auth-adjacent/thing')).toBe(true) // not under /auth/
  })

  it('does NOT fire for auth endpoints (they handle their own 401)', () => {
    // /auth/me is the silent on-load session-restore check — an expired token
    // there must not pop the login modal.
    expect(shouldNotifyUnauthorized(401, '/auth/me')).toBe(false)
    expect(shouldNotifyUnauthorized(401, '/auth/login')).toBe(false)
    expect(shouldNotifyUnauthorized(401, '/auth/register')).toBe(false)
  })

  it('does not fire for non-401 statuses', () => {
    expect(shouldNotifyUnauthorized(403, '/scraper/run')).toBe(false)
    expect(shouldNotifyUnauthorized(500, '/entities/x')).toBe(false)
    expect(shouldNotifyUnauthorized(undefined, '/entities/x')).toBe(false)
  })

  it('handles a missing url', () => {
    expect(shouldNotifyUnauthorized(401, undefined)).toBe(true)
  })
})
