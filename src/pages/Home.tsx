import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useBracket, type Bracket } from '../bracket/BracketProvider'
import { useProgress } from '../bracket/useProgress'
import { Card, PageTitle } from '../components/ui'
import { listStatus, MAX_NOMINATIONS, type ListStatus } from '../lib/normalise'
import { supabase } from '../lib/supabase'

function Action({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-12 items-center justify-center rounded-sm border border-gold-500 bg-gold-500 px-4 text-center font-medium tracking-wide text-ink-950 hover:bg-gold-300"
    >
      {children}
    </Link>
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
    <div className="flex flex-col gap-4">
      {mine?.complete && <p className="label-caps text-center text-gold-500">You've submitted ✓</p>}
      <Action to="/nominate">{label}</Action>
      {progress && (
        <p className="label-caps text-center" role="status">
          {progress.submitted} of {progress.total} have submitted
        </p>
      )}
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
          <p className="text-sm text-ivory-muted">When Harry opens the next bracket, your next move will appear here.</p>
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
      {bracket.description && <p className="-mt-2 mb-5 text-sm text-ivory-muted">{bracket.description}</p>}

      {bracket.phase === 'draft' && (
        <Card>
          <p className="text-sm text-ivory-muted">Harry is setting this one up. Nominations open soon.</p>
        </Card>
      )}
      {bracket.phase === 'nominations' && <NominationsOpen bracket={bracket} />}
      {bracket.phase === 'review' && (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-sm text-ivory-muted">Harry is reviewing the nominations and seeding the bracket.</p>
          </Card>
          <Action to="/nominate">See everyone's nominations</Action>
        </div>
      )}
      {profile?.is_admin && bracket.phase !== 'live' && bracket.phase !== 'complete' && (
        <Link to="/admin" className="mt-6 block text-center text-sm text-gold-500 underline-offset-4 hover:underline">
          Admin controls →
        </Link>
      )}
    </>
  )
}
