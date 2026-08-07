import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  authLogin, authRegister, authMfaVerify, authLogout,
  refreshSession, setAccessToken,
} from '../services/api'
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
  const [loading, setLoading] = useState(true)   // restoring the session on mount

  // Restore the session on load. The access token lives in memory, so a reload
  // starts with none; the httpOnly refresh cookie is what survives, and trading
  // it for a token is the whole startup check. refreshSession() resolves to null
  // rather than throwing when there is no session — the ordinary logged-out case.
  useEffect(() => {
    refreshSession()
      .then((session) => {
        if (session) {
          setUser({
            id: session.id, email: session.email, role: session.role,
            email_verified: session.email_verified,
          })
        }
      })
      // refreshSession() is contracted not to reject, but an unhandled rejection
      // here would leave the app stuck behind the loading state forever. Staying
      // signed out is the safe reading of "we could not establish a session".
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const storeAndSetUser = (data: AuthUser & { access_token: string }) => {
    setAccessToken(data.access_token)
    setUser({ id: data.id, email: data.email, role: data.role, email_verified: data.email_verified })
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

  // Clear locally first, then tell the server. The UI must reflect the logout
  // even if the request fails; the risk of skipping the call is the opposite —
  // the cookie would survive and buy a new token on the next reload.
  const logout = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    void authLogout().catch(() => { /* already logged out locally */ })
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
