import { useState, useEffect } from 'react'

export type Theme = 'dark' | 'light'
export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'owlgraph-theme'

/** The effective theme from the chosen mode + the OS `prefers-color-scheme`. */
export function resolveTheme(mode: ThemeMode, prefersLight: boolean): Theme {
  if (mode === 'light' || mode === 'dark') return mode
  return prefersLight ? 'light' : 'dark'          // 'system'
}

/** The saved mode: a valid explicit choice wins; anything else (a legacy value or
 * nothing saved) means "follow the system", so a fresh visitor tracks their OS. */
export function resolveInitialMode(saved: string | null): ThemeMode {
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

function prefersLight(): boolean {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches }
  catch { return false }
}

/** [effective theme, chosen mode, setMode]. In 'system' mode the effective theme
 * tracks the OS live. */
export function useTheme(): [Theme, ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => resolveInitialMode(localStorage.getItem(STORAGE_KEY)))
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(mode, prefersLight()))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode)
    setTheme(resolveTheme(mode, prefersLight()))
  }, [mode])

  // While following the system, update when the OS scheme changes.
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setTheme(mq.matches ? 'light' : 'dark')
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [mode])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return [theme, mode, setMode]
}
