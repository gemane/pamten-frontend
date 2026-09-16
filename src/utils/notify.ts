/** Browser (OS-level) notifications, for a result the reader may have
 *  switched tabs while waiting for — a refresh that runs for minutes.
 *
 *  Everything is guarded: jsdom and older browsers have no `Notification`,
 *  permission may be denied, and the constructor itself throws on some
 *  platforms (e.g. Android Chrome without a service worker). None of that
 *  may ever break the flow that called us — a notification is a courtesy. */

export function canNotify(): boolean {
  // typeof, not `'Notification' in window`: a key set to undefined (how tests
  // and some embedders remove the API) would otherwise count as present.
  return typeof window !== 'undefined'
    && typeof (window as { Notification?: unknown }).Notification === 'function'
}

/** Ask once. Must run synchronously inside the user's click — after the first
 *  `await` it is no longer a user gesture, and Safari then refuses. */
export function requestNotifyPermission(): void {
  if (!canNotify() || Notification.permission !== 'default') return
  try {
    void Promise.resolve(Notification.requestPermission()).catch(() => { /* declined */ })
  } catch { /* some browsers throw synchronously — treat as declined */ }
}

/** Fire only when the tab is not being looked at; a visible tab already shows
 *  the in-app toast. Returns whether a notification was shown. */
export function notifyIfHidden(title: string, body: string): boolean {
  if (!canNotify() || Notification.permission !== 'granted') return false
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return false
  try {
    new Notification(title, { body })
    return true
  } catch {
    return false
  }
}
