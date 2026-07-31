import { useState, useEffect } from 'react'

export type Theme = 'dark' | 'light'

/**
 * Resolve the initial theme: a valid saved choice wins; otherwise fall back to the
 * OS `prefers-color-scheme` (light only when explicitly preferred), defaulting to
 * dark. Pure so it can be unit-tested without rendering the hook.
 */
export function resolveInitialTheme(saved: string | null, prefersLight: boolean): Theme {
  if (saved === 'light' || saved === 'dark') return saved
  return prefersLight ? 'light' : 'dark'
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('owlgraph-theme')
    let prefersLight = false
    try { prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches }
    catch { prefersLight = false }
    return resolveInitialTheme(saved, prefersLight)
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('owlgraph-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  return [theme, toggle]
}
