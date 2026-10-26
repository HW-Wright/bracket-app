import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useBracket } from '../bracket/BracketProvider'
import { useBracketData, type BracketData } from '../bracket/useBracketData'
import type { EntryRef } from '../bracket/useStage'
import { Badge, Card, Led, PageTitle } from '../components/ui'
import { ROUNDS } from '../lib/bracket'
import {
  bracketSummary,
  cinderella,
  consensusVsChaos,
  entryPath,
  houdini,
  isThirdPlace,
  kingmaker,
  loneWolf,
  MIN_SHARED,
  sheep,
  tasteTwins,
  upsets,
  voteTotals,
  type PersonCount,
} from '../lib/stats'
import { supabase } from '../lib/supabase'

/** Segment banner under the title: same shape and yellow offset box as the Home next-action bar. */
function SeanZone() {
  return (
    <div className="relative -mt-2 mr-[6px] mb-6 w-fit">
      <div aria-hidden className="plate absolute inset-0 translate-x-[6px] translate-y-[6px] bg-yellow" />
      <p className="plate relative flex min-h-12 items-center bg-orange pr-8 pl-4 font-display text-[22px] leading-tight font-extrabold text-navy-950 uppercase italic">
        The Sean Zone
      </p>
    </div>
  )
}

const roundName = (r: number) => ROUNDS[Math.min(Math.max(r, 1), 6) - 1].name
const short = (r: number) => (r >= 6 ? 'Final' : roundName(r).replace('Round of ', 'R'))
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—')

function EntryLink({ e }: { e: EntryRef }) {
  return (
    <Link to={`/entry/${e.id}`} className="font-bold hover:text-orange">
      <span className="font-led text-amber">{e.seed}</span> {e.name}
    </Link>
  )
}

const SECTIONS = [
  ['summary', 'Summary'],
  ['cinderella', 'Cinderella'],
  ['upsets', 'Upsets'],
  ['houdini', 'Houdini'],
  ['twins', 'Taste twins'],
  ['sheep', 'Sheep'],
  ['wolf', 'Lone wolf'],
  ['kingmaker', 'Kingmaker'],
  ['consensus', 'Consensus'],
  ['totals', 'Total votes'],
] as const

function Section({ id, title, blurb, aside, children }: { id: string; title: string; blurb: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={`stat-${id}`} className="scroll-mt-[calc(6rem+env(safe-area-inset-top))]">
      <Card title={title} aside={aside}>
        <p className="-mt-1 mb-3 text-base text-muted">{blurb}</p>
        {children}
      </Card>
    </section>
  )
}

