/**
 * The exported PNG: the graph in a frame of its own background colour, with
 * a header band — the logo, the name and the subtitle on the left; the
 * company and the date on the right — and a footer band — a legend of what
 * the picture draws on the left; on the right what it leaves out (the
 * filters) and the link to the live graph. A picture pasted into a deck
 * then says what it shows, what it hides and where it came from: a graph
 * filtered to ≥ 5 % looked like the whole company.
 *
 * The frame and the header are laid out here, in numbers, and drawn through a
 * narrow slice of the canvas API — so the layout and the drawing calls can be
 * tested without a canvas (jsdom has none).
 */

/** Cytoscape renders the graph at this scale; the frame and the header follow. */
export const EXPORT_SCALE = 2
/** The frame around the graph, CSS px (scaled on export). */
export const EXPORT_BORDER = 24
/** The brand as the sidebar shows it: the mark, a gap, the name over the
 *  subtitle — CSS px. */
export const BRAND_MARK = 44
export const BRAND_FONT = 28
export const BRAND_SUB_FONT = 13
export const BRAND_GAP = 10
export const BRAND_NAME = 'Owlgraph'
export const BRAND_SUBTITLE = 'Ownership Graph'
/** The company's name and the date, right-aligned — CSS px; a long name
 *  shrinks down to the minimum rather than running under the brand. */
export const TITLE_FONT = 20
export const TITLE_MIN_FONT = 12
export const DATE_FONT = 13
/** The footer: the legend's swatches and labels, the filters, the link — CSS px. */
export const LEGEND_FONT = 12
export const LEGEND_SWATCH = 14
export const LEGEND_LINE = 24
export const LEGEND_ITEM_GAP = 18
export const FOOTER_FONT = 13
export const FOOTER_MIN_FONT = 10
/** Where the two rows of the band sit, as fractions of the mark's height. */
const ROW_1 = 0.35
const ROW_2 = 0.8
/** The wordmark's orange, as in the sidebar. */
export const BRAND_COLOR = '#E67E22'
/** The graph's background per theme (Graph.tsx's cy.png `bg`), and the text on it. */
export const EXPORT_BG: Record<'dark' | 'light', string> = { dark: '#1a1a2e', light: '#f0f4f8' }
export const EXPORT_TEXT: Record<'dark' | 'light', string> = { dark: '#eaeaea', light: '#1a2234' }
export const EXPORT_MUTED: Record<'dark' | 'light', string> = { dark: '#8892a4', light: '#5b6578' }
/** The mark, where the export looks it up. */
export const LOGO_SRC = '/icons/logo-128.png'

import { ENTITY_COLORS, ENTITY_SUBTYPES } from './entityColors'
import type { GraphElement } from '../types'

type Rect = { x: number; y: number; w: number; h: number }

export interface ExportLayout {
  width: number
  height: number
  /** The logo mark, square. */
  mark: Rect
  /** The name's left edge and vertical middle, and its font size; the
   *  subtitle under it. */
  name: { x: number; y: number; font: number }
  subtitle: { x: number; y: number; font: number }
  /** The company's name and the date: right edge, vertical middles, fonts. */
  title: { x: number; y: number; font: number; minFont: number }
  date: { x: number; y: number; font: number }
  /** Where the graph image goes: under the band, inside the frame. */
  graph: Rect
  /** The footer's two rows (vertical middles), its left edge for the legend,
   *  its right edge for the filters and the link, and the fonts. */
  footer: { x: number; right: number; y1: number; y2: number; font: number; minFont: number; legendFont: number }
}

/** Where everything goes, in export pixels, for a graph image of `graph`
 *  pixels (already at EXPORT_SCALE). The band is the mark's height plus the
 *  border above and below it. */
export function exportLayout(graph: { w: number; h: number }, scale = EXPORT_SCALE): ExportLayout {
  const border = EXPORT_BORDER * scale
  const mark = BRAND_MARK * scale
  const band = border + mark + border
  const width = graph.w + 2 * border
  const textX = border + mark + BRAND_GAP * scale
  const footerTop = band + graph.h + border
  return {
    width,
    height: footerTop + mark + border,
    mark: { x: border, y: border, w: mark, h: mark },
    name: { x: textX, y: border + mark * ROW_1, font: BRAND_FONT * scale },
    subtitle: { x: textX, y: border + mark * ROW_2, font: BRAND_SUB_FONT * scale },
    title: { x: width - border, y: border + mark * ROW_1, font: TITLE_FONT * scale, minFont: TITLE_MIN_FONT * scale },
    date: { x: width - border, y: border + mark * ROW_2, font: DATE_FONT * scale },
    graph: { x: border, y: band, w: graph.w, h: graph.h },
    footer: { x: border, right: width - border, y1: footerTop + mark * ROW_1, y2: footerTop + mark * ROW_2,
              font: FOOTER_FONT * scale, minFont: FOOTER_MIN_FONT * scale, legendFont: LEGEND_FONT * scale },
  }
}

