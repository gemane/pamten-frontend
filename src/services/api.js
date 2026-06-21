import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://pamten-backend-yrbh.onrender.com',
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
