import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'

// MapLibre needs WebGL; a stand-in records what the component asks of it.
// Hoisted, because vi.mock's factory runs before anything else in the file.
const fakes = vi.hoisted(() => {
  const flags = { throwOnConstruct: false }
  class FakeMap {
    static maps: FakeMap[] = []
    options: Record<string, unknown>
    handlers: Record<string, Array<() => void>> = {}
    sources = new Map<string, unknown>()
    layers = new Map<string, unknown>()
    styleLoaded = false
    jumps: unknown[] = []
    styles: string[] = []
    removed = false
    resized = 0
    constructor(options: Record<string, unknown>) {
      if (flags.throwOnConstruct) throw new Error('WebGL2 is required to display this map')
      this.options = options; FakeMap.maps.push(this)
    }
    on(ev: string, fn: () => void) { (this.handlers[ev] ??= []).push(fn); return this }
    once(ev: string, fn: () => void) { return this.on(ev, fn) }
    emit(ev: string) { (this.handlers[ev] ?? []).forEach(fn => fn()) }
    isStyleLoaded() { return this.styleLoaded }
    jumpTo(o: unknown) { this.jumps.push(o) }
    setStyle(s: string) { this.styles.push(s); this.styleLoaded = false; this.sources.clear(); this.layers.clear() }
    addSource(id: string, s: unknown) { this.sources.set(id, s) }
    addLayer(l: { id: string }) { this.layers.set(l.id, l) }
    getSource(id: string) { return this.sources.get(id) }
    getLayer(id: string) { return this.layers.get(id) }
    removeSource(id: string) { this.sources.delete(id) }
    removeLayer(id: string) { this.layers.delete(id) }
    resize() { this.resized++ }
    remove() { this.removed = true }
  }
  class FakeMarker {
    static live: FakeMarker[] = []
    lngLat: [number, number] | null = null
    el: HTMLElement | undefined
    constructor(o?: { element?: HTMLElement }) { this.el = o?.element; FakeMarker.live.push(this) }
    setLngLat(ll: [number, number]) { this.lngLat = ll; return this }
    addTo() { return this }
    remove() { FakeMarker.live = FakeMarker.live.filter(m => m !== this) }
  }
  return { FakeMap, FakeMarker, flags }
})
const { FakeMap, FakeMarker } = fakes
vi.mock('maplibre-gl', () => ({ Map: fakes.FakeMap, Marker: fakes.FakeMarker }))

import MapDetail, { basemapStyle, circlePolygon, OPENFREEMAP_STYLES } from './MapDetail'

const data = { label: 'Acme GmbH', country: 'DE', city: 'Berlin', lat: 52.52, lng: 13.405, precise: true }
const loaded = () => { const m = FakeMap.maps.at(-1)!; m.styleLoaded = true; m.emit('style.load'); return m }

beforeEach(() => { FakeMap.maps.length = 0; FakeMarker.live = []; vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); document.documentElement.removeAttribute('data-theme') })

