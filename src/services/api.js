import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://pamten-backend-yrbh.onrender.com',
})

// Attach JWT token to every request if present
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('pamten_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const search = (q) =>
  client.get('/search/', { params: { q } })

export const getFullProfile = (id) =>
  client.get(`/search/entity/${id}/full-profile`)

export const getOwnershipTree = (id, depth = 3) =>
  client.get(`/relationships/ownership-tree/${id}`, { params: { depth } })

export const getOwners = (id) =>
  client.get(`/relationships/owners/${id}`)

export const getHistory = (id) =>
  client.get(`/relationships/history/${id}`)

export const getEntity = (id) =>
  client.get(`/entities/${id}`)

export const getPerson = (id) =>
  client.get(`/persons/${id}`)

export const getEntitiesByCountry = () =>
  client.get('/entities/by-country')

export const authRegister = (email, password) =>
  client.post('/auth/register', { email, password })

export const authLogin = (email, password) =>
  client.post('/auth/login', { email, password })

export const authMe = () =>
  client.get('/auth/me')

export const getScraperStatus  = () => client.get('/scraper/status')
export const getScraperSources = () => client.get('/scraper/sources')
export const toggleScraperSource = (name) => client.patch(`/scraper/sources/${name}/toggle`)

export const runScraper = (query, depth = 2) =>
  client.post('/scraper/run', { query, depth })
