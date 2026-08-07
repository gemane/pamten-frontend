import { describe, it, expect } from 'vitest'
import { canScrape, canManageScrapes, canAdministerScrapes } from './scrapeAccess'
import type { AuthUser } from '../types'

const user = (over: Partial<AuthUser> = {}): AuthUser =>
  ({ id: '1', email: 'a@example.com', role: 'viewer', ...over })

describe('canScrape', () => {
  it('denies anonymous users', () => {
    expect(canScrape(null)).toBe(false)
    expect(canScrape(undefined)).toBe(false)
  })

  it('denies signed-in but unverified users (incl. unknown verification)', () => {
    expect(canScrape(user({ email_verified: false }))).toBe(false)
    expect(canScrape(user())).toBe(false)   // email_verified undefined → not yet known
  })

  it('allows any verified user regardless of role', () => {
    expect(canScrape(user({ email_verified: true }))).toBe(true)
    expect(canScrape(user({ role: 'admin', email_verified: true }))).toBe(true)
  })
})

// These two mirror backend guards; if one drifts the UI starts offering actions
// the API refuses. See the comments in scrapeAccess.ts for which guard is which.

describe('canManageScrapes — mirrors require_contributor', () => {
  it('allows contributors and admins', () => {
    expect(canManageScrapes(user({ role: 'contributor' }))).toBe(true)
    expect(canManageScrapes(user({ role: 'admin' }))).toBe(true)
  })

  it('denies viewers, moderators and anonymous', () => {
    expect(canManageScrapes(user({ role: 'viewer' }))).toBe(false)
    expect(canManageScrapes(user({ role: 'moderator' }))).toBe(false)
    expect(canManageScrapes(null)).toBe(false)
    expect(canManageScrapes(undefined)).toBe(false)
  })

  it('does not depend on email verification', () => {
    // Unlike canScrape: the role is the gate the backend applies here.
    expect(canManageScrapes(user({ role: 'contributor', email_verified: false }))).toBe(true)
  })
})

describe('canAdministerScrapes — admin only', () => {
  it('allows admins', () => {
    expect(canAdministerScrapes(user({ role: 'admin' }))).toBe(true)
  })

  it('denies contributors — federation writes are require_admin', () => {
    expect(canAdministerScrapes(user({ role: 'contributor' }))).toBe(false)
  })

  it('denies everyone else', () => {
    expect(canAdministerScrapes(user({ role: 'viewer' }))).toBe(false)
    expect(canAdministerScrapes(user({ role: 'moderator' }))).toBe(false)
    expect(canAdministerScrapes(null)).toBe(false)
  })
})
