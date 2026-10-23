import { Link } from 'react-router'
import { useBracket } from '../../bracket/BracketProvider'
import { useBracketData } from '../../bracket/useBracketData'
import { Card, PageTitle } from '../../components/ui'
import BracketView from './BracketView'

export default function Bracket() {
  const { bracket } = useBracket()
  const { data, loading } = useBracketData(bracket?.id)
  if (loading) return null
  return (
    <>
      <div className="mb-1 flex justify-end">
        <Link to="/archive" className="flex min-h-11 items-center text-base font-bold text-orange uppercase">
          Past brackets →
        </Link>
      </div>
      <PageTitle eyebrow={bracket?.phase === 'complete' ? 'Final result' : 'Bracket'}>{bracket?.title ?? 'Bracket'}</PageTitle>
      {data ? (
        <BracketView data={data} />
      ) : (
        <Card>
          <p className="text-base text-muted">No bracket yet.</p>
        </Card>
      )}
    </>
  )
}