function JumpMenu() {
  const go = (id: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`stat-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <nav aria-label="Jump to a stat" className="mb-6">
      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            className="min-h-9 shrink-0 bg-navy-700 px-3 text-sm font-extrabold tracking-wide whitespace-nowrap text-white uppercase hover:bg-orange hover:text-navy-950"
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-base font-semibold text-muted">{children}</p>
}

/** Totals across the bracket. Also shown on archived brackets. */
export function SummaryStats({ data }: { data: BracketData }) {
  const s = bracketSummary(data.matchups, data.tallies)
  const tiles: [number, string][] = [
    [s.totalVotes, 'Total votes'],
    [s.decided, 'Games decided'],
    [s.unanimous, 'Unanimous'],
    [s.coinTosses, 'Coin tosses'],
    [s.upsets, 'Upsets'],
    [s.adminDecisions, 'Admin calls'],
  ]
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {tiles.map(([n, label]) => (
        <div key={label} className="flex flex-col border border-line bg-navy-900 py-2">
          <span className="font-led text-3xl text-amber">{n}</span>
          <span className="text-xs font-bold tracking-wider text-muted uppercase">{label}</span>
        </div>
      ))}
    </div>
  )
}

function PeopleList({ rows, names, value }: { rows: PersonCount[]; names: Record<string, string>; value: (r: PersonCount) => ReactNode }) {
  return (
    <ol className="-mx-4 -mb-4">
      {rows.map((r, i) => (
        <li key={r.user} className="flex min-h-11 items-center gap-3 border-t border-line px-4">
          <span className="w-5 font-display text-yellow">{i + 1}</span>
          <span className="flex-1 text-lg font-semibold">{names[r.user] ?? '?'}</span>
          <span className="font-led text-xl text-amber">{value(r)}</span>
        </li>
      ))}
    </ol>
  )
}

function TasteTwins({ users, data }: { users: string[]; data: BracketData }) {
  const { grid, best, worst } = tasteTwins(users, data.matchups, data.votes)
  const initials = (u: string) => (data.names[u] ?? '?').slice(0, 2)
  const isPair = (p: { a: string; b: string } | null, x: string, y: string) => !!p && ((p.a === x && p.b === y) || (p.a === y && p.b === x))
  if (!best) return <Empty>Needs a few closed rounds where the same people voted ({MIN_SHARED}+ shared games per pair).</Empty>

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="border-2 border-yellow bg-navy-900 p-2">
          <span className="text-xs font-extrabold tracking-wider text-yellow uppercase">Most aligned</span>
          <p className="text-base font-bold">
            {data.names[best.a]} &amp; {data.names[best.b]} <span className="font-led text-amber">{pct(best.same, best.shared)}</span>
          </p>
        </div>
        <div className="border-2 border-danger bg-navy-900 p-2">
          <span className="text-xs font-extrabold tracking-wider text-danger uppercase">Most opposed</span>
          <p className="text-base font-bold">
            {data.names[worst!.a]} &amp; {data.names[worst!.b]} <span className="font-led text-amber">{pct(worst!.same, worst!.shared)}</span>
          </p>
        </div>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full table-fixed border-collapse text-center" aria-label="Agreement between each pair of people">
          <thead>
            <tr>
              <th className="w-7" />
              {users.map((u) => (
                <th key={u} scope="col" className="pb-1 text-[11px] font-extrabold text-muted uppercase" title={data.names[u]}>
                  {initials(u)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row}>
                <th scope="row" className="text-left text-[11px] font-extrabold text-muted uppercase" title={data.names[row]}>
                  {initials(row)}
                </th>
                {users.map((col) => {
                  const c = grid[row][col]
                  const strength = c.pct ?? 0
                  const ring = isPair(best, row, col) ? 'outline-2 -outline-offset-2 outline-yellow' : isPair(worst, row, col) ? 'outline-2 -outline-offset-2 outline-danger' : ''
                  return (
                    <td key={col} className="p-px">
                      <span
                        className={`flex h-8 w-full items-center justify-center font-led text-[13px] ${row === col ? 'bg-navy-900 text-line' : 'text-white'} ${ring}`}
                        style={row !== col && c.pct != null ? { background: `rgb(255 122 26 / ${0.08 + strength * 0.7})` } : undefined}
                        title={row === col ? undefined : `${data.names[row]} & ${data.names[col]}: ${c.same} of ${c.shared} the same`}
                      >
                        {row === col ? '—' : c.pct == null ? '·' : Math.round(c.pct * 100)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm font-semibold text-muted">% of shared games where both picked the same side. Brighter = more aligned.</p>
    </>
  )
}

export default function Stats() {
  const { bracket } = useBracket()
  const { data, loading } = useBracketData(bracket?.id)
  const [nominators, setNominators] = useState<Record<string, number>>({})
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!bracket) return
    supabase.rpc('entry_standings', { p_bracket_id: bracket.id }).then(({ data: st }) =>
      setNominators(Object.fromEntries(((st ?? []) as { entry_id: string; nominators: number }[]).map((s) => [s.entry_id, s.nominators]))),
    )
  }, [bracket])

  if (loading) return null

  if (!data || data.matchups.length === 0) {
    return (
      <>
        <PageTitle>Stats</PageTitle>
        <SeanZone />
        <Card>
          <p className="text-base text-muted">Stats appear once voting starts.</p>
        </Card>
      </>
    )
  }

  const closed = data.stages.filter((s) => s.status === 'closed').length
  const users = [...new Set(data.votes.map((v) => v.user_id))].sort((a, b) => (data.names[a] ?? '').localeCompare(data.names[b] ?? ''))
  const ups = upsets(data.matchups)
  const totals = voteTotals(data.matchups, data.tallies).filter((t) => t.votes > 0 || t.wins > 0)
  const shown = showAll ? totals : totals.slice(0, 16)
  const cin = cinderella(data.matchups)
  const lowest = data.matchups.flatMap((m) => [m.a, m.b]).find((e) => e?.seed === 64) ?? null
  const lowestPath = lowest ? entryPath(lowest.id, data.matchups).filter((m) => !isThirdPlace(m)) : []
  const lowestOut = lowestPath.find((m) => m.winner && m.winner !== lowest?.id)
  const escapes = houdini(data.matchups, data.tallies)
  const sheepRows = sheep(users, data.matchups, data.tallies, data.votes)
  const wolves = loneWolf(users, data.matchups, data.votes)
  const kings = kingmaker(users, data.matchups, data.tallies, data.votes)
  const groups = consensusVsChaos(data.matchups, nominators)
  const groupLabel = { consensus: 'Consensus (2+ nominators)', solo: 'One-person picks', manual: 'Manual fill-ins' }
  const noVotesYet = <Empty>Builds up as rounds close.</Empty>

  return (
    <>
      <PageTitle eyebrow={data.openStage ? `After stage ${closed} of ${data.stages.length} · live` : `After stage ${closed} of ${data.stages.length}`}>Stats</PageTitle>
      <SeanZone />
      <JumpMenu />

      <div className="flex flex-col gap-6">
        <Section id="summary" title="Bracket summary" blurb="The whole bracket so far in numbers.">
          <SummaryStats data={data} />
        </Section>

        <Section id="cinderella" title="Cinderella run" blurb="The lowest seed still standing in each round.">
          <ol className="-mx-4">
            {cin.map((c) => (
              <li key={c.round} className="flex min-h-11 items-center gap-3 border-t border-line px-4 first:border-0">
                <span className="w-12 shrink-0 text-sm font-extrabold tracking-wider text-muted uppercase">{short(c.round)}</span>
                <span className="min-w-0 flex-1 truncate text-lg">
                  <EntryLink e={c.entry} />
                </span>
              </li>
            ))}
          </ol>
          {lowest && (
            <p className="mt-3 border-t-2 border-orange pt-3 text-base">
              <span className="font-extrabold uppercase">How far #64 got:</span> <EntryLink e={lowest} />{' '}
              {lowestOut ? `went out in the ${roundName(lowestOut.round)}` : `is still alive (${roundName(Math.max(...lowestPath.map((m) => m.round)))})`}.
            </p>
          )}
        </Section>

        <Section id="upsets" title="Classified results · upsets" blurb="Lower seeds beating higher seeds, biggest gap first (round shown on each entry page)." aside={<Badge>{ups.length}</Badge>}>
          {ups.length === 0 ? (
            <Empty>No upsets yet: every higher seed has won so far.</Empty>
          ) : (
            /* Classified-results style: teleprinter type, winner first. */
            <ol className="-mx-4 -mb-4 bg-navy-900 py-1 font-mono text-[13px] font-semibold text-amber uppercase">
              {ups.map((u) => {
                const t = data.tallies[u.matchup.id]
                const [ws, ls] = t ? (u.matchup.winner === u.matchup.a?.id ? [t.votes_a, t.votes_b] : [t.votes_b, t.votes_a]) : ['', '']
                return (
                  <li key={u.matchup.id} className="grid grid-cols-[minmax(0,1fr)_22px_auto] items-center gap-x-2 border-b border-line/60 px-3 py-1.5 last:border-0">
                    <Link to={`/entry/${u.winner.id}`} className="truncate text-white hover:text-amber">
                      ({u.winner.seed}) {u.winner.name}
                    </Link>
                    <span className="text-right text-white">{ws}</span>
                    <span className={`row-span-2 self-center pl-1 ${u.matchup.decided_by === 'votes' ? 'text-danger' : 'text-yellow'}`}>
                      {u.matchup.decided_by === 'coin_toss' ? 'TOSS' : u.matchup.decided_by === 'admin' ? 'ADMIN' : 'SHOCK'}+{u.margin}
                    </span>
                    <Link to={`/entry/${u.loser.id}`} className="truncate hover:text-white">
                      ({u.loser.seed}) {u.loser.name}
                    </Link>
                    <span className="text-right">{ls}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </Section>

        <Section id="houdini" title="Houdini · narrow escapes" blurb="Narrowest escapes: wins by a single vote, plus coin tosses survived.">
          {escapes.length === 0 ? (
            noVotesYet
          ) : (
            <>
              <div className="-mx-4 grid grid-cols-[minmax(0,1fr)_56px_56px] gap-2 px-4 pb-1 text-xs font-bold tracking-widest text-muted uppercase">
                <span>Entry</span>
                <span className="text-right">By 1</span>
                <span className="text-right">Tosses</span>
              </div>
              <ol className="-mx-4 -mb-4">
                {escapes.map((h) => (
                  <li key={h.entry.id} className="grid min-h-11 grid-cols-[minmax(0,1fr)_56px_56px] items-center gap-2 border-t border-line px-4">
                    <span className="truncate text-lg">
                      <EntryLink e={h.entry} />
                    </span>
                    <span className="text-right font-led text-xl text-amber">{h.oneVote}</span>
                    <span className="text-right font-led text-xl text-amber">{h.tosses}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Section>

        <Section id="twins" title="Taste twins" blurb="How often each pair of friends voted the same way.">
          <TasteTwins users={users} data={data} />
        </Section>

        <Section id="sheep" title="Sheep" blurb="How often each person voted with the majority (games with a clear majority).">
          {sheepRows.length === 0 ? noVotesYet : <PeopleList rows={sheepRows} names={data.names} value={(r) => pct(r.count, r.of ?? 0)} />}
        </Section>

        <Section id="wolf" title="Lone wolf" blurb="Times someone was the only vote an entry got.">
          {wolves.length === 0 ? noVotesYet : <PeopleList rows={wolves} names={data.names} value={(r) => r.count} />}
        </Section>

        <Section id="kingmaker" title="Kingmaker" blurb="Times someone's vote decided a game won by one vote.">
          {kings.length === 0 ? <Empty>No game has been won by a single vote yet.</Empty> : <PeopleList rows={kings} names={data.names} value={(r) => r.count} />}
        </Section>

        <Section id="consensus" title="Consensus vs chaos" blurb="Entries several people nominated vs one-person picks: how far each group got.">
          <ol className="-mx-4 -mb-4">
            {groups.map((g) => (
              <li key={g.key} className="flex flex-col gap-1 border-t border-line px-4 py-3 first:border-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-extrabold uppercase">{groupLabel[g.key]}</span>
                  <span className="text-sm font-bold text-muted uppercase">{g.entries} entries</span>
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-base">
                  <span>
                    Alive <Led className="py-0.5">{`${g.alive}/${g.entries}`}</Led>
                  </span>
                  <span>
                    Avg. round <Led className="py-0.5">{g.avgRound.toFixed(1)}</Led>
                  </span>
                </span>
                {g.best && (
                  <span className="text-base text-muted">
                    Best run: <EntryLink e={g.best.entry} /> ({short(g.best.round)})
                  </span>
                )}
              </li>
            ))}
          </ol>
        </Section>

        <Section id="totals" title="League table · total votes" blurb="Every vote each entry has received across all rounds, live votes included.">
          <div className="-mx-4 -mb-4">
            <div className="grid grid-cols-[30px_34px_minmax(0,1fr)_26px_26px_46px] items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold tracking-wide text-muted uppercase">
              <span>Pos</span>
              <span>Seed</span>
              <span>Entry</span>
              <span className="text-center">W</span>
              <span className="text-center">L</span>
              <span className="text-right">Votes</span>
            </div>
            <ol>
              {shown.map((t, i) => (
                <li key={t.entry.id} className={i % 2 === 0 ? 'bg-navy-700/60' : ''}>
                  <Link to={`/entry/${t.entry.id}`} className="grid min-h-10 grid-cols-[30px_34px_minmax(0,1fr)_26px_26px_46px] items-center gap-1.5 px-3 text-[16px] hover:bg-navy-700">
                    <span className="font-extrabold">{i + 1}</span>
                    <span className="font-bold text-muted">{t.entry.seed}</span>
                    <span className="truncate font-bold">{t.entry.name}</span>
                    <span className="text-center">{t.wins}</span>
                    <span className="text-center">{t.losses}</span>
                    <span className="text-right font-extrabold">{t.votes}</span>
                  </Link>
                </li>
              ))}
            </ol>
            {totals.length > shown.length && (
              <button type="button" onClick={() => setShowAll(true)} className="min-h-11 w-full border-t border-line text-base font-bold tracking-wider text-orange uppercase">
                Show all {totals.length} ▸
              </button>
            )}
          </div>
        </Section>
      </div>
    </>
  )
}
