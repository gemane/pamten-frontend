// OpenStreetMap helpers, kept free of any Leaflet import so they're unit-testable in
// the node test environment (Leaflet touches `window` at import time).

export function osmLargeUrl(lat: number, lng: number, zoom = 16): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`
}
