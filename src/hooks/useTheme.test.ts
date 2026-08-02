import { describe, it, expect } from 'vitest'
import { resolveTheme, resolveInitialMode } from './useTheme'

describe('resolveInitialMode', () => {
  it('honours an explicit saved mode', () => {
    expect(resolveInitialMode('light')).toBe('light')
    expect(resolveInitialMode('dark')).toBe('dark')
    expect(resolveInitialMode('system')).toBe('system')
  })

  it('treats nothing-saved or a legacy/invalid value as "system"', () => {
    expect(resolveInitialMode(null)).toBe('system')
    expect(resolveInitialMode('')).toBe('system')
    expect(resolveInitialMode('purple')).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('returns the explicit mode regardless of the OS preference', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it('follows the OS preference in system mode (defaulting to dark)', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })
})
