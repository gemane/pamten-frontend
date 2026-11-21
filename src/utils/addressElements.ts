import { entityLabel } from './displayName'
import type { Entity, GraphElement, NodeData, RegisteredAddress } from '../types'

/**
 * A registered office drawn as a node: the letterbox view (2026-11-10).
 *
 * A registered office is often an agent's door, not where a company is run —
 * 99 dev companies give CSC's 251 Little Falls Drive in Wilmington. The
 * backend reads who else is registered behind the same door from the key
 * every register importer stores (app/registered_address.py); here that door
 * becomes a hub: the company the reader came from points at it, it points at
 * the others. The direction is the reading order, not a holding — the lines
 * carry no arrow and no stake — and it lets the arc layout put the hub below
 * the centre (after its subsidiaries) and the others in a row below the hub.
 *
 * The hub has no profile of its own: the panel lists the companies there
 * (NodePanel's AddressView), a double-click does nothing.
 */

/** The hub's id — distinct from every node id the backend mints. */
export function addressNodeId(key: string): string {
  return `address:${key}`
}

export function isAddressNode(d: { nodeType?: string } | null | undefined): boolean {
  return d?.nodeType === 'address'
}

/** The hub as a node, labelled with the address as the companies write it. */
export function addressNode(section: Pick<RegisteredAddress, 'key' | 'address' | 'count'>): NodeData {
  const id = addressNodeId(section.key)
  const label = section.address || section.key
  return {
    id, label, nodeType: 'address', addressKey: section.key,
    // the panel and the tooltip read `raw`; an address has a name and nothing else
    raw: { id, name: label } as Entity,
  }
}

/**
 * The hub, a line from `focusId` to it and one from it to each company listed,
 * adding the companies the graph does not show yet. Like every builder, only
 * what `loadedIds` does not already hold, so a second "show in graph" adds
 * nothing.
 */
export function buildAddressElements(
  focusId: string,
  section: RegisteredAddress,
  loadedIds: Set<string>,
): GraphElement[] {
  const els: GraphElement[] = []
  const hub = addressNode(section)
  if (!loadedIds.has(hub.id)) {
    loadedIds.add(hub.id)
    els.push({ data: hub })
  }
  const line = (source: string, target: string) => {
    const id = `${source}__registered_at__${target}`
    if (loadedIds.has(id)) return
    loadedIds.add(id)
    els.push({ data: { id, source, target, label: '', edgeType: 'registered_at', stakePct: null } })
  }
  line(focusId, hub.id)
  for (const e of section.entities) {
    if (!e?.id || e.id === focusId) continue
    if (!loadedIds.has(e.id)) {
      loadedIds.add(e.id)
      els.push({ data: { id: e.id, label: entityLabel(e) || '?', nodeType: 'entity',
                         entitySubtype: e.type ?? null, raw: e } })
    }
    line(hub.id, e.id)
  }
  return els
}

/** The address keys whose hub the graph shows — what "show in graph" becomes
 *  "remove from graph" for. */
export function shownAddressKeys(elements: GraphElement[]): Set<string> {
  const keys = new Set<string>()
  for (const el of elements) {
    const d = el.data as NodeData
    if (isAddressNode(d) && d.addressKey) keys.add(d.addressKey)
  }
  return keys
}

/**
 * Take a registered office out of the graph again: the hub, its lines, and the
 * companies that were only there because of it.
 *
 * "Only because of it" is read off the graph as it is now, not remembered from
 * when the hub was drawn: a company that has any other line stays — it was
 * there before, or the reader has expanded it since and its neighbours hang
 * off it. The company the reader came from (the one that points AT the hub)
 * stays whatever it has, and so does everything in `keep` (the node the graph
 * is centred on). Returns the elements left and the ids taken out, so the
 * caller can forget them too.
 */
