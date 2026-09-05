import axios from 'axios'
import i18n from '../i18n'
import type { MapBasis } from '../utils/mapBasis'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type {
  SearchResult,
  FullProfile,
  PersonProfile,
  HistoryEntry,
  ScraperStatus,
  ScrapeResult,
  ScrapeRun,
  ScraperSource,
  EnsureResult,
  CountryEntityGroup,
  Entity,
  AuthUser,
  Source,
  DuplicateScan,
  DedupResult,
  KeptSeparateList,
  MergeLogList,
  FederationStatus,
  FederationPeer,
  FederationPublicKey,
  PeerPullResult,
  FlagCreatePayload,
  FlagCreateResult,
  FlagSummary,
  Flag,
  FlagGroup,
  Suppression,
  Pin,
  ScraperHealth,
} from '../types'

// The backend serves everything under /v1. It still answers on the unversioned
// paths, but those are deprecated and hidden from the schema, so the prefix is
// appended here once rather than on ~50 call sites. VITE_API_URL stays the bare
// origin — don't put /v1 in the env var too, or requests go to /v1/v1.
/** Fallback for `npm run dev` only — never used by a built bundle. */
export const DEV_API_FALLBACK = 'https://api-dev.owlgraph.org'

/**
 * Resolve the backend origin, refusing to guess in a production build.
 *
 * The old fallback was a hardcoded deployment, so a build with VITE_API_URL
 * unset came up looking healthy while quietly reading and writing another
 * environment's data. Throwing is the lesser problem: it surfaces at startup,
 * and only in a build that was already misconfigured.
 */
export function resolveApiBase(configured: string | undefined, isProd: boolean): string {
  if (configured) return configured
  if (isProd) {
    throw new Error(
      'VITE_API_URL is not set. A production build must be given its backend origin ' +
      `(e.g. ${DEV_API_FALLBACK}) — refusing to guess.`,
    )
  }
  return DEV_API_FALLBACK
}

export const API_BASE = resolveApiBase(import.meta.env.VITE_API_URL, import.meta.env.PROD)

/**
 * Exported so tests can install a mock `adapter` and drive the real interceptor
 * chain (token attachment, refresh-and-retry) rather than a re-implementation of
 * it. Application code should use the named request helpers below.
 */
export const client = axios.create({
  baseURL: `${API_BASE.replace(/\/+$/, '')}/v1`,
  // Send the httpOnly refresh cookie. Required for /auth/refresh and /auth/logout;
  // harmless elsewhere. The API must answer with Access-Control-Allow-Credentials,
  // which it does (an explicit CORS_ORIGINS list, since credentialed requests
  // cannot use a wildcard origin).
  withCredentials: true,
})

/**
 * The access token lives in memory, not localStorage.
 *
 * localStorage is readable by any script on the page, so an XSS bug there hands
 * over a working credential. In memory it dies with the tab, and the session is
 * carried instead by an httpOnly refresh cookie that JavaScript cannot read at
 * all. The cost is that a page reload has no token — see restoreSession(), which
 * trades the cookie for a fresh one on startup.
 */
let accessToken: string | null = null

export const setAccessToken = (token: string | null): void => { accessToken = token }
export const getAccessToken = (): string | null => accessToken

/**
 * The header telling the backend which language to write emails in.
 *
 * Deliberately not `Accept-Language`: that reflects the languages configured in
 * the browser, which say nothing about the in-app language switcher — a German
 * UI in an English browser would otherwise produce English email.
 */
export const LANGUAGE_HEADER = 'X-Owlgraph-Language'

/** Read at request time, not module load, so switching language takes effect at once. */
export function currentLanguage(): string {
  return i18n.language || 'en'
}

client.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  config.headers[LANGUAGE_HEADER] = currentLanguage()
  return config
})

let _onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => { _onUnauthorized = fn }

// Whether a 401 should trigger the global "session expired" handler (which pops
// the login modal). Auth endpoints handle their own 401s and must NOT trigger
// it: /auth/me is the silent on-load session-restore check (an expired token
// there should just clear quietly, not pop a login), and /auth/login|register
// show their own inline errors.
export function shouldNotifyUnauthorized(status: number | undefined, url: string | undefined): boolean {
  return status === 401 && !(url ?? '').includes('/auth/')
}

/**
 * A bare client for /auth/refresh.
 *
 * It must not go through `client`'s response interceptor: that interceptor
 * reacts to a 401 by calling refresh, so refreshing through it would recurse.
 */
