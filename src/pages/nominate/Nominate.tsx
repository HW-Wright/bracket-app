import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { useBracket } from '../../bracket/BracketProvider'
import { useProgress } from '../../bracket/useProgress'
import { Card, PageTitle } from '../../components/ui'
import { listStatus, MAX_NOMINATIONS } from '../../lib/normalise'
import { supabase } from '../../lib/supabase'
import NominationEditor from './NominationEditor'

interface NominationRow {
  user_id: string
  rank: number
  text: string
  profiles: { display_name: string } | null
}

export function ProgressLine({ submitted, total }: { submitted: number; total: number }) {
  return (
    <p className="label-caps" role="status">
      {submitted} of {total} have submitted
    </p>
  )
}

function AllNominations({ rows }: { rows: NominationRow[] }) {
  const byUser = new Map<string, { name: string; items: NominationRow[] }>()
  for (const r of rows) {
    const group = byUser.get(r.user_id) ?? { name: r.profiles?.display_name ?? 'Unknown', items: [] }
    group.items.push(r)
    byUser.set(r.user_id, group)
  }
  const groups = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section className="mt-10">
      <h2 className="label-caps mb-1">Everyone's nominations</h2>
      <div className="rule-double mb-4 w-16" />
      {groups.length === 0 ? (
        <p className="text-sm text-ivory-muted">Nobody nominated anything.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <details key={g.name} className="group rounded-sm border border-line bg-ink-900" open>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4">
                <span>{g.name}</span>
                {listStatus(g.items.map((n) => n.text)).complete ? (
                  <span className="label-caps">{g.items.length} picks</span>
                ) : (
                  <span className="label-caps text-danger">Incomplete · not counted</span>
                )}
              </summary>
              <ol className="border-t border-line px-4 py-2">
                {g.items.map((n) => (
                  <li key={n.rank} className="flex gap-3 py-1 text-sm">
                    <span className="w-5 shrink-0 text-right text-gold-500">{n.rank}</span>
                    <span>{n.text}</span>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      )}
    </section>
  )
}

export default function Nominate() {
  const { profile } = useAuth()
  const { bracket, loading } = useBracket()
  const { progress, reload } = useProgress(bracket?.phase === 'nominations' ? bracket.id : undefined)
  const [rows, setRows] = useState<NominationRow[] | null>(null)

  const load = useCallback(async () => {
    if (!bracket) return
    // RLS returns only the caller's rows while open, and everyone's once closed.
    const { data } = await supabase
      .from('nominations')
      .select('user_id, rank, text, profiles(display_name)')
      .eq('bracket_id', bracket.id)
      .order('rank')
    setRows((data as unknown as NominationRow[]) ?? [])
  }, [bracket])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return null
  if (!bracket || bracket.phase === 'draft') {
    return (
      <>
        <PageTitle>Nominate</PageTitle>
        <Card>
          <p className="text-sm text-ivory-muted">Nominations open when Harry starts the next bracket.</p>
        </Card>
      </>
    )
  }

  const mine = (rows ?? []).filter((r) => r.user_id === profile?.id)

  if (bracket.phase === 'nominations') {
    return (
      <>
        <PageTitle eyebrow="Nominations open">{bracket.title}</PageTitle>
        {bracket.description && <p className="-mt-2 mb-4 text-sm text-ivory-muted">{bracket.description}</p>}
        {progress && (
          <div className="mb-4">
            <ProgressLine {...progress} />
          </div>
        )}
        {rows && (
          <NominationEditor
            key={bracket.id}
            bracketId={bracket.id}
            initial={mine.map((r) => r.text)}
            onSaved={reload}
          />
        )}
      </>
    )
  }

  return (
    <>
      <PageTitle eyebrow="Nominations closed">{bracket.title}</PageTitle>
      <Card>
        <h2 className="label-caps mb-3">Your picks</h2>
        {mine.length > 0 && !listStatus(mine.map((n) => n.text)).complete && (
          <p className="mb-3 text-sm text-danger">
            Your list wasn't complete ({MAX_NOMINATIONS} entries, no repeats) when nominations closed, so it doesn't count
            towards this bracket.
          </p>
        )}
        {mine.length === 0 ? (
          <p className="text-sm text-ivory-muted">You didn't nominate anything this time.</p>
        ) : (
          <ol>
            {mine.map((n) => (
              <li key={n.rank} className="flex gap-3 py-1">
                <span className="w-5 shrink-0 text-right font-display text-gold-500">{n.rank}</span>
                <span>{n.text}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {rows && <AllNominations rows={rows} />}
    </>
  )
}
