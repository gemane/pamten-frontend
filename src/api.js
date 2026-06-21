const BASE_URL = import.meta.env.VITE_API_URL || 'https://pamten-backend-yrbh.onrender.com'

export async function search(query) {
  const res = await fetch(`${BASE_URL}/search/?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('Search failed')
  return res.json()
}

export async function getFullProfile(entityId) {
  const res = await fetch(`${BASE_URL}/search/entity/${entityId}/full-profile`)
  if (!res.ok) throw new Error('Failed to load profile')
  return res.json()
}
