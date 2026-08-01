// OpenStreetMap helpers, kept free of any Leaflet import so they're unit-testable in
// the node test environment (Leaflet touches `window` at import time).

export function osmLargeUrl(lat: number, lng: number, zoom = 16): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`
}

// Geocode a full address to precise coordinates via Nominatim. Cached per address so a
// re-open doesn't re-request (Nominatim asks for light, cached use). null = not found.
const _geocodeCache = new Map<string, { lat: number; lng: number } | null>()

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (_geocodeCache.has(address)) return _geocodeCache.get(address)!
  let result: { lat: number; lng: number } | null = null
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (r.ok) {
      const d = await r.json()
      if (Array.isArray(d) && d[0]?.lat && d[0]?.lon)
        result = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
    }
  } catch { /* offline / blocked → fall back to the city point */ }
  _geocodeCache.set(address, result)
  return result
}
