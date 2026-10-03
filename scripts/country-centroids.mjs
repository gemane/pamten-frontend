// Regenerates src/utils/countryCentroids.json: one point per country the
// map knows, where a marker stands for a country too small to see (or not in
// the map's geometry at all) and where the view is fitted to.
//
//   node scripts/country-centroids.mjs
//
// From world-atlas's countries-50m, the sharper of the map's two files: the
// centroid of each country's LARGEST polygon, so France's point is in France
// and not in the Atlantic between it and its overseas departments, and the
// United States' in the lower 48. The 14 territories 50m does not carry are
// filled in by hand below.
import { feature } from 'topojson-client'
import { geoArea, geoCentroid } from 'd3-geo'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iso = readFileSync(join(root, 'src/utils/isoCountries.ts'), 'utf8')
const table = iso.match(/ALPHA2_TO_NUMERIC[^{]*{([^}]*)}/s)[1]
const codes = [...table.matchAll(/([A-Z]{2}):\s*(\d+)/g)].map(m => [m[1], Number(m[2])])

const topo = JSON.parse(readFileSync(join(root, 'node_modules/world-atlas/countries-50m.json'), 'utf8'))
const byId = new Map(feature(topo, topo.objects.countries).features.map(f => [Number(f.id), f]))

const mainland = f => {
  const g = f.geometry
  if (g.type !== 'MultiPolygon') return g
  let best = null, area = -1
  for (const coordinates of g.coordinates) {
    const a = geoArea({ type: 'Polygon', coordinates })
    if (a > area) { area = a; best = { type: 'Polygon', coordinates } }
  }
  return best
}

// Not in 50m: [lat, lng]
const BY_HAND = {
  BQ: [12.2, -68.3], BV: [-54.4, 3.4], CX: [-10.5, 105.6], CC: [-12.2, 96.9], GF: [4.0, -53.0],
  GI: [36.1, -5.3], GP: [16.2, -61.6], MQ: [14.6, -61.0], YT: [-12.8, 45.2], RE: [-21.1, 55.5],
  SJ: [78.0, 16.0], TK: [-9.2, -171.8], TV: [-8.5, 179.2], UM: [19.3, 166.6],
}

const out = {}
const missing = []
for (const [code, id] of codes) {
  const f = byId.get(id)
  if (f) {
    const [lng, lat] = geoCentroid(mainland(f))
    out[code] = [Number(lat.toFixed(1)), Number(lng.toFixed(1))]
  } else if (BY_HAND[code]) {
    out[code] = BY_HAND[code]
  } else {
    missing.push(code)
  }
}
if (missing.length) throw new Error(`no centroid for ${missing.join(' ')}: add them to BY_HAND`)

const sorted = Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]))
writeFileSync(join(root, 'src/utils/countryCentroids.json'), JSON.stringify(sorted).replace(/\],"/g, '],\n"').replace('{', '{\n') + '\n')
console.log(`${Object.keys(sorted).length} countries`)
