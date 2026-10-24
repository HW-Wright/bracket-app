import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useBracket, type Bracket } from '../bracket/BracketProvider'
import { useProgress } from '../bracket/useProgress'
import { useOpenStage } from '../bracket/useStage'
import MysterySeeds from '../components/MysterySeeds'
import PicksAlive from '../components/PicksAlive'
import { ActionLink, Card, Led, PageTitle } from '../components/ui'
import { listStatus, MAX_NOMINATIONS, type ListStatus } from '../lib/normalise'
import { supabase } from '../lib/supabase'

const Action = ActionLink

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-stretch border border-line bg-navy-800">
      <Led className="flex items-center px-3 text-2xl">{value}</Led>
      <span className="flex items-center px-3 py-2 text-sm leading-tight font-bold tracking-wider text-muted uppercase">
        {label}
      </span>
    </div>
  )
}

function NominationsOpen({ bracket }: { bracket: Bracket }) {
  const { profile } = useAuth()
  const { progress } = useProgress(bracket.id)
  const [mine, setMine] = useState<ListStatus | null>(null)

  useEffect(() => {
    if (!profile) return
    // Filter to the caller explicitly: the admin can read everyone's lists while open.
    supabase
      .from('nominations')
      .select('text')
      .eq('bracket_id', bracket.id)
      .eq('user_id', profile.id)
      .then(({ data }) => setMine(listStatus((data ?? []).map((r) => r.text))))
  }, [bracket.id, profile])

  const label = !mine || mine.count === 0
    ? 'Submit your nominations'
    : mine.complete
      ? 'Review your nominations'
      : `Finish your nominations (${mine.count}/${MAX_NOMINATIONS})`

  return (
    <div className="flex flex-col gap-5">
      <Action to="/nominate">{label}</Action>
      <div className="grid grid-cols-2 gap-2.5" role="status">
        <Stat value={`${mine?.count ?? 0}/${MAX_NOMINATIONS}`} label={mine?.complete ? 'Submitted ✓' : 'Your list'} />
        {progress && <Stat value={`${progress.submitted}/${progress.total}`} label="Have submitted" />}
      </div>
    </div>
  )
}

function VotingLive({ bracket }: { bracket: Bracket }) {
  const { stage, matchups, myVotes, voters, tallies } = useOpenStage(bracket.id)
  if (!stage) return null
  const mine = matchups.filter((m) => myVotes[m.id]).length
  // Latest scores: the busiest games in the open round, like a results panel.
  const latest = [...matchups]
    .sort((x, y) => (tallies[y.id]?.votes_a ?? 0) + (tallies[y.id]?.votes_b ?? 0) - ((tallies[x.id]?.votes_a ?? 0) + (tallies[x.id]?.votes_b ?? 0)))
    .slice(0, 3)
  const box = (n: number, level: boolean) => <span className={`w-7 text-center font-extrabold text-navy-950 ${level ? 'bg-yellow' : 'bg-white'}`}>{n}</span>
  return (
    <div className="flex flex-col gap-5">
      <Action to="/vote">{mine === matchups.length && mine > 0 ? `Review your votes` : `Vote in ${stage.label}`}</Action>
      <div className="grid grid-cols-2 gap-2.5" role="status">
        <Stat value={`${mine}/${matchups.length}`} label="Your votes" />
        {voters && <Stat value={`${voters.voters}/${voters.total}`} label="People voted" />}
      </div>
      <Card
        title="Latest scores"
        aside={
          <span className="flex items-center gap-1.5 text-[13px] font-extrabold">
            <span className="h-2 w-2 rounded-full bg-ok" aria-hidden />
            LIVE
          </span>
        }
      >
        <ol className="-m-4">
          {latest.map((m) => {
            const a = tallies[m.id]?.votes_a ?? 0
            const b = tallies[m.id]?.votes_b ?? 0
            return (
              <li key={m.id} className="border-b border-line last:border-0">
                <Link to="/vote" className="grid min-h-11 grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] items-center gap-2 px-3 text-[17px] font-bold hover:bg-navy-700">
                  <span className="truncate text-right">{m.a?.name}</span>
                  <span className="flex justify-center gap-0.5">
                    {box(a, a === b && a > 0)}
                    {box(b, a === b && a > 0)}
                  </span>
                  <span className="truncate">{m.b?.name}</span>
                </Link>
              </li>
            )
          })}
        </ol>
      </Card>
    </div>
  )
}

export default function Home() {
  const { profile } = useAuth()
  const { bracket, loading } = useBracket()
  if (loading) return null

  if (!bracket) {
    return (
      <>
        <PageTitle eyebrow={`Welcome back, ${profile?.display_name ?? ''}`}>No bracket yet</PageTitle>
        <Card>
          <p className="text-base text-muted">When Harry opens the next bracket, your next move will appear here.</p>
        </Card>
        {profile?.is_admin && (
          <div className="mt-4">
            <Action to="/admin">Start a bracket</Action>
          </div>
        )}
      </>
    )
  }

  const eyebrow = {
    draft: 'Coming soon',
    nominations: 'Nominations open',
    review: 'Nominations closed',
    live: 'Voting live',
    complete: 'Complete',
  }[bracket.phase]

  return (
    <>
      <PageTitle eyebrow={eyebrow} live={bracket.phase === 'live' || bracket.phase === 'nominations'}>
        {bracket.title}
      </PageTitle>
      {bracket.description && <p className="-mt-2 mb-5 text-base text-muted">{bracket.description}</p>}

      {bracket.phase === 'draft' && (
        <Card>
          <p className="text-base text-muted">Harry is setting this one up. Nominations open soon.</p>
        </Card>
      )}
      {bracket.phase === 'nominations' && <NominationsOpen bracket={bracket} />}
      {bracket.phase === 'review' && (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-base text-muted">Harry is reviewing the nominations and seeding the bracket.</p>
          </Card>
          <Action to="/nominate">See everyone's nominations</Action>
        </div>
      )}
      {bracket.phase === 'live' && <VotingLive bracket={bracket} />}
      {bracket.phase === 'complete' && <Action to="/bracket">See the champion</Action>}
      {(bracket.phase === 'live' || bracket.phase === 'complete') && (
        <div className="mt-6 flex flex-col gap-6">
          <MysterySeeds bracketId={bracket.id} />
          <PicksAlive bracketId={bracket.id} />
        </div>
      )}
      {profile?.is_admin && (
        <Link to="/admin" className="mt-8 block text-center text-base font-bold text-orange uppercase underline-offset-4 hover:underline">
          Admin controls →
        </Link>
      )}
    </>
  )
}
