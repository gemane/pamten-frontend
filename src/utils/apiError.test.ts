import { describe, it, expect } from 'vitest'
import { errText } from './apiError'

// Settings panels show backend failures verbatim, because the backend's message
// is the specific one: which password rule failed, why a deletion was refused.
// A generic string in its place would hide the actual reason.

describe('errText', () => {
  it("prefers the backend's detail message", () => {
    const err = { response: { data: { detail: 'Current password is incorrect' } } }
    expect(errText(err, 'fallback')).toBe('Current password is incorrect')
  })

  it('passes through the account-deletion refusals', () => {
    // These two carry the instructions the user needs to act on.
    const adminEmail = {
      response: { data: { detail: 'This account is provisioned from ADMIN_EMAIL and would be recreated on the next restart. Unset ADMIN_EMAIL first, then delete it.' } },
    }
    const lastAdmin = {
      response: { data: { detail: 'You are the only admin. Promote another user to admin before deleting this account.' } },
    }
    expect(errText(adminEmail, 'fallback')).toContain('ADMIN_EMAIL')
    expect(errText(lastAdmin, 'fallback')).toContain('only admin')
  })

  it('falls back when the error carries no detail', () => {
    expect(errText(new Error('network down'), 'fallback')).toBe('fallback')
    expect(errText({ response: { data: {} } }, 'fallback')).toBe('fallback')
    expect(errText(undefined, 'fallback')).toBe('fallback')
    expect(errText(null, 'fallback')).toBe('fallback')
  })

  it('falls back when detail is not a string', () => {
    // FastAPI returns a list of objects for request-validation errors; rendering
    // that raw would put "[object Object]" in front of the user.
    expect(errText({ response: { data: { detail: [{ msg: 'bad' }] } } }, 'fallback')).toBe('fallback')
  })
})
