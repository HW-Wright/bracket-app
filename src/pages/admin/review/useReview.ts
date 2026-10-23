import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export interface Standing {
  entry_id: string
  name: string
  points: number
  nominators: number
  manual: boolean
  removed: boolean
  image_path: string | null
  seed: number | null
  merged_count: number
  spellings: string[]
  position: number | null
}

export interface MergedChild {
  id: string
  name: string
  merged_into: string
}

export interface Suggestion {
  entry_a: string
  name_a: string
  entry_b: string
  name_b: string
  score: number
}

export interface RawNomination {
  id: string
  user_id: string
  rank: number
  text: string
  entry_id: string | null
  profiles: { display_name: string } | null
}

export interface ReviewData {
  standings: Standing[]
  children: MergedChild[]
  suggestions: Suggestion[]
  nominations: RawNomination[]
}

export function useReview(bracketId: string) {
  const [data, setData] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!bracketId) return
    const [st, ch, sg, nm] = await Promise.all([
      supabase.rpc('entry_standings', { p_bracket_id: bracketId }),
      supabase.from('entries').select('id, name, merged_into').eq('bracket_id', bracketId).not('merged_into', 'is', null),
      supabase.rpc('duplicate_suggestions', { p_bracket_id: bracketId }),
      supabase
        .from('nominations')
        .select('id, user_id, rank, text, entry_id, profiles(display_name)')
        .eq('bracket_id', bracketId)
        .order('user_id')
        .order('rank'),
    ])
    const firstError = st.error ?? ch.error ?? sg.error ?? nm.error
    if (firstError) return setError(firstError.message)
    setError(null)
    setData({
      standings: (st.data as Standing[]) ?? [],
      children: (ch.data as MergedChild[]) ?? [],
      suggestions: (sg.data as Suggestion[]) ?? [],
      nominations: (nm.data as unknown as RawNomination[]) ?? [],
    })
  }, [bracketId])

  useEffect(() => {
    reload()
  }, [reload])

  /** Run an RPC, then reload. Returns the error message, if any. */
  const act = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<string | null> => {
      const { error } = await supabase.rpc(fn, args)
      await reload()
      return error?.message ?? null
    },
    [reload],
  )

  return { data, error, reload, act }
}

/** Resolve any entry id to its top-level (merged-into) entry id. */
export function rootOf(entryId: string, children: MergedChild[]): string {
  const parent = new Map(children.map((c) => [c.id, c.merged_into]))
  let id = entryId
  for (let i = 0; i < 64 && parent.has(id); i++) id = parent.get(id)!
  return id
}
