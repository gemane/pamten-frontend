import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'

cytoscape.use(dagre)

const STYLE = [
  {
    selector: 'node[nodeType = "entity"]',
    style: {
      'background-color': '#2563eb',
      'label': 'data(label)',
      'color': '#ffffff',
      'text-valign': 'center',
      'text-halign': 'center',
      'shape': 'roundrectangle',
      'width': 'label',
      'height': 'label',
      'padding': '14px',
      'font-size': '13px',
      'font-weight': '600',
      'border-width': 0,
    },
  },
  {
    selector: 'node[nodeType = "person"]',
    style: {
      'background-color': '#059669',
      'label': 'data(label)',
      'color': '#ffffff',
      'text-valign': 'center',
      'text-halign': 'center',
      'shape': 'ellipse',
      'width': 'label',
      'height': 'label',
      'padding': '14px',
      'font-size': '13px',
      'font-weight': '500',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#f59e0b',
    },
  },
  {
    selector: 'edge[edgeType = "owns"]',
    style: {
      'width': 2,
      'line-color': '#475569',
      'target-arrow-color': '#475569',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'label': 'data(label)',
      'font-size': '11px',
      'color': '#94a3b8',
      'text-background-color': '#0f172a',
      'text-background-opacity': 1,
      'text-background-padding': '3px',
    },
  },
  {
    selector: 'edge[edgeType = "role"]',
    style: {
      'width': 1.5,
      'line-color': '#6366f1',
      'target-arrow-color': '#6366f1',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'line-style': 'dashed',
      'label': 'data(label)',
      'font-size': '11px',
      'color': '#818cf8',
      'text-background-color': '#0f172a',
      'text-background-opacity': 1,
      'text-background-padding': '3px',
    },
  },
]

const LAYOUT = {
  name: 'dagre',
  rankDir: 'TB',
  nodeSep: 70,
  rankSep: 90,
  animate: true,
  animationDuration: 350,
  fit: true,
  padding: 60,
}

export default function Graph({ elements, onNodeClick }) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)

  useEffect(() => {
    cyRef.current = cytoscape({
      container: containerRef.current,
      style: STYLE,
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      minZoom: 0.2,
      maxZoom: 3,
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
    const isReset = !elements.some(el => existingIds.has(el.data.id))

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
      <div ref={containerRef} className="graph-container" />
      {elements.length === 0 && (
        <div className="graph-empty">
          <div className="graph-empty-icon">⬡</div>
          <p>Search for a company or person above<br />to explore its ownership graph</p>
        </div>
      )}
    </div>
  )
}
