import { useEffect, useRef, useState } from 'react'
import { FiX } from 'react-icons/fi'
import cytoscape from 'cytoscape'
import type { GraphElement, NodeData } from '../types'

const STYLE: cytoscape.StylesheetStyle[] = [
  // ── Nodes ──────────────────────────────────────────────
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      color: '#fff',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '12px',
      'font-weight': 600,
      'text-wrap': 'wrap',
      'text-max-width': '120px',
      'width': 'label',
      'height': 'label',
      padding: '14px',
    },
  },
  {
    selector: 'node[nodeType = "entity"]',
    style: { 'background-color': '#4A90D9', shape: 'roundrectangle' },
  },
  {
    selector: 'node[entitySubtype = "brand"]',
    style: { 'background-color': '#E67E22' },
  },
  {
    selector: 'node[entitySubtype = "holding"]',
    style: { 'background-color': '#8E44AD' },
  },
  {
    selector: 'node[nodeType = "person"]',
    style: { 'background-color': '#27AE60', shape: 'ellipse' },
  },
  {
    // Scale padding (= visual size) for owner nodes by their importance
    selector: 'node[importance > 0]',
    style: { padding: 'mapData(importance, 0, 60, 14, 34)' },
  },
  {
    selector: 'node:selected',
    style: { 'border-width': 3, 'border-color': '#f1c40f' },
  },

  // ── Edges ──────────────────────────────────────────────
  {
    selector: 'edge',
    style: {
      width: 2,
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      label: 'data(label)',
      'font-size': '10px',
      'text-wrap': 'wrap',
      'text-max-width': '120px',
      color: '#8892a4',
      'text-background-color': '#1a1a2e',
      'text-background-opacity': 1,
      'text-background-padding': '3px',
      'line-color': '#3a3a5c',
      'target-arrow-color': '#3a3a5c',
    },
  },
  {
    selector: 'edge[ownershipType = "full"], edge[ownershipType = "majority"]',
    style: { 'line-color': '#2ECC71', 'target-arrow-color': '#2ECC71' },
  },
  {
    selector: 'edge[ownershipType = "minority"]',
    style: { 'line-color': '#F39C12', 'target-arrow-color': '#F39C12' },
  },
  {
    selector: 'edge[ownershipType = "controlling"]',
    style: { 'line-color': '#E74C3C', 'target-arrow-color': '#E74C3C' },
  },
  {
    selector: 'edge[edgeType = "role"]',
    style: {
      'line-style': 'dashed',
      'line-color': '#6c7ae0',
      'target-arrow-color': '#6c7ae0',
    },
  },
  {
    selector: 'edge[votingPowerPct > 0]',
    style: { color: '#f6c90e' },
  },
]

// Semi-ellipse layout constants.
// Nodes sit on x = a·cos(t), y = ±b·sin(t) for t ∈ [T_START, T_END].
// a scales with node count so nodes never overlap; b is fixed.
// At t = π/2 the node is directly above/below Google; at t = T_START/T_END
// nodes are wide to the sides with a smaller vertical offset — flat ellipse shape.
const T_START      = Math.PI / 6   // 30° — side nodes are 0.5·b above/below Google
const T_END        = Math.PI * 5/6 // 150°
const T_RANGE      = T_END - T_START
const MIN_NODE_GAP = 72             // min arc-length (px) at the densest point (bottom)
const SUB_B        = 280            // fixed vertical semi-axis for subsidiaries
const OWNER_B_MIN  = 120            // vertical distance for most-important owner
const OWNER_B_MAX  = 300            // vertical distance for least-important owner

// Pure function — works on the React elements array, no Cytoscape required.
// Returns a map of nodeId → {x, y} to use when calling cy.add().
function computeArcPositions(
  elements: GraphElement[],
  centerId: string | null,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  if (!centerId) return pos

  // Build edge adjacency from element data
  const incomersOf  = new Map<string, string[]>()
  const outgoersOf  = new Map<string, string[]>()
  const nodeImportance = new Map<string, number>()

  for (const el of elements) {
    const d = el.data as Record<string, unknown>
    if (d.source && d.target) {
      const src = d.source as string
      const tgt = d.target as string
      if (!outgoersOf.has(src)) outgoersOf.set(src, [])
      outgoersOf.get(src)!.push(tgt)
      if (!incomersOf.has(tgt)) incomersOf.set(tgt, [])
      incomersOf.get(tgt)!.push(src)
    } else if (d.id) {
      const imp = (d as { importance?: number }).importance
      if (imp != null) nodeImportance.set(d.id as string, imp)
    }
  }

  pos.set(centerId, { x: 0, y: 0 })

  const topIds    = (incomersOf.get(centerId) ?? []).filter(id => id !== centerId)
  const topSet    = new Set(topIds)
  const bottomIds = (outgoersOf.get(centerId) ?? []).filter(id => !topSet.has(id) && id !== centerId)

  const importances = topIds.map(id => nodeImportance.get(id) ?? 0)
  const maxImp      = Math.max(...importances, 1)

  // Semi-ellipse for subsidiaries (below Google).
  // a scales so nodes get MIN_NODE_GAP spacing at the densest point (t ≈ π/2, bottom).
  // At the bottom the tangent is nearly horizontal so arc-length ≈ a·Δt.
  if (bottomIds.length > 0) {
    const n    = bottomIds.length
    const a    = Math.max(350, MIN_NODE_GAP * (n + 1) / T_RANGE)
    bottomIds.forEach((id, i) => {
      const t  = T_START + T_RANGE / (n + 1) * (i + 1)
      pos.set(id, { x: a * Math.cos(t), y: SUB_B * Math.sin(t) })
    })
  }

  // Semi-ellipse for owners (above Google).
  // b varies per node by importance: more important → smaller b → closer to Google.
  if (topIds.length > 0) {
    const n    = topIds.length
    const a    = Math.max(300, MIN_NODE_GAP * (n + 1) / T_RANGE)
    topIds.forEach((id, i) => {
      const t   = T_START + T_RANGE / (n + 1) * (i + 1)
      const imp = nodeImportance.get(id) ?? 0
      const b   = OWNER_B_MAX - Math.sqrt(imp / maxImp) * (OWNER_B_MAX - OWNER_B_MIN)
      pos.set(id, { x: a * Math.cos(t), y: -b * Math.sin(t) })
    })
  }

  return pos
}

