import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface EntryRef {
  id: string
  name: string
  seed: number | null
  image_path: string | null
}

export interface Matchup {
  id: string
  round: number
  slot: number
  stage: number
  winner: string | null
  decided_by: 'votes' | 'coin_toss' | 'admin' | null
  a: EntryRef | null
  b: EntryRef | null
}

export interface Tally {
  votes_a: number
  votes_b: number
}

export interface Stage {
  number: number
  round: number
  label: string
  status: 'pending' | 'open' | 'closed'
}

export const MATCHUP_SELECT =
  'id, round, slot, stage, winner, decided_by, a:entries!matchups_entry_a_fkey(id, name, seed, image_path), b:entries!matchups_entry_b_fkey(id, name, seed, image_path)'

/** The open stage: its matchups, live tallies (Realtime), your votes and the anonymous voter count. */
export function useOpenStage(bracketId: string | undefined) {
  const [stage, setStage] = useState<Stage | null>(null)
  const [matchups, setMatchups] = useState<Matchup[]>([])
  const [tallies, setTallies] = useState<Record<string, Tally>>({})
  const [myVotes, setMyVotes] = useState<Record<string, string>>({})
  const [voters, setVoters] = useState<{ voters: number; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const instance = useId()

  const loadProgress = useCallback(async (b: string, n: number) => {
    const { data } = await supabase.rpc('stage_progress', { p_bracket_id: b, p_stage: n }).single()
    setVoters((data as { voters: number; total: number }) ?? null)
  }, [])

  const load = useCallback(async () => {
    if (!bracketId) return setLoading(false)
    const { data: st } = await supabase
      .from('stages')
      .select('number, round, label, status')
      .eq('bracket_id', bracketId)
      .eq('status', 'open')
      .maybeSingle()
    setStage(st as Stage | null)
    if (!st) {
      setMatchups([])
      setLoading(false)
      return
    }
    const [{ data: ms }, { data: ts }, { data: vs }] = await Promise.all([
      supabase.from('matchups').select(MATCHUP_SELECT).eq('bracket_id', bracketId).eq('stage', st.number).order('round').order('slot'),
      supabase.from('matchup_tallies').select('matchup_id, votes_a, votes_b').eq('bracket_id', bracketId).eq('stage', st.number),
      // RLS: while the stage is open this is only the caller's own votes.
      supabase.from('votes').select('matchup_id, entry_id, user_id'),
    ])
    const { data: auth } = await supabase.auth.getUser()
    setMatchups((ms as unknown as Matchup[]) ?? [])
    setTallies(Object.fromEntries((ts ?? []).map((t) => [t.matchup_id, { votes_a: t.votes_a, votes_b: t.votes_b }])))
    setMyVotes(Object.fromEntries((vs ?? []).filter((v) => v.user_id === auth.user?.id).map((v) => [v.matchup_id, v.entry_id])))
    await loadProgress(bracketId, st.number)
    setLoading(false)
  }, [bracketId, loadProgress])

  useEffect(() => {
    load()
    if (!bracketId) return
    const channel = supabase
      .channel(`stage-${bracketId}-${instance}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matchup_tallies', filter: `bracket_id=eq.${bracketId}` },
        (payload) => {
          const t = payload.new as { matchup_id: string; votes_a: number; votes_b: number; stage: number }
          setTallies((cur) => ({ ...cur, [t.matchup_id]: { votes_a: t.votes_a, votes_b: t.votes_b } }))
          loadProgress(bracketId, t.stage)
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stages', filter: `bracket_id=eq.${bracketId}` }, () => load())
      .subscribe()
    // Fallback when Realtime drops (phones sleeping): refetch whenever the app comes back.
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [bracketId, load, loadProgress, instance])

  /** Tap to vote, tap the other to switch, tap your choice again to clear. Optimistic. */
  const vote = useCallback(
    async (matchup: Matchup, entryId: string): Promise<string | null> => {
      const current = myVotes[matchup.id]
      const next = current === entryId ? null : entryId
      setMyVotes((cur) => {
        const copy = { ...cur }
        if (next) copy[matchup.id] = next
        else delete copy[matchup.id]
        return copy
      })
      const { error } = await supabase.rpc('cast_vote', { p_matchup_id: matchup.id, p_entry_id: next })
      if (error) {
        await load()
        return error.message
      }
      return null
    },
    [myVotes, load],
  )

  return { loading, stage, matchups, tallies, myVotes, voters, vote, reload: load }
}
