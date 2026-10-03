/**
 * The spreadsheet export: what to ask the server for, and what to call the
 * file it sends back. The server builds the workbook (every owner and
 * subsidiary, the timeline, the sources, the claims — not what the browser
 * loaded), so the browser's part is the current view's parameters and the
 * download.
 */
import type { StakeFilter } from '../components/GraphStakeFilter'

export interface ExportParams {
  as_of?: string
  all_levels?: boolean
  min_stake?: number
  min_stake_exclusive?: boolean
  link?: string
}

/** The query for the current view: the day, the levels, the stake band
 *  (the graph's rule, applied server-side) and the page's own link. Only what
 *  is off its default is sent. */
export function exportParams(view: {
  asOf: string | null; allLevels: boolean; stake: StakeFilter; link?: string
}): ExportParams {
  const p: ExportParams = {}
  if (view.asOf) p.as_of = view.asOf
  if (view.allLevels) p.all_levels = true
  if (view.stake.min > 0) {
    p.min_stake = view.stake.min
    if (!view.stake.inclusive) p.min_stake_exclusive = true
  }
  if (view.link && /^https?:\/\//.test(view.link)) p.link = view.link
  return p
}

/** The file name the server chose, from its Content-Disposition — the
 *  RFC 5987 `filename*` (UTF-8, percent-encoded) first, the plain `filename`
 *  else; `fallback` when the header says nothing. */
export function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback
  const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(header)
  if (star) {
    try { return decodeURIComponent(star[1].trim()) } catch { /* fall through to the plain name */ }
  }
  const plain = /filename="([^"]*)"/.exec(header) ?? /filename=([^;]+)/.exec(header)
  return plain?.[1].trim() || fallback
}

/** Hand a blob to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
