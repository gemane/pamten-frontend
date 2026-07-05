import { useState, useMemo } from 'react'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps'
import worldData from 'world-atlas/countries-110m.json'
import { ALPHA2_TO_NUMERIC, countryName, toAlpha2 } from '../utils/isoCountries'
import { FiRotateCcw } from 'react-icons/fi'
import type { CountryEntityGroup, ContextCountry } from '../types'

interface TooltipState {
  x: number
  y: number
  text: string
}

interface MapViewProps {
  countryData?: CountryEntityGroup[]
  selectedCountry?: string | null
  onCountryClick: (country: string) => void
  contextCountries?: ContextCountry[]
  theme?: 'dark' | 'light'
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

function countryFill(
  data: CountryEntityGroup | undefined,
  context: 'primary' | 'subsidiary' | undefined,
  isHovered: boolean,
  theme: 'dark' | 'light',
  hasContext: boolean,
): string {
  const noData    = theme === 'dark' ? '#1c2540' : '#dde3ec'
  const noDataHov = theme === 'dark' ? '#252d45' : '#c8d1e0'

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
}: MapViewProps) {
  const [hoveredNum, setHoveredNum] = useState<number | null>(null)
  const [tooltip,    setTooltip]    = useState<TooltipState | null>(null)
  const [resetKey,   setResetKey]   = useState<number>(0)

  const numericMap        = useMemo(() => buildNumericMap(countryData), [countryData])
  const contextNumericMap = useMemo(() => buildContextNumericMap(contextCountries), [contextCountries])
  const hasContext        = contextCountries.length > 0

  // Only markers with actual GPS coordinates
  const gpsMarkers = useMemo(() =>
    contextCountries.filter(c => c.lat != null && c.lng != null),
  [contextCountries])

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

      <button className="map-reset-btn" onClick={() => setResetKey(k => k + 1)} title="Reset view">
        <FiRotateCcw />
      </button>

      <div className="map-hint">Scroll to zoom · Drag to pan · Click a country</div>

      <ComposableMap
        projectionConfig={{ scale: 140 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup key={resetKey} minZoom={1} maxZoom={12}>
          <Geographies geography={worldData}>
            {({ geographies }: { geographies: Array<{ id: string; rsmKey: string }> }) =>
              geographies.map((geo) => {
                const numId      = parseInt(geo.id)
                const data       = numericMap.get(numId)
                const context    = contextNumericMap.get(numId)
                const isHovered  = numId === hoveredNum
                const fill       = countryFill(data, context, isHovered, theme, hasContext)
                const stroke     = theme === 'dark' ? '#111827' : '#b8c4d4'
                const strokeW    = context ? 0.8 : 0.4

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
                        setTooltip({ x: 0, y: 0, text: label || countryName(String(numId)) })
                      } else if (data) {
                        setTooltip({ x: 0, y: 0,
                          text: `${countryName(data.country)} — ${data.count} ${data.count === 1 ? 'entity' : 'entities'}`,
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

          {gpsMarkers.map((c, i) => (
            <Marker key={i} coordinates={[c.lng!, c.lat!]}>
              <circle
                r={c.role === 'primary' ? 5 : 4}
                fill={c.role === 'primary' ? '#fcd34d' : '#f59e0b'}
                stroke={theme === 'dark' ? '#111827' : '#fff'}
                strokeWidth={1.5}
                style={{ cursor: 'default', pointerEvents: 'none' }}
              />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {countryData.length === 0 && contextCountries.length === 0 && (
        <div className="map-empty">
          <p>No geographic data yet.<br />Scrape companies to populate the map.</p>
        </div>
      )}
    </div>
  )
}
