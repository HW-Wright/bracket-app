import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usernameToEmail } from '../../supabase/functions/_shared/username.ts'
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  username: string
  display_name: string
  is_admin: boolean
  must_change_password: boolean
  active: boolean
}

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  signIn: (username: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  changePassword: (password: string) => Promise<string | null>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) return setProfile(null)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, is_admin, must_change_password, active')
      .eq('id', userId)
      .maybeSingle()
    setProfile(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // Defer the query: supabase-js warns against awaiting other calls inside this callback.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => loadProfile(next?.user.id), 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      async signIn(username, password) {
        let email: string
        try {
          email = usernameToEmail(username)
        } catch {
          return 'Wrong username or password'
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (!error) return null
        return error.code === 'user_banned' ? 'This account has been deactivated' : 'Wrong username or password'
      },
      async signOut() {
        await supabase.auth.signOut()
      },
      async changePassword(password) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) {
          return error.code === 'same_password' ? 'Pick a password different from your current one' : error.message
        }
        const { error: rpcError } = await supabase.rpc('complete_password_change')
        if (rpcError) return rpcError.message
        await loadProfile(session?.user.id)
        return null
      },
    }),
    [loading, session, profile, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
