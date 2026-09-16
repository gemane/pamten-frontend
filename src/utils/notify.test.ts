import { afterEach, describe, expect, it, vi } from 'vitest'
import { canNotify, notifyIfHidden, requestNotifyPermission } from './notify'

/** A stand-in for the browser's Notification: static permission, a
 *  recording constructor, and a requestPermission we can watch. */
function fakeNotification(permission: string, { throwing = false } = {}) {
  const created: Array<{ title: string; body?: string }> = []
  class FakeNotification {
    static permission = permission
    static requestPermission = vi.fn(() => Promise.resolve('granted'))
    constructor(title: string, opts?: { body?: string }) {
      if (throwing) throw new Error('no notifications here')
      created.push({ title, body: opts?.body })
    }
  }
  vi.stubGlobal('Notification', FakeNotification)
  return { created, FakeNotification }
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

afterEach(() => {
  vi.unstubAllGlobals()
  setVisibility('visible')
})

describe('notifyIfHidden', () => {
  it('is a quiet no-op where the browser has no Notification at all', () => {
    vi.stubGlobal('Notification', undefined)
    // jsdom has no Notification; the stub above makes that explicit either way
    expect(canNotify()).toBe(false)
    expect(notifyIfHidden('t', 'b')).toBe(false)
  })

  it('does not fire while the tab is visible — the toast already shows it', () => {
    const { created } = fakeNotification('granted')
    setVisibility('visible')
    expect(notifyIfHidden('t', 'b')).toBe(false)
    expect(created).toEqual([])
  })

  it('does not fire without permission', () => {
    const { created } = fakeNotification('denied')
    setVisibility('hidden')
    expect(notifyIfHidden('t', 'b')).toBe(false)
    expect(created).toEqual([])
  })

  it('fires with title and body when the tab is hidden and permission is granted', () => {
    const { created } = fakeNotification('granted')
    setVisibility('hidden')
    expect(notifyIfHidden('Owlgraph — refresh finished', 'Refresh of Acme finished')).toBe(true)
    expect(created).toEqual([{ title: 'Owlgraph — refresh finished', body: 'Refresh of Acme finished' }])
  })

  it('swallows a constructor that throws', () => {
    fakeNotification('granted', { throwing: true })
    setVisibility('hidden')
    expect(notifyIfHidden('t', 'b')).toBe(false)
  })
})

describe('requestNotifyPermission', () => {
  it('asks only while the answer is still open', () => {
    const { FakeNotification } = fakeNotification('default')
    requestNotifyPermission()
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('never re-asks once granted or denied', () => {
    for (const p of ['granted', 'denied']) {
      const { FakeNotification } = fakeNotification(p)
      requestNotifyPermission()
      expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
    }
  })

  it('is a no-op without the API', () => {
    vi.stubGlobal('Notification', undefined)
    expect(() => requestNotifyPermission()).not.toThrow()
  })
})
