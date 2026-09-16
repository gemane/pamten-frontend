/** The one sentence a finished "Refresh from sources" reports.
 *
 *  Pure, so the wording is testable without the app: each source that ran
 *  contributes a part, the parts join into `toast.refreshDone`, and a refresh
 *  that changed nothing says so instead of saying nothing — the reader waited
 *  minutes for it and must be told it is over. */

type T = (key: string, opts?: Record<string, unknown>) => string

export interface SecRunOutcome { status: string; total?: number }

export interface RefreshOutcome {
  /** what the instant sources said: `cooldown` = refused as recently updated */
  instant: 'scraped' | 'cooldown' | 'nothing' | 'skipped'
  /** null = not run (viewer, person) or failed */
  sec13f: SecRunOutcome | null
  secEx21: SecRunOutcome | null
}

export function summarizeRefresh(t: T, company: string, o: RefreshOutcome): string {
  const parts: string[] = []
  if (o.sec13f?.status === 'ok' && (o.sec13f.total ?? 0) > 0) {
    parts.push(t('toast.refreshPart13f', { count: o.sec13f.total }))
  } else if (o.sec13f?.status === 'fresh') {
    parts.push(t('toast.refreshPart13fFresh'))
  }
  if (o.secEx21?.status === 'ok' && (o.secEx21.total ?? 0) > 0) {
    parts.push(t('toast.refreshPartEx21', { count: o.secEx21.total }))
  }
  if (o.instant === 'cooldown') parts.push(t('toast.refreshPartCooldown'))
  if (parts.length === 0) return t('toast.refreshDoneNothing', { company })
  return t('toast.refreshDone', { company, summary: parts.join(' · ') })
}
