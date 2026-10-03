import { forwardRef, Fragment, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiX, FiPlusCircle, FiNavigation } from 'react-icons/fi'
import cytoscape from 'cytoscape'
import type { EdgeData, GraphElement, NodeData } from '../types'
import { ENTITY_COLORS, ENTITY_SUBTYPES } from '../utils/entityColors'
import { getStats, type StatsResponse } from '../services/api'
import { keepsEdge, effectiveStakePct, filterLabel, type StakeFilter } from './GraphStakeFilter'
import GraphFilters from './GraphFilters'
import { DEFAULT_ASPECT, computeTreeLayout, routePoints, segmentStyle, type Measure, type Route, type TreeLayout } from '../utils/treeLayout'
import { asOfYear, edgePresence, nodeExists, tenureOfEdge, type Presence } from '../utils/asOf'
import { EXPORT_SCALE, LOGO_SRC, drawExport, exportLayout, legendItems, loadImage } from '../utils/exportPng'

export interface GraphHandle {
  exportPng: () => Promise<void>
}

interface TooltipState {
  x: number
  y: number
  lines: string[]
}

export function buildStylesheet(theme: 'dark' | 'light'): cytoscape.StylesheetStyle[] {
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
      // Base entity style; the subtype rules below override only the colours, so
      // an unrecognised subtype keeps this one. All of it comes from the shared
      // palette in utils/entityColors.ts, which the node panel's row markers and
      // the legend read too — one definition, so they cannot drift apart.
      selector: 'node[nodeType = "entity"]',
      style: {
        'background-color': ENTITY_COLORS.company.fill, shape: 'roundrectangle',
        'border-width': 2, 'border-color': ENTITY_COLORS.company.border,
      },
    },
    ...ENTITY_SUBTYPES.map(subtype => ({
      selector: `node[entitySubtype = "${subtype}"]`,
      style: {
        'background-color': ENTITY_COLORS[subtype].fill,
        'border-color': ENTITY_COLORS[subtype].border,
      },
    })),
    {
      // Membership in a filing group: not ownership, so it must not look like
      // an OWNS edge. Thin, dotted, and in the group's own amber, with no
      // percentage on it — there is no share to state.
      selector: 'edge[edgeType = "member"]',
      style: {
        'line-color': '#b7791f', 'line-style': 'dotted', width: 1.5,
        'target-arrow-color': '#b7791f', 'target-arrow-shape': 'none',
        opacity: 0.85,
      },
    },
    {
      // A voting group is an agreement between parties, not a firm — a diamond
      // says so at a glance. The generated subtype selectors above set colour
      // only, so the shape needs a rule of its own.
      selector: 'node[entitySubtype = "voting_group"]',
      style: { shape: 'diamond', 'border-style': 'dashed' },
    },
    {
      // Last, so a person wins over any subtype that happens to be set on it.
      selector: 'node[nodeType = "person"]',
      style: {
        'background-color': ENTITY_COLORS.person.fill, shape: 'ellipse',
        'border-width': 2, 'border-color': ENTITY_COLORS.person.border,
      },
    },
    {
      // Scale padding (= visual size) for owner nodes by their importance
      selector: 'node[importance > 0]',
      style: { padding: 'mapData(importance, 0, 60, 14, 34)' },
    },
    {
      // The focused (centered) corporation — render it the largest so it anchors the view,
      // with rounder corners so it reads as the hub. Explicit doubled width (the
      // other nodes size to their label; the hub gets a fixed, wider box so it
      // stands out from the subsidiaries and owners around it regardless of how
      // short the company name is), with the wrap width widened to match so a
      // long name uses the room instead of wrapping early.
      selector: 'node.center',
      style: { width: 240, 'text-max-width': '210px', padding: '38px',
               'font-size': '16px', 'font-weight': 700, 'corner-radius': '34px' },
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
      // The subsidiary tree: a line it already explains (the holder is further
      // up the same branch) is not drawn — it would cut across the picture.
      selector: 'edge.implied',
      style: { display: 'none' },
    },
    {
      // …and a co-holder from another branch is drawn faintly: it is real, but
      // it is the one kind of line that has to cross the tree.
      selector: 'edge.coholder',
      style: { opacity: 0.3, 'z-index': 0 },
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
    {
      // An ultimate-parent link that survived the shortcut filter: nothing else
      // reaches that company, so it must be drawn — but it is not a direct
      // holding and should not look like one. Dashed, the same language the
      // voting-power edges already use. Colour is left to the ownership-type
      // rules below, so only the stroke pattern differs.
      selector: 'edge[directOrIndirect = "indirect"]',
      style: { 'line-style': 'dashed' },
    },
    // The as-of view: a relationship the sources do not document for the
    // chosen day is drawn, but faded and dashed — "may have existed", not
    // "existed". A node all of whose links are like that fades with them.
    { selector: 'edge.unknown', style: { 'line-style': 'dashed', opacity: 0.35 } },
    { selector: 'node.unknown', style: { opacity: 0.45 } },
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
    {
      // A centred person who owns AND runs a company: this is the role's line,
      // routed along the holding's — its dashes on top make one two-tone line.
      // The holding's label names the roles too (TreeLayout.labels).
      selector: 'edge.dual',
      style: { 'target-label': '', 'z-index': 2, 'line-dash-pattern': [7, 7], 'target-arrow-shape': 'none' },
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
const MIN_ZOOM      = 0.15          // how far the user (and a fit) can zoom out
const TREE_MIN_ZOOM = 0.02          // …in "all levels", where the whole tree must still fit
const MAX_ZOOM      = 4
/** A fit keeps this much canvas clear around the graph — on a large canvas;
 *  a small one gives a twelfth of its shorter side (a phone's 354 px: 30). */
const FIT_PADDING   = 80
/** On a canvas this narrow (the stylesheet's phone breakpoint) the buttons
 *  laid over its top — Clear, Filters, ⓘ — would cover the owners… */
const SMALL_CANVAS  = 640
/** …so the fit starts below them: their 12 px from the top and 32 px height,
 *  and a gap. */
const CONTROLS_INSET = 44
const CONTROLS_GAP   = 12
const MIN_NODE_GAP = 72             // min arc-length (px) at the densest point (bottom)
const SUB_B        = 280            // fixed vertical semi-axis for subsidiaries
const OWNER_B_MIN  = 120            // vertical distance for most-important owner
const OWNER_B_MAX  = 300            // vertical distance for least-important owner
const LEVEL_GAP    = 220            // vertical px between hop levels beyond the 1st

// Pure function — works on the React elements array, no Cytoscape required.
// Returns a map of nodeId → {x, y} to use when calling cy.add().
/** The elements that survive a stake filter: ownership edges below the band
 *  go, nodes left with no visible edge go (the centre always stays), role
 *  edges are never filtered. Pure, so the re-layout it feeds is testable. */
export function filterVisibleElements(
  elements: GraphElement[],
  filter: StakeFilter,
  centerId: string | null,
  asOf: string | null = null,
): GraphElement[] {
  return classifyElements(elements, filter, centerId, asOf).visible
}

/** The stake filter and the as-of day together: which elements are drawn,
 *  and which of those are only UNKNOWN for that day (drawn dimmed).
 *
 *  Rules, with `asOf` null reducing to the stake filter alone:
 *  - a node founded after the day does not exist, and takes its edges with it;
 *  - an ownership edge below the stake band is hidden (role edges never are);
 *  - an edge absent on the day (started later, ended by then) is hidden;
 *  - a node left with no visible edge is hidden — the centre always stays;
 *  - a visible edge the sources do not document for that day is `unknown`,
 *    and so is a node all of whose visible edges are. */
export function classifyElements(
  elements: GraphElement[],
  filter: StakeFilter,
  centerId: string | null,
  asOf: string | null = null,
): { visible: GraphElement[]; unknownEdges: Set<string>; unknownNodes: Set<string> } {
  const exists = new Map<string, boolean>()
  for (const el of elements) {
    const d = el.data
    if (!('source' in d)) exists.set(d.id, nodeExists(d.raw as { founded?: number | null; founded_date?: string | null }, asOf))
  }
  const presence = new Map<string, Presence>()
  const edgeVisible = (d: EdgeData): boolean => {
    if (exists.get(d.source) === false || exists.get(d.target) === false) return false
    if (d.edgeType !== 'role') {
      const eff = effectiveStakePct(d.stakePct ?? null, d.shares, d.sharesOutstanding)
      if (!keepsEdge(eff, filter)) return false
    }
    const p = edgePresence(tenureOfEdge(d), asOf)
    presence.set(d.id, p)
    return p !== 'absent'
  }
  const nodeHasEdge = new Set<string>()
  const nodeHasPresentEdge = new Set<string>()
  for (const el of elements) {
    const d = el.data
    if ('source' in d && edgeVisible(d)) {
      nodeHasEdge.add(d.source)
      nodeHasEdge.add(d.target)
      if (presence.get(d.id) === 'present') {
        nodeHasPresentEdge.add(d.source)
        nodeHasPresentEdge.add(d.target)
      }
    }
  }
  // The centre always stays — it is what the user asked to see, founded
  // whenever. A neighbour that did not exist yet has no visible edge (edgeVisible
  // drops every edge to it), so it goes with them.
  const nodeVisible = (id: string) => id === centerId || nodeHasEdge.has(id)
  const visible = elements.filter(el => {
    const d = el.data
    if ('source' in d) return edgeVisible(d) && nodeVisible(d.source) && nodeVisible(d.target)
    return nodeVisible(d.id)
  })
  const unknownEdges = new Set<string>()
  const unknownNodes = new Set<string>()
  if (asOf) {
    for (const el of visible) {
      const d = el.data
      if ('source' in d) { if (presence.get(d.id) === 'unknown') unknownEdges.add(d.id) }
      else if (d.id !== centerId && nodeHasEdge.has(d.id) && !nodeHasPresentEdge.has(d.id)) unknownNodes.add(d.id)
    }
  }
  return { visible, unknownEdges, unknownNodes }
}


/** What the canvas must change to show `elements`: everything (a new centre,
 *  or nothing in common), or the difference — what to add AND what to take
 *  away. It only ever added: turning "all levels" off rebuilt the list with
 *  the direct holdings alone, found nothing new, and left Chubb's nine levels
 *  on screen however often the button was pressed. */
export function diffElements(
  existingIds: Set<string>,
  elements: GraphElement[],
  centerChanged: boolean,
): { isReset: boolean; toAdd: GraphElement[]; toRemove: string[] } {
  const isReset = centerChanged || !elements.some(el => existingIds.has(el.data.id))
  if (isReset) return { isReset, toAdd: elements, toRemove: [] }
  const wanted = new Set(elements.map(el => el.data.id))
  return {
    isReset,
    toAdd: elements.filter(el => !existingIds.has(el.data.id)),
    toRemove: [...existingIds].filter(id => !wanted.has(id)),
  }
}

/** Where every node goes, and how the tree's lines run: owners (and people)
 *  on their arc above the centre, the subsidiaries below it as a tree —
 *  columns, right-angled lines. The same for "Direct" and "All levels", so one
 *  level of subsidiaries looks like the first level of all of them. One
 *  computation serves the positions, the routes and the hidden lines. */
export function layoutGraph(
  elements: GraphElement[],
  centerId: string | null,
  measure?: Measure,
  aspect?: number,
): { positions: Map<string, { x: number; y: number }>; tree: TreeLayout } {
  const tree = computeTreeLayout(elements, centerId, measure, aspect)
  return { positions: computeArcPositions(elements, centerId, tree.positions), tree }
}

/** The size Cytoscape draws a node at — the tree is laid out on the real
 *  boxes, so a column's left edges line up exactly. */
export const measureWith = (cy: cytoscape.Core): Measure => id => {
  const n = cy.$id(id)
  return n.nonempty() ? { w: n.outerWidth(), h: n.outerHeight() } : undefined
}

type Rect = { x1: number; y1: number; w: number; h: number }

/** The part of the canvas a graph is fitted into (canvas pixels): the whole
 *  canvas less the padding on a desktop. On a phone, where the canvas is a
 *  third of the screen, the padding is what the canvas can spare — 80 px on
 *  every side of 390 left the tree the middle 60 % — and the buttons laid over
 *  its top are kept clear, or they covered the owners. */
export function fitRegion(canvas: { w: number; h: number }): Rect {
  const pad = Math.min(FIT_PADDING, Math.round(Math.min(canvas.w, canvas.h) / 12))
  const top = canvas.w <= SMALL_CANVAS ? CONTROLS_INSET + CONTROLS_GAP : pad
  return { x1: pad, y1: top, w: canvas.w - 2 * pad, h: canvas.h - top - pad }
}

/** The shape the tree is packed towards: the fit region's, width over height
 *  (a wide desktop canvas 1.6, a phone's canvas under its buttons 1.2); the
 *  default when the canvas has no size yet. */
export function canvasAspect(canvas: { w: number; h: number }): number {
  const { w, h } = fitRegion(canvas)
  return w > 0 && h > 0 ? w / h : DEFAULT_ASPECT
}

/** Where to put the viewport so `bb` (the graph's bounding box, model
 *  coordinates) fills the fit region: `cy.fit`, into a rectangle. */
export function fitViewport(
  canvas: { w: number; h: number }, bb: Rect, zoomRange: { min: number; max: number },
): { zoom: number; pan: { x: number; y: number } } | null {
  if (bb.w <= 0 && bb.h <= 0) return null
  const room = fitRegion(canvas)
  if (room.w <= 0 || room.h <= 0) return null
  const zoom = Math.min(zoomRange.max, Math.max(zoomRange.min,
    Math.min(room.w / Math.max(bb.w, 1), room.h / Math.max(bb.h, 1))))
  return { zoom, pan: {
    x: room.x1 + (room.w - bb.w * zoom) / 2 - bb.x1 * zoom,
    y: room.y1 + (room.h - bb.h * zoom) / 2 - bb.y1 * zoom,
  } }
}

/** Fit the drawn elements into the canvas's fit region. */
function fitGraph(cy: cytoscape.Core) {
  const shown = cy.elements().filter(el => el.style('display') !== 'none')
  const view = fitViewport({ w: cy.width(), h: cy.height() }, shown.boundingBox(),
                           { min: cy.minZoom(), max: cy.maxZoom() })
  if (view) cy.viewport(view)
}

const aspectOf = (cy: cytoscape.Core) => canvasAspect({ w: cy.width(), h: cy.height() })

const ROUTE_STYLE = 'curve-style edge-distances segment-weights segment-distances'
const LABEL_STYLE = 'target-label target-text-offset target-text-margin-x target-text-margin-y'

/** Bend one tree line at right angles between its ends' CURRENT positions. */
function routeEdge(edge: cytoscape.EdgeSingular, route: Route) {
  const s = edge.source().position(), t = edge.target().position()
  const seg = segmentStyle(s, t, routePoints(s, t, route))
  if (!seg) { edge.removeStyle(ROUTE_STYLE); return }
  edge.style({ 'curve-style': 'segments', 'edge-distances': 'node-position',
               'segment-weights': seg.weights, 'segment-distances': seg.distances })
}

/** The tree's lines, after its nodes are placed: each placing line routed at
 *  right angles, each line the tree makes redundant marked `implied` (hidden),
 *  each co-holder's marked `coholder` (faint); every other line as the
 *  stylesheet draws it. The route stays on the edge so a dragged node's lines
 *  can follow it. */
export function applyTreeRoutes(cy: cytoscape.Core, tree: TreeLayout) {
  cy.edges().forEach(edge => {
    const route = tree.routes.get(edge.id())
    edge.scratch('_route', route ?? null)
    if (route) routeEdge(edge, route)
    else edge.removeStyle(ROUTE_STYLE)
    edge.toggleClass('implied', tree.implied.has(edge.id()))
    edge.toggleClass('coholder', tree.coHolders.has(edge.id()))
    // Owns AND runs: the role's dashes run on top of the holding's line, and
    // the holding's label names both.
    edge.toggleClass('dual', tree.dual.has(edge.id()))
    // The label: in the room the layout kept above the company, beside the
    // line — not on it, where it sat across the bars and the other labels.
    edge.removeStyle(LABEL_STYLE)
    const label = tree.labels.get(edge.id())
    if (!route || !label) return
    const fromTop = route.kind === 'top'
    edge.style({
      'target-label': label.text,
      'target-text-offset': fromTop ? label.h / 2 + 4 : 1,
      'target-text-margin-x': fromTop ? label.w / 2 + 8 : label.w / 2,
      'target-text-margin-y': fromTop ? 0 : -(edge.target().outerHeight() / 2 + label.h / 2 + 1),
    })
  })
}

/** Owners (and people) on an arc above the centre; what the centre points at
 *  on an arc below it; anything further out stacked above or below the node it
 *  hangs on.
 *
 *  `placed`: nodes that already have their place — the graph passes the tree
 *  (the companies below the centre). They are taken as they are: they get no
 *  slot on the lower arc, which then holds only what the tree leaves over (a
 *  vote, a membership), and whatever hangs on one of them is stacked from
 *  where it really is. Before, the whole lower arc was computed and thrown
 *  away, and an expanded subsidiary's other owners were stacked above the arc
 *  slot it no longer occupied. */
export function computeArcPositions(
  elements: GraphElement[],
  centerId: string | null,
  placed?: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  if (!centerId) return pos
  for (const [id, p] of placed ?? []) pos.set(id, p)

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
  const bottomIds = (outgoersOf.get(centerId) ?? [])
    .filter(id => !topSet.has(id) && id !== centerId && !placed?.has(id))

  // Left-to-right order along each arc follows the panel's stake ordering.
  topIds.sort(cmpByStake(id => edgeStake.get(edgeKey(id, centerId))))       // owners → center
  bottomIds.sort(cmpByStake(id => edgeStake.get(edgeKey(centerId, id))))    // center → subsidiaries

  const importances = topIds.map(id => nodeImportance.get(id) ?? 0)
  const maxImp      = Math.max(...importances, 1)

  // Semi-ellipse for what the centre points at (below it) and is not `placed`.
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
  const queue: string[] = [...topIds, ...bottomIds, ...[...(placed?.keys() ?? [])].filter(id => id !== centerId)]
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

// Full parent names, not shorthand: a bare group name resolves to whatever
// ranks best, and for these three that was the wrong company outright —
// "Heineken" landed on HEINEKEN Mexico, "Bertelsmann" on the US subsidiary.
// Kept in step with scripts/scrape-companies.sh, which scrapes the same list.
const ALL_EXAMPLE_QUERIES = [
  'Anheuser-Busch InBev',
  'Heineken International',
  'Carlsberg',
  'Nestlé',
  'Unilever',
  'Bertelsmann SE',
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


/** How much a node grows while its panel row is in focus — "slightly". */
export const FOCUS_SCALE = 1.2
/** …and how much darker it is drawn meanwhile (Cytoscape's `background-blacken`,
 *  0 = its own colour, 1 = black). Twenty percent larger alone was easy to miss
 *  among a column of same-coloured boxes; a shade darker makes it the one that
 *  stands out, whatever its colour (company, person, group). */
export const FOCUS_DARKEN = 0.28
const FOCUS_BASE = '_focusBase'
// Cytoscape's animation runtime accepts `spring(tension, friction)` (a
// Runge-Kutta spring sized to the animation's duration) but its type
// definitions list only the named/cubic-bezier easings — hence the cast.
const FOCUS_SPRING = 'spring(420, 18)' as unknown as cytoscape.Css.TransitionTimingFunction

interface FocusBase { padding: number; fontSize: number; textMaxWidth: number }

/**
 * Emphasise the node whose owner/subsidiary row is in focus in the panel, and
 * let the previous one go.
 *
 * The node grows by animating its padding, font size AND wrap width by the same
 * factor: every node except the hub sizes to its label (`width: label`), so the
 * box, the text and the border grow together. The wrap width matters as much as
 * the font — left at 120px, a larger font breaks the name onto more lines and the
 * node grows taller and narrower instead of simply larger. The grow uses a spring easing — a small overshoot and settle
 * reads as organic where a linear tween reads as a UI toggle — and the release
 * an ease-out. The value the node had before the first grow is kept in scratch,
 * so a node re-focused while it is still shrinking grows from where the
 * stylesheet puts it, not from a half-animated size. When the release finishes
 * the inline styles are removed, so the stylesheet (importance sizing, the
 * selected border) is back in charge.
 *
 * `animate: false` (prefers-reduced-motion) applies the same sizes instantly.
 * The hub is left alone: it is already the largest thing on screen and is never
 * one of its own panel's rows.
 */
export function applyNodeFocus(cy: cytoscape.Core, prevId: string | null, nextId: string | null,
                               animate: boolean): void {
  if (prevId && prevId !== nextId) releaseNode(cy.getElementById(prevId), animate)
  if (nextId) growNode(cy.getElementById(nextId), animate)
}

function growNode(n: cytoscape.CollectionReturnValue, animate: boolean): void {
  if (n.empty() || !n.isNode() || n.hasClass('center')) return
  n.stop(true)
  let base = n.scratch(FOCUS_BASE) as FocusBase | undefined
  if (!base) {
    base = { padding: n.numericStyle('padding'), fontSize: n.numericStyle('font-size'),
             textMaxWidth: n.numericStyle('text-max-width') }
    n.scratch(FOCUS_BASE, base)
  }
  const target = { padding: base.padding * FOCUS_SCALE, 'font-size': base.fontSize * FOCUS_SCALE,
                   'text-max-width': `${base.textMaxWidth * FOCUS_SCALE}px` }
  n.style({ 'z-index': 10, 'background-blacken': FOCUS_DARKEN })
  if (animate) n.animate({ style: target, easing: FOCUS_SPRING, duration: 480 })
  else n.style(target)
}

function releaseNode(n: cytoscape.CollectionReturnValue, animate: boolean): void {
  if (n.empty() || !n.isNode()) return
  const base = n.scratch(FOCUS_BASE) as FocusBase | undefined
  if (!base) return
  n.stop(true)
  // its own colour back at once: only the box in focus is the darker one, not
  // also the one still shrinking
  n.removeStyle('background-blacken')
  const restore = () => {
    n.removeStyle('padding font-size text-max-width z-index')
    n.removeScratch(FOCUS_BASE)
  }
  if (animate) {
    n.animate({ style: { padding: base.padding, 'font-size': base.fontSize,
                         'text-max-width': `${base.textMaxWidth}px` },
                easing: 'ease-out-cubic', duration: 360, complete: restore })
  } else {
    restore()
  }
}

/**
 * Report the node under the mouse — the other direction of the panel/graph link:
 * the node panel lights up the owner or subsidiary row for it. `null` when the
 * mouse leaves the node. Mouse events only, so a tap on a phone does not
 * trigger it (the phone has the panel's centre line instead).
 */
export function bindNodeHover(cy: cytoscape.Core, onHover: (id: string | null) => void): void {
  cy.on('mouseover', 'node', evt => onHover(evt.target.id()))
  cy.on('mouseout', 'node', () => onHover(null))
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
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
  /** Shared with the node-panel list so one control filters both views. */
  stakeFilter: StakeFilter
  onStakeFilterChange: (filter: StakeFilter) => void
  /** "All levels": the whole subsidiary tree below the centre is loaded, not
   *  only its first level (both are drawn as a tree). Shared with the panel,
   *  which indents its list. */
  allLevels?: boolean
  onAllLevelsChange?: (on: boolean) => void
  /** The day the graph shows (time travel), YYYY-MM-DD; null = the present. */
  asOf?: string | null
  /** A year chosen (as its 31 December) or null = back to the present. */
  onAsOfChange?: (asOf: string | null) => void
  /** The country the SEARCH is scoped to ('' = all), set in the Filters panel. */
  country?: string
  onCountryChange?: (country: string) => void
  countries?: { country: string; count: number }[]
  /** Node whose row is in focus in the node panel — grown slightly (see applyNodeFocus). */
  focusedId?: string | null
  /** Called with the id of the node under the mouse, null when it leaves (see bindNodeHover). */
  onNodeHover?: (id: string | null) => void
}

const NO_COUNTRIES: { country: string; count: number }[] = []

const Graph = forwardRef<GraphHandle, GraphProps>(function Graph(
  { elements, centerId, selectedNode, onNodeClick, onExampleClick, onClear, onNavigateTo, onExpand, expandingId, theme, stakeFilter, onStakeFilterChange, allLevels = false, onAllLevelsChange, asOf = null, onAsOfChange, country = '', onCountryChange, countries = NO_COUNTRIES, focusedId = null, onNodeHover }: GraphProps,
  ref
) {
  const { t, i18n } = useTranslation()
  const containerRef    = useRef<HTMLDivElement>(null)
  const cyRef           = useRef<cytoscape.Core | null>(null)
  const prevCenterIdRef = useRef<string | null | undefined>(null)
  const layoutModeRef = useRef<boolean>(allLevels)   // the mode the elements on screen belong to (sets the zoom floor)
  const prevFocusIdRef  = useRef<string | null>(null)
  // The handlers are bound once when the graph is created; a ref keeps them
  // calling the current callback rather than the one from the first render.
  const onNodeHoverRef  = useRef(onNodeHover)
  onNodeHoverRef.current = onNodeHover
  const [tooltip, setTooltip]     = useState<TooltipState | null>(null)
  const [examples, setExamples]   = useState(() => pickRandom(ALL_EXAMPLE_QUERIES, 3))
  const [taglineIdx, setTaglineIdx] = useState(0)
  const [stats, setStats]         = useState<StatsResponse | null>(null)

  useEffect(() => {
    const id = setInterval(() => setExamples(pickRandom(ALL_EXAMPLE_QUERIES, 3)), 60_000)
    return () => clearInterval(id)
  }, [])

  // Data-scale counts for the welcome screen (best-effort — hidden if unavailable).
  useEffect(() => {
    let alive = true
    getStats().then(r => { if (alive) setStats(r.data) }).catch(() => {})
    return () => { alive = false }
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
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    })

    const cy = cyRef.current

    cy.on('tap', 'node', (evt) => {
      onNodeClick(evt.target.data() as NodeData)
    })

    // A dragged node takes its right-angled tree lines with it.
    cy.on('drag', 'node', (evt) => {
      evt.target.connectedEdges().forEach((edge: cytoscape.EdgeSingular) => {
        const route = edge.scratch('_route') as Route | null
        if (route) routeEdge(edge, route)
      })
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

    bindNodeHover(cy, id => onNodeHoverRef.current?.(id))

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
    const { isReset, toAdd, toRemove } = diffElements(existingIds, elements, centerChanged)
    // The mode follows the ELEMENTS, not the switch: the switch flips at once,
    // its elements arrive a moment later, and re-fitting the old elements to
    // the new mode's zoom floor in between made the picture swell before every
    // change. Adopted here, when the elements that belong to it land.
    const modeChanged = layoutModeRef.current !== allLevels
    layoutModeRef.current = allLevels

    if (isReset) {
      cy.elements().remove()
      cy.add(elements as cytoscape.ElementDefinition[])
    } else {
      if (toAdd.length === 0 && toRemove.length === 0 && !modeChanged) return
      // Edges first: removing a node takes its edges with it, and removing an
      // already-removed edge afterwards would be a lookup of nothing.
      for (const id of toRemove) cy.$id(id).remove()
      cy.add(toAdd as cytoscape.ElementDefinition[])
    }

    // Mark the hub BEFORE laying out and fitting: node.center is a fixed 240px
    // box, much wider than its label, and fitting with the base width first
    // left a lone company (Al Jazeera Media Network — no owners or
    // subsidiaries) zoomed to maxZoom, then widened past the viewport edges.
    // Fit must see the real size. (The effect below re-marks on a centre-only
    // change; this covers the fresh-graph fit.)
    cy.nodes().removeClass('center')
    if (centerId) cy.$id(centerId).addClass('center')

    // Step 1: run concentric layout — this reliably fits the viewport (proven to work).
    // Step 2: on layoutstop, instantly move nodes to arc positions while viewport stays correct.
    // A whole tree is far wider than one ring of subsidiaries — Chubb's nine
    // levels ran off both edges because the fit stopped at the usual floor.
    cy.minZoom(allLevels ? TREE_MIN_ZOOM : MIN_ZOOM)
    const { positions, tree } = layoutGraph(elements, centerId ?? null, measureWith(cy), aspectOf(cy))
    const place = () => {
      if (positions.size === 0) return
      cy.nodes().forEach(node => {
        const p = positions.get(node.id())
        if (p) node.position(p)
      })
      applyTreeRoutes(cy, tree)
      fitGraph(cy)
    }
    // The same company with more or fewer elements (a node expanded, "all
    // levels" switched): go straight to the final positions. The concentric
    // pass below fits the viewport to a ring first, and on a graph that is
    // already on screen that showed as the whole picture swelling for a moment
    // before settling.
    if (!isReset) {
      cy.batch(place)
      return
    }
    const layout = cy.layout({
      name: 'concentric',
      animate: false,
      fit: true,
      padding: 80,
      concentric: (node: cytoscape.NodeSingular) =>
        (centerId && node.id() === centerId) ? 10 : 1,
      levelWidth: () => 1,
    })
    layout.on('layoutstop', place)
    layout.run()
  }, [elements, centerId])

  // Mark the focused (centered) node so the stylesheet can render it larger. Runs after
  // the element-building effect above (source order), so the node is present.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().removeClass('center')
    if (centerId) cy.$id(centerId).addClass('center')
  }, [centerId, elements])

  // Hide ownership below the chosen band; hide nodes left with nothing — and
  // RE-PLACE the survivors. The arc positions were computed for the full node
  // set, so filtering used to leave four owners marooned at their original
  // slots on the far left and right with a gulf between them (Alphabet under
  // ≥1%). Recomputing the arc over the visible elements closes the ranks, and
  // a fit keeps the smaller graph filling the viewport.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || elements.length === 0) return
    // One classification for both: what is drawn, and what is drawn dimmed
    // because the sources do not document it for the chosen day.
    const { visible, unknownEdges, unknownNodes } =
      classifyElements(elements, stakeFilter, centerId ?? null, asOf)
    const shown = new Set(visible.map(el => el.data.id))
    cy.elements().forEach(ele => {
      ele.style('display', shown.has(ele.id()) ? 'element' : 'none')
      ele.toggleClass('unknown', unknownEdges.has(ele.id()) || unknownNodes.has(ele.id()))
    })

    cy.minZoom(layoutModeRef.current ? TREE_MIN_ZOOM : MIN_ZOOM)
    // The tree is laid out, routed and judged on the VISIBLE elements (the
    // stake filter's and the day's), once: judged on everything, a 0.1 %
    // holder the filter hides could still make the 99.9 % holder's line
    // "redundant", and the company was left with no line at all.
    const { positions, tree } = layoutGraph(visible, centerId ?? null, measureWith(cy), aspectOf(cy))
    if (positions.size > 0) {
      cy.nodes().forEach(node => {
        const p = positions.get(node.id())
        if (p && node.style('display') !== 'none') node.position(p)
      })
      applyTreeRoutes(cy, tree)
      // a line the tree makes redundant stays hidden whatever the filter says
      // (the display set above is a bypass, which outranks the class's rule)
      cy.edges('.implied').style('display', 'none')
      fitGraph(cy)
    }
  }, [stakeFilter, elements, centerId, asOf])

  const centerLabel = elements.find(el => 'id' in el.data && el.data.id === centerId)
    ?.data.label ?? 'graph'

  // Grow the node whose panel row is in focus; shrink the one before it.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    applyNodeFocus(cy, prevFocusIdRef.current, focusedId, !prefersReducedMotion())
    prevFocusIdRef.current = focusedId
  }, [focusedId])

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      const cy = cyRef.current
      if (!cy) return
      const uri = cy.png({ output: 'base64uri', bg: theme === 'dark' ? '#1a1a2e' : '#f0f4f8', full: true, scale: EXPORT_SCALE })
      // The graph in a white frame with the logo and the name on it; the bare
      // graph when the page cannot compose it (no canvas, image blocked).
      const [graph, logo] = await Promise.all([loadImage(uri), loadImage(LOGO_SRC)])
      let href = uri
      if (graph) {
        const layout = exportLayout({ w: graph.naturalWidth, h: graph.naturalHeight })
        const canvas = document.createElement('canvas')
        canvas.width = layout.width
        canvas.height = layout.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const lang = i18n.language
          const today = new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(new Date())
          const date = asOf ? `${t('asOf.chip', { year: asOfYear(asOf) })} · ${today}` : today
          // the legend for what is drawn: the stake filter's and the day's survivors
          const { visible } = classifyElements(elements, stakeFilter, centerId ?? null, asOf)
          const filters = `${t('graph.levelsLabel')}: ${t(allLevels ? 'graph.levelsAll' : 'graph.levelsDirect')}`
            + ` · ${t('graph.filterTitle')}: ${filterLabel(stakeFilter, t('graph.filterAny'))}`
          drawExport(ctx, layout, { graph, logo }, {
            title: centerLabel, date, legend: legendItems(visible, t), filters, link: window.location.href,
            fontFamily: getComputedStyle(document.body).fontFamily || 'sans-serif', theme,
          })
          href = canvas.toDataURL('image/png')
        }
      }
      const a = document.createElement('a')
      a.href = href
      a.download = `${centerLabel}.png`
      a.click()
    },
  }), [theme, centerLabel, asOf, t, i18n.language, elements, stakeFilter, centerId, allLevels])

  // What the filter can actually judge on this graph: ownership links that state
  // a percentage, out of the ownership links there are.
  const stakeCoverage = useMemo(() => {
    const owns = elements
      .map(el => el.data)
      .filter((d): d is EdgeData => 'edgeType' in d && d.edgeType !== 'role')
    return { stated: owns.filter(d => d.stakePct != null).length, total: owns.length }
  }, [elements])

  const showNodeActions = elements.length > 0
    && !!selectedNode
    && selectedNode.id !== centerId

  return (
    <div className="graph-wrapper">
      {/* An ink tree behind the canvas — a company structure drawn as nature
          draws one. Faint, under everything, and not part of the PNG export. */}
      <div className="graph-backdrop" aria-hidden="true" />
      <div ref={containerRef} className="graph-canvas" onMouseLeave={() => setTooltip(null)} />

      {elements.length === 0 && (
        <div className="graph-welcome">
          <div className="graph-welcome__logo">Owlgraph</div>
          <p key={taglineIdx} className="graph-welcome__tagline">
            {taglineIdx === 0 ? t('graph.tagline') : t('graph.tagline2')}
          </p>
          {stats && (
            <div className="graph-welcome__stats">
              <span>{stats.companies.toLocaleString(i18n.language)} {t('graph.statCompanies')}</span>
              <span>{stats.people.toLocaleString(i18n.language)} {t('graph.statPeople')}</span>
              {/* Two and two on a phone. See .graph-welcome__break — it collapses
                  on desktop, where the four still read as one line. */}
              <div className="graph-welcome__break" />
              <span>{stats.relationships.toLocaleString(i18n.language)} {t('graph.statRelationships')}</span>
              <span>{stats.sources.toLocaleString(i18n.language)} {t('graph.statSources')}</span>
            </div>
          )}
          <div className="graph-welcome__chips">
            {examples.map((name, i) => (
              <Fragment key={name}>
                {/* Two, then the third on its own row — same break as the stats. */}
                {i === 2 && <div className="graph-welcome__break" />}
                <button
                  className="graph-welcome__chip"
                  onClick={() => onExampleClick?.(name)}
                >
                  {name}
                </button>
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {elements.length > 0 && (
        <div className="graph-actions">
          {onClear && (
            <button className="graph-action-btn graph-action-btn--clear" onClick={onClear}
                    title={t('graph.clear')} aria-label={t('graph.clear')}>
              <FiX /> <span className="graph-action-btn__label">{t('graph.clear')}</span>
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

      {/* One button for everything that decides WHAT is shown. Also without a
          graph: the country scopes the search, which starts on the empty canvas. */}
      <GraphFilters hasGraph={elements.length > 0}
                    stake={stakeFilter} onStakeChange={onStakeFilterChange}
                    stated={stakeCoverage.stated} total={stakeCoverage.total}
                    allLevels={allLevels} onAllLevelsChange={onAllLevelsChange}
                    asOf={asOf} onAsOfChange={onAsOfChange} centerId={centerId}
                    country={country} onCountryChange={onCountryChange} countries={countries} />

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
