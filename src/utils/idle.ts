// Schedule work for when the browser is idle (the depth-2 enrichment pass), falling back
// to a short timeout where requestIdleCallback isn't available (Safari, jsdom/node tests).
// Returns a cancel function. `win` is injectable so the scheduler is unit-testable.

interface IdleWindow {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

export function scheduleIdle(
  fn: () => void,
  timeout = 4000,
  win: IdleWindow = (typeof window !== 'undefined' ? window : {}) as IdleWindow,
): () => void {
  if (typeof win.requestIdleCallback === 'function') {
    const handle = win.requestIdleCallback(fn, { timeout })
    return () => win.cancelIdleCallback?.(handle)
  }
  const id = setTimeout(fn, Math.min(timeout, 1500))
  return () => clearTimeout(id)
}
