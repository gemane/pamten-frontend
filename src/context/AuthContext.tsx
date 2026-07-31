import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { authLogin, authRegister, authMe, authMfaVerify } from '../services/api'
import type { AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean; mfaToken?: string }>
  verifyMfa: (mfaToken: string, code: string) => Promise<void>
  register: (email: string, password: string) => Promise<{ verificationRequired: boolean }>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null)   // { email, role, id }
  const [loading, setLoading] = useState(true)   // checking stored token on mount

  useEffect(() => {
    const token = localStorage.getItem('owlgraph_token')
    if (!token) { setLoading(false); return }
    authMe()
      .then(({ data }) => setUser(data))
      .catch((err: unknown) => {
        // Only discard the token when the server rejected it — a network
        // blip or 5xx must not log the user out.
        const status = (err as { response?: { status?: number } }).response?.status
        if (status === 401) localStorage.removeItem('owlgraph_token')
      })
      .finally(() => setLoading(false))
  }, [])

  const storeAndSetUser = (data: AuthUser & { access_token: string }) => {
    localStorage.setItem('owlgraph_token', data.access_token)
    setUser({ id: data.id, email: data.email, role: data.role })
  }

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authLogin(email, password)
    if ('mfa_required' in data) return { mfaRequired: true, mfaToken: data.mfa_token }
    storeAndSetUser(data)
    return { mfaRequired: false }
  }, [])

  const verifyMfa = useCallback(async (mfaToken: string, code: string) => {
    const { data } = await authMfaVerify(mfaToken, code)
    storeAndSetUser(data)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const { data } = await authRegister(email, password)
    // Non-admin sign-ups get no token — they must verify their email first.
    if ('access_token' in data) {
      storeAndSetUser(data)
      return { verificationRequired: false }
    }
    return { verificationRequired: true }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('owlgraph_token')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyMfa, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
