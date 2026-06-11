import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

/* ─────────────────────────────────────────
   Types & Context
───────────────────────────────────────── */
export type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  authError: string | null
  refreshSession: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred'

export const getInitials = (email?: string | null) => {
  if (!email) return 'OP'
  const [name] = email.split('@')
  const parts = name.split(/[._-]/).filter(Boolean)
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || email[0]?.toUpperCase() || 'OP'
  )
}

/* ─────────────────────────────────────────
   Hook
───────────────────────────────────────── */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

/* ─────────────────────────────────────────
   Provider
───────────────────────────────────────── */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    setAuthError(null)
    const { data, error } = await supabase.auth.getSession()
    if (error) { setAuthError(error.message); setSession(null); return }
    setSession(data.session)
  }, [])

  const signOut = useCallback(async () => {
    setAuthError(null)
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(error.message)
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) { setAuthError(error.message); setSession(null) }
        else setSession(data.session)
      })
      .catch((error) => {
        if (!mounted) return
        setAuthError(getErrorMessage(error))
        setSession(null)
      })
      .finally(() => { if (mounted) setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, loading, authError, refreshSession, signOut }),
    [authError, loading, refreshSession, session, signOut]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
