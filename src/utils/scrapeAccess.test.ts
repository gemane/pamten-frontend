import { describe, it, expect } from 'vitest'
import { canScrape } from './scrapeAccess'
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
