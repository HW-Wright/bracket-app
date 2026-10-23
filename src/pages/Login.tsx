import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Button, ErrorText, TextField } from '../components/ui'

export default function Login() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(await signIn(username, password))
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4">
      <div className="flex flex-col items-start gap-2">
        <Badge tone="live" className="ml-1">
          Members only
        </Badge>
        <div className="slant ml-1 border-l-[6px] border-orange bg-navy-800 px-4 py-3">
          <h1 className="font-display text-4xl leading-none uppercase italic">
            The Gang <span className="text-orange">Does a Bracket</span>
          </h1>
        </div>
        <Badge tone="yellow" className="ml-5">
          Tip-off soon
        </Badge>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          required
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  )
}
