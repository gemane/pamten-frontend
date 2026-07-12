// Share the current view's deep link: native share sheet where preferred
// (mobile), clipboard otherwise. Returns what happened so the caller can
// give the right feedback ('dismissed' = user closed the share sheet).

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed'

export interface ShareCapabilities {
  share?: (data: { url: string }) => Promise<void>
  clipboardWrite?: (text: string) => Promise<void>
}

function defaultCapabilities(): ShareCapabilities {
  return {
    share: typeof navigator !== 'undefined' && navigator.share
      ? navigator.share.bind(navigator)
      : undefined,
    clipboardWrite: typeof navigator !== 'undefined' && navigator.clipboard
      ? navigator.clipboard.writeText.bind(navigator.clipboard)
      : undefined,
  }
}

export async function shareLink(
  url: string,
  preferNativeShare: boolean,
  caps: ShareCapabilities = defaultCapabilities(),
): Promise<ShareOutcome> {
  if (preferNativeShare && caps.share) {
    try {
      await caps.share({ url })
      return 'shared'
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return 'dismissed'
      // share failed for another reason — fall through to the clipboard
    }
  }
  if (caps.clipboardWrite) {
    try {
      await caps.clipboardWrite(url)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
  return 'failed'
}
