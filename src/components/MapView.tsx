import { useState, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps'
import worldData from 'world-atlas/countries-110m.json'
import { ALPHA2_TO_NUMERIC, countryName, toAlpha2 } from '../utils/isoCountries'
import { FiRotateCcw } from 'react-icons/fi'
import type { MapDetailData } from './MapDetail'   // type only — no Leaflet at import
import type { CountryEntityGroup, ContextCountry } from '../types'

// Lazy so Leaflet (which needs `window` at import) is only loaded when a pin is clicked.
const MapDetail = lazy(() => import('./MapDetail'))

interface TooltipState {
  x: number
  y: number
  text: string
}

interface FlyTo {
  center: [number, number]
  zoom: number
}

interface MapViewProps {
  countryData?: CountryEntityGroup[]
  selectedCountry?: string | null
  onCountryClick: (country: string) => void
  contextCountries?: ContextCountry[]
  theme?: 'dark' | 'light'
  flyTo?: FlyTo | null
}

function buildNumericMap(countryData: CountryEntityGroup[]): Map<number, CountryEntityGroup> {
  const map = new Map<number, CountryEntityGroup>()
  for (const d of countryData) {
    const a2 = toAlpha2(d.country) ?? d.country
    const num = ALPHA2_TO_NUMERIC[a2]
    if (num) map.set(num, d)
  }
  return map
}

function buildContextNumericMap(contextCountries: ContextCountry[]): Map<number, 'primary' | 'subsidiary'> {
  const map = new Map<number, 'primary' | 'subsidiary'>()
  for (const c of contextCountries) {
    const a2 = toAlpha2(c.country)
    if (!a2) continue
    const num = ALPHA2_TO_NUMERIC[a2]
    if (!num) continue
    if (!map.has(num) || c.role === 'primary') map.set(num, c.role)
  }
  return map
}

const MAX_COUNT = 20

export interface PlacedMarker {
  c: ContextCountry
  ox: number   // screen-pixel offset applied to the pin (before ÷ zoom)
  oy: number
  clustered: boolean
}

// Two entities at (nearly) the same coordinate — e.g. a parent and a same-campus
// subsidiary like Microsoft Corp + Round Island One (~90 m apart) — stack into a single
// un-clickable pin. Group markers by their coordinate (rounded to ~1 km); for each
// cluster keep one pin ANCHORED at the true location (the HQ/primary if present) and fan
// the others out around it, so the HQ stays put and the rest become individually
// clickable. Offsets are returned in screen pixels; the caller divides by zoom so the
// on-screen spacing is constant at every zoom level.
export function spreadOverlapping(markers: ContextCountry[], radius = 14): PlacedMarker[] {
  const groups = new Map<string, ContextCountry[]>()
  for (const c of markers) {
    const key = `${c.lat!.toFixed(2)},${c.lng!.toFixed(2)}`
    const g = groups.get(key)
    if (g) g.push(c)
    else groups.set(key, [c])
  }
  const out: PlacedMarker[] = []
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.push({ c: g[0], ox: 0, oy: 0, clustered: false })
      continue
    }
    // Anchor the primary (HQ) at the true point; everything else fans around it.
    const ordered = [...g].sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0))
    const [anchor, ...rest] = ordered
    out.push({ c: anchor, ox: 0, oy: 0, clustered: true })
    rest.forEach((c, i) => {
      const angle = (2 * Math.PI * i) / rest.length - Math.PI / 2
      out.push({ c, ox: radius * Math.cos(angle), oy: radius * Math.sin(angle), clustered: true })
    })
  }
  return out
}

export function countryFill(
  data: CountryEntityGroup | undefined,
  context: 'primary' | 'subsidiary' | undefined,
  isHovered: boolean,
  theme: 'dark' | 'light',
  hasContext: boolean,
): string {
  const noData    = theme === 'dark' ? '#1e2d4a' : '#c8d4e8'
  const noDataHov = theme === 'dark' ? '#263657' : '#b4c4da'

  if (context === 'primary')    return isHovered ? '#fcd34d' : '#b45309'
  if (context === 'subsidiary') return isHovered ? '#f59e0b' : '#d97706'
  if (!data || hasContext) return isHovered ? noDataHov : noData

  const t = Math.min(data.count / MAX_COUNT, 1)
  if (isHovered) return '#6aaae3'
  const r = Math.round(30  + t * (74  - 30))
  const g = Math.round(74  + t * (144 - 74))
  const b = Math.round(122 + t * (217 - 122))
  return `rgb(${r},${g},${b})`
}

