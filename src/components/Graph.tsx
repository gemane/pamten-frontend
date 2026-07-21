import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiX, FiPlusCircle, FiNavigation } from 'react-icons/fi'
import cytoscape from 'cytoscape'
import type { GraphElement, NodeData } from '../types'

export interface GraphHandle {
  exportPng: () => void
}

interface TooltipState {
  x: number
  y: number
  lines: string[]
}

function buildStylesheet(theme: 'dark' | 'light'): cytoscape.StylesheetStyle[] {
  const edgeLabelBg = theme === 'dark' ? '#1a1a2e' : '#f0f4f8'
  const edgeColor   = theme === 'dark' ? '#8892a4' : '#4a5568'
  const edgeLine    = theme === 'dark' ? '#3a3a5c' : '#9ca3b8'
  return [
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
      style: { 'background-color': '#4A90D9', shape: 'roundrectangle', 'border-width': 2, 'border-color': '#2d6aa8' },
    },
    {
      selector: 'node[entitySubtype = "brand"]',
      style: { 'background-color': '#E67E22', 'border-color': '#b05a0d' },
    },
    {
      selector: 'node[entitySubtype = "holding"]',
      style: { 'background-color': '#8E44AD', 'border-color': '#622d7a' },
    },
    {
      selector: 'node[nodeType = "person"]',
      style: { 'background-color': '#27AE60', shape: 'ellipse', 'border-width': 2, 'border-color': '#1a7a42' },
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
    {
      selector: 'node.expanding',
      style: { 'border-width': 3, 'border-color': '#f1c40f', 'border-style': 'dashed' },
    },

    // ── Edges ──────────────────────────────────────────────
    {
      selector: 'edge',
      style: {
        width: 2,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'font-size': '10px',
        'text-wrap': 'wrap',
        'text-max-width': '120px',
        color: edgeColor,
        'text-background-color': edgeLabelBg,
        'text-background-opacity': 1,
        'text-background-padding': '3px',
        'line-color': edgeLine,
        'target-arrow-color': edgeLine,
      },
    },
    {
      // Owner / role edges: source is the outer node → label near source
      selector: 'edge[edgeDir = "in"]',
      style: { 'source-label': 'data(label)', 'source-text-offset': 60 },
    },
    {
      // Subsidiary edges: target is the outer node → label near target
      selector: 'edge[edgeDir = "out"]',
      style: { 'target-label': 'data(label)', 'target-text-offset': 60 },
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
      selector: 'edge[edgeType = "votes"]',
      style: {
        'line-color': '#9B59B6',
        'target-arrow-color': '#9B59B6',
        'line-style': 'dashed',
        width: 'mapData(votingPowerPct, 0, 100, 2, 7)' as unknown as number,
        color: '#c39bd3',
      },
    },
    // Edge width by ownership type — used when stake% is not in the data
    { selector: 'edge[ownershipType = "minority"]',    style: { width: 2.5 } },
    { selector: 'edge[ownershipType = "controlling"]', style: { width: 4 } },
    { selector: 'edge[ownershipType = "majority"]',    style: { width: 5 } },
    { selector: 'edge[ownershipType = "full"]',        style: { width: 7 } },
    // Precise override when stake% is known
    {
      selector: 'edge[stakePct > 0]',
      style: { width: 'mapData(stakePct, 0, 100, 2, 7)' as unknown as number },
    },
  ]
}

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
const LEVEL_GAP    = 220            // vertical px between hop levels beyond the 1st

