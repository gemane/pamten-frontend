import { describe, it, expect } from 'vitest'
import { select } from 'd3-selection'
// Importing d3-transition monkey-patches `.interrupt` onto d3-selection's
// prototype. react-simple-maps' <ZoomableGroup> calls d3-zoom's
// `zoom.transform`, which internally calls `selection.interrupt()`. If the
// build ever resolves more than one physical copy of d3-selection, the copy
// react-simple-maps uses won't carry that patch and the whole map crashes at
// render with "selection.interrupt is not a function", blanking the app.
// This guards that a single, patched d3-selection is resolved. See the
// `overrides` block in package.json that forces the d3-zoom/selection chain
// to a single v3 copy.
import 'd3-transition'

describe('d3 dependency integrity (map zoom)', () => {
  it('d3-transition patches .interrupt onto the resolved d3-selection', () => {
    const sel = select(null as unknown as Element)
    expect(typeof (sel as unknown as { interrupt?: unknown }).interrupt).toBe('function')
  })
})
