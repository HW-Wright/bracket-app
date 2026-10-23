import { useState } from 'react'
import { Link } from 'react-router'
import { useBracket } from '../bracket/BracketProvider'
import { useBracketData } from '../bracket/useBracketData'
import { Badge, Card, PageTitle } from '../components/ui'
import { ROUNDS } from '../lib/bracket'
import { isThirdPlace, upsets, voteTotals } from '../lib/stats'

export default function Stats() {
  const { bracket } = useBracket()
  const { data, loading } = useBracketData(bracket?.id)
  const [showAll, setShowAll] = useState(false)
  if (loading) return null

  if (!data || data.matchups.length === 0) {
    return (
      <>
        <PageTitle>Stats</PageTitle>
        <Card>
          <p className="text-base text-muted">Upsets and running vote totals appear once voting starts.</p>
        </Card>
      </>
    )
  }

  const ups = upsets(data.matchups)
  const totals = voteTotals(data.matchups, data.tallies).filter((t) => t.votes > 0 || t.wins > 0)
  const shown = showAll ? totals : totals.slice(0, 16)
  const closed = data.stages.filter((s) => s.status === 'closed').length

  return (
    <>
      <PageTitle eyebrow={data.openStage ? `After stage ${closed} of ${data.stages.length} · live` : `After stage ${closed} of ${data.stages.length}`}>Stats</PageTitle>
      <div className="flex flex-col gap-6">
        <Card title="Upsets · biggest first" aside={<Badge tone="live">{ups.length}</Badge>}>
          {ups.length === 0 ? (
            <p className="text-base text-muted">No upsets yet: every higher seed has won so far.</p>
          ) : (
            <ol className="-m-4">
              {ups.map((u) => (
                <li key={u.matchup.id} className="grid grid-cols-[minmax(0,1fr)_58px] items-center gap-3 border-b border-line py-2 pr-3 pl-4 last:border-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-lg leading-6 font-bold">
                      <span className="font-led text-amber">{u.winner.seed}</span>{' '}
                      <Link to={`/entry/${u.winner.id}`} className="hover:text-orange">
                        {u.winner.name}
                      </Link>{' '}
                      <span className="font-semibold text-muted">def.</span> <span className="font-led text-amber">{u.loser.seed}</span>{' '}
                      <Link to={`/entry/${u.loser.id}`} className="hover:text-orange">
                        {u.loser.name}
                      </Link>
                    </span>
                    <span className="text-sm font-semibold text-muted">
                      {data.tallies[u.matchup.id] &&
                        (u.matchup.winner === u.matchup.a?.id
                          ? `${data.tallies[u.matchup.id].votes_a}–${data.tallies[u.matchup.id].votes_b}`
                          : `${data.tallies[u.matchup.id].votes_b}–${data.tallies[u.matchup.id].votes_a}`)}
                      {u.matchup.decided_by === 'coin_toss' && ' · coin toss'}
                      {u.matchup.decided_by === 'admin' && ' · admin decision'} · {isThirdPlace(u.matchup) ? 'Third-place playoff' : ROUNDS[u.matchup.round - 1].name}
                    </span>
                  </span>
                  <span className="led py-1 text-center font-led text-lg text-danger">+{u.margin}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Total votes · all rounds">
          <div className="-m-4">
            <div className="grid grid-cols-[26px_40px_minmax(0,1fr)_48px_44px] items-center gap-2 px-3 py-1.5 text-xs font-bold tracking-widest text-muted uppercase">
              <span>#</span>
              <span>Seed</span>
              <span>Entry</span>
              <span className="text-right">Votes</span>
              <span className="text-right">W–L</span>
            </div>
            <ol>
              {shown.map((t, i) => (
                <li key={t.entry.id} className="border-t border-line">
                  <Link to={`/entry/${t.entry.id}`} className="grid min-h-11 grid-cols-[26px_40px_minmax(0,1fr)_48px_44px] items-center gap-2 px-3 hover:bg-navy-700">
                    <span className="font-display text-yellow">{i + 1}</span>
                    <span className="led py-0.5 text-center font-led text-amber">{t.entry.seed}</span>
                    <span className="truncate text-lg font-semibold">{t.entry.name}</span>
                    <span className="text-right font-led text-xl text-amber">{t.votes}</span>
                    <span className="text-right text-base font-bold">
                      {t.wins}–{t.losses}
                    </span>
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
        </Card>
      </div>
    </>
  )
}
