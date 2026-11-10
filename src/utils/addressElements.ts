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
