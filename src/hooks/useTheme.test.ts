import { describe, it, expect } from 'vitest'
import { resolveInitialTheme } from './useTheme'

describe('resolveInitialTheme', () => {
  it('honours a valid saved choice over the OS preference', () => {
    expect(resolveInitialTheme('light', false)).toBe('light')
    expect(resolveInitialTheme('dark', true)).toBe('dark')
  })

  it('falls back to the OS preference when nothing is saved', () => {
    expect(resolveInitialTheme(null, true)).toBe('light')
    expect(resolveInitialTheme(null, false)).toBe('dark')
  })

  it('ignores an invalid saved value and uses the OS preference', () => {
    expect(resolveInitialTheme('purple', true)).toBe('light')
    expect(resolveInitialTheme('', false)).toBe('dark')
  })

  it('defaults to dark', () => {
    expect(resolveInitialTheme(null, false)).toBe('dark')
  })
})
