import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { useBracket } from '../../bracket/BracketProvider'
import { useProgress } from '../../bracket/useProgress'
import { Badge, Card, Led, PageTitle } from '../../components/ui'
import { listStatus, MAX_NOMINATIONS } from '../../lib/normalise'
import { supabase } from '../../lib/supabase'
import NominationEditor from './NominationEditor'

export interface NominationRow {
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

/** Everyone's lists grouped by person. `open`: nominations still open (admin view), so incomplete = draft. */
export function AllNominations({ rows, open = false, title = "Everyone's nominations" }: { rows: NominationRow[]; open?: boolean; title?: string }) {
  const byUser = new Map<string, { name: string; items: NominationRow[] }>()
  for (const r of rows) {
    const group = byUser.get(r.user_id) ?? { name: r.profiles?.display_name ?? 'Unknown', items: [] }
    group.items.push(r)
    byUser.set(r.user_id, group)
  }
  const groups = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section className={open ? '' : 'mt-10'}>
      <Badge className="mb-3">{title}</Badge>
      {groups.length === 0 ? (
        <p className="text-base text-muted">Nobody nominated anything.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <details key={g.name} className="group border border-line bg-navy-800" open>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 border-b-2 border-orange bg-navy-900 px-4">
                <span className="text-lg font-extrabold tracking-wider uppercase">{g.name}</span>
                {listStatus(g.items.map((n) => n.text)).complete ? (
                  <span className="label-caps">{g.items.length} picks</span>
                ) : (
                  <span className={`label-caps ${open ? '' : 'text-danger'}`}>{open ? `Draft · ${g.items.length}/15` : 'Incomplete · not counted'}</span>
                )}
              </summary>
              <ol className="px-3 py-2">
                {g.items.map((n) => (
                  <li key={n.rank} className="flex items-center gap-3 py-1 text-lg">
                    <Led className="w-9 shrink-0 text-center">{n.rank}</Led>
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
          <p className="text-base text-muted">Nominations open when Harry starts the next bracket.</p>
        </Card>
      </>
    )
  }

  const mine = (rows ?? []).filter((r) => r.user_id === profile?.id)

  if (bracket.phase === 'nominations') {
    return (
      <>
        <PageTitle eyebrow="Nominations open">{bracket.title}</PageTitle>
        {bracket.description && <p className="-mt-2 mb-4 text-base text-muted">{bracket.description}</p>}
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
        <h2 className="mb-3 text-base font-extrabold tracking-[0.15em] uppercase">Your picks</h2>
        {mine.length > 0 && !listStatus(mine.map((n) => n.text)).complete && (
          <p className="mb-3 text-base font-semibold text-danger">
            Your list wasn't complete ({MAX_NOMINATIONS} entries, no repeats) when nominations closed, so it doesn't count
            towards this bracket.
          </p>
        )}
        {mine.length === 0 ? (
          <p className="text-base text-muted">You didn't nominate anything this time.</p>
        ) : (
          <ol>
            {mine.map((n) => (
              <li key={n.rank} className="flex items-center gap-3 py-1 text-lg">
                <Led className="w-9 shrink-0 text-center">{n.rank}</Led>
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