const ALL_EXAMPLE_QUERIES = [
  'Amazon',
  'Apple',
  'Samsung',
  'Volkswagen',
  'Nestlé',
  'BlackRock',
  'Berkshire Hathaway',
  'SoftBank',
  'JPMorgan',
  'Alibaba',
  'Tencent',
  'Saudi Aramco',
  'Anheuser-Busch InBev',
]

function pickRandom(arr: string[], n: number): string[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

const EXAMPLE_QUERIES = pickRandom(ALL_EXAMPLE_QUERIES, 3)

interface GraphProps {
  elements: GraphElement[]
  centerId?: string | null
  onNodeClick: (data: NodeData) => void
  onExampleClick?: (query: string) => void
  onClear?: (() => void) | null
  onExpand?: (id: string) => void
  onToast?: (message: string, variant?: string) => void
  expandingId?: string | null
}

export default function Graph({ elements, centerId, onNodeClick, onExampleClick, onClear, onExpand, onToast }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef        = useRef<cytoscape.Core | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    cyRef.current = cytoscape({
      container: containerRef.current,
      style: STYLE,
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      minZoom: 0.15,
      maxZoom: 4,
    })

    cyRef.current.on('tap', 'node', (evt) => {
      // TODO: cytoscape EventObject has no typed .data() for custom node data
      onNodeClick(evt.target.data() as NodeData)
    })

    cyRef.current.on('dblclick', 'node', (evt) => {
      // TODO: cytoscape EventObject has no typed .data() for custom node data
      const nodeData = evt.target.data() as NodeData
      if (nodeData.nodeType === 'entity') {
        onExpand?.(nodeData.id)
      } else {
        onToast?.('Person nodes cannot be expanded', 'info')
      }
    })

    cyRef.current.on('mouseover', 'node[nodeType = "entity"]', (evt) => {
      // TODO: cytoscape EventObject has no typed .originalEvent
      const originalEvent = (evt as cytoscape.EventObject & { originalEvent: MouseEvent }).originalEvent
      const { clientX, clientY } = originalEvent
      setTooltip({ x: clientX, y: clientY })
    })

    cyRef.current.on('mouseout', 'node[nodeType = "entity"]', () => {
      setTooltip(null)
    })

    return () => cyRef.current?.destroy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    if (elements.length === 0) {
      cy.elements().remove()
      return
    }

    const existingIds = new Set(cy.elements().map(el => el.id()))
    const isReset     = !elements.some(el => existingIds.has(el.data.id))

    if (isReset) {
      cy.elements().remove()
      cy.add(elements as cytoscape.ElementDefinition[])
    } else {
      const toAdd = elements.filter(el => !existingIds.has(el.data.id))
      if (toAdd.length === 0) return
      cy.add(toAdd as cytoscape.ElementDefinition[])
    }

    // Step 1: run concentric layout — this reliably fits the viewport (proven to work).
    // Step 2: on layoutstop, instantly move nodes to arc positions while viewport stays correct.
    const positions = computeArcPositions(elements, centerId ?? null)
    const layout = cy.layout({
      name: 'concentric',
      animate: false,
      fit: true,
      padding: 80,
      concentric: (node: cytoscape.NodeSingular) =>
        (centerId && node.id() === centerId) ? 10 : 1,
      levelWidth: () => 1,
    })
    layout.on('layoutstop', () => {
      if (positions.size > 0) {
        cy.nodes().forEach(node => {
          const p = positions.get(node.id())
          if (p) node.position(p)
        })
        cy.fit(undefined, 80)
      }
    })
    layout.run()
  }, [elements, centerId])

  return (
    <div className="graph-wrapper">
      <div ref={containerRef} className="graph-canvas" />

      {elements.length === 0 && (
        <div className="graph-welcome">
          <div className="graph-welcome__logo">Pamten</div>
          <p className="graph-welcome__tagline">Map the world's corporate ownership</p>
          <div className="graph-welcome__chips">
            {EXAMPLE_QUERIES.map(name => (
              <button
                key={name}
                className="graph-welcome__chip"
                onClick={() => onExampleClick?.(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {onClear && (
        <button className="graph-clear-btn" onClick={onClear} title="Clear graph">
          <FiX /> Clear
        </button>
      )}

      {tooltip && (
        <div
          className="graph-node-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 36 }}
        >
          Double-click to expand
        </div>
      )}
    </div>
  )
}
