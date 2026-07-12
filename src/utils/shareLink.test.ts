import { describe, it, expect, vi } from 'vitest'
import { shareLink } from './shareLink'

const URL_ = 'https://example.com/#graph/e/abc'

describe('shareLink', () => {
  it('uses the native share sheet when preferred and available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const clipboardWrite = vi.fn()
    expect(await shareLink(URL_, true, { share, clipboardWrite })).toBe('shared')
    expect(share).toHaveBeenCalledWith({ url: URL_ })
    expect(clipboardWrite).not.toHaveBeenCalled()
  })

  it('reports dismissed when the user closes the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }))
    const clipboardWrite = vi.fn()
    expect(await shareLink(URL_, true, { share, clipboardWrite })).toBe('dismissed')
    expect(clipboardWrite).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard when native share fails for other reasons', async () => {
    const share = vi.fn().mockRejectedValue(new Error('boom'))
    const clipboardWrite = vi.fn().mockResolvedValue(undefined)
    expect(await shareLink(URL_, true, { share, clipboardWrite })).toBe('copied')
    expect(clipboardWrite).toHaveBeenCalledWith(URL_)
  })

  it('copies to the clipboard when native share is not preferred', async () => {
    const share = vi.fn()
    const clipboardWrite = vi.fn().mockResolvedValue(undefined)
    expect(await shareLink(URL_, false, { share, clipboardWrite })).toBe('copied')
    expect(share).not.toHaveBeenCalled()
  })

  it('copies to the clipboard when share is unavailable even if preferred', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined)
    expect(await shareLink(URL_, true, { clipboardWrite })).toBe('copied')
  })

  it('reports failed when the clipboard write throws', async () => {
    const clipboardWrite = vi.fn().mockRejectedValue(new Error('denied'))
    expect(await shareLink(URL_, false, { clipboardWrite })).toBe('failed')
  })

  it('reports failed when no capability exists', async () => {
    expect(await shareLink(URL_, false, {})).toBe('failed')
  })
})
