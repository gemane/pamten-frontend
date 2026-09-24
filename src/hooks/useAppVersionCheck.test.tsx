import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const native = vi.hoisted(() => ({ is: true, platform: 'android', version: '1.2.0' }))
const listeners = vi.hoisted(() => [] as Array<(s: { isActive: boolean }) => void>)
const get = vi.hoisted(() => vi.fn())

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.is, getPlatform: () => native.platform },
}))
vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: async () => ({ version: native.version, build: '10200' }),
    addListener: async (_evt: string, cb: (s: { isActive: boolean }) => void) => {
      listeners.push(cb)
      return { remove: () => {} }
    },
  },
}))
vi.mock('axios', () => ({ default: { get: (...a: unknown[]) => get(...a) } }))
vi.mock('../services/api', () => ({ API_BASE: 'https://api.example.com/' }))

import { useAppVersionCheck } from './useAppVersionCheck'

beforeEach(() => {
  native.is = true; native.platform = 'android'; native.version = '1.2.0'
  listeners.length = 0
  get.mockReset()
  vi.useRealTimers()
})

describe('useAppVersionCheck', () => {
  it('asks the UNVERSIONED endpoint with the platform and the installed version', async () => {
    get.mockResolvedValue({ data: { update_required: true, update_available: true,
                                    store_url: 'https://play.google.com/x' } })
    const { result } = renderHook(() => useAppVersionCheck())
    await waitFor(() => expect(result.current.kind).toBe('required'))
    const [url, opts] = get.mock.calls[0]
    expect(url).toBe('https://api.example.com/app-version')      // not /v1/app-version
    expect(opts.params).toEqual({ platform: 'android', version: '1.2.0' })
  })

  it('the web app never asks', async () => {
    native.is = false
    const { result } = renderHook(() => useAppVersionCheck())
    await new Promise(r => setTimeout(r, 10))
    expect(get).not.toHaveBeenCalled()
    expect(result.current.kind).toBe('none')
  })

  it('a development build never asks', async () => {
    native.version = '0.0.0-dev+abc1234'
    renderHook(() => useAppVersionCheck())
    await new Promise(r => setTimeout(r, 10))
    expect(get).not.toHaveBeenCalled()
  })

  it('fails open when the server cannot be reached', async () => {
    get.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useAppVersionCheck())
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(result.current.kind).toBe('none')
  })

  it('asks again when the app returns to the foreground after an hour, not before', async () => {
    get.mockResolvedValue({ data: { update_required: false, update_available: false } })
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    renderHook(() => useAppVersionCheck())
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(listeners.length).toBe(1))

    now.mockReturnValue(1_000_000 + 10 * 60 * 1000)           // 10 minutes later
    await act(async () => listeners[0]({ isActive: true }))
    expect(get).toHaveBeenCalledTimes(1)

    get.mockResolvedValue({ data: { update_required: true } })
    now.mockReturnValue(1_000_000 + 61 * 60 * 1000)           // past the hour
    await act(async () => listeners[0]({ isActive: true }))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    // going to the background does not ask
    await act(async () => listeners[0]({ isActive: false }))
    expect(get).toHaveBeenCalledTimes(2)
    now.mockRestore()
  })
})