// Pure function — works on the React elements array, no Cytoscape required.
// Returns a map of nodeId → {x, y} to use when calling cy.add().
export function computeArcPositions(
  elements: GraphElement[],
  centerId: string | null,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  if (!centerId) return pos

  // Build edge adjacency from element data
  const incomersOf  = new Map<string, string[]>()
  const outgoersOf  = new Map<string, string[]>()
  const nodeImportance = new Map<string, number>()
  const nodeLabel   = new Map<string, string>()
  const edgeStake   = new Map<string, number | null>()   // key: edgeKey(src, tgt) → max stake%
  const edgeKey = (a: string, b: string) => a + '\u0000' + b   // sep can't occur in node ids

  for (const el of elements) {
    const d = el.data
    if ('source' in d) {
      const src = d.source
      const tgt = d.target
      if (!outgoersOf.has(src)) outgoersOf.set(src, [])
      outgoersOf.get(src)!.push(tgt)
      if (!incomersOf.has(tgt)) incomersOf.set(tgt, [])
      incomersOf.get(tgt)!.push(src)
      // Keep the largest stake across parallel edges (an owner may have both an
      // owns and a votes edge to the same target).
      const key  = edgeKey(src, tgt)
      const st   = d.stakePct ?? null
      const prev = edgeStake.get(key)
      edgeStake.set(key, prev == null ? st : (st == null ? prev : Math.max(prev, st)))
    } else if (d.id) {
      if (d.importance != null) nodeImportance.set(d.id, d.importance)
      nodeLabel.set(d.id, d.label ?? '')
    }
  }

  // Order arc nodes the same way the side panel does: largest ownership stake
  // first, unknown stakes last, ties alphabetical by name.
  const cmpByStake = (getStake: (id: string) => number | null | undefined) =>
    (a: string, b: string) => {
      const sa = getStake(a), sb = getStake(b)
      if (sa != null && sb != null && sa !== sb) return sb - sa
      if (sa != null && sb == null) return -1
      if (sa == null && sb != null) return 1
      return (nodeLabel.get(a) ?? '').localeCompare(nodeLabel.get(b) ?? '')
    }

  pos.set(centerId, { x: 0, y: 0 })

  const topIds    = (incomersOf.get(centerId) ?? []).filter(id => id !== centerId)
  const topSet    = new Set(topIds)
  const bottomIds = (outgoersOf.get(centerId) ?? []).filter(id => !topSet.has(id) && id !== centerId)

  // Left-to-right order along each arc follows the panel's stake ordering.
  topIds.sort(cmpByStake(id => edgeStake.get(edgeKey(id, centerId))))       // owners → center
  bottomIds.sort(cmpByStake(id => edgeStake.get(edgeKey(centerId, id))))    // center → subsidiaries

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

  // BFS: position any nodes beyond the 1st hop (expanded graph).
  // For every queued node, owners go ABOVE it and subsidiaries go BELOW it,
  // regardless of which direction the node was reached from.
  const positioned = new Set<string>(pos.keys())
  const queue: string[] = [...topIds, ...bottomIds]
  let qi = 0
  while (qi < queue.length) {
    const id = queue[qi++]
    const parentPos = pos.get(id)!

    const newOwners = (incomersOf.get(id) ?? []).filter(nid => !positioned.has(nid))
    newOwners.sort(cmpByStake(nid => edgeStake.get(edgeKey(nid, id))))
    const nOwners = newOwners.length
    newOwners.forEach((nid, i) => {
      const xOff = nOwners > 1 ? (i - (nOwners - 1) / 2) * MIN_NODE_GAP : 0
      pos.set(nid, { x: parentPos.x + xOff, y: parentPos.y - LEVEL_GAP })
      positioned.add(nid)
      queue.push(nid)
    })

    const newSubs = (outgoersOf.get(id) ?? []).filter(nid => !positioned.has(nid))
    newSubs.sort(cmpByStake(nid => edgeStake.get(edgeKey(id, nid))))
    const nSubs = newSubs.length
    newSubs.forEach((nid, i) => {
      const xOff = nSubs > 1 ? (i - (nSubs - 1) / 2) * MIN_NODE_GAP : 0
      pos.set(nid, { x: parentPos.x + xOff, y: parentPos.y + LEVEL_GAP })
      positioned.add(nid)
      queue.push(nid)
    })
  }

  return pos
}

const ALL_EXAMPLE_QUERIES = [
  'AB InBev',
  'Heineken',
  'Carlsberg',
  'Nestlé',
  'Unilever',
  'Bertelsmann',
  'Axel Springer',
  'Alphabet',
  'Microsoft',
  'Apple',
  'News Corp',
  'Grupo Televisa',
  'Embraer',
  'MercadoLibre',
  'Grupo Bimbo',
  'SoftBank',
  'Samsung Electronics',
  'Tata Group',
  'Alibaba Group',
  'CITIC Group',
  'Saudi Aramco',
  'Mubadala Investment Company',
  'Al Jazeera Media Network',
  'Naspers',
  'Dangote Group',
  'MTN Group',
  'Wesfarmers',
  'Nine Entertainment',
]

