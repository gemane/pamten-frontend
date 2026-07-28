import { describe, it, expect } from 'vitest'
import { extractError } from './AuthModal'

describe('extractError', () => {
  it('returns a plain string detail as the message', () => {
    const err = { response: { data: { detail: 'Email already registered' } } }
    expect(extractError(err, 'fallback')).toEqual({ text: 'Email already registered' })
  })

  it('unpacks the {code,message} object detail (the email_not_verified 403)', () => {
    const err = { response: { data: { detail: { code: 'email_not_verified', message: 'Please verify your email before logging in.' } } } }
    expect(extractError(err, 'fallback')).toEqual({
      text: 'Please verify your email before logging in.',
      code: 'email_not_verified',
    })
  })

  it('falls back when there is no detail (network / unexpected error)', () => {
    expect(extractError({}, 'Something went wrong')).toEqual({ text: 'Something went wrong' })
    expect(extractError(new Error('boom'), 'Something went wrong')).toEqual({ text: 'Something went wrong' })
  })

  it('uses the fallback when an object detail has a code but no message', () => {
    const err = { response: { data: { detail: { code: 'x' } } } }
    expect(extractError(err, 'fallback')).toEqual({ text: 'fallback', code: 'x' })
  })
})
