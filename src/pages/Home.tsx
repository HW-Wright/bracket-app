import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useBracket, type Bracket } from '../bracket/BracketProvider'
import { useProgress } from '../bracket/useProgress'
import { useOpenStage } from '../bracket/useStage'
import PicksAlive from '../components/PicksAlive'
import { Card, Led, PageTitle } from '../components/ui'
import { listStatus, MAX_NOMINATIONS, type ListStatus } from '../lib/normalise'
import { supabase } from '../lib/supabase'

/** The one big call to action: white slanted broadcast bar with an orange offset shadow. */
function Action({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="mx-1.5 flex min-h-14 -skew-x-8 items-center justify-center bg-white px-4 text-center font-display text-xl text-navy-950 uppercase shadow-[5px_5px_0_var(--color-orange)] hover:bg-yellow"
    >
      {children} ▸
    </Link>
  )
}

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
  const { progress } = useProgress(bracket.id)
  const [mine, setMine] = useState<ListStatus | null>(null)

  useEffect(() => {
    // RLS: while open this returns only the caller's own rows.
    supabase
      .from('nominations')
      .select('text')
      .eq('bracket_id', bracket.id)
      .then(({ data }) => setMine(listStatus((data ?? []).map((r) => r.text))))
  }, [bracket.id])

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
  const { stage, matchups, myVotes, voters } = useOpenStage(bracket.id)
  if (!stage) return null
  const mine = matchups.filter((m) => myVotes[m.id]).length
  return (
    <div className="flex flex-col gap-5">
      <Action to="/vote">{mine === matchups.length && mine > 0 ? `Review your votes` : `Vote in ${stage.label}`}</Action>
      <div className="grid grid-cols-2 gap-2.5" role="status">
        <Stat value={`${mine}/${matchups.length}`} label="Your votes" />
        {voters && <Stat value={`${voters.voters}/${voters.total}`} label="People voted" />}
      </div>
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
      <PageTitle eyebrow={eyebrow}>{bracket.title}</PageTitle>
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
        <div className="mt-6">
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