/** The slice of CanvasRenderingContext2D the export draws with. */
export interface ExportContext {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  font: string
  textBaseline: CanvasTextBaseline
  textAlign: CanvasTextAlign
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  measureText(text: string): { width: number }
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
  beginPath(): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  fill(): void
  stroke(): void
  setLineDash(segments: number[]): void
}

/** One entry of the legend: a node type (a square, or a circle for a person)
 *  or a line kind (solid or dashed), as the graph draws it. */
export type LegendItem =
  | { kind: 'node'; label: string; fill: string; border: string; round?: boolean }
  | { kind: 'line'; label: string; color: string; dashed?: boolean }

export interface ExportText {
  /** The company at the centre. */
  title: string
  /** The date line: when it was exported, and "as of" when the graph is a past one. */
  date: string
  /** What the picture draws: the legend, only the kinds that are in it. */
  legend: LegendItem[]
  /** What the picture leaves out: the filters in force. */
  filters: string
  /** The live graph, for a reader of the picture. */
  link: string
  /** The app's font, so the header is set in the same face as on screen. */
  fontFamily: string
  theme: 'dark' | 'light'
}

/** Draw the frame, the header and the graph. */
export function drawExport(
  ctx: ExportContext, layout: ExportLayout,
  images: { graph: CanvasImageSource; logo: CanvasImageSource | null }, text: ExportText,
): void {
  const font = (weight: number, size: number) => `${weight} ${size}px ${text.fontFamily}`
  ctx.fillStyle = EXPORT_BG[text.theme]
  ctx.fillRect(0, 0, layout.width, layout.height)

  // the brand, left: without the mark the name starts where the mark would have
  const brandX = images.logo ? layout.name.x : layout.mark.x
  if (images.logo) ctx.drawImage(images.logo, layout.mark.x, layout.mark.y, layout.mark.w, layout.mark.h)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = BRAND_COLOR
  ctx.font = font(800, layout.name.font)
  ctx.fillText(BRAND_NAME, brandX, layout.name.y)
  ctx.fillStyle = EXPORT_MUTED[text.theme]
  ctx.font = font(500, layout.subtitle.font)
  ctx.fillText(BRAND_SUBTITLE, brandX, layout.subtitle.y)

  // the company and the date, right — the name shrunk to fit the room left
  // of the brand, down to the minimum
  ctx.textAlign = 'right'
  ctx.font = font(800, layout.name.font)
  const nameW = ctx.measureText(BRAND_NAME).width
  ctx.font = font(500, layout.subtitle.font)
  const subW = ctx.measureText(BRAND_SUBTITLE).width
  const gap = layout.name.x - layout.mark.x - layout.mark.w
  const room = layout.title.x - (brandX + Math.max(nameW, subW)) - 2 * gap
  // a text shrunk until it fits `room`, down to `minFont`; the font is left set
  const fit = (s: string, weight: number, size: number, minFont: number, room: number) => {
    ctx.font = font(weight, size)
    while (ctx.measureText(s).width > room && size > minFont) {
      size = Math.max(minFont, size - 2)
      ctx.font = font(weight, size)
    }
  }
  fit(text.title, 700, layout.title.font, layout.title.minFont, room)
  ctx.fillStyle = EXPORT_TEXT[text.theme]
  ctx.fillText(text.title, layout.title.x, layout.title.y)
  ctx.fillStyle = EXPORT_MUTED[text.theme]
  ctx.font = font(500, layout.date.font)
  ctx.fillText(text.date, layout.date.x, layout.date.y)

  ctx.drawImage(images.graph, layout.graph.x, layout.graph.y, layout.graph.w, layout.graph.h)

  // the footer, right: the filters over the link, each shrunk to half the
  // width at most so the legend keeps the other half
  const f = layout.footer
  const half = (f.right - f.x) / 2
  ctx.textAlign = 'right'
  ctx.fillStyle = EXPORT_TEXT[text.theme]
  fit(text.filters, 500, f.font, f.minFont, half)
  ctx.fillText(text.filters, f.right, f.y1)
  const filtersW = ctx.measureText(text.filters).width
  ctx.fillStyle = EXPORT_MUTED[text.theme]
  fit(text.link, 400, f.font, f.minFont, half)
  ctx.fillText(text.link, f.right, f.y2)
  const rightW = Math.max(filtersW, ctx.measureText(text.link).width)

  // the footer, left: the legend flowed across the two rows, in the room the
  // right block leaves; what does not fit two rows is left out
  const scale = layout.mark.w / BRAND_MARK
  const swatch = LEGEND_SWATCH * scale, line = LEGEND_LINE * scale, itemGap = LEGEND_ITEM_GAP * scale, pad = 6 * scale
  const legendRight = f.right - rightW - 2 * gap
  ctx.textAlign = 'left'
  ctx.font = font(500, f.legendFont)
  let x = f.x
  let row: number | null = f.y1
  for (const item of text.legend) {
    const sw = item.kind === 'node' ? swatch : line
    const w = sw + pad + ctx.measureText(item.label).width
    if (x + w > legendRight && x > f.x) { x = f.x; row = row === f.y1 ? f.y2 : null }
    if (row === null) break
    if (item.kind === 'node') {
      ctx.fillStyle = item.fill
      ctx.strokeStyle = item.border
      ctx.lineWidth = 1.5 * scale
      ctx.beginPath()
      if (item.round) ctx.arc(x + swatch / 2, row, swatch / 2, 0, 2 * Math.PI)
      else { ctx.moveTo(x, row - swatch / 2); ctx.lineTo(x + swatch, row - swatch / 2); ctx.lineTo(x + swatch, row + swatch / 2); ctx.lineTo(x, row + swatch / 2); ctx.lineTo(x, row - swatch / 2) }
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.strokeStyle = item.color
      ctx.lineWidth = 2.5 * scale
      ctx.setLineDash(item.dashed ? [5 * scale, 4 * scale] : [])
      ctx.beginPath()
      ctx.moveTo(x, row)
      ctx.lineTo(x + line, row)
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.fillStyle = EXPORT_TEXT[text.theme]
    ctx.fillText(item.label, x + sw + pad, row)
    x += w + itemGap
  }
}

/** An image from a URL or data URI; null when it cannot be loaded (the
 *  export goes out without the mark rather than not at all). */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** The legend for THESE elements: the node types and line kinds the picture
 *  actually draws, in the ⓘ panel's order and colours — nine node types and
 *  eight line kinds would be a key to a different picture. `t` names them. */
export function legendItems(
  elements: GraphElement[], t: (key: string) => string,
): LegendItem[] {
  const nodeTypes = new Set<string>()
  const lineKinds = new Set<string>()
  for (const el of elements) {
    const d = el.data as unknown as Record<string, unknown>
    if ('source' in d) {
      if (d.edgeType === 'role') lineKinds.add('role')
      else if (d.edgeType === 'votes') lineKinds.add('votingPower')
      else if (d.edgeType === 'member') lineKinds.add('voting_group')
      else if (d.edgeType === 'owns') {
        if (d.directOrIndirect === 'indirect') lineKinds.add('ultimateParent')
        if (d.ownershipType === 'full' || d.ownershipType === 'majority') lineKinds.add('fullMajority')
        else if (d.ownershipType === 'minority') lineKinds.add('minority')
        else if (d.ownershipType === 'controlling') lineKinds.add('controlling')
      }
    } else if (d.nodeType === 'person') nodeTypes.add('person')
    else nodeTypes.add(typeof d.entitySubtype === 'string' && (ENTITY_SUBTYPES as readonly string[]).includes(d.entitySubtype) ? d.entitySubtype : 'company')
  }
  const nodes: LegendItem[] = [...['company'], ...ENTITY_SUBTYPES, 'person'].filter(k => nodeTypes.has(k))
    .map(k => ({ kind: 'node', label: t(`legend.${k}`), fill: ENTITY_COLORS[k].fill, border: ENTITY_COLORS[k].border, round: k === 'person' }))
  const LINES: Record<string, { color: string; dashed?: boolean }> = {
    fullMajority: { color: '#2ECC71' }, minority: { color: '#F39C12' }, controlling: { color: '#E74C3C' },
    votingPower: { color: '#9B59B6', dashed: true }, ultimateParent: { color: '#8892a4', dashed: true },
    role: { color: '#6c7ae0', dashed: true }, voting_group: { color: '#b7791f', dashed: true },
  }
  const lines: LegendItem[] = Object.keys(LINES).filter(k => lineKinds.has(k))
    .map(k => ({ kind: 'line', label: t(`legend.${k}`), ...LINES[k] }))
  return [...nodes, ...lines]
}
