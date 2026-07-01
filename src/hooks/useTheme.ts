import { useState, useEffect } from 'react'

export type Theme = 'dark' | 'light'

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('owlgraph-theme') as Theme | null
    if (saved === 'light' || saved === 'dark') return saved
    try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' }
    catch { return 'dark' }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('owlgraph-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  return [theme, toggle]
}
