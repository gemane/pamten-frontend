/** GLEIF's proceedings of a company that still exists — liquidation,
 *  bankruptcy, insolvency, voluntary arrangement — as the backend stores
 *  them on `Entity.gleif_events` (findings item 85d): one string per event,
 *  `"TYPE|STATUS|effective|recorded"`, the register's recorded day beside
 *  the event's own because a tenth of the proceedings in progress carry no
 *  effective day. The timeline rows come from the backend; the panel's
 *  "Status" is derived here: the latest entry of a type, when it is in
 *  progress, is the company's current state. */

export const LEGAL_EVENT_TYPES = ['liquidation', 'bankruptcy', 'insolvency', 'voluntary_arrangement'] as const
export type LegalEventType = typeof LEGAL_EVENT_TYPES[number]
export type LegalEventStatus = 'in_progress' | 'completed' | 'withdrawn_cancelled'

export interface LegalEvent {
  event: LegalEventType
  status: LegalEventStatus
  /** the event's own day, when the register states one */
  effective: string | null
  /** the day the register recorded it */
  recorded: string | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = new Set(['in_progress', 'completed', 'withdrawn_cancelled'])

export function parseLegalEvent(entry: string | null | undefined): LegalEvent | null {
  const parts = (entry ?? '').split('|')
  if (parts.length !== 4) return null
  const event = parts[0].toLowerCase()
  const status = parts[1].toLowerCase()
  if (!(LEGAL_EVENT_TYPES as readonly string[]).includes(event) || !STATUSES.has(status)) return null
  return {
    event: event as LegalEventType,
    status: status as LegalEventStatus,
    effective: DAY.test(parts[2]) ? parts[2] : null,
    recorded: DAY.test(parts[3]) ? parts[3] : null,
  }
}

/** The company's current proceeding, if any: per type the latest entry (by
 *  the effective day, else the recorded one; the list's order breaks ties),
 *  and a type whose latest entry is in progress is a state the company is
 *  in. Several at once: the one that began last. `since` is the day the
 *  entry carries, the recorded one when the event itself is undated. */
export function currentState(entries: string[] | null | undefined): { event: LegalEventType; since: string | null } | null {
  const latest = new Map<LegalEventType, LegalEvent>()
  for (const raw of entries ?? []) {
    const ev = parseLegalEvent(raw)
    if (!ev) continue
    const seen = latest.get(ev.event)
    if (!seen || (ev.effective ?? ev.recorded ?? '') >= (seen.effective ?? seen.recorded ?? '')) latest.set(ev.event, ev)
  }
  const open = [...latest.values()].filter(ev => ev.status === 'in_progress')
  if (!open.length) return null
  open.sort((a, b) => (b.effective ?? b.recorded ?? '').localeCompare(a.effective ?? a.recorded ?? ''))
  return { event: open[0].event, since: open[0].effective ?? open[0].recorded }
}
