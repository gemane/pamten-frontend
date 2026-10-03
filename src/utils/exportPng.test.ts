import { describe, it, expect } from 'vitest'
import { BRAND_COLOR, BRAND_FONT, BRAND_GAP, BRAND_MARK, BRAND_NAME, BRAND_SUBTITLE, BRAND_SUB_FONT, DATE_FONT,
  EXPORT_BG, EXPORT_BORDER, EXPORT_MUTED, EXPORT_SCALE, EXPORT_TEXT, FOOTER_FONT, FOOTER_MIN_FONT, LEGEND_FONT,
  TITLE_FONT, TITLE_MIN_FONT, drawExport, exportLayout, legendItems, type ExportContext, type ExportText, type LegendItem } from './exportPng'
import { ENTITY_COLORS } from './entityColors'
import type { GraphElement } from '../types'

type Call = { op: string; args: unknown[]; fillStyle: string; strokeStyle: string; font: string; baseline: string; align: string; dash: number[] }

/** A context that records what is drawn, in order; text measures 0.6 em a character. */
function recorder() {
  const calls: Call[] = []
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textBaseline: 'alphabetic', textAlign: 'start', dash: [] as number[] }
  const rec = (op: string) => (...args: unknown[]) => calls.push({ op, args, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle,
    font: state.font, baseline: state.textBaseline, align: state.textAlign, dash: state.dash })
  const ctx = Object.assign(state, {
    fillRect: rec('fillRect'), fillText: rec('fillText'), drawImage: rec('drawImage'),
    beginPath: rec('beginPath'), arc: rec('arc'), moveTo: rec('moveTo'), lineTo: rec('lineTo'), fill: rec('fill'), stroke: rec('stroke'),
    setLineDash: (d: number[]) => { state.dash = d },
    measureText: (s: string) => ({ width: s.length * 0.6 * Number(/ (\d+)px/.exec(state.font)?.[1] ?? 0) }),
  })
  return { ctx: ctx as unknown as ExportContext, calls }
}
const graph = { w: 1800, h: 1200 }          // a graph image, already at EXPORT_SCALE
const GRAPH = 'graph' as unknown as CanvasImageSource
const LOGO = 'logo' as unknown as CanvasImageSource
const legend: LegendItem[] = [
  { kind: 'node', label: 'Company', fill: '#4A90D9', border: '#2d6aa8' },
  { kind: 'node', label: 'Person', fill: '#27AE60', border: '#1a7a42', round: true },
  { kind: 'line', label: 'Minority', color: '#F39C12' },
  { kind: 'line', label: 'Role', color: '#6c7ae0', dashed: true },
]
const text: ExportText = { title: 'MICROSOFT CORPORATION', date: 'October 3, 2026', legend,
  filters: 'Subsidiaries: Direct · Minimum stake: ≥1%', link: 'https://owlgraph.example/#graph/e/x', fontFamily: 'Inter', theme: 'light' }
const texts = (calls: Call[]) => calls.filter(c => c.op === 'fillText')
const HEADER_TEXTS = 4   // name, subtitle, company, date — before the graph is drawn
const fontSize = (c: Call) => Number(/ (\d+)px/.exec(c.font)![1])

