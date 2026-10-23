import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MATCHUP_SELECT, type Matchup, type Stage } from './useStage'

export interface LatestResults {
  stage: Stage
  lines: string[]
}

const tag = (e: { seed: number | null; name: string } | null) => (e ? `(${e.seed}) ${e.name}` : '?')

/** Results of the most recently closed stage, as one crawl line per game. Refreshes when stages change. */
export function useLatestResults(bracketId: string | undefined, enabled: boolean) {
  const [results, setResults] = useState<LatestResults | null>(null)
  const instance = useId()

  const load = useCallback(async () => {
    if (!bracketId || !enabled) return setResults(null)
    const { data: st } = await supabase
      .from('stages')
      .select('number, round, label, status')
      .eq('bracket_id', bracketId)
      .eq('status', 'closed')
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!st) return setResults(null)
    const [{ data: ms }, { data: ts }] = await Promise.all([
      supabase.from('matchups').select(MATCHUP_SELECT).eq('bracket_id', bracketId).eq('stage', st.number).order('round').order('slot'),
      supabase.from('matchup_tallies').select('matchup_id, votes_a, votes_b').eq('bracket_id', bracketId).eq('stage', st.number),
    ])
    const tallies = new Map((ts ?? []).map((t) => [t.matchup_id, t]))
    const lines = ((ms ?? []) as unknown as Matchup[])
      .filter((m) => m.winner)
      .map((m) => {
        const t = tallies.get(m.id)
        const aWon = m.winner === m.a?.id
        const [w, l] = aWon ? [m.a, m.b] : [m.b, m.a]
        const [wv, lv] = aWon ? [t?.votes_a ?? 0, t?.votes_b ?? 0] : [t?.votes_b ?? 0, t?.votes_a ?? 0]
        const prefix = m.round === 6 ? (m.slot === 0 ? 'FINAL: ' : '3RD PLACE: ') : ''
        const how = m.decided_by === 'coin_toss' ? ' (COIN TOSS)' : m.decided_by === 'admin' ? ' (ADMIN)' : ''
        const upset = w?.seed != null && l?.seed != null && w.seed > l.seed ? ' UPSET!' : ''
        return `${prefix}${tag(w)} ${wv}–${lv} ${tag(l)}${how}${upset}`
      })
    setResults(lines.length ? { stage: st as Stage, lines } : null)
  }, [bracketId, enabled])

  useEffect(() => {
    load()
    if (!bracketId || !enabled) return
    const channel = supabase
      .channel(`results-${bracketId}-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stages', filter: `bracket_id=eq.${bracketId}` }, () => load())
      .subscribe()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [bracketId, enabled, load, instance])

  return results
}