export function removeAddressElements(
  elements: GraphElement[],
  key: string,
  keep: Iterable<string> = [],
): { elements: GraphElement[]; removed: Set<string> } {
  const hubId = addressNodeId(key)
  const removed = new Set<string>()
  const kept = new Set<string>(keep)
  const others = new Set<string>()          // the companies the hub points at
  for (const el of elements) {
    const d = el.data as { id: string; source?: string; target?: string; edgeType?: string }
    if (d.id === hubId) removed.add(d.id)
    else if (d.edgeType === 'registered_at' && (d.source === hubId || d.target === hubId)) {
      removed.add(d.id)
      if (d.target === hubId && d.source) kept.add(d.source)       // where the reader came from
      if (d.source === hubId && d.target) others.add(d.target)
    }
  }
  if (!removed.has(hubId)) return { elements, removed: new Set() }
  const linked = new Set<string>()          // nodes that still have a line once the hub's are gone
  for (const el of elements) {
    const d = el.data as { id: string; source?: string; target?: string }
    if (d.source && d.target && !removed.has(d.id)) { linked.add(d.source); linked.add(d.target) }
  }
  for (const id of others) if (!linked.has(id) && !kept.has(id)) removed.add(id)
  return { elements: elements.filter(el => !removed.has((el.data as { id: string }).id)), removed }
}

/**
 * The graph as drawn while a registered office is shown: the address and its
 * companies take the place of the subsidiaries of the company the reader came
 * from (the user, 2026-11-21 — beside or below the subsidiaries the two crowds
 * competed; the letterbox is a different question from "what does it own").
 *
 * Nothing is forgotten: this is a view of `elements`, which keep the
 * subsidiaries, so taking the address out again shows them as before. Hidden
 * is everything reached downwards from that company along holdings — except
 * the companies registered at the address (a subsidiary that shares the door
 * stays, now under the door) and everything in `keep` (the graph's centre).
 */
export function replaceSubsidiaries(elements: GraphElement[], keep: Iterable<string> = []): GraphElement[] {
  type Edge = { id: string; source: string; target: string; edgeType?: string }
  const edges = elements.map(el => el.data as Edge).filter(d => d.source && d.target)
  const hubs = new Set(elements.map(el => el.data as NodeData).filter(isAddressNode).map(d => d.id))
  if (hubs.size === 0) return elements
  const stay = new Set<string>([...keep, ...hubs])
  const focus = new Set<string>()
  for (const e of edges) {
    if (e.edgeType !== 'registered_at') continue
    if (hubs.has(e.target)) { focus.add(e.source); stay.add(e.source) }
    if (hubs.has(e.source)) stay.add(e.target)
  }
  const below = new Map<string, string[]>()
  for (const e of edges) {
    if (e.edgeType === 'registered_at' || e.edgeType === 'role') continue
    if (!below.has(e.source)) below.set(e.source, [])
    below.get(e.source)!.push(e.target)
  }
  const gone = new Set<string>()
  const queue = [...focus]
  const seen = new Set<string>(focus)
  while (queue.length) {
    for (const next of below.get(queue.pop() as string) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      if (!stay.has(next)) gone.add(next)
      queue.push(next)
    }
  }
  if (gone.size === 0) return elements
  // a holding line between two that stay (the company and a subsidiary at its
  // own door) goes too: the door's dotted line is what joins them now
  const left = elements.filter(el => {
    const d = el.data as Edge
    if (!d.source) return !gone.has(d.id)
    if (gone.has(d.source) || gone.has(d.target)) return false
    return !(focus.has(d.source) && d.edgeType !== 'registered_at' && d.edgeType !== 'role' && seen.has(d.target))
  })
  // …and whoever was only there through a hidden node (a person on a hidden subsidiary's board)
  const linked = new Set<string>()
  for (const el of left) { const d = el.data as Edge; if (d.source) { linked.add(d.source); linked.add(d.target) } }
  const hadLine = new Set<string>()
  for (const e of edges) { hadLine.add(e.source); hadLine.add(e.target) }
  return left.filter(el => {
    const d = el.data as Edge
    return !!d.source || linked.has(d.id) || stay.has(d.id) || !hadLine.has(d.id)
  })
}

