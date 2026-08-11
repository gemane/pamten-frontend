/**
 * The Android back gesture.
 *
 * Capacitor's native bridge contains no back handling whatsoever — no
 * onBackPressed, no OnBackInvokedCallback, no KEYCODE_BACK — so without a
 * listener on the web side one back press closes the app from anywhere in it.
 * That is what these tests pin, since jsdom cannot press a hardware button:
 * that the listener is registered on device, that it walks history when there is
 * history, that it exits only when there is not, and that it stays out of the
 * way in a browser.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const isNativePlatform = vi.fn()
const addListener = vi.fn()
const exitApp = vi.fn()
const remove = vi.fn()

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (...args: unknown[]) => addListener(...args),
    exitApp: () => exitApp(),
  },
}))

import { useAndroidBackButton } from './useAndroidBackButton'

/** The handler the hook registered, so a back press can be simulated. */
const press = (canGoBack: boolean) => {
  const handler = addListener.mock.calls[0][1] as (e: { canGoBack: boolean }) => void
  handler({ canGoBack })
}

beforeEach(() => {
  vi.clearAllMocks()
  addListener.mockResolvedValue({ remove })
  isNativePlatform.mockReturnValue(true)
  vi.spyOn(window.history, 'back').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('useAndroidBackButton', () => {
  it('registers a back handler on a device', () => {
    renderHook(() => useAndroidBackButton())
    expect(addListener).toHaveBeenCalledWith('backButton', expect.any(Function))
  })

  it('does nothing in a browser, where the real Back button already works', () => {
    isNativePlatform.mockReturnValue(false)
    renderHook(() => useAndroidBackButton())
    expect(addListener).not.toHaveBeenCalled()
  })

  it('walks history back when there is somewhere to go', () => {
    renderHook(() => useAndroidBackButton())
    press(true)
    expect(window.history.back).toHaveBeenCalled()
    expect(exitApp).not.toHaveBeenCalled()
  })

  it('exits only from the first screen', () => {
    // The Android convention, and the reason canGoBack is consulted rather than
    // always exiting — which is today's bug — or never exiting, which traps you.
    renderHook(() => useAndroidBackButton())
    press(false)
    expect(exitApp).toHaveBeenCalled()
    expect(window.history.back).not.toHaveBeenCalled()
  })

  it('removes the listener on unmount', async () => {
    const { unmount } = renderHook(() => useAndroidBackButton())
    await Promise.resolve()
    unmount()
    expect(remove).toHaveBeenCalled()
  })

  it('removes a listener that resolved after unmount', async () => {
    // addListener is async: unmounting before it resolves would otherwise leak a
    // handler that outlives the component and keeps handling back presses.
    let resolve!: (v: { remove: () => void }) => void
    addListener.mockReturnValue(new Promise(r => { resolve = r }))

    const { unmount } = renderHook(() => useAndroidBackButton())
    unmount()
    resolve({ remove })
    await Promise.resolve()

    expect(remove).toHaveBeenCalled()
  })
})
