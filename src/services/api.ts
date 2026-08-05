import axios from 'axios'
import type { AxiosResponse } from 'axios'
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
} from '../types'

// The backend serves everything under /v1. It still answers on the unversioned
// paths, but those are deprecated and hidden from the schema, so the prefix is
// appended here once rather than on ~50 call sites. VITE_API_URL stays the bare
// origin — don't put /v1 in the env var too, or requests go to /v1/v1.
export const API_BASE = import.meta.env.VITE_API_URL || 'https://pamten-backend-yrbh.onrender.com'

const client = axios.create({
  baseURL: `${API_BASE.replace(/\/+$/, '')}/v1`,
})

// Attach JWT token to every request if present
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('owlgraph_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
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

client.interceptors.response.use(
  res => res,
  err => {
    if (_onUnauthorized && shouldNotifyUnauthorized(err.response?.status, err.config?.url)) {
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

export const getEntitiesByCountry = (): Promise<AxiosResponse<CountryEntityGroup[]>> =>
  client.get('/entities/by-country')

export const getCountryEntities = (country: string, limit = 200): Promise<AxiosResponse<Entity[]>> =>
  client.get(`/entities/by-country/${encodeURIComponent(country)}`, { params: { limit } })

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

// ── Verification flags ───────────────────────────────────────────────────────
export const createFlag = (payload: FlagCreatePayload): Promise<AxiosResponse<FlagCreateResult>> =>
  client.post('/flags', payload)

export const getFlagSummary = (
  params: { node_id?: string; from_id?: string; to_id?: string; role?: string }
): Promise<AxiosResponse<FlagSummary>> =>
  client.get('/flags/summary', { params })

// Moderation (moderator/admin only on the server)
export const getFlags = (
  params: { status?: string; target_kind?: string; category?: string; limit?: number }
): Promise<AxiosResponse<Flag[]>> =>
  client.get('/flags', { params })

export const updateFlagStatus = (id: string, status: string): Promise<AxiosResponse<{ id: string; status: string }>> =>
  client.patch(`/flags/${id}`, { status })

// Aggregated queue — one row per target+category with a count + member flag_ids.
export const getFlagGroups = (
  params: { status?: string; target_kind?: string; category?: string }
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
// where outbound SMTP is blocked. Other sessions stay signed in (tokens are stateless).
export const authChangePassword = (current_password: string, new_password: string): Promise<AxiosResponse<{ message: string }>> =>
  client.post('/auth/change-password', { current_password, new_password })

export interface UserRecord { id: string; email: string; role: string; email_verified?: boolean; created_at?: string }
export const getUsers       = (): Promise<AxiosResponse<UserRecord[]>> => client.get('/auth/users')
export const updateUserRole = (id: string, role: string): Promise<AxiosResponse<{ message: string }>> =>
  client.patch(`/auth/users/${id}/role`, { role })
export const deleteUser     = (id: string): Promise<AxiosResponse<{ message: string }>> =>
  client.delete(`/auth/users/${id}`)

export const getScraperStatus  = (): Promise<AxiosResponse<ScraperStatus>> => client.get('/scraper/status')
export const getScraperRuns    = (limit = 50): Promise<AxiosResponse<{ count: number; runs: ScrapeRun[] }>> =>
  client.get('/scraper/runs', { params: { limit } })
export const getScraperSources = (): Promise<AxiosResponse<ScraperSource[]>> => client.get('/scraper/sources')
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
export const ensureScrape = (query: string, depth = 1, force = false): Promise<AxiosResponse<EnsureResult>> =>
  client.post('/scraper/ensure', { query, depth, force })
