import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { Matchup } from '../../bracket/useStage'
import { MATCHUP_SELECT } from '../../bracket/useStage'
import { Card, PageTitle } from '../../components/ui'
import { podium } from '../../lib/stats'
import { supabase } from '../../lib/supabase'

interface Past {
  id: string
  title: string
  created_at: string
  completed_at: string | null
  archived_at: string
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export default function Archive() {
  const [past, setPast] = useState<Past[] | null>(null)
  const [finals, setFinals] = useState<Record<string, Matchup[]>>({})

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('brackets')
        .select('id, title, created_at, completed_at, archived_at')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
      const list = (data as Past[]) ?? []
      setPast(list)
      if (!list.length) return
      const { data: ms } = await supabase.from('matchups').select(`bracket_id, ${MATCHUP_SELECT}`).eq('round', 6).in('bracket_id', list.map((b) => b.id))
      const by: Record<string, Matchup[]> = {}
      for (const m of (ms ?? []) as unknown as (Matchup & { bracket_id: string })[]) (by[m.bracket_id] ??= []).push(m)
      setFinals(by)
    })()
  }, [])

  return (
    <>
      <PageTitle eyebrow="Hall of fame">Archive</PageTitle>
      {past === null ? null : past.length === 0 ? (
        <Card>
          <p className="text-base text-muted">No past brackets yet. Finished brackets move here when Harry starts the next one.</p>
        </Card>
      ) : (
        <ol className="flex flex-col gap-3">
          {past.map((b) => {
            const p = podium(finals[b.id] ?? [])
            return (
              <li key={b.id}>
                <Link to={`/archive/${b.id}`} className="block border-2 border-line bg-navy-800 hover:border-orange">
                  <div className="led flex justify-between border-b-2 border-line px-3 py-1 text-sm font-bold tracking-wider text-muted uppercase">
                    <span>{date(b.created_at)}</span>
                    <span>{b.completed_at ? `Final ${date(b.completed_at)}` : 'Unfinished'}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3">
                    <span className="font-display text-xl uppercase">{b.title}</span>
                    {p.first && (
                      <span className="text-base">
                        <span className="font-extrabold text-yellow">1st</span> {p.first.name}
                        {p.second && (
                          <>
                            {' '}· <span className="font-bold text-muted">2nd</span> {p.second.name}
                          </>
                        )}
                        {p.third && (
                          <>
                            {' '}· <span className="font-bold text-orange">3rd</span> {p.third.name}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}
