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
  BodsImportResult,
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
} from '../types'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://pamten-backend-yrbh.onrender.com',
})

// Attach JWT token to every request if present
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('pamten_token')
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

export const authRegister = (email: string, password: string): Promise<AxiosResponse<AuthUser & { access_token: string }>> =>
  client.post('/auth/register', { email, password })

export const authLogin = (email: string, password: string): Promise<AxiosResponse<AuthUser & { access_token: string }>> =>
  client.post('/auth/login', { email, password })

export const authMe = (): Promise<AxiosResponse<AuthUser>> =>
  client.get('/auth/me')

export interface UserRecord { id: string; email: string; role: string; created_at?: string }
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

export const runBodsGleif = (
  params: { limit?: number; filter_jurisdiction?: string; local_file?: string }
): Promise<AxiosResponse<BodsImportResult>> =>
  client.post('/scraper/bods/gleif/run', null, { params })

export const runBodsUkPsc = (
  params: { limit?: number; local_file?: string }
): Promise<AxiosResponse<BodsImportResult>> =>
  client.post('/scraper/bods/uk-psc/run', null, { params })
