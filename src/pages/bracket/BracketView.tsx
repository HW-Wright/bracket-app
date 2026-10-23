import { useState } from 'react'
import { Link } from 'react-router'
import type { BracketData, VoteRow } from '../../bracket/useBracketData'
import type { EntryRef, Matchup } from '../../bracket/useStage'
import EntryThumb from '../../components/EntryThumb'
import MatchupCard from '../../components/MatchupCard'
import { Badge, Card } from '../../components/ui'
import { ROUNDS } from '../../lib/bracket'
import { entryPath, isThirdPlace, podium, winnerOf } from '../../lib/stats'

/** Who voted for which side, once the stage has closed. */
export function VoterReveal({ matchup, votes, names }: { matchup: Matchup; votes: VoteRow[]; names: Record<string, string> }) {
  const mine = votes.filter((v) => v.matchup_id === matchup.id)
  const side = (e: EntryRef | null) =>
    e
      ? mine
          .filter((v) => v.entry_id === e.id)
          .map((v) => names[v.user_id] ?? '?')
          .sort()
      : []
  const rows: [EntryRef | null, string[]][] = [
    [matchup.a, side(matchup.a)],
    [matchup.b, side(matchup.b)],
  ]
  return (
    <div className="mx-1.5 mt-1 flex flex-col gap-1 border-t border-line pt-2 text-sm">
      {mine.length === 0 ? (
        <span className="font-semibold text-muted">Nobody voted.</span>
      ) : (
        rows.map(([e, who]) => (
          <span key={e?.id ?? 'x'} className="flex gap-2">
            <span className="shrink-0 font-bold text-muted uppercase">{e?.name}:</span>
            <span className="font-semibold">{who.length ? who.join(', ') : '—'}</span>
          </span>
        ))
      )}
    </div>
  )
}

