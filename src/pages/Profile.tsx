import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import ChangePasswordForm from '../components/ChangePasswordForm'
import { Button, Card, PageTitle } from '../components/ui'

export default function Profile() {
  const { profile, signOut } = useAuth()
  const [saved, setSaved] = useState(false)
  return (
    <>
      <PageTitle eyebrow={`@${profile?.username}`}>{profile?.display_name}</PageTitle>
      <div className="flex flex-col gap-4">
        <Card title="Change password">
          <ChangePasswordForm onDone={() => setSaved(true)} />
          {saved && (
            <p role="status" className="mt-3 text-base font-semibold text-ok">
              Password updated.
            </p>
          )}
        </Card>
        <Link to="/archive" className="flex min-h-11 items-center text-base font-bold text-orange uppercase underline-offset-4 hover:underline">
          Past brackets →
        </Link>
        <Button variant="ghost" onClick={signOut}>
          Log out
        </Button>
      </div>
    </>
  )
}
