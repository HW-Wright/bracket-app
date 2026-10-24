import { useState } from 'react'
import { useBracket } from '../bracket/BracketProvider'
import { useOpenStage } from '../bracket/useStage'
import MatchupCard from '../components/MatchupCard'
import { Card, ErrorText, Led, PageTitle } from '../components/ui'

const ROUND_NAMES = ['', 'Round of 64', 'Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'The Final']

export default function Vote() {
  const { bracket } = useBracket()
  const { loading, stage, matchups, tallies, myVotes, voters, vote } = useOpenStage(bracket?.phase === 'live' ? bracket.id : undefined)
  const [error, setError] = useState<string | null>(null)

  if (loading) return null
  if (!bracket || bracket.phase !== 'live' || !stage) {
    return (
      <>
        <PageTitle>Vote</PageTitle>
        <Card>
          <p className="text-base text-muted">
            {bracket?.phase === 'complete' ? 'Voting is over. The champion has been crowned.' : 'Nothing to vote on yet. Voting opens once Harry locks the seeding.'}
          </p>
        </Card>
      </>
    )
  }

  const mine = matchups.filter((m) => myVotes[m.id]).length
  const sectionLabel = stage.label.split(' · ')[1]

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageTitle eyebrow={`Stage ${stage.number}${sectionLabel ? ` · ${sectionLabel}` : ''}`} sub={`${matchups.length} games`} live>
          {ROUND_NAMES[stage.round]}
        </PageTitle>
        <div className="led mt-3 shrink-0 border border-line px-2.5 py-1 text-center" role="status">
          <span className="block font-led text-2xl leading-7 font-extrabold text-amber">
            {mine}/{matchups.length}
          </span>
          <span className="text-[11px] font-bold tracking-[0.15em] text-muted">YOU'VE VOTED</span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base text-muted">Tap to vote, tap the other to switch, tap again to clear. Voting is optional.</p>
        {voters && (
          <span className="flex items-center gap-2 text-sm font-bold tracking-wider text-muted uppercase">
            <Led className="py-0.5">
              {voters.voters}/{voters.total}
            </Led>
            people have voted
          </span>
        )}
      </div>

      <ErrorText>{error}</ErrorText>
      <div className="flex flex-col gap-4">
        {matchups.map((m, i) => (
          <MatchupCard
            key={m.id}
            number={i + 1}
            matchup={m}
            tally={tallies[m.id]}
            myVote={myVotes[m.id]}
            onPick={async (entryId) => setError(await vote(m, entryId))}
          />
        ))}
      </div>
      <p className="mt-6 text-center text-sm font-semibold text-muted">
        Who voted for what is revealed when Harry closes the stage.
      </p>
    </>
  )
}