describe('the detail map on OpenFreeMap', () => {
  it('opens on the light Liberty style at the address, street-level zoom for a precise pin', () => {
    render(<MapDetail data={data} onClose={() => {}} />)
    const m = FakeMap.maps[0]
    expect(m.options.style).toBe(OPENFREEMAP_STYLES.light)
    expect(m.options.center).toEqual([13.405, 52.52])
    expect(m.options.zoom).toBe(16)
    vi.runAllTimers()
    expect(m.resized).toBe(1)                                       // measured again once the popup is up
  })

  it('takes the dark style when the page is dark, and follows a theme switch while open', () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    render(<MapDetail data={data} onClose={() => {}} />)
    const m = FakeMap.maps[0]
    expect(m.options.style).toBe(OPENFREEMAP_STYLES.dark)
    document.documentElement.setAttribute('data-theme', 'light')
    return vi.waitFor(() => expect(m.styles).toEqual([OPENFREEMAP_STYLES.light]))
  })

  it('a precise address gets a pin once the style is up; an approximate one a 1,500 m circle at city zoom', () => {
    const { rerender } = render(<MapDetail data={data} onClose={() => {}} />)
    const m = loaded()
    expect(FakeMarker.live).toHaveLength(1)
    expect(FakeMarker.live[0].lngLat).toEqual([13.405, 52.52])
    expect(FakeMarker.live[0].el?.className).toBe('map-detail__pin')
    expect(m.sources.has('hq-area')).toBe(false)
    rerender(<MapDetail data={{ ...data, precise: false }} onClose={() => {}} />)
    expect(FakeMarker.live).toHaveLength(0)                         // the pin gave way to the circle
    expect(m.jumps.at(-1)).toEqual({ center: [13.405, 52.52], zoom: 12 })
    const src = m.sources.get('hq-area') as { data: GeoJSON.Feature<GeoJSON.Polygon> }
    expect(src.data.geometry.type).toBe('Polygon')
    expect(m.layers.has('hq-area-fill') && m.layers.has('hq-area-line')).toBe(true)
  })

  it('another company picked: the same map jumps there and the mark moves', () => {
    const { rerender } = render(<MapDetail data={data} onClose={() => {}} />)
    const m = loaded()
    rerender(<MapDetail data={{ ...data, label: 'Beta AG', lat: 48.2, lng: 16.37 }} onClose={() => {}} />)
    expect(FakeMap.maps).toHaveLength(1)                              // not a second map
    expect(m.jumps.at(-1)).toEqual({ center: [16.37, 48.2], zoom: 16 })
    expect(FakeMarker.live).toHaveLength(1)
    expect(FakeMarker.live[0].lngLat).toEqual([16.37, 48.2])
  })

  it('a style reload redraws the mark; closing removes the map and its mark', () => {
    const { unmount } = render(<MapDetail data={{ ...data, precise: false }} onClose={() => {}} />)
    const m = loaded()
    expect(m.sources.has('hq-area')).toBe(true)
    m.setStyle('x'); m.styleLoaded = true; m.emit('style.load')
    expect(m.sources.has('hq-area')).toBe(true)                     // drawn again on the new style
    unmount()
    expect(m.removed).toBe(true)
    expect(FakeMarker.live).toHaveLength(0)
  })
})

describe('without WebGL', () => {
  it('says so inside the pop-up and keeps the link to the large map, instead of crashing the map view', () => {
    fakes.flags.throwOnConstruct = true
    try {
      const { getByRole, getByText } = render(<MapDetail data={data} onClose={() => {}} />)
      expect(getByRole('note').textContent).toMatch(/needs WebGL/)
      expect(getByRole('link', { name: /larger map/i })).toBeTruthy()
    } finally {
      fakes.flags.throwOnConstruct = false
    }
  })
})

describe('the helpers', () => {
  it('basemapStyle: dark for dark, Liberty for anything else', () => {
    expect(basemapStyle('dark')).toBe(OPENFREEMAP_STYLES.dark)
    expect(basemapStyle('light')).toBe(OPENFREEMAP_STYLES.light)
    expect(basemapStyle(null)).toBe(OPENFREEMAP_STYLES.light)
  })

  it('circlePolygon: a closed ring of points about the radius away', () => {
    const ring = circlePolygon(52.52, 13.405, 1500).geometry.coordinates[0]
    expect(ring).toHaveLength(65)
    expect(ring[0]).toEqual(ring[64])                                 // closed
    const [lng, lat] = ring[16]                                       // due north
    expect(lng).toBeCloseTo(13.405, 6)
    expect((lat - 52.52) * 111_320).toBeCloseTo(1500, 0)
    const [elng] = ring[0]                                            // due east, longitude shrunk by the latitude
    expect((elng - 13.405) * 111_320 * Math.cos(52.52 * Math.PI / 180)).toBeCloseTo(1500, 0)
  })
})
