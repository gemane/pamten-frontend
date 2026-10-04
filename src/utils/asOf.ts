/**
 * The "as of" rules — what a relationship's dates say about a chosen day.
 *
 * Time travel shows the graph and the panel as they stood at the end of a
 * year. Each relationship carries what its source said: a `since` (a stated
 * start; with `since_basis: 'first_listed'` only a LOWER bound, the oldest
 * annual subsidiary list naming it; with `'newly_listed'` the first list
 * naming it when the one before does not), an `until`, and a `source_date`
 * (the filing or snapshot that asserted it). Three answers follow:
 *
 *   present  — the sources show it existed on that day
 *   absent   — the sources show it did not (started later, or ended by then)
 *   unknown  — nothing documents that day: it exists now, and the evidence
 *              only starts later. Shown dimmed, never hidden: a flat Exhibit
 *              21 or a 13F says nothing about the past, and hiding what may
 *              have existed would make the past look emptier than it was.
 *
 * The evidence date is `since` when stated or bounded (a start date is the
 * source's own assertion that the holding existed by then), else the
 * `source_date`. With no as-of day every rule is a no-op: the present behaves
 * exactly as before.
 *
 * Dates compare as ISO strings. Filers write partial dates ("2023-04-00"), and
 * a bare year ("2019") sorts before "2019-12-31" — which is the intended
 * reading, since as-of is always 31 December: founded "2019" exists at the
 * end of 2019; an `until` of "2019" counts as ended at that year's end.
 */
import type { EdgeData, Entity, Person } from '../types'

export type Presence = 'present' | 'unknown' | 'absent'

export interface Tenure {
  since?: string | null
  since_basis?: string | null
  until?: string | null
  source_date?: string | null
}

export const isAsOf = (s: string | null | undefined): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** A year clicked in the timeline means its last day. */
export const asOfFromYear = (year: string | number): string => `${year}-12-31`

export const asOfYear = (asOf: string): string => asOf.slice(0, 4)

/** Ended by the day. Without a day: ended at all — today's `!!until` rule. */
export function endedBy(rel: Tenure | null | undefined, asOf: string | null): boolean {
  if (!rel?.until) return false
  return asOf ? rel.until <= asOf : true
}

/** A start after the day: a STATED one, or a FIRST LISTING (`newly_listed`: the
 *  annual list for the year before was read and does not name it, nor any
 *  older one — not proof, but the filings' own answer, and the user's call:
 *  hidden before that year). A lower bound (`first_listed`) never says
 *  "started after". */
/** Every `since_basis` but `newly_listed` says only "at least since" — the
 *  oldest Exhibit 21 naming it (`first_listed`), a 13D/G amendment
 *  (`amendment`), the UK PSC register's first day (`register_start`), and
 *  whatever the backend adds next. The backend's as-of clause reads the same
 *  rule (owns_merge.STATED_BASES), so the panel and the graph agree. */
export const isLowerBound = (basis: string | null | undefined): boolean =>
  !!basis && basis !== 'newly_listed'

export function startedAfter(rel: Tenure | null | undefined, asOf: string | null): boolean {
  if (!asOf || !rel?.since || isLowerBound(rel.since_basis)) return false
  return rel.since > asOf
}

/** When the sources first show the relationship existing. */
export function evidenceDate(rel: Tenure | null | undefined): string | null {
  return rel?.since || rel?.source_date || null
}

export function edgePresence(rel: Tenure | null | undefined, asOf: string | null): Presence {
  if (!asOf) return 'present'
  if (startedAfter(rel, asOf) || endedBy(rel, asOf)) return 'absent'
  const evidence = evidenceDate(rel)
  return evidence && evidence <= asOf ? 'present' : 'unknown'
}

/** A company founded after the day did not exist; nothing else is certain. */
export function nodeExists(
  entity: { founded?: number | null; founded_date?: string | null } | null | undefined,
  asOf: string | null,
): boolean {
  if (!asOf || !entity) return true
  if (entity.founded_date) return entity.founded_date <= asOf
  if (entity.founded != null) return String(entity.founded) <= asOf
  return true
}

/** A panel row: the party must have existed, and the relationship must not be absent. */
export function rowPresence(
  party: Entity | Person | null | undefined,
  rel: Tenure | null | undefined,
  asOf: string | null,
): Presence {
  if (!nodeExists(party as { founded?: number | null; founded_date?: string | null } | null, asOf)) return 'absent'
  return edgePresence(rel, asOf)
}

/** Edge data is camelCase; the rules read the API's snake_case shape. */
export function tenureOfEdge(d: EdgeData): Tenure {
  return { since: d.since ?? null, since_basis: d.sinceBasis ?? null,
           until: d.until ?? null, source_date: d.sourceDate ?? null }
}
