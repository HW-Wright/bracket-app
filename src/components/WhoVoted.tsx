import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import type { BracketData } from '../bracket/useBracketData'
import { useBracketData } from '../bracket/useBracketData'
import type { EntryRef, Matchup } from '../bracket/useStage'
import { ROUNDS } from '../lib/bracket'
import { isThirdPlace, playerPicks } from '../lib/stats'
import { Card, Led } from './ui'

type Mode = 'player' | 'match'

/** Rounds whose stage has closed (so everyone's votes are visible), oldest first. */
export function closedRounds(data: BracketData): number[] {
  return [...new Set(data.stages.filter((s) => s.status === 'closed').map((s) => s.round))].sort((a, b) => a - b)
}

const shortRound = (round: number) => (round === 6 ? 'Final' : ROUNDS[round - 1].name.replace('Round of ', 'R'))
const gameTitle = (m: Matchup, i: number) => (isThirdPlace(m) ? 'Third place' : m.round === 6 ? 'The final' : `Match ${i + 1}`)

function NameChip({ name, mine }: { name: string; mine: boolean }) {
  return <span className={`px-1.5 text-sm font-extrabold tracking-wide uppercase ${mine ? 'bg-orange text-navy-950' : 'bg-navy-900 text-white'}`}>{name}</span>
}

function ByMatch({ data, games, me }: { data: BracketData; games: Matchup[]; me?: string }) {
  return (
    <ol className="-mx-4 -mb-4">
      {games.map((m, i) => {
        const t = data.tallies[m.id]
        const side = (e: EntryRef | null, votes: number) => {
          const who = data.votes
            .filter((v) => v.matchup_id === m.id && v.entry_id === e?.id)
            .map((v) => v.user_id)
            .sort((x, y) => (data.names[x] ?? '').localeCompare(data.names[y] ?? ''))
          const won = !!m.winner && m.winner === e?.id
          return (
            <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-x-2.5 gap-y-1 px-3 py-1.5">
              <span className={`flex h-[30px] items-center justify-center text-lg font-extrabold text-navy-950 ${won ? 'bg-orange' : 'bg-white'}`}>{votes}</span>
              <Link to={`/entry/${e?.id}`} className={`flex min-h-[30px] min-w-0 items-center gap-1.5 text-[17px] leading-tight ${won ? 'font-extrabold' : 'font-bold text-white/70'}`}>
                <span className="shrink-0 text-sm font-extrabold text-muted">({e?.seed})</span>
                <span className="truncate">{e?.name}</span>
                {won && <span className="shrink-0 text-xs font-extrabold tracking-wider text-orange">WIN</span>}
              </Link>
              <span className="col-start-2 flex flex-wrap gap-1">
                {who.length ? who.map((u) => <NameChip key={u} name={data.names[u] ?? '?'} mine={u === me} />) : <span className="text-sm font-semibold text-muted">No votes</span>}
              </span>
            </div>
          )
        }
        return (
          <li key={m.id} className="border-t border-line pb-1">
            <p className="bg-navy-900 px-3 py-0.5 text-sm font-extrabold tracking-wider uppercase italic">
              {gameTitle(m, i)}
              {m.decided_by === 'coin_toss' && <span className="ml-2 bg-yellow px-1.5 text-xs text-navy-950 not-italic">COIN TOSS</span>}
              {m.decided_by === 'admin' && <span className="ml-2 bg-live px-1.5 text-xs text-white not-italic">ADMIN DECISION</span>}
            </p>
            {side(m.a, t?.votes_a ?? 0)}
            {side(m.b, t?.votes_b ?? 0)}
          </li>
        )
      })}
    </ol>
  )
}

function ByPlayer({ data, games, me }: { data: BracketData; games: Matchup[]; me?: string }) {
  const players = playerPicks(games, data.votes, data.names)
  const [open, setOpen] = useState<string | null>(me ?? null)
  if (players.length === 0) return <p className="text-base text-muted">Nobody voted in this round.</p>
  return (
    <ul className="-mx-4 -mb-4">
      {players.map((p) => {
        const expanded = open === p.userId
        return (
          <li key={p.userId} className={`border-t border-line ${p.userId === me ? 'bg-navy-700/60' : ''}`}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : p.userId)}
              className="flex min-h-12 w-full items-center gap-3 px-3 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-lg font-bold">
                {data.names[p.userId] ?? '?'}
                {p.userId === me && <span className="ml-2 text-xs font-extrabold tracking-wider text-orange uppercase">You</span>}
              </span>
              <Led className="h-8 text-lg">
                {p.correct}/{p.picks.length}
              </Led>
              <span className="w-[4.5rem] text-xs leading-tight font-bold tracking-wider text-muted uppercase">Winners picked</span>
              <span aria-hidden className="w-4 text-center text-orange">
                {expanded ? '▴' : '▾'}
              </span>
            </button>
            {expanded && (
              <ol className="flex flex-col gap-1 px-3 pb-3">
                {p.picks.map(({ matchup: m, picked, won }) => {
                  const other = m.a?.id === picked.id ? m.b : m.a
                  return (
                    <li key={m.id} className="flex items-baseline gap-2 text-base">
                      <span className={`w-4 shrink-0 text-center font-extrabold ${won ? 'text-ok' : won === false ? 'text-danger' : 'text-muted'}`} aria-label={won ? 'went through' : won === false ? 'went out' : 'undecided'}>
                        {won ? '✓' : won === false ? '✗' : '·'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-bold">{picked.name}</span> <span className="text-muted">({picked.seed})</span>
                        <span className="text-muted"> over </span>
                        {other?.name} <span className="text-muted">({other?.seed})</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Who voted for who in one closed round, by player (each person's picks and hit rate) or by match. */
export function WhoVotedRound({ data, round, initial = 'player' }: { data: BracketData; round: number; initial?: Mode }) {
  const { profile } = useAuth()
  const [mode, setMode] = useState<Mode>(initial)
  const games = data.matchups.filter((m) => m.round === round && m.a && m.b)
  return (
    <>
      <div className="mb-3 flex gap-2">
        {(['player', 'match'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMode(v)}
            aria-pressed={mode === v}
            className={`slant min-h-11 flex-1 px-3 text-base font-extrabold tracking-wider uppercase ${mode === v ? 'bg-white text-navy-950' : 'bg-navy-900 text-muted'}`}
          >
            {v === 'player' ? 'By player' : 'By match'}
          </button>
        ))}
      </div>
      {mode === 'player' ? <ByPlayer data={data} games={games} me={profile?.id} /> : <ByMatch data={data} games={games} me={profile?.id} />}
    </>
  )
}

/** Home: who voted for who in the most recently closed round. */
export default function WhoVoted({ bracketId }: { bracketId: string }) {
  const { data } = useBracketData(bracketId)
  if (!data) return null
  const rounds = closedRounds(data)
  const round = rounds.at(-1)
  if (!round) return null
  return (
    <Card title="Who voted for who" aside={<span className="text-sm font-extrabold tracking-wide uppercase">{shortRound(round)}</span>}>
      <WhoVotedRound key={round} data={data} round={round} />
      {rounds.length > 1 && (
        <Link to="/bracket?view=votes" className="-mx-4 -mb-4 mt-4 flex min-h-11 items-center justify-end border-t border-line px-3 text-base font-bold text-orange uppercase">
          Earlier rounds ▸
        </Link>
      )}
    </Card>
  )
}