function ChampionCard({ data }: { data: BracketData }) {
  const p = podium(data.matchups)
  if (!p.first) return null
  const path = entryPath(p.first.id, data.matchups).filter((m) => !isThirdPlace(m))
  const place = (label: string, e: EntryRef | null, tone: string) =>
    e && (
      <Link to={`/entry/${e.id}`} className="flex min-h-14 items-center gap-3 border border-line bg-navy-800 pr-3">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center font-display text-xl text-navy-950 ${tone}`}>{label}</span>
        <EntryThumb name={e.name} path={e.image_path} size={40} />
        <span className="min-w-0 flex-1 truncate text-lg font-bold">{e.name}</span>
        <span className="led px-2 font-led text-amber">#{e.seed}</span>
      </Link>
    )

  return (
    <section className="mb-8 flex flex-col gap-4" aria-label="Champion">
      <div className="relative overflow-hidden border-2 border-orange bg-navy-800 px-4 pt-5 pb-6 text-center shadow-[6px_6px_0_var(--color-yellow)]">
        <Badge tone="live" className="mb-3">
          Champion
        </Badge>
        <div className="mx-auto mb-3 w-fit motion-safe:animate-[champ_700ms_ease-out_both]">
          <EntryThumb name={p.first.name} path={p.first.image_path} size={120} />
        </div>
        <h2 className="font-display text-4xl leading-tight uppercase italic motion-safe:animate-[champ_700ms_150ms_ease-out_both]">{p.first.name}</h2>
        <p className="mt-2 text-base font-bold tracking-wider text-muted uppercase">
          Seed <span className="font-led text-amber">{p.first.seed}</span> · {data.bracket.title}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {place('1ST', p.first, 'bg-yellow')}
        {place('2ND', p.second, 'bg-muted')}
        {place('3RD', p.third, 'bg-orange')}
      </div>
      <Card title="Road to the title">
        <ol className="-m-4">
          {path.map((m) => {
            const opp = m.a?.id === p.first!.id ? m.b : m.a
            const t = data.tallies[m.id]
            const [mine, theirs] = m.a?.id === p.first!.id ? [t?.votes_a ?? 0, t?.votes_b ?? 0] : [t?.votes_b ?? 0, t?.votes_a ?? 0]
            return (
              <li key={m.id} className="flex min-h-12 items-center gap-3 border-b border-line px-3 last:border-0">
                <span className="w-24 shrink-0 text-sm font-bold text-muted uppercase">{ROUNDS[m.round - 1].name}</span>
                <span className="min-w-0 flex-1 truncate text-base font-semibold">
                  beat {opp?.name} <span className="text-muted">({opp?.seed})</span>
                </span>
                <span className="font-led text-amber">
                  {mine}–{theirs}
                </span>
                {m.decided_by !== 'votes' && <span className="text-xs font-bold text-yellow uppercase">{m.decided_by === 'admin' ? 'admin' : 'toss'}</span>}
              </li>
            )
          })}
        </ol>
      </Card>
    </section>
  )
}

function TreeBox({ m, data }: { m: Matchup; data: BracketData }) {
  const t = data.tallies[m.id]
  const line = (e: EntryRef | null, votes: number) => {
    const won = m.winner && m.winner === e?.id
    const lost = m.winner && m.winner !== e?.id
    return (
      <span className={`flex items-center gap-1.5 px-1.5 ${won ? 'bg-orange text-navy-950' : ''} ${lost ? 'opacity-55' : ''}`}>
        <span className="w-5 shrink-0 text-right font-led text-xs">{e?.seed ?? ''}</span>
        <span className={`min-w-0 flex-1 truncate text-sm ${won ? 'font-extrabold' : 'font-semibold'}`}>{e?.name ?? '—'}</span>
        <span className="font-led text-xs">{e ? votes : ''}</span>
      </span>
    )
  }
  return (
    <div className="w-40 border border-line bg-navy-800 py-0.5">
      {line(m.a, t?.votes_a ?? 0)}
      {line(m.b, t?.votes_b ?? 0)}
    </div>
  )
}

/** Horizontally scrollable tree of rounds that have both entries known. */
function Tree({ data }: { data: BracketData }) {
  const rounds = ROUNDS.map((r) => data.matchups.filter((m) => m.round === r.round && !isThirdPlace(m))).filter((ms) => ms.some((m) => m.a && m.b))
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex gap-3" style={{ height: 32 * 54 }}>
        {rounds.map((ms, i) => (
          <div key={i} className="flex shrink-0 flex-col">
            <span className="label-caps mb-1 h-5">{ROUNDS[ms[0].round - 1].name}</span>
            <div className="flex flex-1 flex-col justify-around">
              {ms.map((m) => (
                <TreeBox key={m.id} m={m} data={data} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BracketView({ data }: { data: BracketData }) {
  const roundsWithGames = ROUNDS.filter((r) => data.matchups.some((m) => m.round === r.round && (m.a || m.b)))
  const openRound = data.stages.find((s) => s.number === data.openStage)?.round
  const [round, setRound] = useState<number>(openRound ?? roundsWithGames.at(-1)?.round ?? 1)
  const [view, setView] = useState<'list' | 'tree'>('tree')

  if (data.matchups.length === 0) {
    return (
      <Card>
        <p className="text-base text-muted">The bracket appears once Harry locks the seeding.</p>
      </Card>
    )
  }

  const closed = (m: Matchup) => data.stages.find((s) => s.number === m.stage)?.status === 'closed'
  const games = data.matchups.filter((m) => m.round === round)

  return (
    <>
      {data.bracket.phase === 'complete' && <ChampionCard data={data} />}

      <div className="mb-3 flex gap-2">
        {(['tree', 'list'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`slant min-h-11 px-4 text-base font-extrabold tracking-wider uppercase ${view === v ? 'bg-white text-navy-950' : 'bg-navy-800 text-muted'}`}
          >
            {v === 'list' ? 'Round by round' : 'Bracket tree'}
          </button>
        ))}
      </div>

      {view === 'tree' ? (
        <Tree data={data} />
      ) : (
        <>
          <div role="tablist" className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1">
            {roundsWithGames.map((r) => (
              <button
                key={r.round}
                role="tab"
                aria-selected={round === r.round}
                onClick={() => setRound(r.round)}
                className={`slant min-h-11 shrink-0 px-3 text-base font-extrabold tracking-wider uppercase ${round === r.round ? 'bg-orange text-navy-950' : 'bg-navy-800 text-muted'}`}
              >
                {r.round === 6 ? 'Final' : r.name.replace('Round of ', 'R')}
                {r.round === openRound && <span className="ml-1.5 text-danger">●</span>}
              </button>
            ))}
          </div>
          {round === openRound && (
            <p className="mb-3 text-base text-muted">
              Voting is open: tallies are live and voters are revealed when the stage closes.{' '}
              <Link to="/vote" className="font-bold text-orange">
                Vote ▸
              </Link>
            </p>
          )}
          <div className="flex flex-col gap-4">
            {games.map((m, i) => (
              <MatchupCard
                key={m.id}
                number={i + 1}
                matchup={m}
                tally={data.tallies[m.id]}
                link
                footer={closed(m) && m.a && m.b ? <VoterReveal matchup={m} votes={data.votes} names={data.names} /> : null}
              />
            ))}
          </div>
          {round === 6 && games[0] && winnerOf(games[0]) === null && <p className="mt-4 text-base text-muted">The final and third-place playoff are decided together.</p>}
        </>
      )}
    </>
  )
}
