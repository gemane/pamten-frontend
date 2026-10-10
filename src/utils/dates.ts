/** Dates as the viewer reads them.
 *
 *  The sources write ISO: "2024-02-13", "2026-07-12T09:00:00+00:00", and the
 *  partial forms a register or a filing leaves behind — "2023-04-00" for a
 *  month, "1955" or "1955-00-00" for a year. Each is written the way the
 *  viewer's language writes it (Intl, the browser's own tables): a full date
 *  as "Feb 13, 2024" / "13.02.2024" / "13 feb 2024", a month as "Apr 2023",
 *  a year as it is. Formatted in UTC, so a date never slips a day for a
 *  viewer west of Greenwich. Anything else — not a date, a 13th month, a
 *  31st of April — is null, and the caller shows nothing rather than nonsense. */
const DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:[T ].*)?$/

export function formatDate(value: string | number | null | undefined, lang: string): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : null
  const m = DATE.exec(String(value).trim())
  if (!m) return null
  const y = Number(m[1]), month = m[2] ? Number(m[2]) : 0, day = m[3] ? Number(m[3]) : 0
  if (month === 0) return String(y)
  if (month > 12) return null
  if (day === 0) return fmt(lang, { year: 'numeric', month: 'short', timeZone: 'UTC' }, Date.UTC(y, month - 1, 1))
  const t = Date.UTC(y, month - 1, day)
  const back = new Date(t)          // Date.UTC rolls a 31st of April into May: not a date, say nothing
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null
  return fmt(lang, { dateStyle: 'medium', timeZone: 'UTC' }, t)
}

function fmt(lang: string, opts: Intl.DateTimeFormatOptions, t: number): string {
  try { return new Intl.DateTimeFormat(lang, opts).format(t) }
  catch { return new Intl.DateTimeFormat('en', opts).format(t) }
}
