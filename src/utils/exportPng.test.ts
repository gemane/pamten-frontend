import { describe, it, expect } from 'vitest'
import { BRAND_COLOR, BRAND_FONT, BRAND_GAP, BRAND_MARK, BRAND_NAME, EXPORT_BORDER, EXPORT_SCALE, FRAME_COLOR,
  drawExport, exportLayout, type ExportContext } from './exportPng'

/** A context that records what is drawn, in order. */
function recorder() {
  const calls: { op: string; args: unknown[]; fillStyle: string; font: string; baseline: string }[] = []
  const ctx = {
    fillStyle: '', font: '', textBaseline: 'alphabetic',
    fillRect: (...args: unknown[]) => calls.push({ op: 'fillRect', args, fillStyle: ctx.fillStyle, font: ctx.font, baseline: ctx.textBaseline }),
    fillText: (...args: unknown[]) => calls.push({ op: 'fillText', args, fillStyle: ctx.fillStyle, font: ctx.font, baseline: ctx.textBaseline }),
    drawImage: (...args: unknown[]) => calls.push({ op: 'drawImage', args, fillStyle: ctx.fillStyle, font: ctx.font, baseline: ctx.textBaseline }),
  }
  return { ctx: ctx as unknown as ExportContext, calls }
}
const graph = { w: 1800, h: 1200 }          // a graph image, already at EXPORT_SCALE
const GRAPH = 'graph' as unknown as CanvasImageSource
const LOGO = 'logo' as unknown as CanvasImageSource

describe('exportLayout — a white frame, the brand in its top band, the graph under it', () => {
  const l = exportLayout(graph)
  const border = EXPORT_BORDER * EXPORT_SCALE
  const mark = BRAND_MARK * EXPORT_SCALE

  it('frames the graph with the border on every side', () => {
    expect(l.width).toBe(graph.w + 2 * border)
    expect(l.graph).toEqual({ x: border, y: border + mark + border, w: graph.w, h: graph.h })
    expect(l.height).toBe(l.graph.y + graph.h + border)
  })

  it('puts the mark top left and the name beside it, centred on the mark', () => {
    expect(l.mark).toEqual({ x: border, y: border, w: mark, h: mark })
    expect(l.name).toEqual({ x: border + mark + BRAND_GAP * EXPORT_SCALE, y: border + mark / 2, font: BRAND_FONT * EXPORT_SCALE })
  })

  it('scales the frame and the brand with the export, not the graph', () => {
    const one = exportLayout(graph, 1)
    expect(one.width).toBe(graph.w + 2 * EXPORT_BORDER)
    expect(one.mark.w).toBe(BRAND_MARK)
    expect(one.name.font).toBe(BRAND_FONT)
    expect(one.graph.w).toBe(graph.w)
  })
})

describe('drawExport — what goes onto the canvas', () => {
  const l = exportLayout(graph)

  it('paints the whole canvas white first, then the mark, the name and the graph', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: LOGO }, 'Inter')
    expect(calls.map(c => c.op)).toEqual(['fillRect', 'drawImage', 'fillText', 'drawImage'])
    expect(calls[0]).toMatchObject({ args: [0, 0, l.width, l.height], fillStyle: FRAME_COLOR })
    expect(calls[1].args).toEqual([LOGO, l.mark.x, l.mark.y, l.mark.w, l.mark.h])
    expect(calls[3].args).toEqual([GRAPH, l.graph.x, l.graph.y, l.graph.w, l.graph.h])
  })

  it('writes the name only — in the wordmark\'s orange, bold, the app\'s face — never the subtitle', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: LOGO }, 'Inter')
    const texts = calls.filter(c => c.op === 'fillText')
    expect(texts).toHaveLength(1)
    expect(texts[0]).toMatchObject({ args: [BRAND_NAME, l.name.x, l.name.y], fillStyle: BRAND_COLOR, baseline: 'middle' })
    expect(texts[0].font).toBe(`800 ${l.name.font}px Inter`)
    expect(JSON.stringify(calls)).not.toContain('Ownership Graph')
  })

  it('without the mark (not loaded) the name starts where the mark would have', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: null }, 'Inter')
    expect(calls.map(c => c.op)).toEqual(['fillRect', 'fillText', 'drawImage'])
    expect(calls[1].args).toEqual([BRAND_NAME, l.mark.x, l.name.y])
  })
})
