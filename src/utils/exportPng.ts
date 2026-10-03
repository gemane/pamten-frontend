/**
 * The exported PNG: the graph in a white frame, with the logo and the name
 * in the frame's top band — so a picture pasted into a deck or a report says
 * where it came from. The name only: the subtitle is for the sidebar.
 *
 * The frame and the brand are laid out here, in numbers, and drawn through a
 * narrow slice of the canvas API — so the layout and the drawing calls can be
 * tested without a canvas (jsdom has none).
 */

/** Cytoscape renders the graph at this scale; the frame and the brand follow. */
export const EXPORT_SCALE = 2
/** The frame around the graph, CSS px (scaled on export). */
export const EXPORT_BORDER = 24
/** The brand as the sidebar shows it: the mark, a gap, the name — CSS px. */
export const BRAND_MARK = 36
export const BRAND_FONT = 28
export const BRAND_GAP = 10
export const BRAND_NAME = 'Owlgraph'
/** The wordmark's orange, as in the sidebar. */
export const BRAND_COLOR = '#E67E22'
export const FRAME_COLOR = '#ffffff'
/** The mark, where the export looks it up. */
export const LOGO_SRC = '/icons/logo-128.png'

type Rect = { x: number; y: number; w: number; h: number }

export interface ExportLayout {
  width: number
  height: number
  /** The logo mark, square. */
  mark: Rect
  /** The name's left edge and vertical middle, and its font size. */
  name: { x: number; y: number; font: number }
  /** Where the graph image goes: under the brand band, inside the frame. */
  graph: Rect
}

/** Where everything goes, in export pixels, for a graph image of `graph`
 *  pixels (already at EXPORT_SCALE). The brand band is the mark's height
 *  plus the border above and below it. */
export function exportLayout(graph: { w: number; h: number }, scale = EXPORT_SCALE): ExportLayout {
  const border = EXPORT_BORDER * scale
  const mark = BRAND_MARK * scale
  const band = border + mark + border
  return {
    width: graph.w + 2 * border,
    height: band + graph.h + border,
    mark: { x: border, y: border, w: mark, h: mark },
    name: { x: border + mark + BRAND_GAP * scale, y: border + mark / 2, font: BRAND_FONT * scale },
    graph: { x: border, y: band, w: graph.w, h: graph.h },
  }
}

/** The slice of CanvasRenderingContext2D the export draws with. */
export interface ExportContext {
  fillStyle: string | CanvasGradient | CanvasPattern
  font: string
  textBaseline: CanvasTextBaseline
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
}

/** Draw the frame, the brand and the graph. `fontFamily`: the app's, so the
 *  name is set in the same face as on screen. */
export function drawExport(
  ctx: ExportContext, layout: ExportLayout,
  images: { graph: CanvasImageSource; logo: CanvasImageSource | null }, fontFamily: string,
): void {
  ctx.fillStyle = FRAME_COLOR
  ctx.fillRect(0, 0, layout.width, layout.height)
  if (images.logo) ctx.drawImage(images.logo, layout.mark.x, layout.mark.y, layout.mark.w, layout.mark.h)
  ctx.fillStyle = BRAND_COLOR
  ctx.font = `800 ${layout.name.font}px ${fontFamily}`
  ctx.textBaseline = 'middle'
  // without the mark the name starts where the mark would have
  ctx.fillText(BRAND_NAME, images.logo ? layout.name.x : layout.mark.x, layout.name.y)
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
