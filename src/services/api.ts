import axios from 'axios'
import type { AxiosResponse } from 'axios'
import type {
  SearchResult,
  FullProfile,
  HistoryEntry,
  ScraperStatus,
  ScrapeResult,
  ScraperSource,
  BodsImportResult,
  CountryEntityGroup,
  AuthUser,
  Source,
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

export const search = (q: string, country?: string): Promise<AxiosResponse<SearchResult[]>> =>
  client.get('/search/', { params: country ? { q, country } : { q } })

export const getCountries = (): Promise<AxiosResponse<{ country: string; count: number }[]>> =>
  client.get('/entities/countries')

export const getFullProfile = (id: string): Promise<AxiosResponse<FullProfile>> =>
  client.get(`/search/entity/${id}/full-profile`)

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

export const getEntitySources = (id: string): Promise<AxiosResponse<Source[]>> =>
  client.get(`/sources/entity/${id}`)

export const authRegister = (email: string, password: string): Promise<AxiosResponse<AuthUser & { access_token: string }>> =>
  client.post('/auth/register', { email, password })

export const authLogin = (email: string, password: string): Promise<AxiosResponse<AuthUser & { access_token: string }>> =>
  client.post('/auth/login', { email, password })

export const authMe = (): Promise<AxiosResponse<AuthUser>> =>
  client.get('/auth/me')

export const getScraperStatus  = (): Promise<AxiosResponse<ScraperStatus>> => client.get('/scraper/status')
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
