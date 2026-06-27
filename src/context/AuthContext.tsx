import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { authLogin, authRegister, authMe } from '../services/api'
import type { AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null)   // { email, role, id }
  const [loading, setLoading] = useState(true)   // checking stored token on mount

  useEffect(() => {
    const token = localStorage.getItem('pamten_token')
    if (!token) { setLoading(false); return }
    authMe()
      .then(({ data }) => setUser(data))
      .catch(() => localStorage.removeItem('pamten_token'))
      .finally(() => setLoading(false))
  }, [])

  const storeAndSetUser = (data: AuthUser & { access_token: string }) => {
    localStorage.setItem('pamten_token', data.access_token)
    setUser({ id: data.id, email: data.email, role: data.role })
  }

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authLogin(email, password)
    storeAndSetUser(data)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const { data } = await authRegister(email, password)
    storeAndSetUser(data)
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

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
