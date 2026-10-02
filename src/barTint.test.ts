/**
 * The three bars — top (logo, navigation, search), the Overview/Timeline bar,
 * the phone's footer — share one violet: a deep one with light labels in the
 * dark theme, lavender with dark labels in the light theme. They were the
 * panel's own colour: bars only by their hairlines.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(__dirname, 'index.css'), 'utf-8')
const BARS = ['.left-panel__header', '.graph-topbar', '.panel-tabs', '.app-bottom-nav']

/** Relative luminance and contrast, WCAG 2. */
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** The --bar-* variables one block declares. */
const tokensOf = (selector: string) => {
  const block = css.match(new RegExp(`(?:^|\\n)${selector} \\{([^}]*--bar-bg[^}]*)\\}`))
  expect(block, `${selector} declares the bar colours`).toBeTruthy()
  return Object.fromEntries([...block![1].matchAll(/--(bar-[a-z-]+): (#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]))
}
const dark = tokensOf(':root')
const light = tokensOf('\\[data-theme="light"\\]')

describe('the three bars share one violet per theme', () => {
  it('all of them from one colour, in both themes', () => {
    const rule = css.match(/\n([^{}]*)\{ background: var\(--bar-bg\); \}/)
    expect(rule, 'one rule sets the bar background').toBeTruthy()
    const selectors = rule![1].split(',').map(x => x.trim())
    for (const bar of BARS) {
      expect(selectors).toContain(bar)                                  // the dark theme (the default)
      expect(selectors).toContain(`[data-theme="light"] ${bar}`)        // …and past the older, more specific light rules
    }
  })

  it('is the last word on each bar: no later rule paints one another colour', () => {
    const after = css.slice(css.indexOf('background: var(--bar-bg)') + 10)
    for (const bar of BARS)
      // the bar itself (alone or in a selector list) — not something inside it
      expect(after).not.toMatch(new RegExp(`(^|[\\s,])\\${bar}\\s*(,[^{]*)?\\{[^}]*background:`))
  })

  it('dark theme: a deep violet with light labels; light theme: lavender with dark ones', () => {
    expect(lum(dark['bar-bg'])).toBeLessThan(0.08)
    expect(lum(dark['bar-text'])).toBeGreaterThan(0.5)
    expect(lum(light['bar-bg'])).toBeGreaterThan(0.5)
    expect(lum(light['bar-text'])).toBeLessThan(0.1)
    // violet, both: more blue than red, more red than green
    for (const t of [dark, light]) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(t['bar-bg'].slice(i, i + 2), 16))
      expect(b).toBeGreaterThan(r)
      expect(r).toBeGreaterThan(g)
    }
  })

  it('keeps the labels readable on it', () => {
    for (const t of [dark, light]) {
      expect(contrast(t['bar-text'], t['bar-bg'])).toBeGreaterThanOrEqual(4.5)     // inactive
      expect(contrast(t['bar-active'], t['bar-bg'])).toBeGreaterThanOrEqual(4.5)   // active
    }
    // the active item is told apart by more than a shade: bold and underlined
    expect(css).toMatch(/\.bottom-nav-btn--active \{ color: var\(--bar-active\); font-weight: 700; \}/)
    expect(css).toMatch(/\.panel-tab--active \{ border-bottom-color: var\(--bar-active\); \}/)
  })

  it('leaves the logo as it is', () => {
    expect(css).not.toMatch(/\[data-theme="light"\][^{]*\.logo-mark[^{]*\{/)
    expect(css).not.toMatch(/\[data-theme="light"\][^{]*\.logo \{/)
  })
})
