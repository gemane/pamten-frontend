/**
 * Layout invariants that jsdom cannot catch.
 *
 * These are asserted against the stylesheet text rather than a rendered page,
 * because vitest has no layout engine — and the bug they guard against was
 * invisible in every component test while being obvious on a phone: the map
 * panel's company list was cut off mid-row, with a dead band of panel background
 * between the last visible row and the bottom nav.
 *
 * Two causes, both structural:
 *
 * 1. **A scroller inside a scroller.** `.map-panel` had `height: 100%` and its
 *    own `overflow-y: auto`, inside containers that already scroll. A percentage
 *    height resolves against the containing block's *content* box, so the inner
 *    scroller ended where the outer one's bottom padding began, and clipped the
 *    list there.
 * 2. **The bottom nav reserved twice.** `.right-panel` clears the fixed 58px nav
 *    with its own padding; `.mobile-panel` reserved it again, taking another
 *    58px out of every panel below the canvas.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf-8')

/** Every rule body for a selector, comments stripped. Several selectors here are
 *  declared more than once — a base rule plus a media-query override — so taking
 *  only the first would test whichever happens to come first in the file. */
function rulesFor(selector: string): string[] {
  const bare = selector.trim()
  const out: string[] = []
  for (let at = css.indexOf(`${bare} {`); at !== -1; at = css.indexOf(`${bare} {`, at + 1)) {
    // `.map-panel {` must not also match `.map-panel__hint {`; the space before
    // the brace already guarantees that, but a preceding word character would
    // mean we matched the tail of a longer selector.
    if (/[\w-]/.test(css[at - 1] ?? '')) continue
    out.push(css.slice(at, css.indexOf('}', at)).replace(/\/\*[\s\S]*?\*\//g, ''))
  }
  expect(out.length, `no rule for ${bare}`).toBeGreaterThan(0)
  return out
}

/** The declarations of every rule for a selector, as one string. */
const ruleFor = (selector: string) => rulesFor(selector).join('\n')

const NAV_HEIGHT = 58   // .app-bottom-nav, fixed to the viewport bottom

const paddingBottom = (rule: string): number | null => {
  const shorthand = /padding:\s*([^;]+);/.exec(rule)
  const explicit = /padding-bottom:\s*(-?[\d.]+)px/.exec(rule)
  if (explicit) return Number(explicit[1])
  if (shorthand) {
    const parts = shorthand[1].trim().split(/\s+/)
    const bottom = parts.length >= 3 ? parts[2] : parts[0]
    return /px$/.test(bottom) ? parseFloat(bottom) : null
  }
  return null
}

describe('the map panel is not a scroller inside a scroller', () => {
  it('does not scroll on its own — its container does', () => {
    expect(ruleFor('.map-panel')).not.toMatch(/overflow-y:\s*auto/)
  })

  it('fills its container by min-height, not height', () => {
    // `height: 100%` is the trap: it measures the content box, so any bottom
    // padding on the container silently shortens this panel and clips the list.
    const rule = ruleFor('.map-panel')
    expect(rule).toMatch(/min-height:\s*100%/)
    expect(rule).not.toMatch(/[^-]height:\s*100%/)
  })

  it('still sits inside containers that do scroll', () => {
    expect(ruleFor('.left-panel__detail')).toMatch(/overflow-y:\s*auto/)
    expect(ruleFor('.mobile-panel')).toMatch(/overflow-y:\s*auto/)
  })
})

describe('the bottom nav is cleared exactly once', () => {
  /** Whether any rule for this selector reserves the nav's height. */
  const reservesTheNav = (selector: string) =>
    rulesFor(selector).some(r => (paddingBottom(r) ?? 0) >= NAV_HEIGHT)

  it('is cleared by the outer panel', () => {
    expect(reservesTheNav('.right-panel')).toBe(true)
  })

  it('is not cleared again by the panels inside it', () => {
    // A second reservation comes straight off the visible height of the list —
    // and where the child fills its container, off the bottom of the list itself.
    expect(reservesTheNav('.mobile-panel')).toBe(false)
    expect(reservesTheNav('.mobile-full-panel')).toBe(false)
  })
})
