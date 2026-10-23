import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

export type BracketPhase = 'draft' | 'nominations' | 'review' | 'live' | 'complete'

export interface Bracket {
  id: string
  title: string
  description: string | null
  phase: BracketPhase
  created_at: string
  nominations_opened_at: string | null
  nominations_closed_at: string | null
}

interface BracketState {
  loading: boolean
  bracket: Bracket | null
  refresh: () => Promise<void>
}

const BracketContext = createContext<BracketState | null>(null)

/** The single active (non-archived) bracket. Refetched when the app regains focus. */
export function BracketProvider({ children }: { children: ReactNode }) {
  const [bracket, setBracket] = useState<Bracket | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('brackets')
      .select('id, title, description, phase, created_at, nominations_opened_at, nominations_closed_at')
      .is('archived_at', null)
      .maybeSingle()
    setBracket(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const value = useMemo(() => ({ loading, bracket, refresh }), [loading, bracket, refresh])
  return <BracketContext.Provider value={value}>{children}</BracketContext.Provider>
}

export function useBracket(): BracketState {
  const ctx = useContext(BracketContext)
  if (!ctx) throw new Error('useBracket must be used inside BracketProvider')
  return ctx
}

export interface Progress {
  submitted: number
  total: number
}

export async function fetchProgress(bracketId: string): Promise<Progress | null> {
  const { data } = await supabase.rpc('nomination_progress', { p_bracket_id: bracketId }).single()
  return (data as Progress | null) ?? null
}

/** Supabase RPC errors carry the Postgres RAISE message, which is written to be user-facing. */
export function rpcMessage(error: { message: string } | null): string | null {
  return error ? error.message : null
}
