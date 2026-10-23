import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useBracket } from '../bracket/BracketProvider'
import { useBracketData } from '../bracket/useBracketData'
import EntryThumb from '../components/EntryThumb'
import MatchupCard from '../components/MatchupCard'
import { Badge, Card, Led } from '../components/ui'
import { ROUNDS } from '../lib/bracket'
import { entryPath, isThirdPlace, pickStatus, podium } from '../lib/stats'
import { supabase } from '../lib/supabase'
import { VoterReveal } from './bracket/BracketView'

interface EntryInfo {
  id: string
  name: string
  seed: number | null
  image_path: string | null
  bracket_id: string
  manual: boolean
}

interface Nominator {
  name: string
  rank: number
  text: string
}

export default function EntryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { bracket: active } = useBracket()
  const [entry, setEntry] = useState<EntryInfo | null>(null)
  const [stats, setStats] = useState<{ points: number; nominators: number; spellings: string[] } | null>(null)
  const [nominators, setNominators] = useState<Nominator[]>([])
  const [missing, setMissing] = useState(false)
  const { data } = useBracketData(entry?.bracket_id)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: e } = await supabase.from('entries').select('id, name, seed, image_path, bracket_id, manual').eq('id', id!).maybeSingle()
      if (cancelled) return
      if (!e) return setMissing(true)
      setEntry(e)
      // This entry plus everything merged into it.
      const { data: all } = await supabase.from('entries').select('id, merged_into').eq('bracket_id', e.bracket_id)
      const ids = new Set([e.id])
      let grew = true
      while (grew) {
        grew = false
        for (const x of all ?? []) {
          if (x.merged_into && ids.has(x.merged_into) && !ids.has(x.id)) {
            ids.add(x.id)
            grew = true
          }
        }
      }
      const [{ data: st }, { data: ns }] = await Promise.all([
        supabase.rpc('entry_standings', { p_bracket_id: e.bracket_id }),
        supabase.from('nominations').select('rank, text, user_id, profiles(display_name)').in('entry_id', [...ids]).order('rank'),
      ])
      if (cancelled) return
      const mine = ((st ?? []) as { entry_id: string; points: number; nominators: number; spellings: string[] }[]).find((s) => s.entry_id === e.id)
      setStats(mine ?? null)
      // Best rank per person (the scoring rule).
      const best = new Map<string, Nominator>()
      for (const n of (ns ?? []) as unknown as { rank: number; text: string; user_id: string; profiles: { display_name: string } | null }[]) {
        if (!best.has(n.user_id)) best.set(n.user_id, { name: n.profiles?.display_name ?? '?', rank: n.rank, text: n.text })
      }
      setNominators([...best.values()].sort((a, b) => a.rank - b.rank))
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (missing) {
    return (
      <Card>
        <p className="text-base text-muted">That entry doesn't exist any more.</p>
      </Card>
    )
  }
  if (!entry) return null

  const path = data ? entryPath(entry.id, data.matchups) : []
  const status = data ? pickStatus(entry, data.matchups, data.tallies, data.openStage) : null
  const p = data ? podium(data.matchups) : null
  const place = p?.first?.id === entry.id ? 'Champion' : p?.second?.id === entry.id ? 'Runner-up' : p?.third?.id === entry.id ? 'Third place' : null
  const statusText = !status
    ? ''
    : place ?? {
        cut: 'Missed the cut',
        out: status.kind === 'out' ? `Out in the ${ROUNDS[status.round - 1].name}` : '',
        champion: 'Champion',
        playing: status.kind === 'playing' ? `${status.state} ${status.score[0]}–${status.score[1]}` : '',
        waiting: status.kind === 'waiting' ? `Through to the ${ROUNDS[Math.min(status.round, 6) - 1].name}` : '',
      }[status.kind]

  return (
    <>
      <button type="button" onClick={() => navigate(-1)} className="mb-3 inline-flex min-h-11 items-center text-base font-bold text-orange uppercase">
        ← Back
      </button>
      <div className="mb-5 flex items-center gap-4">
        <EntryThumb name={entry.name} path={entry.image_path} size={96} />
        <div className="min-w-0">
          {data && <Badge tone={place === 'Champion' ? 'live' : 'orange'}>{statusText}</Badge>}
          <h1 className="mt-1 font-display text-3xl leading-tight uppercase">{entry.name}</h1>
          {data && (
            <Link to={entry.bracket_id === active?.id ? '/bracket' : `/archive/${entry.bracket_id}`} className="text-base font-semibold text-muted">
              {data.bracket.title}
            </Link>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2 text-center">
        {[
          [entry.seed ?? '—', 'Seed'],
          [stats?.points ?? 0, 'Points'],
          [stats?.nominators ?? 0, 'Nominators'],
        ].map(([v, l]) => (
          <div key={l} className="flex flex-col border border-line bg-navy-800 py-2">
            <span className="font-led text-3xl text-amber">{v}</span>
            <span className="label-caps">{l}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        <Card title="Nominated by">
          {nominators.length === 0 ? (
            <p className="text-base text-muted">{entry.manual ? 'Added by Harry to fill the bracket (0 points).' : 'Nobody.'}</p>
          ) : (
            <ol className="-m-4">
              {nominators.map((n) => (
                <li key={n.name} className="flex min-h-12 items-center gap-3 border-b border-line pr-3 last:border-0">
                  <Led className="flex h-12 w-11 shrink-0 items-center justify-center">#{n.rank}</Led>
                  <span className="flex-1 text-lg font-semibold">{n.name}</span>
                  {n.text.trim() !== entry.name && <span className="truncate text-sm text-muted">as “{n.text}”</span>}
                  <span className="font-led text-amber">{16 - n.rank}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {path.length > 0 && data && (
          <section className="flex flex-col gap-3">
            <Badge className="ml-1 self-start">Path through the bracket</Badge>
            {path.map((m) => {
              const closed = data.stages.find((s) => s.number === m.stage)?.status === 'closed'
              return (
                <div key={m.id} className="flex flex-col gap-1">
                  <span className="label-caps">{isThirdPlace(m) ? 'Third-place playoff' : ROUNDS[m.round - 1].name}</span>
                  <MatchupCard
                    number={m.slot + 1}
                    matchup={m}
                    tally={data.tallies[m.id]}
                    link
                    footer={closed && m.a && m.b ? <VoterReveal matchup={m} votes={data.votes} names={data.names} /> : null}
                  />
                </div>
              )
            })}
          </section>
        )}
      </div>
    </>
  )
}
