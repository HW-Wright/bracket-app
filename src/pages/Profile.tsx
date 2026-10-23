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
        <Card>
          <h2 className="label-caps mb-4">Change password</h2>
          <ChangePasswordForm onDone={() => setSaved(true)} />
          {saved && (
            <p role="status" className="mt-3 text-sm text-ok">
              Password updated.
            </p>
          )}
        </Card>
        <Link to="/archive" className="text-sm text-gold-500 underline-offset-4 hover:underline">
          Past brackets →
        </Link>
        <Button variant="ghost" onClick={signOut}>
          Log out
        </Button>
      </div>
    </>
  )
}
