/** What the server did for a refresh whose answer never reached the browser.
 *
 *  The SEC phase of "Refresh from sources" runs for minutes, and a phone that
 *  goes to another app suspends the tab: every request in flight is dropped on
 *  the way back, while the server keeps working and writes its outcome to the
 *  run log. Without this, the summary toast then read "nothing new from the
 *  sources" over a refresh that had drawn 89 holders. So when a call is lost,
 *  the toast asks the run log — `GET /scraper/runs`, the same rows the Scraper
 *  tab shows — what each source did for the company since the click, waits
 *  while a run is still going, and reports the real numbers.
 *
 *  Pure apart from the fetcher it is handed, so the rules are testable without
 *  the app. */
import type { ScrapeRun } from '../types'
import type { RefreshOutcome, SecRunOutcome } from './refreshSummary'

/** Run-log source → the outcome slot that source fills. Every other run for the
 *  company is an instant source (what `/scraper/ensure` ran) and feeds the
 *  per-source totals. */
const SLOW_SLOTS: Record<string, 'sec13f' | 'secEx21' | 'secAcq'> = {
  'sec-13f': 'sec13f', 'sec-ex21': 'secEx21', 'sec-acquisitions': 'secAcq',
}

/** A phone's clock and the server's may disagree by a little; a run that
 *  started this much before the click still counts as this refresh's. */
export const CLOCK_SLACK_MS = 120_000

/** How many rows to ask for: the log is newest first and other readers'
 *  on-demand scrapes land between ours, so well beyond the default page. */
export const RUN_LOG_WINDOW = 200

/** The server stamps microseconds; Safari's Date accepts three fraction
 *  digits, so trim before parsing. NaN for anything unreadable. */
export function runStartMs(run: Pick<ScrapeRun, 'started_at'>): number {
  const iso = (run.started_at ?? '').replace(/(\.\d{3})\d+/, '$1')
  return iso ? new Date(iso).getTime() : NaN
}

/** The company's runs that belong to this refresh — started at or after the
 *  click (less the clock slack) — reduced to the newest row per source. */
export function runsSince(runs: ScrapeRun[], company: string, clickedAt: number): Map<string, ScrapeRun> {
  const floor = clickedAt - CLOCK_SLACK_MS
  const newest = new Map<string, ScrapeRun>()
  for (const run of runs) {
    if (run.target !== company) continue
    const at = runStartMs(run)
    if (!(at >= floor)) continue
    const held = newest.get(run.source)
    if (!held || at > runStartMs(held)) newest.set(run.source, run)
  }
  return newest
}

/** A run is still going when the server says so and has not given it up. */
const stillRunning = (run: ScrapeRun): boolean => run.status === 'running' && !run.stale

const toOutcome = (run: ScrapeRun): SecRunOutcome => ({ status: run.status, total: run.total ?? 0 })

export interface RecoveryOptions {
  /** between two looks at the log while a run is still going */
  intervalMs?: number
  /** how many looks before giving up and reporting the run as still running */
  maxPolls?: number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Fill the outcome's lost slots from the run log, in place.
 *
 *  Only what the browser did not hear is filled: a slot the call answered
 *  keeps its answer, and a slot whose call the server refused (403, 409) has
 *  no run row since the click and stays empty. Sets `recovered` when a row was
 *  read back and `stillRunning` when the server was still at it after the
 *  last look. A log that cannot be read changes nothing. */
export async function recoverFromRunLog(
  outcome: RefreshOutcome, company: string, clickedAt: number,
  fetchRuns: () => Promise<ScrapeRun[]>, opts: RecoveryOptions = {},
): Promise<void> {
  const { intervalMs = 10_000, maxPolls = 30, sleep = defaultSleep } = opts
  let latest = new Map<string, ScrapeRun>()
  for (let look = 0; look < maxPolls; look++) {
    try {
      latest = runsSince(await fetchRuns(), company, clickedAt)
    } catch {
      return   // the log is out of reach too; the toast says what it knows
    }
    if (![...latest.values()].some(stillRunning)) break
    if (look + 1 < maxPolls) await sleep(intervalMs)
  }
  const instantTotals: Record<string, number> = {}
  for (const [source, run] of latest) {
    const slot = SLOW_SLOTS[source]
    if (slot) {
      if (outcome[slot] == null) { outcome[slot] = toOutcome(run); outcome.recovered = true }
    } else if (outcome.instant !== 'scraped') {
      instantTotals[source] = run.total ?? 0
    }
  }
  if (Object.keys(instantTotals).length > 0) {
    outcome.instant = 'scraped'
    outcome.sourceTotals = instantTotals
    outcome.recovered = true
  }
  if ([...latest.values()].some(stillRunning)) outcome.stillRunning = true
}
