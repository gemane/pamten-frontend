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


describe('browser-chrome sync (meta theme-color)', () => {
  it('follows the applied theme, so light mode gets a light top bar', async () => {
    const { renderHook, act } = await import('@testing-library/react')
    const { useTheme } = await import('./useTheme')
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', '#ffffff')
    document.head.appendChild(meta)

    const { result } = renderHook(() => useTheme())
    act(() => { result.current[2]('dark') })
    expect(meta.getAttribute('content')).toBe('#1a1a2e')
    act(() => { result.current[2]('light') })
    expect(meta.getAttribute('content')).toBe('#ffffff')
    meta.remove()
  })
})
