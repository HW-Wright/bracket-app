import type { EntryRef, Matchup, Tally } from '../bracket/useStage'
import EntryThumb from './EntryThumb'
import { Badge } from './ui'

function PickBar({
  entry,
  votes,
  picked,
  won,
  lost,
  onPick,
}: {
  entry: EntryRef | null
  votes: number
  picked: boolean
  won: boolean
  lost: boolean
  onPick?: () => void
}) {
  const highlight = picked || won
  const body = (
    <>
      <span className="led flex items-center justify-center font-led text-xl text-amber">{entry?.seed ?? '–'}</span>
      <span className="flex min-w-0 items-center gap-2.5 px-2.5">
        {entry && (
          <span className="skew-x-8">
            <EntryThumb name={entry.name} path={entry.image_path} size={36} />
          </span>
        )}
        <span className="flex min-w-0 flex-col text-left">
          <span className={`truncate text-[22px] leading-6 ${highlight ? 'font-extrabold' : 'font-bold'}`}>{entry?.name ?? 'To be decided'}</span>
          {picked && <span className="text-xs font-extrabold tracking-[0.15em]">✓ YOUR PICK</span>}
          {won && !picked && <span className="text-xs font-extrabold tracking-[0.15em]">WINNER</span>}
        </span>
      </span>
      <span className="led flex items-center justify-center font-led text-3xl text-amber">{votes}</span>
    </>
  )
  const cls = `mx-1.5 grid min-h-[60px] -skew-x-8 grid-cols-[46px_minmax(0,1fr)_58px] items-stretch text-left ${
    highlight
      ? 'bg-orange text-navy-950 shadow-[4px_4px_0_var(--color-yellow)]'
      : `border border-line bg-navy-800 ${lost ? 'opacity-60' : ''}`
  }`
  return onPick && entry ? (
    <button type="button" aria-pressed={picked} aria-label={`${entry.name}, seed ${entry.seed}, ${votes} votes`} onClick={onPick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** One matchup in a "GAME n" box: two pick bars, a live tally bar and a VS / TIED badge. */
export default function MatchupCard({
  number,
  matchup,
  tally,
  myVote,
  onPick,
}: {
  number: number
  matchup: Matchup
  tally: Tally | undefined
  myVote?: string
  onPick?: (entryId: string) => void
}) {
  const a = tally?.votes_a ?? 0
  const b = tally?.votes_b ?? 0
  const total = a + b
  const decided = !!matchup.winner
  const tied = !decided && total > 0 && a === b
  const third = matchup.round === 6 && matchup.slot === 1
  const status = decided
    ? matchup.decided_by === 'coin_toss'
      ? 'COIN TOSS'
      : matchup.decided_by === 'admin'
        ? 'ADMIN DECISION'
        : 'FINAL'
    : tied
      ? 'TIED · COIN TOSS IF STILL LEVEL'
      : 'VOTES'

  return (
    <article className="border-2 border-line bg-navy-900">
      <header className="led flex items-center justify-between gap-2 border-b-2 border-line px-3 py-1.5">
        <span className="font-led text-[15px] text-amber">{third ? 'THIRD PLACE' : matchup.round === 6 ? 'THE FINAL' : `GAME ${number}`}</span>
        <span className={`text-right text-[13px] font-extrabold tracking-[0.15em] ${tied || matchup.decided_by === 'admin' ? 'text-danger' : matchup.decided_by === 'coin_toss' ? 'text-yellow' : 'text-muted'}`}>
          {status}
        </span>
      </header>
      <div className="flex flex-col gap-1.5 px-1.5 pt-2.5 pb-3">
        <PickBar
          entry={matchup.a}
          votes={a}
          picked={!!matchup.a && myVote === matchup.a.id}
          won={decided && matchup.winner === matchup.a?.id}
          lost={decided && matchup.winner !== matchup.a?.id}
          onPick={onPick && matchup.a ? () => onPick(matchup.a!.id) : undefined}
        />
        <div className="flex items-center gap-2.5 px-3" aria-hidden>
          <span className="flex h-1.5 flex-1 justify-start bg-line">
            <span className="bg-orange transition-[width] duration-500 motion-reduce:transition-none" style={{ width: total ? `${(a / total) * 100}%` : 0 }} />
          </span>
          {tied ? <Badge tone="live">Tied</Badge> : <Badge tone="yellow">VS</Badge>}
          <span className="flex h-1.5 flex-1 justify-end bg-line">
            <span className="bg-muted transition-[width] duration-500 motion-reduce:transition-none" style={{ width: total ? `${(b / total) * 100}%` : 0 }} />
          </span>
        </div>
        <PickBar
          entry={matchup.b}
          votes={b}
          picked={!!matchup.b && myVote === matchup.b.id}
          won={decided && matchup.winner === matchup.b?.id}
          lost={decided && matchup.winner !== matchup.b?.id}
          onPick={onPick && matchup.b ? () => onPick(matchup.b!.id) : undefined}
        />
      </div>
    </article>
  )
}
