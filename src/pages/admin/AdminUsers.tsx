import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MIN_PASSWORD_LENGTH } from '../../../supabase/functions/_shared/username.ts'
import { useAuth, type Profile } from '../../auth/AuthProvider'
import { Button, Card, ErrorText, TextField } from '../../components/ui'
import { supabase } from '../../lib/supabase'

async function callAdmin(body: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.functions.invoke('admin-users', { body })
  if (!error) return null
  // FunctionsHttpError carries the JSON body from the function.
  const ctx = (error as { context?: Response }).context
  try {
    return ((await ctx?.json()) as { error?: string })?.error ?? error.message
  } catch {
    return error.message
  }
}

function UserRow({ user, isSelf, onChanged }: { user: Profile; isSelf: boolean; onChanged: () => void }) {
  const [mode, setMode] = useState<'idle' | 'reset'>('idle')
  const [temp, setTemp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(body: Record<string, unknown>, success: string) {
    setBusy(true)
    setError(null)
    const err = await callAdmin(body)
    setBusy(false)
    if (err) return setError(err)
    setNotice(success)
    setMode('idle')
    setTemp('')
    onChanged()
  }

  function toggleActive() {
    const verb = user.active ? 'Deactivate' : 'Reactivate'
    if (!confirm(`${verb} ${user.display_name}?`)) return
    run({ action: 'set_active', userId: user.id, active: !user.active }, `${user.display_name} ${user.active ? 'deactivated' : 'reactivated'}.`)
  }

  return (
    <li className="flex flex-col gap-3 border-b border-line py-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={user.active ? '' : 'text-muted line-through'}>
            {user.display_name} {user.is_admin && <span className="label-caps ml-1 text-orange!">Admin</span>}
          </p>
          <p className="text-xs text-muted">
            @{user.username}
            {user.must_change_password && ' · must change password'}
            {!user.active && ' · deactivated'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => setMode(mode === 'reset' ? 'idle' : 'reset')}>
            Reset
          </Button>
          {!isSelf && (
            <Button variant={user.active ? 'danger' : 'ghost'} disabled={busy} onClick={toggleActive}>
              {user.active ? 'Deactivate' : 'Reactivate'}
            </Button>
          )}
        </div>
      </div>
      {mode === 'reset' && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            run({ action: 'reset_password', userId: user.id, tempPassword: temp }, `Temporary password set for ${user.display_name}.`)
          }}
        >
          <div className="flex-1">
            <TextField label="Temporary password" value={temp} onChange={(e) => setTemp(e.target.value)} minLength={MIN_PASSWORD_LENGTH} required />
          </div>
          <Button type="submit" disabled={busy}>Set</Button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
      {notice && <p role="status" className="text-base font-semibold text-ok">{notice}</p>}
    </li>
  )
}

function AddUser({ onAdded }: { onAdded: () => void }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [temp, setTemp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const err = await callAdmin({ action: 'add_user', username, displayName, tempPassword: temp })
    setBusy(false)
    setError(err)
    if (!err) {
      setUsername('')
      setDisplayName('')
      setTemp('')
      onAdded()
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" required />
      <TextField label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      <TextField label="Temporary password" value={temp} onChange={(e) => setTemp(e.target.value)} minLength={MIN_PASSWORD_LENGTH} required />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add user'}</Button>
    </form>
  )
}

export default function AdminUsers() {
  const { profile } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, is_admin, must_change_password, active')
      .order('created_at')
    setUsers(data ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <Card title="Users">
        <ul>
          {users.map((u) => (
            <UserRow key={u.id} user={u} isSelf={u.id === profile?.id} onChanged={load} />
          ))}
        </ul>
      </Card>
      <Card title="Add a user">
        <AddUser onAdded={load} />
      </Card>
    </div>
  )
}
