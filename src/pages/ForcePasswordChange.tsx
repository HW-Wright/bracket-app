import { useAuth } from '../auth/AuthProvider'
import ChangePasswordForm from '../components/ChangePasswordForm'
import { Button, PageTitle } from '../components/ui'

export default function ForcePasswordChange() {
  const { profile, signOut } = useAuth()
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <PageTitle eyebrow={`Welcome, ${profile?.display_name ?? ''}`}>Choose a new password</PageTitle>
      <p className="mb-6 text-base text-muted">
        Your starting password was temporary. Pick your own before you go any further.
      </p>
      <ChangePasswordForm />
      <Button variant="ghost" className="mt-6" onClick={signOut}>
        Log out
      </Button>
    </main>
  )
}
