import { describe, it, expect, vi } from 'vitest'
import { scheduleIdle } from './idle'

describe('scheduleIdle', () => {
  it('uses requestIdleCallback when available, and cancels it', () => {
    const requestIdleCallback = vi.fn().mockReturnValue(42)
    const cancelIdleCallback = vi.fn()
    const fn = vi.fn()
    const cancel = scheduleIdle(fn, 4000, { requestIdleCallback, cancelIdleCallback })
    expect(requestIdleCallback).toHaveBeenCalledWith(fn, { timeout: 4000 })
    cancel()
    expect(cancelIdleCallback).toHaveBeenCalledWith(42)
  })

  it('falls back to setTimeout when requestIdleCallback is absent', () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn()
      scheduleIdle(fn, 4000, {})           // no requestIdleCallback → timeout fallback
      expect(fn).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1500)
      expect(fn).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancel() stops the setTimeout fallback from firing', () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn()
      const cancel = scheduleIdle(fn, 4000, {})
      cancel()
      vi.advanceTimersByTime(2000)
      expect(fn).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