export const refreshClient = axios.create({
  baseURL: `${API_BASE.replace(/\/+$/, '')}/v1`,
  withCredentials: true,
})

/** What the API returns when it hands out an access token. */
export interface SessionPayload extends AuthUser {
  access_token: string
  expires_in?: number
}

let refreshInFlight: Promise<SessionPayload | null> | null = null

/**
 * Trade the refresh cookie for a new access token, or `null` if the session is
 * over. Never rejects — an expired session is an expected outcome, not an error.
 *
 * Concurrent callers share one in-flight request. Without that, a page issuing
 * six requests at once would fire six refreshes on a stale token, and rotation
 * would treat the five that arrive second as replays and burn the session.
 */
export function refreshSession(): Promise<SessionPayload | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshClient.post<SessionPayload>('/auth/refresh')
      .then(({ data }) => { setAccessToken(data.access_token); return data })
      .catch(() => { setAccessToken(null); return null })
      .finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

/** Marker for the one retry a request gets after a refresh. */
type RetriableConfig = InternalAxiosRequestConfig & { _retriedAfterRefresh?: boolean }

client.interceptors.response.use(
  res => res,
  async err => {
    const status = err.response?.status as number | undefined
    const config = err.config as RetriableConfig | undefined
    const url = config?.url ?? ''

    // An expired access token is now the common case, not an exceptional one:
    // they last 15 minutes. Refresh once and replay the request, so the user
    // never sees it. Auth routes are excluded — /auth/refresh is what we would
    // be calling, and login/register surface their own 401s inline.
    if (status === 401 && config && !config._retriedAfterRefresh && !url.includes('/auth/')) {
      config._retriedAfterRefresh = true
      const session = await refreshSession()
      if (session) return client(config)
    }

    if (_onUnauthorized && shouldNotifyUnauthorized(status, url)) {
      _onUnauthorized()
    }
    return Promise.reject(err)
  },
)

export const search = (q: string, country?: string): Promise<AxiosResponse<SearchResult[]>> =>
  client.get('/search/', { params: country ? { q, country } : { q } })

export const getCountries = (): Promise<AxiosResponse<{ country: string; count: number }[]>> =>
  client.get('/entities/countries')

export interface StatsResponse {
  companies: number
  people: number
  relationships: number
  sources: number
}

// Public data-scale counts for the landing page.
export const getStats = (): Promise<AxiosResponse<StatsResponse>> =>
  client.get('/stats')

export const getFullProfile = (id: string): Promise<AxiosResponse<FullProfile>> =>
  client.get(`/search/entity/${id}/full-profile`)

export const getPersonProfile = (id: string): Promise<AxiosResponse<PersonProfile>> =>
  client.get(`/search/person/${id}/full-profile`)

export const getOwnershipTree = (id: string, depth = 3): Promise<AxiosResponse<unknown>> =>
  client.get(`/relationships/ownership-tree/${id}`, { params: { depth } })

export const getOwners = (id: string): Promise<AxiosResponse<unknown[]>> =>
  client.get(`/relationships/owners/${id}`)

export const getHistory = (id: string): Promise<AxiosResponse<HistoryEntry[]>> =>
  client.get(`/relationships/history/${id}`)

export const getEntity = (id: string): Promise<AxiosResponse<unknown>> =>
  client.get(`/entities/${id}`)

export const getPerson = (id: string): Promise<AxiosResponse<unknown>> =>
  client.get(`/persons/${id}`)

export const getEntitiesByCountry = (
  basis: MapBasis = 'jurisdiction',
): Promise<AxiosResponse<CountryEntityGroup[]>> =>
  client.get('/entities/by-country', { params: { basis } })

export const getCountryEntities = (
  country: string, basis: MapBasis = 'jurisdiction', limit = 200,
): Promise<AxiosResponse<Entity[]>> =>
  client.get(`/entities/by-country/${encodeURIComponent(country)}`, { params: { basis, limit } })

/** The companies the map cannot place — no country at all for this basis. */
export const getEntitiesWithoutCountry = (
  basis: MapBasis = 'jurisdiction', limit = 200,
): Promise<AxiosResponse<Entity[]>> =>
  client.get('/entities/without-country', { params: { basis, limit } })

