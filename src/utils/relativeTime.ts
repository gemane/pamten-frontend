/** "3m ago"-style relative time, shared by the activity feed and the health
 *  panel. Takes `t` rather than importing i18n so callers stay testable with
 *  a plain function. Keys live under `activity.*` — both consumers show run
 *  recency, and one vocabulary beats two drifting ones. */
export function ago(iso: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return t('activity.secondsAgo', { count: s })
  if (s < 3600) return t('activity.minutesAgo', { count: Math.round(s / 60) })
  if (s < 86400) return t('activity.hoursAgo', { count: Math.round(s / 3600) })
  return t('activity.daysAgo', { count: Math.round(s / 86400) })
}
