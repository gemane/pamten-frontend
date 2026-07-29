import { describe, it, expect } from 'vitest'
import { parseEmailAction } from './useEmailActionLinks'

describe('parseEmailAction', () => {
  it('extracts a verify-email action + token', () => {
    expect(parseEmailAction('?action=verify-email&token=abc123'))
      .toEqual({ action: 'verify-email', token: 'abc123' })
  })
  it('extracts a reset-password action + token', () => {
    expect(parseEmailAction('?action=reset-password&token=xyz'))
      .toEqual({ action: 'reset-password', token: 'xyz' })
  })
  it('returns null when action or token is missing, or the query is empty', () => {
    expect(parseEmailAction('?action=verify-email')).toBeNull()
    expect(parseEmailAction('?token=abc')).toBeNull()
    expect(parseEmailAction('')).toBeNull()
  })
})