/**
 * Counts per ISO 3166-2 subdivision (`US-DE`), across every country at once.
 *
 * `subdivision` stays out of the `MapBasis` union deliberately: it is a
 * refinement of where a company is *registered*, not a third thing the
 * Registered/Headquarters switch offers, and widening the union would put a
 * third button on that switch by accident.
 *
 * One call for all of them — there are a few dozen rows in total — and the caller
 * narrows to a country by prefix.
 */
export const getEntitiesBySubdivision = (): Promise<AxiosResponse<CountryEntityGroup[]>> =>
  client.get('/entities/by-country', { params: { basis: 'subdivision' } })

/** The companies registered in one subdivision. */
export const getSubdivisionEntities = (
  code: string, limit = 200,
): Promise<AxiosResponse<Entity[]>> =>
  client.get(`/entities/by-country/${encodeURIComponent(code)}`, {
    params: { basis: 'subdivision', limit },
  })

export const getPersonSources = (id: string): Promise<AxiosResponse<Source[]>> =>
  client.get(`/sources/person/${id}`)

export const getPersonDuplicates = (): Promise<AxiosResponse<DuplicateScan>> =>
  client.get('/persons/duplicates')

export const mergePersons = (keep_id: string, dup_id: string): Promise<AxiosResponse<{ message: string }>> =>
  client.post('/persons/merge', { keep_id, dup_id })

export const runDeduplicate = (apply = true): Promise<AxiosResponse<DedupResult>> =>
  client.post('/persons/deduplicate', null, { params: { apply } })

export const keepSeparate = (ids: string[]): Promise<AxiosResponse<{ message: string }>> =>
  client.post('/persons/keep-separate', { ids })

export const undoKeepSeparate = (ids: string[]): Promise<AxiosResponse<{ message: string }>> =>
  client.delete('/persons/keep-separate', { data: { ids } })

export const getKeptSeparate = (): Promise<AxiosResponse<KeptSeparateList>> =>
  client.get('/persons/kept-separate')

export const getMergeLog = (): Promise<AxiosResponse<MergeLogList>> =>
  client.get('/persons/merge-log')

// ── Federation (trusted-peer sync) ──────────────────────────────────────────
export const getFederationStatus = (): Promise<AxiosResponse<FederationStatus>> =>
  client.get('/federation/status')

export const getFederationPeers = (): Promise<AxiosResponse<{ count: number; peers: FederationPeer[] }>> =>
  client.get('/federation/peers')

export const getFederationPublicKey = (): Promise<AxiosResponse<FederationPublicKey>> =>
  client.get('/federation/public-key')

export const addFederationPeer = (
  body: { name: string; base_url: string; auth_token?: string; public_key?: string; credibility_score?: number }
): Promise<AxiosResponse<FederationPeer>> =>
  client.post('/federation/peers', body)

export const deleteFederationPeer = (id: string): Promise<AxiosResponse<{ message: string }>> =>
  client.delete(`/federation/peers/${id}`)

export const pullFederationPeer = (id: string): Promise<AxiosResponse<PeerPullResult>> =>
  client.post(`/federation/peers/${id}/pull`)

export const getEntitySources = (id: string): Promise<AxiosResponse<Source[]>> =>
  client.get(`/sources/entity/${id}`)

// ── Usage measurement ────────────────────────────────────────────────────────
//
// Aggregate counters only: what was searched for and which features get used.
// No id of any kind is sent — not the user, not a session, not a device — and the
// server keeps counts rather than events (see backend app/analytics.py).
//
// Fire-and-forget by design: measurement may never delay, block or break the
// thing it is measuring, so failures are swallowed here rather than handled by
// every call site.
export interface AnalyticsEvent {
  kind: 'search' | 'usage'
  query?: string
  country?: string
  /** `selected` a result was chosen · `zero` nothing was found · `abandoned` results
   *  were shown and none was taken. Reported once, when a search settles. */
  outcome?: 'selected' | 'zero' | 'abandoned'
  rank?: number
  event?: string
}

export const reportEvent = (body: AnalyticsEvent): void => {
  void client.post('/analytics/event', body).catch(() => { /* never surfaces */ })
}

// ── Verification flags ───────────────────────────────────────────────────────
export const createFlag = (payload: FlagCreatePayload): Promise<AxiosResponse<FlagCreateResult>> =>
  client.post('/flags', payload)

// `related_to` asks for one company or person AND everything reported about it —
// the node plus any relationship at either end — so the disputed badge and the
// scoped queue count the same set.
export const getFlagSummary = (
  params: { node_id?: string; from_id?: string; to_id?: string; role?: string; related_to?: string }
): Promise<AxiosResponse<FlagSummary>> =>
  client.get('/flags/summary', { params })

