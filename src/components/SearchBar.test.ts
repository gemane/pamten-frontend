import { describe, it, expect } from 'vitest'
import { consumeSkip } from './SearchBar'

describe('consumeSkip — suppress the search a programmatic setQuery would trigger', () => {
  it('runs a normal search when nothing is being skipped', () => {
    expect(consumeSkip('microsoft', null)).toEqual({ run: true, skip: null })
  })

  it('skips (and clears) the pass whose query matches the skip value', () => {
    // The programmatic setQuery(label) pass: must not search, and the guard is spent.
    expect(consumeSkip('Microsoft Corp', 'Microsoft Corp')).toEqual({ run: false, skip: null })
  })

  it('preserves the skip when an earlier, non-matching pass runs first (the remount bug)', () => {
    // On remount the effect first runs with query='' while skip='Microsoft Corp'. A
    // boolean guard would be eaten here; the value guard must survive so the later
    // query='Microsoft Corp' pass is the one that gets skipped.
    const first = consumeSkip('', 'Microsoft Corp')
    expect(first).toEqual({ run: true, skip: 'Microsoft Corp' })
    const second = consumeSkip('Microsoft Corp', first.skip)
    expect(second).toEqual({ run: false, skip: null })
  })

  it('does not skip a genuine later search of the same text once the guard is cleared', () => {
    expect(consumeSkip('Microsoft Corp', null)).toEqual({ run: true, skip: null })
  })
})
