import { useState, useMemo } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import worldData from 'world-atlas/countries-110m.json'
import { ALPHA2_TO_NUMERIC, countryName } from '../utils/isoCountries'

// Build numeric-keyed lookup from countryData array
function buildNumericMap(countryData) {
  const map = new Map()
  for (const d of countryData) {
    const num = ALPHA2_TO_NUMERIC[d.country]
    if (num) map.set(num, d)
  }
  return map
}

const MAX_COUNT = 20 // cap for color scale

function countryFill(data, isSelected, isHovered) {
  if (!data) {
    return isHovered ? '#252d45' : '#1c2540'
  }
  const intensity = Math.min(data.count / MAX_COUNT, 1)
  if (isSelected) return '#4A90D9'
  if (isHovered)  return '#6aaae3'
  // Lerp from #1e4a7a (low) to #4A90D9 (high)
  const r = Math.round(30  + intensity * (74  - 30))
  const g = Math.round(74  + intensity * (144 - 74))
  const b = Math.round(122 + intensity * (217 - 122))
  return `rgb(${r},${g},${b})`
}

export default function MapView({ countryData = [], selectedCountry, onCountryClick }) {
  const [hoveredNum, setHoveredNum] = useState(null)
  const [tooltip,    setTooltip]    = useState(null) // { x, y, text }
  const [zoom,       setZoom]       = useState(1)

  const numericMap = useMemo(() => buildNumericMap(countryData), [countryData])

  const handleMove = (evt) => {
    const rect = evt.currentTarget.getBoundingClientRect()
    setTooltip(t => t ? { ...t, x: evt.clientX - rect.left, y: evt.clientY - rect.top } : t)
  }

  return (
    <div className="map-wrapper" onMouseMove={handleMove}>
      {tooltip && (
        <div className="map-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
          {tooltip.text}
        </div>
      )}

      <div className="map-zoom-controls">
        <button onClick={() => setZoom(z => Math.min(z * 1.5, 8))}>+</button>
        <button onClick={() => setZoom(z => Math.max(z / 1.5, 1))}>−</button>
      </div>

      <ComposableMap
        projectionConfig={{ scale: 140 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup zoom={zoom} minZoom={1} maxZoom={8}>
          <Geographies geography={worldData}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const numId    = parseInt(geo.id)
                const data     = numericMap.get(numId)
                const isSelected = data && data.country === selectedCountry
                const isHovered  = numId === hoveredNum
                const fill = countryFill(data, isSelected, isHovered)

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => data && onCountryClick(data.country)}
                    onMouseEnter={() => {
                      setHoveredNum(numId)
                      if (data) {
                        setTooltip({
                          x: 0, y: 0,
                          text: `${countryName(data.country)} — ${data.count} ${data.count === 1 ? 'entity' : 'entities'}`,
                        })
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredNum(null)
                      setTooltip(null)
                    }}
                    style={{
                      default: { fill, stroke: '#111827', strokeWidth: 0.4, outline: 'none' },
                      hover:   { fill, stroke: '#111827', strokeWidth: 0.4, outline: 'none', cursor: data ? 'pointer' : 'default' },
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
