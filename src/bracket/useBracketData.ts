import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bracket } from './BracketProvider'
import { MATCHUP_SELECT, type Matchup, type Stage, type Tally } from './useStage'

export interface VoteRow {
  matchup_id: string
  user_id: string
  entry_id: string
}

export interface BracketData {
  bracket: Bracket
  stages: Stage[]
  matchups: Matchup[]
  tallies: Record<string, Tally>
  /** RLS: everyone's votes for closed stages, plus the caller's own in the open stage. */
  votes: VoteRow[]
  names: Record<string, string>
  openStage: number | null
}

/** Everything about one bracket (active or archived). Tallies update live. */
export function useBracketData(bracketId: string | undefined) {
  const [data, setData] = useState<BracketData | null>(null)
  const [loading, setLoading] = useState(true)
  const instance = useId()

  const load = useCallback(async () => {
    if (!bracketId) return setLoading(false)
    const [b, st, ms, ts, vs, ps] = await Promise.all([
      supabase
        .from('brackets')
        .select('id, title, description, phase, created_at, nominations_opened_at, nominations_closed_at, locked_at, completed_at')
        .eq('id', bracketId)
        .maybeSingle(),
      supabase.from('stages').select('number, round, label, status').eq('bracket_id', bracketId).order('number'),
      supabase.from('matchups').select(MATCHUP_SELECT).eq('bracket_id', bracketId).order('round').order('slot'),
      supabase.from('matchup_tallies').select('matchup_id, votes_a, votes_b').eq('bracket_id', bracketId),
      supabase.from('votes').select('matchup_id, user_id, entry_id, matchups!inner(bracket_id)').eq('matchups.bracket_id', bracketId),
      supabase.from('profiles').select('id, display_name'),
    ])
    if (!b.data) {
      setData(null)
      return setLoading(false)
    }
    const stages = (st.data as Stage[]) ?? []
    setData({
      bracket: b.data as Bracket,
      stages,
      matchups: (ms.data as unknown as Matchup[]) ?? [],
      tallies: Object.fromEntries((ts.data ?? []).map((t) => [t.matchup_id, { votes_a: t.votes_a, votes_b: t.votes_b }])),
      votes: ((vs.data ?? []) as VoteRow[]).map(({ matchup_id, user_id, entry_id }) => ({ matchup_id, user_id, entry_id })),
      names: Object.fromEntries((ps.data ?? []).map((p) => [p.id, p.display_name])),
      openStage: stages.find((s) => s.status === 'open')?.number ?? null,
    })
    setLoading(false)
  }, [bracketId])

  useEffect(() => {
    load()
    if (!bracketId) return
    const channel = supabase
      .channel(`bracket-${bracketId}-${instance}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matchup_tallies', filter: `bracket_id=eq.${bracketId}` }, (payload) => {
        const t = payload.new as { matchup_id: string; votes_a: number; votes_b: number }
        setData((cur) => (cur ? { ...cur, tallies: { ...cur.tallies, [t.matchup_id]: { votes_a: t.votes_a, votes_b: t.votes_b } } } : cur))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stages', filter: `bracket_id=eq.${bracketId}` }, () => load())
      .subscribe()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [bracketId, load, instance])

  return { data, loading, reload: load }
}
