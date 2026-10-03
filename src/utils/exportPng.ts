/**
 * The exported PNG: the graph in a frame of its own background colour, with
 * a header band — the logo, the name and the subtitle on the left; the
 * company and the date on the right — so a picture pasted into a deck or a
 * report says what it shows and where it came from.
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
  return {
    width,
    height: band + graph.h + border,
    mark: { x: border, y: border, w: mark, h: mark },
    name: { x: textX, y: border + mark * ROW_1, font: BRAND_FONT * scale },
    subtitle: { x: textX, y: border + mark * ROW_2, font: BRAND_SUB_FONT * scale },
    title: { x: width - border, y: border + mark * ROW_1, font: TITLE_FONT * scale, minFont: TITLE_MIN_FONT * scale },
    date: { x: width - border, y: border + mark * ROW_2, font: DATE_FONT * scale },
    graph: { x: border, y: band, w: graph.w, h: graph.h },
  }
}

/** The slice of CanvasRenderingContext2D the export draws with. */
export interface ExportContext {
  fillStyle: string | CanvasGradient | CanvasPattern
  font: string
  textBaseline: CanvasTextBaseline
  textAlign: CanvasTextAlign
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  measureText(text: string): { width: number }
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
}

export interface ExportText {
  /** The company at the centre. */
  title: string
  /** The date line: when it was exported, and "as of" when the graph is a past one. */
  date: string
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
  let size = layout.title.font
  ctx.font = font(700, size)
  while (ctx.measureText(text.title).width > room && size > layout.title.minFont) {
    size = Math.max(layout.title.minFont, size - 2)
    ctx.font = font(700, size)
  }
  ctx.fillStyle = EXPORT_TEXT[text.theme]
  ctx.fillText(text.title, layout.title.x, layout.title.y)
  ctx.fillStyle = EXPORT_MUTED[text.theme]
  ctx.font = font(500, layout.date.font)
  ctx.fillText(text.date, layout.date.x, layout.date.y)

  ctx.drawImage(images.graph, layout.graph.x, layout.graph.y, layout.graph.w, layout.graph.h)
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
