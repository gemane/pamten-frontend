import { describe, it, expect } from 'vitest'
import { FOCUS_ATTR, focusIdAt, focusRows, pickCenterRow, type RowBox } from './graphFocus'

const rows: RowBox[] = [
  { id: 'a', top: 100, bottom: 130 },
  { id: 'b', top: 132, bottom: 162 },
  { id: 'c', top: 164, bottom: 194 },
]

describe('pickCenterRow', () => {
  it('picks the row the centre line runs through', () => {
    // viewport 0..290 → centre 145, inside b
    expect(pickCenterRow(rows, 0, 290)).toBe('b')
  })

  it('in the gap between two rows, takes the nearer one', () => {
    // centre 131 sits between a (ends 130) and b (starts 132): a is 1px away
    expect(pickCenterRow(rows, 0, 262)).toBe('a')
    expect(pickCenterRow(rows, 0, 263.8)).toBe('b')   // centre 131.9, b is 0.1px away
  })

  it('lets go once the centre is more than a row height away', () => {
    // centre 250: c ends at 194, 56px away, more than its 30px height
    expect(pickCenterRow(rows, 0, 500)).toBeNull()
  })

  it('never picks a row outside the viewport', () => {
    // viewport 200..400: all rows above it
    expect(pickCenterRow(rows, 200, 400)).toBeNull()
  })

  it('ignores a row just outside a small viewport even though it is near the centre', () => {
    // viewport 0..40 (centre 20); the only row starts at 41, 21px away — within
    // its own 30px height, but not on screen, so it must not light up
    expect(pickCenterRow([{ id: 'below', top: 41, bottom: 71 }], 0, 40)).toBeNull()
  })

  it('is null for no rows', () => {
    expect(pickCenterRow([], 0, 500)).toBeNull()
  })
})

describe('DOM helpers', () => {
  const scope = () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <button ${FOCUS_ATTR}="lei:1"><span class="name">Owner</span></button>
      <div class="rel-item">Executive, no focus</div>
      <div ${FOCUS_ATTR}="gb-coh:2">Subsidiary</div>`
    return root
  }

  it('reads the id of the focusable row an event hit, from any child', () => {
    const root = scope()
    expect(focusIdAt(root.querySelector('.name'))).toBe('lei:1')
    expect(focusIdAt(root.querySelector('.rel-item'))).toBeNull()
    expect(focusIdAt(null)).toBeNull()
  })

  it('lists only the focusable rows, in document order', () => {
    expect(focusRows(scope()).map(r => r.id)).toEqual(['lei:1', 'gb-coh:2'])
  })
})
