import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'

cytoscape.use(cola)

const STYLE = [
  // ── Nodes ──────────────────────────────────────────────
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      color: '#fff',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '12px',
      'font-weight': '600',
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

export default function Graph({ elements, onNodeClick }) {
  const containerRef = useRef(null)
  const cyRef        = useRef(null)

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
      onNodeClick(evt.target.data())
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
      cy.add(elements)
    } else {
      const toAdd = elements.filter(el => !existingIds.has(el.data.id))
      if (toAdd.length === 0) return
      cy.add(toAdd)
    }

    cy.layout(LAYOUT).run()
  }, [elements])

  return (
    <div className="graph-wrapper">
      <div ref={containerRef} className="graph-canvas" />
      {elements.length === 0 && (
        <div className="graph-empty">
          <div className="graph-empty-icon">⬡</div>
          <p>Search for a company or person<br />to explore its ownership graph</p>
        </div>
      )}
    </div>
  )
}