// Moderation (moderator/admin only on the server)
// Paged: the total for the same filters comes back in the `X-Total-Count`
// header, since the body is a bare array.
export const getFlags = (
  params: { status?: string; target_kind?: string; category?: string; related_to?: string; skip?: number; limit?: number }
): Promise<AxiosResponse<Flag[]>> =>
  client.get('/flags', { params })

export const updateFlagStatus = (id: string, status: string): Promise<AxiosResponse<{ id: string; status: string }>> =>
  client.patch(`/flags/${id}`, { status })

// Aggregated queue — one row per target+category with a count + member flag_ids.
export const getFlagGroups = (
  params: { status?: string; target_kind?: string; category?: string; related_to?: string }
): Promise<AxiosResponse<FlagGroup[]>> =>
  client.get('/flags', { params: { ...params, group: true, limit: 500 } })

// Suppress an edge flag: deletes the edge + records a re-scrape-surviving override.
export const suppressFlag = (id: string): Promise<AxiosResponse<{ id: string; flag_id: string; status: string }>> =>
  client.post(`/flags/${id}/suppress`)

export const getSuppressions = (): Promise<AxiosResponse<Suppression[]>> =>
  client.get('/flags/suppressions')

export const removeSuppression = (id: string): Promise<AxiosResponse<{ id: string; status: string }>> =>
  client.delete(`/flags/suppressions/${id}`)

// Pin a corrected OWNS value (stake % and/or ownership type) as a read-time override.
export const pinFlag = (
  id: string, body: { stake_percent?: number; ownership_type?: string }
): Promise<AxiosResponse<{ id: string; flag_id: string; status: string }>> =>
  client.post(`/flags/${id}/pin`, body)

export const getPins = (): Promise<AxiosResponse<Pin[]>> =>
  client.get('/flags/pins')

export const removePin = (id: string): Promise<AxiosResponse<{ id: string; status: string }>> =>
  client.delete(`/flags/pins/${id}`)

// Registration returns either an access token (the bootstrap/first-user admin)
// or a "verify your email" acknowledgement (everyone else).
export type RegisterResult =
  (AuthUser & { access_token: string })
  | { message: string; verification_required: true; email: string }

export const authRegister = (email: string, password: string): Promise<AxiosResponse<RegisterResult>> =>
  client.post('/auth/register', { email, password })

// Login returns an access token, or an MFA challenge when 2FA is enabled.
export type LoginResult =
  (AuthUser & { access_token: string })
  | { mfa_required: true; mfa_token: string }

export const authLogin = (email: string, password: string): Promise<AxiosResponse<LoginResult>> =>
  client.post('/auth/login', { email, password })

export const authMe = (): Promise<AxiosResponse<AuthUser>> =>
  client.get('/auth/me')

/**
 * End the session server-side, revoking the refresh token and clearing the cookie.
 *
 * Dropping the in-memory token alone would only log this tab out: the cookie
 * would still buy a new access token on the next reload.
 */
export const authLogout = (): Promise<AxiosResponse<{ message: string }>> =>
  client.post('/auth/logout')

// ── Two-factor auth (TOTP) ──────────────────────────────────────────────────
export const authMfaVerify = (mfa_token: string, code: string): Promise<AxiosResponse<AuthUser & { access_token: string }>> =>
  client.post('/auth/mfa/verify', { mfa_token, code })

export const authMfaStatus = (): Promise<AxiosResponse<{ mfa_enabled: boolean }>> =>
  client.get('/auth/mfa/status')

export const authMfaSetup = (): Promise<AxiosResponse<{ secret: string; otpauth_uri: string }>> =>
  client.post('/auth/mfa/setup')

export const authMfaEnable = (code: string): Promise<AxiosResponse<{ enabled: boolean; recovery_codes: string[] }>> =>
  client.post('/auth/mfa/enable', { code })

export const authMfaDisable = (code: string): Promise<AxiosResponse<{ enabled: boolean }>> =>
  client.post('/auth/mfa/disable', { code })

export const authVerifyEmail = (token: string): Promise<AxiosResponse<{ message: string; email?: string }>> =>
  client.post('/auth/verify-email', { token })

export const authResendVerification = (email: string): Promise<AxiosResponse<{ message: string }>> =>
  client.post('/auth/resend-verification', { email })

export const authForgotPassword = (email: string): Promise<AxiosResponse<{ message: string }>> =>
  client.post('/auth/forgot-password', { email })

