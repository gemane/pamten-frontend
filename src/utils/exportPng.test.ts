import { describe, it, expect } from 'vitest'
import { BRAND_COLOR, BRAND_FONT, BRAND_GAP, BRAND_MARK, BRAND_NAME, BRAND_SUBTITLE, BRAND_SUB_FONT, DATE_FONT,
  EXPORT_BG, EXPORT_BORDER, EXPORT_MUTED, EXPORT_SCALE, EXPORT_TEXT, TITLE_FONT, TITLE_MIN_FONT,
  drawExport, exportLayout, type ExportContext, type ExportText } from './exportPng'

type Call = { op: string; args: unknown[]; fillStyle: string; font: string; baseline: string; align: string }

/** A context that records what is drawn, in order; text measures 0.6 em a character. */
function recorder() {
  const calls: Call[] = []
  const ctx = {
    fillStyle: '', font: '', textBaseline: 'alphabetic', textAlign: 'start',
    fillRect: (...args: unknown[]) => calls.push({ op: 'fillRect', args, fillStyle: ctx.fillStyle, font: ctx.font, baseline: ctx.textBaseline, align: ctx.textAlign }),
    fillText: (...args: unknown[]) => calls.push({ op: 'fillText', args, fillStyle: ctx.fillStyle, font: ctx.font, baseline: ctx.textBaseline, align: ctx.textAlign }),
    drawImage: (...args: unknown[]) => calls.push({ op: 'drawImage', args, fillStyle: ctx.fillStyle, font: ctx.font, baseline: ctx.textBaseline, align: ctx.textAlign }),
    measureText: (s: string) => ({ width: s.length * 0.6 * Number(/ (\d+)px/.exec(ctx.font)?.[1] ?? 0) }),
  }
  return { ctx: ctx as unknown as ExportContext, calls }
}
const graph = { w: 1800, h: 1200 }          // a graph image, already at EXPORT_SCALE
const GRAPH = 'graph' as unknown as CanvasImageSource
const LOGO = 'logo' as unknown as CanvasImageSource
const text: ExportText = { title: 'MICROSOFT CORPORATION', date: 'October 3, 2026', fontFamily: 'Inter', theme: 'light' }
const texts = (calls: Call[]) => calls.filter(c => c.op === 'fillText')
const fontSize = (c: Call) => Number(/ (\d+)px/.exec(c.font)![1])

describe('exportLayout — a frame, the header in its top band, the graph under it', () => {
  const l = exportLayout(graph)
  const border = EXPORT_BORDER * EXPORT_SCALE
  const mark = BRAND_MARK * EXPORT_SCALE

  it('frames the graph with the border on every side', () => {
    expect(l.width).toBe(graph.w + 2 * border)
    expect(l.graph).toEqual({ x: border, y: border + mark + border, w: graph.w, h: graph.h })
    expect(l.height).toBe(l.graph.y + graph.h + border)
  })

  it('puts the mark top left, the name and the subtitle beside it on two rows', () => {
    expect(l.mark).toEqual({ x: border, y: border, w: mark, h: mark })
    expect(l.name.x).toBe(border + mark + BRAND_GAP * EXPORT_SCALE)
    expect(l.subtitle.x).toBe(l.name.x)
    expect(l.name.y).toBeLessThan(l.subtitle.y)
    expect(l.name.y).toBeGreaterThan(border)
    expect(l.subtitle.y).toBeLessThan(border + mark)
    expect(l.name.font).toBe(BRAND_FONT * EXPORT_SCALE)
    expect(l.subtitle.font).toBe(BRAND_SUB_FONT * EXPORT_SCALE)
  })

  it('puts the company and the date against the right edge, on the same two rows', () => {
    expect(l.title.x).toBe(l.width - border)
    expect(l.date.x).toBe(l.width - border)
    expect(l.title.y).toBe(l.name.y)
    expect(l.date.y).toBe(l.subtitle.y)
    expect(l.title.font).toBe(TITLE_FONT * EXPORT_SCALE)
    expect(l.title.minFont).toBe(TITLE_MIN_FONT * EXPORT_SCALE)
    expect(l.date.font).toBe(DATE_FONT * EXPORT_SCALE)
  })

  it('scales the frame and the header with the export, not the graph', () => {
    const one = exportLayout(graph, 1)
    expect(one.width).toBe(graph.w + 2 * EXPORT_BORDER)
    expect(one.mark.w).toBe(BRAND_MARK)
    expect(one.name.font).toBe(BRAND_FONT)
    expect(one.graph.w).toBe(graph.w)
  })
})

