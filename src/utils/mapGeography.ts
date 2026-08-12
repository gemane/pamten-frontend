/**
 * Map geometry, loaded on demand.
 *
 * Everything here is an npm dependency rather than a URL. The CSP blocks other
 * hosts outright, and the Android build has to draw a map with the network off —
 * so geometry is bundled, and the only question is *which chunk* it lands in.
 *
 * The world map ships two files. `countries-110m` is small enough to sit in the
 * main bundle and coarse enough to look blocky past about 3× zoom, and the map
 * zooms to 12×. `countries-50m` is seven times the size and sharp enough for the
 * whole zoom range. Loading the detailed one lazily gives both: the first paint
 * is instant and costs nobody who never opens the map anything, and the sharper
 * geometry swaps in a moment later.
 *
 * Cached in module scope, not component state — switching tabs must not re-import,
 * and two components mounting at once must not fetch twice.
 */

export type Topology = object

let detailedWorld: Topology | null = null
let detailedWorldPromise: Promise<Topology> | null = null

let usStates: Topology | null = null
let usStatesPromise: Promise<Topology> | null = null

/** The sharper world, once it has arrived. Null until then — callers draw 110m. */
export function loadedWorld(): Topology | null {
  return detailedWorld
}

export function loadDetailedWorld(): Promise<Topology> {
  if (detailedWorld) return Promise.resolve(detailedWorld)
  if (!detailedWorldPromise) {
    detailedWorldPromise = import('world-atlas/countries-50m.json')
      .then(m => {
        detailedWorld = (m.default ?? m) as Topology
        return detailedWorld
      })
      .catch(err => {
        // Not fatal: 110m is already on screen and perfectly usable. Clearing the
        // promise lets a later attempt retry rather than caching the failure.
        detailedWorldPromise = null
        throw err
      })
  }
  return detailedWorldPromise
}

/** The loaded US state geometry, or null if it has not been asked for yet. */
export function loadedUsStates(): Topology | null {
  return usStates
}

/**
 * US state geometry for the subdivision drill-down.
 *
 * Only fetched when someone actually drills into the United States — it is the
 * largest asset in the app and most sessions never open it.
 */
export function loadUsStates(): Promise<Topology> {
  if (usStates) return Promise.resolve(usStates)
  if (!usStatesPromise) {
    usStatesPromise = import('us-atlas/states-10m.json')
      .then(m => {
        usStates = (m.default ?? m) as Topology
        return usStates
      })
      .catch(err => {
        usStatesPromise = null
        throw err
      })
  }
  return usStatesPromise
}
