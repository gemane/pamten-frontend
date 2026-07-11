import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [hoveredNum, setHoveredNum] = useState<number | null>(null)
  const [tooltip,    setTooltip]    = useState<TooltipState | null>(null)
  const [resetKey,   setResetKey]   = useState<number>(0)
  const [zoom,       setZoom]       = useState<number>(1)

  const numericMap        = useMemo(() => buildNumericMap(countryData), [countryData])
  const contextNumericMap = useMemo(() => buildContextNumericMap(contextCountries), [contextCountries])
  const hasContext        = contextCountries.length > 0

  // Only markers with actual GPS coordinates
  const gpsMarkers = useMemo(() =>
    contextCountries.filter(c => c.lat != null && c.lng != null),
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

      <button className="map-reset-btn" onClick={() => setResetKey(k => k + 1)} title={t('map.resetView')}>
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
                        setTooltip({ x: 0, y: 0, text: label || countryName(String(numId)) })
                      } else if (data) {
                        setTooltip({ x: 0, y: 0,
                          text: `${countryName(data.country)} — ${t('map.entityCount', { count: data.count })}`,
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
                r={(c.role === 'primary' ? 5 : 4) / zoom}
                fill={c.role === 'primary' ? '#fcd34d' : '#f59e0b'}
                stroke={theme === 'dark' ? '#111827' : '#fff'}
                strokeWidth={1.5 / zoom}
                style={{ cursor: 'default', pointerEvents: 'none' }}
              />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {countryData.length === 0 && contextCountries.length === 0 && (
        <div className="map-empty">
          <p>{t('map.empty1')}<br />{t('map.empty2')}</p>
        </div>
      )}
    </div>
  )
}
