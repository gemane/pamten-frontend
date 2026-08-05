/**
 * Pull a user-facing message out of an axios error.
 *
 * The backend's `detail` is the useful text — "Current password is incorrect",
 * which password rule failed, why an account deletion was refused. Prefer it and
 * fall back only when the failure carries none (a network error, say).
 *
 * Shared rather than redefined per component: several settings panels surface
 * backend errors the same way, and a second copy is how the two drift apart.
 */
export function errText(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === 'string' ? d : fallback
}
