import { useEffect, useRef, useState } from 'react'
import { FiX } from 'react-icons/fi'
import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'
import type { GraphElement, NodeData } from '../types'

cytoscape.use(cola)

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
]

const LAYOUT = {
  name: 'cola',
  animate: true,
  maxSimulationTime: 2000,
  randomize: false,
  nodeSpacing: 50,
  fit: true,
  padding: 60,
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
  onNodeClick: (data: NodeData) => void
  onExampleClick?: (query: string) => void
  onClear?: (() => void) | null
  onExpand?: (id: string) => void
  onToast?: (message: string, variant?: string) => void
  expandingId?: string | null
}

export default function Graph({ elements, onNodeClick, onExampleClick, onClear, onExpand, onToast }: GraphProps) {
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

    cy.layout(LAYOUT).run()
  }, [elements])

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
