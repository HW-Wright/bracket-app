import { useState, type FormEvent } from 'react'
import { MIN_PASSWORD_LENGTH } from '../../supabase/functions/_shared/username.ts'
import { useAuth } from '../auth/AuthProvider'
import { Button, ErrorText, TextField } from './ui'

export default function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { changePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters`)
    if (password !== confirm) return setError("Passwords don't match")
    setBusy(true)
    const err = await changePassword(password)
    setBusy(false)
    setError(err)
    if (!err) {
      setPassword('')
      setConfirm('')
      onDone?.()
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField
        label="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
      />
      <TextField
        label="Confirm new password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        required
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save password'}
      </Button>
    </form>
  )
}
