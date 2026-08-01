import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { osmLargeUrl, geocodeAddress } from '../utils/osm'

describe('osmLargeUrl', () => {
  it('links to the point on openstreetmap.org', () => {
    expect(osmLargeUrl(51.5, -0.12, 16)).toBe(
      'https://www.openstreetmap.org/?mlat=51.5&mlon=-0.12#map=16/51.5/-0.12')
  })
})

describe('geocodeAddress', () => {
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns precise coords from Nominatim, and caches (one fetch for repeats)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ lat: '51.9', lon: '-2.07' }],
    })
    vi.stubGlobal('fetch', fetchMock)

    const addr = '10 Test St, Cheltenham, GL51 0TJ, uniqueA'
    expect(await geocodeAddress(addr)).toEqual({ lat: 51.9, lng: -2.07 })
    await geocodeAddress(addr)                 // cached
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null on no match or error (falls back to the city point)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    expect(await geocodeAddress('nowhere, uniqueB')).toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')))
    expect(await geocodeAddress('unreachable, uniqueC')).toBeNull()
  })
})
