import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useBracketData } from '../bracket/useBracketData'
import { ROUNDS } from '../lib/bracket'
import { isAlive, pickStatus, type PickStatus } from '../lib/stats'
import { supabase } from '../lib/supabase'
import { Card, Led } from './ui'

interface Pick {
  entryId: string
  name: string
  seed: number | null
  rank: number
}

const ORDER: Record<PickStatus['kind'], number> = { champion: 0, playing: 1, waiting: 2, out: 3, cut: 4 }

function label(s: PickStatus): [string, string] {
  switch (s.kind) {
    case 'champion':
      return ['CHAMPION', 'text-yellow']
    case 'playing':
      return [`${s.state.toUpperCase()} ${s.score[0]}–${s.score[1]}`, s.state === 'leading' ? 'text-yellow' : s.state === 'tied' ? 'text-danger' : 'text-muted']
    case 'waiting':
      return [s.round > 6 ? 'THROUGH' : `INTO ${ROUNDS[s.round - 1].name.toUpperCase()}`, 'text-muted']
    case 'out':
      return [`OUT · ${ROUNDS[s.round - 1].name.replace('Round of ', 'R').toUpperCase()}`, 'text-muted']
    case 'cut':
      return ['MISSED THE CUT', 'text-muted']
  }
}

/** Home: how many of your 15 nominations are still in the bracket, and how each is doing. */
export default function PicksAlive({ bracketId }: { bracketId: string }) {
  const { profile } = useAuth()
  const { data } = useBracketData(bracketId)
  const [picks, setPicks] = useState<Pick[] | null>(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    if (!profile) return
    ;(async () => {
      const [{ data: ns }, { data: es }] = await Promise.all([
        supabase.from('nominations').select('rank, entry_id').eq('bracket_id', bracketId).eq('user_id', profile.id).order('rank'),
        supabase.from('entries').select('id, name, seed, merged_into').eq('bracket_id', bracketId),
      ])
      const byId = new Map((es ?? []).map((e) => [e.id, e]))
      const root = (id: string) => {
        let e = byId.get(id)
        for (let i = 0; e?.merged_into && i < 64; i++) e = byId.get(e.merged_into)
        return e
      }
      // One row per entry: two of your picks merged together count once, at your better rank.
      const seen = new Map<string, Pick>()
      for (const n of ns ?? []) {
        const e = n.entry_id ? root(n.entry_id) : undefined
        if (e && !seen.has(e.id)) seen.set(e.id, { entryId: e.id, name: e.name, seed: e.seed, rank: n.rank })
      }
      setPicks([...seen.values()])
    })()
  }, [bracketId, profile])

  if (!data || !picks) return null
  if (picks.length === 0) {
    return (
      <Card title="Your picks">
        <p className="text-base text-muted">Your list wasn't complete when nominations closed, so none of your picks are in this one.</p>
      </Card>
    )
  }

  const rows = picks
    .map((p) => ({ ...p, status: pickStatus({ id: p.entryId, seed: p.seed }, data.matchups, data.tallies, data.openStage) }))
    .sort((a, b) => ORDER[a.status.kind] - ORDER[b.status.kind] || a.rank - b.rank)
  const alive = rows.filter((r) => isAlive(r.status)).length
  const shown = all ? rows : rows.slice(0, 5)

  return (
    <Card title="Your picks still alive" aside={<Led className="py-0.5 text-xl">{`${alive}/${rows.length}`}</Led>}>
      <ol className="-m-4">
        {shown.map((r) => {
          const [text, tone] = label(r.status)
          const dead = !isAlive(r.status)
          return (
            <li key={r.entryId} className="border-b border-line last:border-0">
              <Link to={`/entry/${r.entryId}`} className={`flex min-h-11 items-center gap-3 pr-3 hover:bg-navy-700 ${dead ? 'text-muted/80' : ''}`}>
                <Led className="flex h-11 w-11 shrink-0 items-center justify-center">{r.seed ?? '—'}</Led>
                <span className={`min-w-0 flex-1 truncate text-lg font-semibold ${dead ? 'line-through' : ''}`}>{r.name}</span>
                <span className={`shrink-0 text-sm font-bold tracking-wider ${tone}`}>{text}</span>
              </Link>
            </li>
          )
        })}
      </ol>
      {rows.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="-mx-4 -mb-4 mt-4 min-h-11 w-[calc(100%+2rem)] border-t border-line text-base font-bold tracking-wider text-orange uppercase">
          All {rows.length} picks ▸
        </button>
      )}
    </Card>
  )
}