function pickRandom(arr: string[], n: number): string[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}


interface GraphProps {
  elements: GraphElement[]
  centerId?: string | null
  selectedNode?: NodeData | null
  onNodeClick: (data: NodeData) => void
  onExampleClick?: (query: string) => void
  onClear?: (() => void) | null
  onNavigateTo?: (nodeData: NodeData) => void
  onExpand?: (id: string) => void
  onToast?: (message: string, variant?: string) => void
  expandingId?: string | null
  theme: 'dark' | 'light'
}

const Graph = forwardRef<GraphHandle, GraphProps>(function Graph(
  { elements, centerId, selectedNode, onNodeClick, onExampleClick, onClear, onNavigateTo, onExpand, expandingId, theme }: GraphProps,
  ref
) {
  const { t } = useTranslation()
  const containerRef    = useRef<HTMLDivElement>(null)
  const cyRef           = useRef<cytoscape.Core | null>(null)
  const prevCenterIdRef = useRef<string | null | undefined>(null)
  const [tooltip, setTooltip]     = useState<TooltipState | null>(null)
  const [threshold, setThreshold] = useState(0)
  const [examples, setExamples]   = useState(() => pickRandom(ALL_EXAMPLE_QUERIES, 3))
  const [taglineIdx, setTaglineIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setExamples(pickRandom(ALL_EXAMPLE_QUERIES, 3)), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTaglineIdx(i => 1 - i), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    cyRef.current = cytoscape({
      container: containerRef.current,
      style: buildStylesheet(theme),
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      minZoom: 0.15,
      maxZoom: 4,
    })

    const cy = cyRef.current

    cy.on('tap', 'node', (evt) => {
      onNodeClick(evt.target.data() as NodeData)
    })

    cy.on('dblclick', 'node', (evt) => {
      const nodeData = evt.target.data() as NodeData
      if (nodeData.nodeType === 'entity') {
        onExpand?.(nodeData.id)
      } else {
        onNavigateTo?.(nodeData)
      }
    })

    cy.on('mouseover', 'node', (evt) => {
      const d   = evt.target.data()
      const me  = evt.originalEvent as MouseEvent
      const lines: string[] = [d.label]
      if (d.entitySubtype)    lines.push(d.entitySubtype.charAt(0).toUpperCase() + d.entitySubtype.slice(1))
      if (d.raw?.country)     lines.push(`${t('panel.country')}: ${d.raw.country}`)
      if (d.raw?.founded)     lines.push(`${t('panel.founded')}: ${d.raw.founded}`)
      if (d.raw?.revenue)     lines.push(`${t('panel.revenue')}: $${(d.raw.revenue / 1e9).toFixed(1)}B`)
      if (d.raw?.employees)   lines.push(`${t('panel.employees')}: ${Number(d.raw.employees).toLocaleString()}`)
      if (d.raw?.description) lines.push(d.raw.description.slice(0, 80) + (d.raw.description.length > 80 ? '…' : ''))
      if (d.nodeType === 'entity' && onExpand) lines.push(t('graph.expandHint'))
      setTooltip({ x: me.clientX, y: me.clientY, lines })
    })

    cy.on('mouseover', 'edge', (evt) => {
      const d   = evt.target.data()
      const me  = evt.originalEvent as MouseEvent
      const lines: string[] = []
      if (d.edgeType === 'role') {
        lines.push(`${t('tooltip.role')}: ${d.label}`)
      } else {
        if (d.ownershipType)     lines.push(`${t('tooltip.type')}: ${d.ownershipType}`)
        if (d.stakePct != null)  lines.push(`${t('tooltip.stake')}: ${d.stakePct}%`)
        if (d.votingPowerPct != null) lines.push(`${t('tooltip.votingPower')}: ${d.votingPowerPct}%`)
      }
      if (lines.length > 0) setTooltip({ x: me.clientX, y: me.clientY, lines })
    })

    cy.on('mousemove', (evt) => {
      const me = evt.originalEvent as MouseEvent
      if (evt.target === cy) {
        setTooltip(null)
      } else {
        setTooltip(prev => prev ? { ...prev, x: me.clientX, y: me.clientY } : null)
      }
    })

    // Mobile: clear tooltip on tap outside a node/edge, or when panning/zooming
    cy.on('tap', (evt) => { if (evt.target === cy) setTooltip(null) })
    cy.on('pan zoom', () => setTooltip(null))

    return () => cy.destroy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.style(buildStylesheet(theme) as cytoscape.StylesheetStyle[])
  }, [theme])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().removeClass('expanding')
    if (expandingId) cy.$id(expandingId).addClass('expanding')
  }, [expandingId])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    if (elements.length === 0) {
      cy.elements().remove()
      return
    }

    const centerChanged = centerId !== prevCenterIdRef.current
    prevCenterIdRef.current = centerId
    const existingIds = new Set(cy.elements().map(el => el.id()))
    const isReset     = centerChanged || !elements.some(el => existingIds.has(el.data.id))

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

  // Hide edges below the stake% threshold; hide orphaned nodes.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || elements.length === 0) return
    cy.edges().forEach(edge => {
      const stakePct  = edge.data('stakePct')
      const edgeType  = edge.data('edgeType')
      if (edgeType === 'role') return
      const hidden = stakePct != null && stakePct < threshold
      edge.style('display', hidden ? 'none' : 'element')
    })
    cy.nodes().forEach(node => {
      if (node.id() === centerId) return
      const visible = node.connectedEdges().some(e => e.style('display') !== 'none')
      node.style('display', visible ? 'element' : 'none')
    })
  }, [threshold, elements, centerId])

  const centerLabel = elements.find(el => 'id' in el.data && el.data.id === centerId)
    ?.data.label ?? 'graph'

  useImperativeHandle(ref, () => ({
    exportPng: () => {
      const cy = cyRef.current
      if (!cy) return
      const uri = cy.png({ output: 'base64uri', bg: theme === 'dark' ? '#1a1a2e' : '#f0f4f8', full: true, scale: 2 })
      const a = document.createElement('a')
      a.href = uri
      a.download = `${centerLabel}.png`
      a.click()
    },
  }), [theme, centerLabel])

  const showNodeActions = elements.length > 0
    && !!selectedNode
    && selectedNode.id !== centerId

  return (
    <div className="graph-wrapper">
      <div ref={containerRef} className="graph-canvas" onMouseLeave={() => setTooltip(null)} />

      {elements.length === 0 && (
        <div className="graph-welcome">
          <div className="graph-welcome__logo">Pamten</div>
          <p key={taglineIdx} className="graph-welcome__tagline">
            {taglineIdx === 0 ? t('graph.tagline') : t('graph.tagline2')}
          </p>
          <div className="graph-welcome__chips">
            {examples.map(name => (
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

      {elements.length > 0 && (
        <div className="graph-actions">
          {onClear && (
            <button className="graph-action-btn graph-action-btn--clear" onClick={onClear}>
              <FiX /> {t('graph.clear')}
            </button>
          )}
          {showNodeActions && (
            <>
              <button
                className="graph-action-btn"
                onClick={() => onExpand?.(selectedNode!.id)}
                disabled={expandingId === selectedNode!.id}
              >
                <FiPlusCircle /> {t('graph.expandGraph')}
              </button>
              <button
                className="graph-action-btn"
                onClick={() => onNavigateTo?.(selectedNode!)}
              >
                <FiNavigation /> {t('graph.openAsCenter')}
              </button>
            </>
          )}
        </div>
      )}

      {elements.length > 0 && (
        <div className="graph-threshold">
          <span className="graph-threshold__label">{t('graph.minStake', { value: threshold })}</span>
          <input
            className="graph-threshold__slider"
            type="range" min={0} max={25} step={1} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
          />
        </div>
      )}

      {tooltip && (
        <div className="graph-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          {tooltip.lines.map((line, i) => (
            <div key={i} className={i === 0 ? 'graph-tooltip__title' : 'graph-tooltip__row'}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
})

export default Graph
