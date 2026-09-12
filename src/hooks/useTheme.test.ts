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
    // the page carries a media-qualified PAIR; the toggle must rewrite both
    const metas = ['light', 'dark'].map(scheme => {
      const m = document.createElement('meta')
      m.setAttribute('name', 'theme-color')
      m.setAttribute('media', `(prefers-color-scheme: ${scheme})`)
      m.setAttribute('content', scheme === 'light' ? '#f0f4f8' : '#1a1a2e')
      document.head.appendChild(m)
      return m
    })

    const { result } = renderHook(() => useTheme())
    act(() => { result.current[2]('dark') })
    expect(metas.map(m => m.getAttribute('content'))).toEqual(['#1a1a2e', '#1a1a2e'])
    act(() => { result.current[2]('light') })
    expect(metas.map(m => m.getAttribute('content'))).toEqual(['#f0f4f8', '#f0f4f8'])
    metas.forEach(m => m.remove())
  })
})
