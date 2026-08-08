/**
 * Session handling in the API client: where the access token lives, how an
 * expired one is refreshed, and what happens when the session is really over.
 *
 * These drive the real axios instances through a stub `adapter`, so the actual
 * interceptors run. Asserting against a re-implementation of the interceptor
 * logic would prove nothing about the code that ships.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import {
  client, refreshClient, setAccessToken, getAccessToken, refreshSession,
  LANGUAGE_HEADER, currentLanguage,
} from './api'

/** Minimal successful axios response for a stub adapter. */
function ok(data: unknown, config: InternalAxiosRequestConfig): AxiosResponse {
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}

function unauthorized(config: InternalAxiosRequestConfig) {
  return Object.assign(new Error('Request failed with status code 401'), {
    isAxiosError: true,
    config,
    response: { data: {}, status: 401, statusText: 'Unauthorized', headers: {}, config },
  })
}

const SESSION = { access_token: 'fresh-token', email: 'user@example.com', role: 'viewer',
                  email_verified: true, expires_in: 900 }

beforeEach(() => {
  setAccessToken(null)
  vi.restoreAllMocks()
})

// ── Where the token lives ─────────────────────────────────────────────────────

describe('access token storage', () => {
  it('keeps the token out of localStorage, where any script could read it', () => {
    setAccessToken('secret-token')
    expect(JSON.stringify(localStorage)).not.toContain('secret-token')
    expect(getAccessToken()).toBe('secret-token')
  })

  it('attaches the token as a bearer header', async () => {
    setAccessToken('secret-token')
    const adapter = vi.fn<AxiosAdapter>(async (config) => ok({}, config))
    await client.get('/entities/x', { adapter })
    expect(adapter.mock.calls[0][0].headers.Authorization).toBe('Bearer secret-token')
  })

  it('sends no Authorization header when logged out', async () => {
    const adapter = vi.fn<AxiosAdapter>(async (config) => ok({}, config))
    await client.get('/search/', { adapter })
    expect(adapter.mock.calls[0][0].headers.Authorization).toBeUndefined()
  })

  it('sends credentials, so the refresh cookie travels with the request', () => {
    expect(client.defaults.withCredentials).toBe(true)
    expect(refreshClient.defaults.withCredentials).toBe(true)
  })
})

// ── Refreshing ────────────────────────────────────────────────────────────────

