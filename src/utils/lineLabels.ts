import type { GraphElement } from '../types'

/** Complete each holding's line label with what hangs below the company it
 *  reaches: "45% · 735 subsidiaries", or "735 subsidiaries" where no stake is
 *  stated. Done on the elements rather than in the stylesheet so the text
 *  lands where every line's label lands — beside the company, in the room the
 *  tree layout keeps for it (`treeLayout` measures `data.label`) — and not as
 *  a second label drawn across the line. `below` words the number in the
 *  viewer's language. Elements with nothing to add are returned as they are. */
export function withLineLabels(elements: GraphElement[], below: (n: number) => string): GraphElement[] {
  return elements.map(el => {
    const d = el.data
    if (!('source' in d) || d.edgeType !== 'owns') return el
    const n = d.descendants
    if (typeof n !== 'number' || n <= 0) return el
    const base = String(d.label ?? '')
    return { data: { ...d, label: base ? `${base} · ${below(n)}` : below(n) } }
  })
}
