import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useBracketData } from '../../bracket/useBracketData'
import { Card, PageTitle } from '../../components/ui'
import { SummaryStats } from '../Stats'
import { supabase } from '../../lib/supabase'
import BracketView from '../bracket/BracketView'
import { AllNominations, type NominationRow } from '../nominate/Nominate'

/** Read-only view of a past bracket: full history, entry pages and everyone's nominations. */
export default function ArchivedBracket() {
  const { id } = useParams()
  const { data, loading } = useBracketData(id)
  const [rows, setRows] = useState<NominationRow[] | null>(null)

  useEffect(() => {
    supabase
      .from('nominations')
      .select('user_id, rank, text, profiles(display_name)')
      .eq('bracket_id', id!)
      .order('rank')
      .then(({ data }) => setRows((data as unknown as NominationRow[]) ?? []))
  }, [id])

  if (loading) return null
  return (
    <>
      <Link to="/archive" className="mb-3 inline-flex min-h-11 items-center text-base font-bold text-orange uppercase">
        ← Archive
      </Link>
      {data ? (
        <>
          <PageTitle eyebrow="Archived">{data.bracket.title}</PageTitle>
          <Card title="Bracket summary" className="mb-6">
            <SummaryStats data={data} />
          </Card>
          <BracketView data={data} />
          {rows && <AllNominations rows={rows} />}
        </>
      ) : (
        <Card>
          <p className="text-base text-muted">Bracket not found.</p>
        </Card>
      )}
    </>
  )
}