describe('refreshSession', () => {
  it('stores the new token and returns the session', async () => {
    refreshClient.defaults.adapter = async (config) => ok(SESSION, config)
    const session = await refreshSession()
    expect(session?.email).toBe('user@example.com')
    expect(getAccessToken()).toBe('fresh-token')
  })

  it('resolves to null instead of throwing when there is no session', async () => {
    // Being logged out is the ordinary case on a first visit, not an error the
    // caller should have to catch.
    refreshClient.defaults.adapter = async (config) => { throw unauthorized(config) }
    await expect(refreshSession()).resolves.toBeNull()
  })

  it('clears a stale token when the refresh fails', async () => {
    setAccessToken('stale')
    refreshClient.defaults.adapter = async (config) => { throw unauthorized(config) }
    await refreshSession()
    expect(getAccessToken()).toBeNull()
  })

  it('coalesces concurrent refreshes into one request', async () => {
    // Rotation invalidates the presented token, so firing several refreshes with
    // the same cookie would make the later ones look like replays — and the
    // server burns the whole session when it sees one.
    const adapter = vi.fn<AxiosAdapter>(async (config) => ok(SESSION, config))
    refreshClient.defaults.adapter = adapter
    await Promise.all([refreshSession(), refreshSession(), refreshSession()])
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('allows a new refresh after the previous one settles', async () => {
    const adapter = vi.fn<AxiosAdapter>(async (config) => ok(SESSION, config))
    refreshClient.defaults.adapter = adapter
    await refreshSession()
    await refreshSession()
    expect(adapter).toHaveBeenCalledTimes(2)
  })
})

// ── Refresh-and-retry on 401 ──────────────────────────────────────────────────

describe('recovering from an expired access token', () => {
  it('refreshes and replays the request, so the user sees nothing', async () => {
    setAccessToken('expired')
    refreshClient.defaults.adapter = async (config) => ok(SESSION, config)

    let attempt = 0
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      attempt += 1
      if (attempt === 1) throw unauthorized(config)
      return ok({ name: 'Acme' }, config)
    })

    const res = await client.get('/entities/x', { adapter })
    expect(res.data).toEqual({ name: 'Acme' })
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('replays with the new token, not the expired one', async () => {
    setAccessToken('expired')
    refreshClient.defaults.adapter = async (config) => ok(SESSION, config)

    let attempt = 0
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      attempt += 1
      if (attempt === 1) throw unauthorized(config)
      return ok({}, config)
    })

    await client.get('/entities/x', { adapter })
    expect(adapter.mock.calls[1][0].headers.Authorization).toBe('Bearer fresh-token')
  })

  it('gives up after one retry rather than looping', async () => {
    // A 401 that survives a good refresh means "forbidden", not "expired".
    setAccessToken('expired')
    refreshClient.defaults.adapter = async (config) => ok(SESSION, config)
    const adapter = vi.fn<AxiosAdapter>(async (config) => { throw unauthorized(config) })

    await expect(client.get('/entities/x', { adapter })).rejects.toBeTruthy()
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('does not retry when the session is genuinely over', async () => {
    setAccessToken('expired')
    refreshClient.defaults.adapter = async (config) => { throw unauthorized(config) }
    const adapter = vi.fn<AxiosAdapter>(async (config) => { throw unauthorized(config) })

    await expect(client.get('/entities/x', { adapter })).rejects.toBeTruthy()
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('leaves auth endpoints alone', async () => {
    // /auth/login reports a bad password itself; refreshing behind it would be
    // both pointless and confusing.
    const refreshAdapter = vi.fn<AxiosAdapter>(async (config) => ok(SESSION, config))
    refreshClient.defaults.adapter = refreshAdapter
    const adapter = vi.fn<AxiosAdapter>(async (config) => { throw unauthorized(config) })

    await expect(client.post('/auth/login', {}, { adapter })).rejects.toBeTruthy()
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(refreshAdapter).not.toHaveBeenCalled()
  })

  it('does not refresh on a 403', async () => {
    setAccessToken('valid')
    const refreshAdapter = vi.fn<AxiosAdapter>(async (config) => ok(SESSION, config))
    refreshClient.defaults.adapter = refreshAdapter
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      throw Object.assign(new Error('403'), {
        isAxiosError: true, config,
        response: { data: {}, status: 403, statusText: 'Forbidden', headers: {}, config },
      })
    })

    await expect(client.get('/scraper/run', { adapter })).rejects.toBeTruthy()
    expect(refreshAdapter).not.toHaveBeenCalled()
  })
})

// ── The UI language, for server-composed email ────────────────────────────────
//
// The site is localized but emails are written on the server, so it has to be
// told which language the reader is actually using. Not Accept-Language: that
// is the browser's setting, not the app's switcher.

describe('language header', () => {
  it('sends the current UI language on every request', async () => {
    const adapter = vi.fn<AxiosAdapter>(async (config) => ok({}, config))
    await client.get('/entities/x', { adapter })
    expect(adapter.mock.calls[0][0].headers[LANGUAGE_HEADER]).toBe(currentLanguage())
  })

  it('follows a language switch rather than caching the value at startup', async () => {
    const i18n = (await import('../i18n')).default
    const original = i18n.language
    try {
      await i18n.changeLanguage('de')
      const adapter = vi.fn<AxiosAdapter>(async (config) => ok({}, config))
      await client.post('/auth/forgot-password', {}, { adapter })
      expect(adapter.mock.calls[0][0].headers[LANGUAGE_HEADER]).toBe('de')
    } finally {
      await i18n.changeLanguage(original)
    }
  })
})