export default function MapView({
  countryData = [],
  selectedCountry,
  onCountryClick,
  contextCountries = [],
  theme = 'dark',
  flyTo,
}: MapViewProps) {
  const { t, i18n } = useTranslation()
  const [hoveredNum, setHoveredNum] = useState<number | null>(null)
  const [tooltip,    setTooltip]    = useState<TooltipState | null>(null)
  const [detail,     setDetail]     = useState<MapDetailData | null>(null)
  const [resetKey,   setResetKey]   = useState<number>(0)
  // Seed from flyTo so pin markers (sized as radius / zoom) are correct on the
  // first paint after an auto-zoom. react-simple-maps bypasses move events for
  // flyTo, so onMoveEnd never fires to correct a stale zoom of 1.
  const [zoom,       setZoom]       = useState<number>(() => flyTo?.zoom ?? 1)

  const numericMap        = useMemo(() => buildNumericMap(countryData), [countryData])
  const contextNumericMap = useMemo(() => buildContextNumericMap(contextCountries), [contextCountries])
  const hasContext        = contextCountries.length > 0

  // Only markers with actual GPS coordinates
  const gpsMarkers = useMemo(() =>
    spreadOverlapping(contextCountries.filter(c => c.lat != null && c.lng != null)),
  [contextCountries])

  // Guard against NaN coordinates that would corrupt the d3-zoom transform
  const safeCenter = flyTo && isFinite(flyTo.center[0]) && isFinite(flyTo.center[1]) ? flyTo : null

  const handleMouseMove = (evt: React.MouseEvent<HTMLDivElement>) => {
    const rect = evt.currentTarget.getBoundingClientRect()
    setTooltip(t => t ? { ...t, x: evt.clientX - rect.left, y: evt.clientY - rect.top } : t)
  }

  return (
    <div className="map-wrapper" onMouseMove={handleMouseMove}>
      {tooltip && (
        <div className="map-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
          {tooltip.text}
        </div>
      )}

      <button className="map-reset-btn" onClick={() => { setResetKey(k => k + 1); setZoom(flyTo?.zoom ?? 1) }} title={t('map.resetView')}>
        <FiRotateCcw />
      </button>

      <div className="map-hint">{t('map.hint')}</div>

      <ComposableMap
        projectionConfig={{ scale: 140 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup
          key={`${resetKey}-${safeCenter ? `${safeCenter.center[0]},${safeCenter.center[1]}` : 'default'}`}
          center={safeCenter?.center ?? [0, 20]}
          zoom={safeCenter?.zoom ?? 1}
          minZoom={1}
          maxZoom={12}
          onMoveEnd={({ zoom: z }: { coordinates: [number, number]; zoom: number }) => setZoom(z)}
        >
          <Geographies geography={worldData}>
            {({ geographies }: { geographies: Array<{ id: string; rsmKey: string }> }) =>
              geographies.map((geo) => {
                const numId      = parseInt(geo.id)
                const data       = numericMap.get(numId)
                const context    = contextNumericMap.get(numId)
                const isHovered  = numId === hoveredNum
                const fill       = countryFill(data, context, isHovered, theme, hasContext)
                const stroke     = theme === 'dark' ? '#2a3a5a' : '#8898b4'
                const strokeW    = context ? 0.8 : 0.5

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => !hasContext && data && onCountryClick(data.country)}
                    onMouseEnter={() => {
                      setHoveredNum(numId)
                      if (context) {
                        const label = contextCountries
                          .filter(c => (toAlpha2(c.country) ? ALPHA2_TO_NUMERIC[toAlpha2(c.country)!] : null) === numId)
                          .map(c => c.label)
                          .join(', ')
                        setTooltip({ x: 0, y: 0, text: label || countryName(String(numId), i18n.language) })
                      } else if (data) {
                        setTooltip({ x: 0, y: 0,
                          text: `${countryName(data.country, i18n.language)} — ${t('map.entityCount', { count: data.count })}`,
                        })
                      }
                    }}
                    onMouseLeave={() => { setHoveredNum(null); setTooltip(null) }}
                    style={{
                      default: { fill, stroke, strokeWidth: strokeW, outline: 'none' },
                      hover:   { fill, stroke, strokeWidth: strokeW, outline: 'none',
                                 cursor: context || (!hasContext && data) ? 'pointer' : 'default' },
                      pressed: { fill: '#2b6cb0', outline: 'none' },
                    }}
                  />
                )
              })
            }
          </Geographies>

          {gpsMarkers.map(({ c, ox, oy, clustered }, i) => (
            <Marker key={i} coordinates={[c.lng!, c.lat!]}
              onClick={() => setDetail({ label: c.label, city: c.city, country: c.country,
                                         lat: c.lat!, lng: c.lng!, hqAddress: c.hqAddress,
                                         legalAddress: c.legalAddress, precise: c.precise })}
              onMouseEnter={() => setTooltip({ x: 0, y: 0, text: c.label })}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Fan clustered (near-coincident) pins out so each is clickable; a thin
                  leader line ties them back to their shared location. */}
              <g transform={`translate(${ox / zoom} ${oy / zoom})`}>
                {clustered && (ox !== 0 || oy !== 0) && (
                  <line x1={-ox / zoom} y1={-oy / zoom} x2={0} y2={0}
                    stroke={theme === 'dark' ? '#6b7280' : '#9ca3af'} strokeWidth={1 / zoom}
                    style={{ pointerEvents: 'none' }} />
                )}
                {/* Invisible larger hit area so the pin is easy to tap on mobile;
                    shrunk when clustered so neighbouring hit areas don't overlap. */}
                <circle r={(clustered ? 9 : 14) / zoom} fill="transparent" style={{ cursor: 'pointer' }} />
                <circle
                  r={(c.role === 'primary' ? 5 : 4) / zoom}
                  fill={c.role === 'primary' ? '#fcd34d' : '#f59e0b'}
                  stroke={theme === 'dark' ? '#111827' : '#fff'}
                  strokeWidth={1.5 / zoom}
                  style={{ cursor: 'pointer', pointerEvents: 'none' }}
                />
              </g>
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {detail && (
        <Suspense fallback={null}>
          <MapDetail data={detail} onClose={() => setDetail(null)} />
        </Suspense>
      )}

      {countryData.length === 0 && contextCountries.length === 0 && (
        <div className="map-empty">
          <p>{t('map.empty1')}<br />{t('map.empty2')}</p>
        </div>
      )}
    </div>
  )
}
