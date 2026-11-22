import type { ContextCountry } from '../types'
import type { MapDetailData } from '../components/MapDetail'

/** What a pin's street map is told about it. */
export function pinDetail(c: ContextCountry): MapDetailData {
  return { label: c.label, city: c.city, country: c.country, lat: c.lat!, lng: c.lng!,
           hqAddress: c.hqAddress, legalAddress: c.legalAddress, precise: c.precise }
}

/** The selected company's own pin, when it has a coordinate to stand on. */
export function primaryPin(pins: ContextCountry[]): ContextCountry | null {
  return pins.find(c => c.role === 'primary' && c.lat != null && c.lng != null) ?? null
}