describe('exportLayout — a frame, the header in its top band, the graph under it', () => {
  const l = exportLayout(graph)
  const border = EXPORT_BORDER * EXPORT_SCALE
  const mark = BRAND_MARK * EXPORT_SCALE

  it('frames the graph with the border on every side', () => {
    expect(l.width).toBe(graph.w + 2 * border)
    expect(l.graph).toEqual({ x: border, y: border + mark + border, w: graph.w, h: graph.h })
    expect(l.height).toBeGreaterThan(l.graph.y + graph.h + border)   // the footer band follows
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

  it('has a footer band under the graph, as tall as the header\'s', () => {
    expect(l.footer.x).toBe(border)
    expect(l.footer.right).toBe(l.width - border)
    expect(l.footer.y1).toBe(l.graph.y + l.graph.h + border + (l.name.y - border))
    expect(l.footer.y2).toBe(l.graph.y + l.graph.h + border + (l.subtitle.y - border))
    expect(l.height).toBe(l.graph.y + l.graph.h + border + mark + border)
    expect(l.footer.font).toBe(FOOTER_FONT * EXPORT_SCALE)
    expect(l.footer.minFont).toBe(FOOTER_MIN_FONT * EXPORT_SCALE)
    expect(l.footer.legendFont).toBe(LEGEND_FONT * EXPORT_SCALE)
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
    expect(calls.slice(0, 7).map(c => c.op)).toEqual(['fillRect', 'drawImage', 'fillText', 'fillText', 'fillText', 'fillText', 'drawImage'])
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
    expect(calls.slice(0, 6).map(c => c.op)).toEqual(['fillRect', 'fillText', 'fillText', 'fillText', 'fillText', 'drawImage'])
    expect(calls[1].args).toEqual([BRAND_NAME, l.mark.x, l.name.y])
    expect(calls[2].args).toEqual([BRAND_SUBTITLE, l.mark.x, l.subtitle.y])
  })
})

describe('drawExport — the footer', () => {
  const l = exportLayout(graph)

  it('writes the filters over the link against the right edge, after the graph', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: LOGO }, text)
    const graphAt = calls.findIndex(c => c.op === 'drawImage' && c.args[0] === GRAPH)
    const [filters, link] = texts(calls.slice(graphAt))
    expect(filters).toMatchObject({ args: [text.filters, l.footer.right, l.footer.y1], align: 'right', fillStyle: EXPORT_TEXT.light })
    expect(filters.font).toBe(`500 ${l.footer.font}px Inter`)
    expect(link).toMatchObject({ args: [text.link, l.footer.right, l.footer.y2], align: 'right', fillStyle: EXPORT_MUTED.light })
  })

  it('shrinks a long link to half the width at most, not below the minimum', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: LOGO }, { ...text, link: 'https://owlgraph.example/#graph/e/' + 'x'.repeat(26) })
    const link = texts(calls).find(c => c.args[0] !== text.link && String(c.args[0]).startsWith('https'))!
    expect(fontSize(link)).toBeLessThan(l.footer.font)
    expect(fontSize(link)).toBeGreaterThanOrEqual(l.footer.minFont)
    expect((34 + 26) * 0.6 * fontSize(link)).toBeLessThanOrEqual((l.footer.right - l.footer.x) / 2)

    const { ctx: ctx2, calls: calls2 } = recorder()
    drawExport(ctx2, l, { graph: GRAPH, logo: LOGO }, { ...text, link: 'https://owlgraph.example/#graph/e/' + 'x'.repeat(400) })
    expect(fontSize(texts(calls2).find(c => String(c.args[0]).startsWith('https'))!)).toBe(l.footer.minFont)
  })

  it('draws every legend item on the first row, left to right: swatch then label', () => {
    const { ctx, calls } = recorder()
    drawExport(ctx, l, { graph: GRAPH, logo: LOGO }, text)
    const labels = texts(calls).filter(c => legend.some(i => i.label === c.args[0]))
    expect(labels.map(c => c.args[0])).toEqual(['Company', 'Person', 'Minority', 'Role'])
    expect(labels.every(c => c.args[2] === l.footer.y1 && c.align === 'left')).toBe(true)
    expect(labels.every(c => c.font === `500 ${l.footer.legendFont}px Inter`)).toBe(true)
    const xs = labels.map(c => c.args[1] as number)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    // a square for a company, a circle for a person, a dashed line for a role
    expect(calls.filter(c => c.op === 'arc')).toHaveLength(1)
    expect(calls.find(c => c.op === 'fill' && c.fillStyle === '#4A90D9')).toBeDefined()
    const roleStroke = calls.filter(c => c.op === 'stroke' && c.strokeStyle === '#6c7ae0')
    expect(roleStroke).toHaveLength(1)
    expect(roleStroke[0].dash.length).toBe(2)
    const minorityStroke = calls.find(c => c.op === 'stroke' && c.strokeStyle === '#F39C12')!
    expect(minorityStroke.dash).toEqual([])
  })

  it('flows onto the second row when the first is full, and leaves out what two rows cannot hold', () => {
    const narrow = exportLayout({ w: 1200, h: 400 })
    const many: LegendItem[] = Array.from({ length: 12 }, (_, i) => ({ kind: 'node', label: `Kind number ${i}`, fill: '#000', border: '#000' }))
    const { ctx, calls } = recorder()
    drawExport(ctx, narrow, { graph: GRAPH, logo: LOGO }, { ...text, legend: many, filters: 'Direct' })
    const labels = texts(calls).filter(c => String(c.args[0]).startsWith('Kind number'))
    const rows = new Set(labels.map(c => c.args[2]))
    expect(rows).toEqual(new Set([narrow.footer.y1, narrow.footer.y2]))
    expect(labels.length).toBeLessThan(12)
    expect(labels.length).toBeGreaterThan(2)
    // nothing runs under the right block
    const rightLeft = narrow.footer.right - text.link.length * 0.6 * narrow.footer.font
    for (const c of labels) expect((c.args[1] as number) + String(c.args[0]).length * 0.6 * narrow.footer.legendFont).toBeLessThan(rightLeft)
  })
})