describe('drawExport — what goes onto the canvas', () => {
  const l = exportLayout(graph)

  it('paints the whole canvas in the graph\'s own background first, then the mark, the texts, the graph', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: LOGO }, text)
    expect(calls.map(c => c.op)).toEqual(['fillRect', 'drawImage', 'fillText', 'fillText', 'fillText', 'fillText', 'drawImage'])
    expect(calls[0]).toMatchObject({ args: [0, 0, l.width, l.height], fillStyle: EXPORT_BG.light })
    expect(calls[1].args).toEqual([LOGO, l.mark.x, l.mark.y, l.mark.w, l.mark.h])
    expect(calls[6].args).toEqual([GRAPH, l.graph.x, l.graph.y, l.graph.w, l.graph.h])
  })

  it('the same background in the dark theme: the dark one, with light text', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: LOGO }, { ...text, theme: 'dark' })
    expect(calls[0].fillStyle).toBe(EXPORT_BG.dark)
    expect(texts(calls).find(c => c.args[0] === text.title)!.fillStyle).toBe(EXPORT_TEXT.dark)
    expect(texts(calls).find(c => c.args[0] === text.date)!.fillStyle).toBe(EXPORT_MUTED.dark)
  })

  it('writes the name in the wordmark\'s orange, bold, and the subtitle under it, left-aligned', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: LOGO }, text)
    const [name, sub] = texts(calls)
    expect(name).toMatchObject({ args: [BRAND_NAME, l.name.x, l.name.y], fillStyle: BRAND_COLOR, baseline: 'middle', align: 'left' })
    expect(name.font).toBe(`800 ${l.name.font}px Inter`)
    expect(sub).toMatchObject({ args: [BRAND_SUBTITLE, l.subtitle.x, l.subtitle.y], fillStyle: EXPORT_MUTED.light, align: 'left' })
    expect(sub.font).toBe(`500 ${l.subtitle.font}px Inter`)
  })

  it('writes the company and the date right-aligned against the frame\'s right edge', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: LOGO }, text)
    const [, , title, date] = texts(calls)
    expect(title).toMatchObject({ args: [text.title, l.title.x, l.title.y], fillStyle: EXPORT_TEXT.light, align: 'right' })
    expect(title.font).toBe(`700 ${l.title.font}px Inter`)
    expect(date).toMatchObject({ args: [text.date, l.date.x, l.date.y], fillStyle: EXPORT_MUTED.light, align: 'right' })
  })

  it('shrinks a long company name to the room left of the brand, but not below the minimum', () => {
    const narrow = exportLayout({ w: 700, h: 400 })
    const { ctx, calls } = recorder()
    drawExport(ctx, narrow, { graph: GRAPH, logo: LOGO }, { ...text, title: 'A'.repeat(18) })
    const title = texts(calls)[2]
    expect(fontSize(title)).toBeLessThan(narrow.title.font)
    expect(fontSize(title)).toBeGreaterThanOrEqual(narrow.title.minFont)
    // the measured width fits the room: right edge less the brand's and two gaps
    const brandRight = narrow.name.x + BRAND_NAME.length * 0.6 * narrow.name.font
    const room = narrow.title.x - brandRight - 2 * BRAND_GAP * EXPORT_SCALE
    expect(18 * 0.6 * fontSize(title)).toBeLessThanOrEqual(room)

    const { ctx: ctx2, calls: calls2 } = recorder()
    drawExport(ctx2, narrow, { graph: GRAPH, logo: LOGO }, { ...text, title: 'A'.repeat(400) })
    expect(fontSize(texts(calls2)[2])).toBe(narrow.title.minFont)
  })

  it('without the mark (not loaded) the brand starts where the mark would have', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: null }, text)
    expect(calls.map(c => c.op)).toEqual(['fillRect', 'fillText', 'fillText', 'fillText', 'fillText', 'drawImage'])
    expect(calls[1].args).toEqual([BRAND_NAME, l.mark.x, l.name.y])
    expect(calls[2].args).toEqual([BRAND_SUBTITLE, l.mark.x, l.subtitle.y])
  })
})
