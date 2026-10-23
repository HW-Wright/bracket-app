import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { EntryRef, Matchup, Tally } from '../bracket/useStage'
import EntryThumb from './EntryThumb'

function Row({
  entry,
  votes,
  picked,
  won,
  lost,
  level,
  onPick,
  link,
}: {
  entry: EntryRef | null
  votes: number
  picked: boolean
  won: boolean
  lost: boolean
  level: boolean
  onPick?: () => void
  link?: boolean
}) {
  const highlight = picked || won
  const body = (
    <>
      <span className={`text-center text-[15px] font-extrabold ${highlight ? 'text-navy-950/75' : 'text-muted'}`}>{entry?.seed ?? '–'}</span>
      <span className="flex min-w-0 items-center gap-2.5">
        {entry && <EntryThumb name={entry.name} path={entry.image_path} size={34} />}
        <span className="flex min-w-0 flex-col text-left">
          <span className={`line-clamp-2 text-[21px] leading-[23px] break-words ${highlight ? 'font-extrabold' : 'font-bold'}`}>{entry?.name ?? 'To be decided'}</span>
          {picked && <span className="text-xs font-extrabold tracking-[0.12em]">✓ YOUR PICK</span>}
          {won && !picked && <span className="text-xs font-extrabold tracking-[0.12em]">WINNER</span>}
        </span>
      </span>
      {/* White score box (yellow while level). */}
      <span className={`flex h-[34px] items-center justify-center text-[22px] font-extrabold text-navy-950 ${level ? 'bg-yellow' : 'bg-white'}`}>{votes}</span>
    </>
  )
  const cls = `grid min-h-[54px] w-full grid-cols-[38px_minmax(0,1fr)_42px] items-center gap-2.5 px-2.5 py-1.5 text-left ${
    highlight ? 'bg-orange text-navy-950' : lost ? 'opacity-55' : ''
  }`
  if (onPick && entry) {
    return (
      <button type="button" aria-pressed={picked} aria-label={`${entry.name}, seed ${entry.seed}, ${votes} votes`} onClick={onPick} className={`${cls} ${picked ? '' : 'hover:bg-navy-700'}`}>
        {body}
      </button>
    )
  }
  if (link && entry) {
    return (
      <Link to={`/entry/${entry.id}`} aria-label={`${entry.name}, seed ${entry.seed}, ${votes} votes`} className={cls}>
        {body}
      </Link>
    )
  }
  return <div className={cls}>{body}</div>
}

/** One matchup in a "MATCH n" box: header strip, two rows with white score boxes. */
export default function MatchupCard({
  number,
  matchup,
  tally,
  myVote,
  onPick,
  link,
  footer,
}: {
  number: number
  matchup: Matchup
  tally: Tally | undefined
  myVote?: string
  onPick?: (entryId: string) => void
  /** Read-only cards: entries link to their entry pages. */
  link?: boolean
  /** Extra content under the rows (e.g. who voted for what). */
  footer?: ReactNode
}) {
  const a = tally?.votes_a ?? 0
  const b = tally?.votes_b ?? 0
  const decided = !!matchup.winner
  const level = !decided && a + b > 0 && a === b
  const third = matchup.round === 6 && matchup.slot === 1
  const title = third ? 'THIRD PLACE' : matchup.round === 6 ? 'THE FINAL' : `MATCH ${number}`

  const status = decided ? (
    matchup.decided_by === 'coin_toss' ? (
      <span className="bg-yellow px-2 text-xs font-extrabold tracking-wider text-navy-950 not-italic">FT · COIN TOSS</span>
    ) : matchup.decided_by === 'admin' ? (
      <span className="bg-live px-2 text-xs font-extrabold tracking-wider text-white not-italic">FT · ADMIN DECISION</span>
    ) : (
      <span className="text-[13px] font-extrabold tracking-wider not-italic">FT</span>
    )
  ) : level ? (
    <span className="bg-yellow px-2 text-xs font-extrabold tracking-wider text-navy-950 not-italic">LEVEL · COIN TOSS IF IT STAYS LEVEL</span>
  ) : (
    <span className="flex items-center gap-1.5 text-[13px] font-extrabold tracking-wider not-italic">
      <span className="h-2 w-2 rounded-full bg-ok" aria-hidden />
      LIVE
    </span>
  )

  const row = (e: EntryRef | null, votes: number) => (
    <Row
      entry={e}
      votes={votes}
      picked={!!e && myVote === e.id}
      won={decided && matchup.winner === e?.id}
      lost={decided && matchup.winner !== e?.id}
      level={level}
      onPick={onPick && e ? () => onPick(e.id) : undefined}
      link={link}
    />
  )

  return (
    <article className="border border-line bg-navy-800">
      <header className="flex min-h-8 items-center justify-between gap-2 bg-navy-700 px-3 py-1 text-[15px] font-extrabold italic">
        <span>{title}</span>
        {status}
      </header>
      {row(matchup.a, a)}
      <div className="h-px bg-line" />
      {row(matchup.b, b)}
      {footer && <div className="px-2.5 pb-2.5">{footer}</div>}
    </article>
  )
}