describe('legendItems — only what the picture draws', () => {
  const n = (id: string, extra: Record<string, unknown> = {}) => ({ data: { id, label: id, nodeType: 'entity', raw: {}, ...extra } }) as unknown as GraphElement
  const e = (s: string, t: string, extra: Record<string, unknown> = {}) =>
    ({ data: { id: `${s}-${t}`, source: s, target: t, label: '', edgeType: 'owns', edgeDir: 'out', ...extra } }) as unknown as GraphElement
  const t = (k: string) => k

  it('names the node types present, company first and person last, in the palette\'s colours', () => {
    const items = legendItems([n('p', { nodeType: 'person' }), n('h', { entitySubtype: 'holding' }), n('c'), n('odd', { entitySubtype: 'spaceship' })], t)
    expect(items).toEqual([
      { kind: 'node', label: 'legend.company', fill: ENTITY_COLORS.company.fill, border: ENTITY_COLORS.company.border, round: false },
      { kind: 'node', label: 'legend.holding', fill: ENTITY_COLORS.holding.fill, border: ENTITY_COLORS.holding.border, round: false },
      { kind: 'node', label: 'legend.person', fill: ENTITY_COLORS.person.fill, border: ENTITY_COLORS.person.border, round: true },
    ])
  })

  it('names the line kinds present, after the nodes, as the ⓘ panel colours them', () => {
    const items = legendItems([n('a'), n('b'),
      e('a', 'b', { ownershipType: 'full' }), e('a', 'b', { ownershipType: 'minority', directOrIndirect: 'indirect' }),
      e('a', 'b', { edgeType: 'role' }), e('a', 'b', { edgeType: 'votes' })], t)
    expect(items.map(i => i.label)).toEqual(['legend.company', 'legend.fullMajority', 'legend.minority', 'legend.votingPower', 'legend.ultimateParent', 'legend.role'])
    expect(items.find(i => i.label === 'legend.role')).toMatchObject({ kind: 'line', color: '#6c7ae0', dashed: true })
    expect(items.find(i => i.label === 'legend.fullMajority')).toMatchObject({ kind: 'line', color: '#2ECC71' })
    expect((items.find(i => i.label === 'legend.fullMajority') as { dashed?: boolean }).dashed).toBeUndefined()
  })

  it('leaves out what is not there: a controlling-only graph has no minority line', () => {
    const items = legendItems([n('a'), n('b'), e('a', 'b', { ownershipType: 'controlling' })], t)
    expect(items.map(i => i.label)).toEqual(['legend.company', 'legend.controlling'])
    expect(legendItems([], t)).toEqual([])
  })
})
