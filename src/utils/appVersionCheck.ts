/**
 * The client side of the minimum-app-version switch (backend `GET /app-version`).
 *
 * The installed app is a native shell that loads the live website, so the web
 * code is always current; what can go stale is the SHELL — its plugins, its
 * WebView settings, its bridge. When a shell version has to stop running (a
 * security fix, a plugin the site now relies on), the backend's policy says so
 * and this check shows the user a blocking "update" screen; when a newer shell
 * merely exists, a dismissible banner.
 *
 * The server decides, the client only asks — comparing versions is the backend's
 * job (routers/app_version.py), so a buggy comparison here can never lock anyone
 * out. And it fails open like the server: no answer, a malformed answer or a
 * development build all mean "carry on".
 */

export interface VersionVerdict {
  update_required: boolean
  update_available: boolean
  latest?: string | null
  store_url?: string | null
  message?: string | null
}

export type UpdateState =
  | { kind: 'none' }
  | { kind: 'required'; storeUrl: string | null; message: string | null }
  | { kind: 'available'; storeUrl: string | null; message: string | null; latest: string | null }

export const NO_UPDATE: UpdateState = { kind: 'none' }

/**
 * Whether this client should ask at all. Only a native app has a shell version to
 * outdate; the web app always runs what was deployed last. A development build
 * (0.0.0-dev+<commit>, or an empty version) is never distributed and would read
 * as older than any minimum, so it does not ask either.
 */
export function shouldCheck(platform: string, version: string | null | undefined): boolean {
  if (platform !== 'android' && platform !== 'ios') return false
  const v = (version ?? '').trim()
  return v !== '' && !v.startsWith('0.0.0')
}

/** Turn the server's answer into what to show. Anything unexpected → nothing. */
export function toUpdateState(verdict: unknown): UpdateState {
  if (!verdict || typeof verdict !== 'object') return NO_UPDATE
  const v = verdict as Partial<VersionVerdict>
  const storeUrl = safeStoreUrl(v.store_url)
  const message = typeof v.message === 'string' && v.message.trim() ? v.message.trim() : null
  if (v.update_required === true) return { kind: 'required', storeUrl, message }
  if (v.update_available === true) {
    return { kind: 'available', storeUrl, message,
             latest: typeof v.latest === 'string' ? v.latest : null }
  }
  return NO_UPDATE
}

/**
 * Only an https (or Play/App Store scheme) link is opened. The policy is set by
 * an admin, but it is still data from the network, and a `javascript:` URL behind
 * an "Update" button is exactly the kind of thing that must never run.
 */
export function safeStoreUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const u = url.trim()
  return /^(https:\/\/|market:\/\/|itms-apps:\/\/)/i.test(u) ? u : null
}

/** The soft prompt is dismissed per offered version: a newer one asks again. */
export const dismissKey = (latest: string | null) => `owlgraph.updateDismissed.${latest ?? 'unknown'}`

/** Re-ask at most this often when the app comes back to the foreground. */
export const RECHECK_MS = 60 * 60 * 1000
