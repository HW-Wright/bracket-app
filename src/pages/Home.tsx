import { useAuth } from '../auth/AuthProvider'
import { Card, PageTitle } from '../components/ui'

export default function Home() {
  const { profile } = useAuth()
  return (
    <>
      <PageTitle eyebrow={`Welcome back, ${profile?.display_name ?? ''}`}>No bracket yet</PageTitle>
      <Card>
        <p className="text-sm text-ivory-muted">When Harry opens the next bracket, your next move will appear here.</p>
      </Card>
    </>
  )
}
