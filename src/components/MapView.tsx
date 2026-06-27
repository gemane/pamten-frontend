import { useState, useMemo } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import worldData from 'world-atlas/countries-110m.json'
import { ALPHA2_TO_NUMERIC, countryName } from '../utils/isoCountries'
import { FiRotateCcw } from 'react-icons/fi'
import type { CountryEntityGroup } from '../types'

interface TooltipState {
  x: number
  y: number
  text: string
}

interface MapViewProps {
  countryData?: CountryEntityGroup[]
  selectedCountry?: string | null
  onCountryClick: (country: string) => void
}

function buildNumericMap(countryData: CountryEntityGroup[]): Map<number, CountryEntityGroup> {
  const map = new Map<number, CountryEntityGroup>()
  for (const d of countryData) {
    const num = ALPHA2_TO_NUMERIC[d.country]
    if (num) map.set(num, d)
  }
  return map
}

const MAX_COUNT = 20

function countryFill(data: CountryEntityGroup | undefined, isSelected: boolean, isHovered: boolean): string {
  if (!data) return isHovered ? '#252d45' : '#1c2540'
  const t = Math.min(data.count / MAX_COUNT, 1)
  if (isSelected) return '#4A90D9'
  if (isHovered)  return '#6aaae3'
  const r = Math.round(30 + t * (74  - 30))
  const g = Math.round(74 + t * (144 - 74))
  const b = Math.round(122 + t * (217 - 122))
  return `rgb(${r},${g},${b})`
}

export default function MapView({ countryData = [], selectedCountry, onCountryClick }: MapViewProps) {
  const [hoveredNum, setHoveredNum] = useState<number | null>(null)
  const [tooltip,    setTooltip]    = useState<TooltipState | null>(null)
  const [resetKey,   setResetKey]   = useState<number>(0)

  const numericMap = useMemo(() => buildNumericMap(countryData), [countryData])

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
                const isSelected = data != null && data.country === selectedCountry
                const isHovered  = numId === hoveredNum
                const fill       = countryFill(data, isSelected, isHovered)

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => data && onCountryClick(data.country)}
                    onMouseEnter={() => {
                      setHoveredNum(numId)
                      if (data) {
                        setTooltip({ x: 0, y: 0,
                          text: `${countryName(data.country)} — ${data.count} ${data.count === 1 ? 'entity' : 'entities'}`,
                        })
                      }
                    }}
                    onMouseLeave={() => { setHoveredNum(null); setTooltip(null) }}
                    style={{
                      default: { fill, stroke: '#111827', strokeWidth: 0.4, outline: 'none' },
                      hover:   { fill, stroke: '#111827', strokeWidth: 0.4, outline: 'none',
                                 cursor: data ? 'pointer' : 'default' },
                      pressed: { fill: '#357abd', outline: 'none' },
                    }}
                  />
                )
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {countryData.length === 0 && (
        <div className="map-empty">
          <p>No geographic data yet.<br />Scrape companies to populate the map.</p>
        </div>
      )}
    </div>
  )
}
