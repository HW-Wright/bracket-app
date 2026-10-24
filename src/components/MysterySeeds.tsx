import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { ROUNDS } from '../lib/bracket'
import { supabase } from '../lib/supabase'
import EntryThumb from './EntryThumb'
import { Card } from './ui'

interface Row {
  position: number
  user_id: string
  display_name: string
  is_mine: boolean
  revealed: boolean
  status: 'alive' | 'out' | 'champion'
  out_round: number | null
  entry_id: string | null
  entry_name: string | null
  entry_seed: number | null
  image_path: string | null
}

/** "?" in a dark box: an entry nobody (but its owner) knows yet. */
function Mystery() {
  return (
    <span className="led flex h-9 w-9 shrink-0 items-center justify-center border border-line" aria-label="Hidden">
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <path d="M9 9a3 3 0 1 1 4.2 2.75c-.8.37-1.2 1-1.2 1.85V14" />
        <path d="M12 18h.01" />
      </svg>
    </span>
  )
}

/**
 * Home: every player's secret entry, listed in seed order (best first) without seed numbers. Each one is
 * revealed when it goes out or wins; you always see your own. The server decides what each viewer gets.
 */
export default function MysterySeeds({ bracketId }: { bracketId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const instance = useId()

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('mystery_board', { p_bracket_id: bracketId })
    setRows((data as Row[]) ?? [])
  }, [bracketId])

  useEffect(() => {
    load()
    // Reveals happen when a stage closes (or is undone).
    const channel = supabase
      .channel(`mystery-${bracketId}-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stages', filter: `bracket_id=eq.${bracketId}` }, () => load())
      .subscribe()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [bracketId, load, instance])

  if (!rows || rows.length === 0) return null
  const hidden = rows.filter((r) => !r.revealed).length

  return (
    <Card title="Mystery seeds" aside={<span className="text-sm font-extrabold tracking-wide uppercase">{hidden} still hidden</span>}>
      <p className="-mt-1 mb-3 text-base text-muted">
        Everyone was dealt a secret entry, listed best seed first. Each one is revealed when it goes out, or wins.
      </p>
      <ol className="-mx-4 -mb-4">
        {rows.map((r) => {
          const tag =
            r.status === 'champion'
              ? ['CHAMPION', 'bg-yellow text-navy-950']
              : r.status === 'out'
                ? [`OUT · ${r.out_round === 6 ? 'FINAL' : ROUNDS[(r.out_round ?? 1) - 1].name.replace('Round of ', 'R').toUpperCase()}`, 'bg-navy-900 text-muted']
                : null
          return (
            <li key={r.user_id} className={`flex min-h-14 items-center gap-3 border-t border-line pr-3 ${r.is_mine ? 'bg-navy-700/60' : ''}`}>
              <span className="flex h-14 w-11 shrink-0 items-center justify-center bg-navy-900 text-lg font-extrabold italic">{r.position}</span>
              <span className="w-[30%] shrink-0 truncate text-lg font-bold">
                {r.display_name}
                {r.is_mine && <span className="block text-xs font-extrabold tracking-wider text-orange uppercase">You</span>}
              </span>
              <span className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
                {r.entry_id && r.entry_name ? (
                  <Link to={`/entry/${r.entry_id}`} className="flex min-w-0 items-center gap-2.5">
                    <span className="flex min-w-0 flex-col items-end text-right">
                      <span className={`truncate text-base font-bold ${r.status === 'out' ? 'text-muted line-through' : ''}`}>{r.entry_name}</span>
                      {tag ? (
                        <span className={`px-1.5 text-[11px] font-extrabold tracking-wider ${tag[1]}`}>{tag[0]}</span>
                      ) : (
                        <span className="text-[11px] font-extrabold tracking-wider text-orange uppercase">Only you can see this</span>
                      )}
                    </span>
                    <EntryThumb name={r.entry_name} path={r.image_path} size={36} />
                  </Link>
                ) : (
                  <Mystery />
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