export const authResetPassword = (token: string, new_password: string): Promise<AxiosResponse<{ message: string }>> =>
  client.post('/auth/reset-password', { token, new_password })

// Self-service rotation for a signed-in user — no email round-trip, so it works
// where outbound SMTP is blocked. Other sessions are revoked; this one is
// re-issued by the server, so the caller stays signed in.
export const authChangePassword = (current_password: string, new_password: string): Promise<AxiosResponse<{ message: string }>> =>
  client.post('/auth/change-password', { current_password, new_password })

// Permanent, and re-authenticated with the password so a stolen token isn't enough.
// The password travels in a DELETE body — supported here and already used elsewhere
// in this file (see keep-separate).
export const authDeleteAccount = (password: string): Promise<AxiosResponse<{ message: string }>> =>
  client.delete('/auth/me', { data: { password } })

export interface UserRecord { id: string; email: string; role: string; email_verified?: boolean; created_at?: string }
export const getUsers       = (): Promise<AxiosResponse<UserRecord[]>> => client.get('/auth/users')
export const updateUserRole = (id: string, role: string): Promise<AxiosResponse<{ message: string }>> =>
  client.patch(`/auth/users/${id}/role`, { role })
export const deleteUser     = (id: string): Promise<AxiosResponse<{ message: string }>> =>
  client.delete(`/auth/users/${id}`)

export const getScraperStatus  = (): Promise<AxiosResponse<ScraperStatus>> => client.get('/scraper/status')
export const getScraperRuns    = (limit = 50): Promise<AxiosResponse<{ count: number; runs: ScrapeRun[] }>> =>
  client.get('/scraper/runs', { params: { limit } })
// Per-source freshness/health: last run, streaks, bulk-data age. Public;
// last_error and the lock holder appear only for contributor+ (the backend
// redacts by dropping the keys).
export const getScraperHealth = (): Promise<AxiosResponse<ScraperHealth>> =>
  client.get('/scraper/health')
export const getScraperSources = (): Promise<AxiosResponse<ScraperSource[]>> => client.get('/scraper/sources')
// Set a source's data mode: 'full' draws edges, 'claims_only' records claims
// and enriches entities but never draws structure. Admin-only server-side.
export const setScraperSourceMode = (name: string, mode: 'full' | 'claims_only') =>
  client.patch(`/scraper/sources/${name}/mode`, null, { params: { mode } })

export const toggleScraperSource = (name: string): Promise<AxiosResponse<ScraperSource>> => client.patch(`/scraper/sources/${name}/toggle`)

export const runScraper = (query: string, depth = 2): Promise<AxiosResponse<ScrapeResult>> =>
  client.post('/scraper/run', { query, depth })

export const runScraperSecEdgar = (company: string): Promise<AxiosResponse<ScrapeResult>> =>
  client.post('/scraper/sec-edgar/run', null, { params: { company } })

export const runScraperOpenCorporates = (company: string): Promise<AxiosResponse<ScrapeResult>> =>
  client.post('/scraper/open-corporates/run', null, { params: { company } })

export const runScraperAll = (company: string, depth = 2): Promise<AxiosResponse<unknown>> =>
  client.post('/scraper/run-all', null, { params: { company, depth } })

// On-demand enrichment for any verified user: ensure a company is present + fresh,
// scraping the instant sources only when needed (see backend app/scraper/ondemand.py).
// `country` (ISO-2) narrows both halves of the lookup: which company in the DB
// counts as the answer, and what the sources are allowed to answer with. Without
// it, "Alphabet" searched under Germany comes back as Alphabet Inc.
// Institutional holders from Form 13F — contributor-only, quarterly-gated
// server-side (a repeat call inside the quarter answers `fresh` and fetches
// nothing), 409 until the SEC EDGAR scrape stamped the company's CIK. Slow by
// nature: one EDGAR fetch per holder, minutes for a widely-held issuer.
export interface Sec13fResult {
  status: 'ok' | 'fresh' | 'no_results' | string
  total?: number
  next_deadline?: string
}
export const runSec13f = (company: string): Promise<AxiosResponse<Sec13fResult>> =>
  client.post('/scraper/sec-13f/run', null, { params: { company } })

export const ensureScrape = (
  query: string, depth = 1, force = false, country?: string,
): Promise<AxiosResponse<EnsureResult>> =>
  client.post('/scraper/ensure', country ? { query, depth, force, country } : { query, depth, force })
