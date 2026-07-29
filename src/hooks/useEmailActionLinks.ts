import { useEffect, useRef } from 'react'

/**
 * Parse an emailed action link's query string. Verification and reset emails point
 * at `${APP_BASE_URL}/?action=verify-email|reset-password&token=…`. Returns the
 * action + token, or null when either is missing. Pure — unit-tested.
 */
export function parseEmailAction(search: string): { action: string; token: string } | null {
  const params = new URLSearchParams(search)
  const action = params.get('action')
  const token  = params.get('token')
  return action && token ? { action, token } : null
}

/**
 * Handle the emailed verification / password-reset links, exactly once on load:
 * parse the query, strip it from the URL (so a refresh doesn't re-fire it, keeping
 * the hash view), and dispatch to the caller's handlers.
 */
export function useEmailActionLinks(handlers: {
  onVerifyEmail: (token: string) => void
  onResetPassword: (token: string) => void
}): void {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    const parsed = parseEmailAction(window.location.search)
    if (!parsed) return
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    if (parsed.action === 'verify-email') handlers.onVerifyEmail(parsed.token)
    else if (parsed.action === 'reset-password') handlers.onResetPassword(parsed.token)
    // once on mount; handlers close over current state and are intentionally not deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
