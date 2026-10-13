/** The one sentence a finished "Refresh from sources" reports.
 *
 *  Pure, so the wording is testable without the app: each source that ran
 *  contributes a part, the parts join into `toast.refreshDone`, and a refresh
 *  that changed nothing says so instead of saying nothing — the reader waited
 *  minutes for it and must be told it is over. */

type T = (key: string, opts?: Record<string, unknown>) => string

export interface SecRunOutcome { status: string; total?: number; enriched?: number }

export interface RefreshOutcome {
  /** what the instant sources said: `cooldown` = refused as recently updated,
   *  `in_progress` = another refresh of the same company is still running */
  instant: 'scraped' | 'cooldown' | 'in_progress' | 'nothing' | 'skipped'
  /** what each instant source wrote (catalogue name → count), when the backend says */
  sourceTotals?: Record<string, number>
  /** null = not run (viewer, person) or failed */
  sec13f: SecRunOutcome | null
  secEx21: SecRunOutcome | null
  /** the acquirer's XBRL business combinations: `total` drawn new, `enriched`
   *  already listed and now dated and priced */
  secAcq: SecRunOutcome | null
  /** a call was lost (the tab was suspended) and its result read back from the
   *  server's run log — see refreshRecovery */
  recovered?: boolean
  /** the server was still running a source when the toast could wait no longer */
  stillRunning?: boolean
}

/** A SEC run changed the graph: it drew edges, or dated ones that were there. */
export function secRunWrote(r: SecRunOutcome | null): boolean {
  return r?.status === 'ok' && ((r.total ?? 0) > 0 || (r.enriched ?? 0) > 0)
}

/** Catalogue names are identifiers; these are the names on the coverage page. */
const SOURCE_LABELS: Record<string, string> = {
  wikidata: 'Wikidata', sec_edgar: 'SEC EDGAR', open_corporates: 'OpenCorporates',
}

export function summarizeRefresh(t: T, company: string, o: RefreshOutcome): string {
  const parts: string[] = []
  if (o.instant === 'scraped') {
    // Each instant source that wrote something, in the order they ran.
    for (const [name, total] of Object.entries(o.sourceTotals ?? {})) {
      if (total > 0) parts.push(`${SOURCE_LABELS[name] ?? name}: ${total}`)
    }
  }
  if (o.sec13f?.status === 'ok' && (o.sec13f.total ?? 0) > 0) {
    parts.push(t('toast.refreshPart13f', { count: o.sec13f.total }))
  } else if (o.sec13f?.status === 'fresh') {
    parts.push(t('toast.refreshPart13fFresh'))
  }
  if (o.secEx21?.status === 'ok' && (o.secEx21.total ?? 0) > 0) {
    parts.push(t('toast.refreshPartEx21', { count: o.secEx21.total }))
  }
  if (o.secAcq?.status === 'ok') {
    if ((o.secAcq.total ?? 0) > 0) parts.push(t('toast.refreshPartAcq', { count: o.secAcq.total }))
    if ((o.secAcq.enriched ?? 0) > 0) parts.push(t('toast.refreshPartAcqDated', { count: o.secAcq.enriched }))
  }
  if (o.instant === 'cooldown') parts.push(t('toast.refreshPartCooldown'))
  if (o.instant === 'in_progress') parts.push(t('toast.refreshPartInProgress'))
  // Last, so the numbers come first and their provenance after: what was read
  // back from the log, and what the server had not finished.
  if (o.stillRunning) parts.push(t('toast.refreshPartStillRunning'))
  if (o.recovered) parts.push(t('toast.refreshPartRecovered'))
  if (parts.length === 0) return t('toast.refreshDoneNothing', { company })
  return t('toast.refreshDone', { company, summary: parts.join(' · ') })
}
