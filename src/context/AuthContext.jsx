import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authLogin, authRegister, authMe } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)   // { email, role, id }
  const [loading, setLoading] = useState(true)   // checking stored token on mount

  useEffect(() => {
    const token = localStorage.getItem('pamten_token')
    if (!token) { setLoading(false); return }
    authMe()
      .then(({ data }) => setUser(data))
      .catch(() => localStorage.removeItem('pamten_token'))
      .finally(() => setLoading(false))
  }, [])

  const storeAndSetUser = (data) => {
    localStorage.setItem('pamten_token', data.access_token)
    setUser({ id: data.id, email: data.email, role: data.role })
  }

  const login = useCallback(async (email, password) => {
    const { data } = await authLogin(email, password)
    storeAndSetUser(data)
    return data
  }, [])

  const register = useCallback(async (email, password) => {
    const { data } = await authRegister(email, password)
    storeAndSetUser(data)
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('pamten_token')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
