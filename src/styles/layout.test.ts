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

/**
 * The start screen wraps where we say, on a phone.
 *
 * Four statistics and three suggestions, in centred flex rows. Left to wrap on
 * their own they broke wherever the text ran out — which moves with the numbers
 * (six digits or seven) and with the language, so the shape of the first screen
 * a visitor sees changed between visits. Asked for: 2 + 2 and 2 + 1 on a small
 * screen, desktop untouched.
 *
 * Checked against the stylesheet and the markup rather than a rendered page,
 * because vitest has no layout engine and this is entirely a question of where
 * lines break. Both halves have to hold: a break element the CSS never widens
 * does nothing, and CSS with no element to apply it to does nothing either.
 */
const graphSource = readFileSync(
  join(__dirname, '..', 'components', 'Graph.tsx'), 'utf-8')

/** The rule body inside `@media (max-width: 640px)` for a selector.
 *
 *  The query's extent is found by counting braces, not by taking a fixed slice.
 *  A slice runs past the closing brace, and then a rule sitting just *after* the
 *  media query reads as though it were inside it — which is exactly the mistake
 *  this helper exists to detect. */
function mobileRuleFor(selector: string): string {
  for (let from = css.indexOf('@media (max-width: 640px)'); from !== -1;
       from = css.indexOf('@media (max-width: 640px)', from + 1)) {
    let depth = 0
    let end = from
    for (let i = css.indexOf('{', from); i < css.length; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}' && --depth === 0) { end = i; break }
    }
    const block = css.slice(from, end)
    const found = block.indexOf(`${selector} {`)
    if (found !== -1) return block.slice(found, block.indexOf('}', found))
  }
  return ''
}

describe('where the start screen breaks its rows', () => {
  it('breaks after the second statistic', () => {
    // Between the second and third <span>, so the four read 2 + 2. Matched on
    // the element, not the class name: a comment naming the class sits right
    // beside it, and searching for the name alone passed with the element gone.
    const stats = graphSource.slice(
      graphSource.indexOf('graph-welcome__stats'),
      graphSource.indexOf('graph-welcome__chips'))
    const element = /<div className="graph-welcome__break" \/>/
    expect(stats).toMatch(element)
    const before = stats.slice(0, stats.search(element))
    expect((before.match(/<span>/g) ?? []).length).toBe(2)
    expect((stats.match(/<span>/g) ?? []).length).toBe(4)
  })

  it('breaks after the second suggestion', () => {
    // The chips are mapped, so the break is placed by index: before the third.
    const chips = graphSource.slice(graphSource.indexOf('graph-welcome__chips'))
    expect(chips).toMatch(/i === 2 && <div className="graph-welcome__break"/)
  })

  it('is invisible until the screen is small', () => {
    // Desktop keeps all four statistics on one line; a break element that was
    // ever full-width there would split them for everybody.
    expect(ruleFor('.graph-welcome__break')).toMatch(/display:\s*none/)
  })

  it('spans the row once it is', () => {
    // The flexbox line break: full basis, no height. Without the basis it is a
    // zero-width child and nothing moves.
    const rule = mobileRuleFor('.graph-welcome__break')
    expect(rule).toMatch(/display:\s*block/)
    expect(rule).toMatch(/flex-basis:\s*100%/)
    expect(rule).toMatch(/height:\s*0/)
  })

  it('does not leave a separator dangling at the start of the second row', () => {
    // The statistics are separated by "· " on a ::before. The third one now
    // begins a line, where a leading dot reads as a typo.
    expect(mobileRuleFor('.graph-welcome__stats > span:nth-of-type(3)::before'))
      .toMatch(/content:\s*none/)
  })

  it('leaves the desktop separators alone', () => {
    // Only the first is suppressed outside the media query; suppressing the
    // third there too would drop a divider from the single-line layout.
    const base = ruleFor('.graph-welcome__stats > span:nth-of-type(3)::before')
      .replace(mobileRuleFor('.graph-welcome__stats > span:nth-of-type(3)::before'), '')
    expect(base.trim()).toBe('')
  })

  it('lets the rows keep centring themselves', () => {
    // flex-basis: 50% on the items would break in the same places, but it
    // stretches a pill button to half the row and pins the pair left. The break
    // element exists precisely so the items keep their natural width.
    for (const selector of ['.graph-welcome__stats', '.graph-welcome__chips']) {
      expect(ruleFor(selector)).toMatch(/justify-content:\s*center/)
      expect(ruleFor(selector)).toMatch(/flex-wrap:\s*wrap/)
    }
  })
})

describe('a section nested inside another does not end in dead space', () => {
  it('drops the trailing margins that would otherwise stack', () => {
    // The GLEIF parent statement is a `.panel-section` inside the Details
    // collapsible. Left alone, its own 18px bottom margin and its last
    // paragraph's 16px stack into ~34px of empty panel below the text.
    expect(ruleFor('.panel-section .panel-section:last-child')).toMatch(/margin-bottom:\s*0/)
    expect(ruleFor('.panel-section .panel-section > .panel-desc:last-child'))
      .toMatch(/margin-bottom:\s*0/)
  })

  it('leaves the spacing between top-level sections alone', () => {
    // Scoped to the nested case on purpose: a blanket `.panel-section:last-child`
    // would close the gap under the last section of every panel.
    expect(ruleFor('.panel-section')).toMatch(/margin-bottom:\s*18px/)
  })
})
