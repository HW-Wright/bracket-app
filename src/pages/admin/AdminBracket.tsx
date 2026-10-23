import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { rpcMessage, useBracket, type Bracket, type BracketPhase } from '../../bracket/BracketProvider'
import { useProgress } from '../../bracket/useProgress'
import { Badge, Button, Card, ErrorText, Led, TextField } from '../../components/ui'
import { IMAGE_BUCKET } from '../../lib/image'
import { supabase } from '../../lib/supabase'

interface UserStatus {
  user_id: string
  display_name: string
  count: number
  has_repeats: boolean
  complete: boolean
}

function useAdminStatus(bracketId: string | undefined) {
  const [rows, setRows] = useState<UserStatus[] | null>(null)
  const reload = useCallback(async () => {
    if (!bracketId) return setRows(null)
    const { data } = await supabase.rpc('admin_nomination_status', { p_bracket_id: bracketId })
    setRows((data as UserStatus[]) ?? [])
  }, [bracketId])
  useEffect(() => {
    reload()
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])
  return { rows, reload }
}

function StatusList({ rows }: { rows: UserStatus[] }) {
  return (
    <ul className="divide-y divide-line border border-line">
      {rows.map((r) => (
        <li key={r.user_id} className="flex min-h-11 items-center justify-between gap-3 pr-3 text-lg">
          <span className="flex items-center gap-3">
            <Led className={`flex h-11 w-14 items-center justify-center ${r.complete ? 'text-ok!' : ''}`}>{r.count}/15</Led>
            <span className="font-semibold">{r.display_name}</span>
          </span>
          <span className={`text-base font-bold uppercase ${r.complete ? 'text-ok' : r.has_repeats ? 'text-danger' : 'text-muted'}`}>
            {r.complete ? 'Submitted ✓' : r.count === 0 ? 'Nothing yet' : r.has_repeats ? 'Has a repeat' : 'Draft'}
          </span>
        </li>
      ))}
    </ul>
  )
}

function BracketForm({ bracket, onDone }: { bracket?: Bracket; onDone: () => void }) {
  const [title, setTitle] = useState(bracket?.title ?? '')
  const [description, setDescription] = useState(bracket?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = bracket
      ? await supabase.rpc('update_bracket', { p_bracket_id: bracket.id, p_title: title, p_description: description })
      : await supabase.rpc('create_bracket', { p_title: title, p_description: description })
    setBusy(false)
    setError(rpcMessage(error))
    if (!error) onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <TextField label="Title / topic" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Description (optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={280}
          rows={3}
          className="border border-line bg-navy-800 px-3 py-2 text-base text-white outline-none focus:border-orange"
        />
      </label>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy}>
        {bracket ? 'Save changes' : 'Create bracket (draft)'}
      </Button>
    </form>
  )
}

export default function AdminBracket() {
  const { bracket, refresh } = useBracket()
  const { progress, reload: reloadProgress } = useProgress(bracket?.phase === 'nominations' ? bracket.id : undefined)
  const showStatus = bracket?.phase === 'nominations' || bracket?.phase === 'review'
  const { rows: status, reload: reloadStatus } = useAdminStatus(showStatus ? bracket?.id : undefined)
  const incomplete = (status ?? []).filter((r) => !r.complete)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, confirmText: string) {
    if (!confirm(confirmText)) return
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    setError(rpcMessage(error))
    await refresh()
  }

  async function abandon() {
    const b = bracket!
    const lost =
      b.phase === 'live' || b.phase === 'complete'
        ? "everyone's nominations, every vote and every result so far, and all entry images. It will not go to the archive"
        : b.phase === 'review'
          ? "everyone's nominations, your review work and any entry images"
          : "everyone's nominations"
    const typed = prompt(`This permanently deletes “${b.title}”: ${lost}. This can't be undone.\n\nType the bracket title to confirm:`)
    if (typed === null) return
    setBusy(true)
    const { error } = await supabase.rpc('abandon_bracket', { p_bracket_id: b.id, p_confirm_title: typed })
    if (!error) {
      // The bracket's images live under its folder in storage; tidy them up too.
      const { data: files } = await supabase.storage.from(IMAGE_BUCKET).list(b.id, { limit: 1000 })
      if (files?.length) await supabase.storage.from(IMAGE_BUCKET).remove(files.map((f) => `${b.id}/${f.name}`))
    }
    setBusy(false)
    setError(rpcMessage(error))
    await refresh()
  }

  const setPhase = (to: BracketPhase, text: string) =>
    run(() => supabase.rpc('set_bracket_phase', { p_bracket_id: bracket!.id, p_to: to }), text)

  if (!bracket || bracket.phase === 'complete') {
    return (
      <Card title="Start a new bracket">
        {bracket && (
          <p className="mb-4 text-base text-muted">“{bracket.title}” will move to the archive.</p>
        )}
        <BracketForm onDone={refresh} />
        {bracket && (
          <>
            <Button variant="danger" disabled={busy} onClick={abandon} className="mt-6 w-full">
              Delete “{bracket.title}” instead of archiving…
            </Button>
            <ErrorText>{error}</ErrorText>
          </>
        )}
      </Card>
    )
  }

  return (
    <Card
      title="Current bracket"
      aside={<Badge tone={bracket.phase === 'nominations' || bracket.phase === 'live' ? 'live' : 'yellow'}>{bracket.phase}</Badge>}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="font-display text-2xl leading-tight uppercase">{bracket.title}</p>
        {(bracket.phase === 'draft' || bracket.phase === 'nominations') && (
          <Button variant="ghost" onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel' : 'Edit'}
          </Button>
        )}
      </div>

      {editing && (
        <div className="mb-4">
          <BracketForm
            bracket={bracket}
            onDone={async () => {
              setEditing(false)
              await refresh()
            }}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {bracket.phase === 'draft' && (
          <>
            <Button disabled={busy} onClick={() => setPhase('nominations', `Open nominations for “${bracket.title}”?`)}>
              Open nominations
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                run(() => supabase.rpc('delete_draft_bracket', { p_bracket_id: bracket.id }), 'Delete this draft bracket?')
              }
            >
              Delete draft
            </Button>
          </>
        )}

        {bracket.phase === 'nominations' && (
          <>
            <div className="flex items-center justify-between">
              {progress && (
                <p className="label-caps" role="status">
                  {progress.submitted} of {progress.total} have submitted
                </p>
              )}
              <button
                type="button"
                className="min-h-11 px-2 text-base font-bold text-orange uppercase"
                onClick={() => {
                  reloadProgress()
                  reloadStatus()
                }}
              >
                Refresh
              </button>
            </div>
            {status && <StatusList rows={status} />}
            <Button
              disabled={busy}
              onClick={() =>
                setPhase(
                  'review',
                  incomplete.length === 0
                    ? `Everyone has submitted.\n\nClose nominations and reveal everyone's lists?`
                    : `Not complete, and won't count: ${incomplete
                        .map((r) => `${r.display_name} (${r.count}/15${r.has_repeats ? ', repeat' : ''})`)
                        .join(', ')}.\n\nClose nominations anyway and reveal everyone's lists?`,
                )
              }
            >
              Close nominations and reveal
            </Button>
          </>
        )}

        {bracket.phase === 'review' && (
          <>
            {status && incomplete.length > 0 && (
              <p className="text-base text-muted">
                Not counted (incomplete at close): {incomplete.map((r) => r.display_name).join(', ')}. Reopen nominations to
                let them finish.
              </p>
            )}
            <Link
              to="/admin/review"
              className="plate flex min-h-14 items-center bg-orange pr-8 pl-4 font-display text-xl font-extrabold text-navy-950 uppercase italic hover:bg-yellow"
            >
              Review &amp; seeding ▸
            </Link>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                setPhase('nominations', 'Reopen nominations? Everyone can edit their lists again, lists go back to private, and ALL review work (merges, manual entries, removals, images) is discarded. Closing again rebuilds entries from scratch.')
              }
            >
              Reopen nominations
            </Button>
          </>
        )}

        {bracket.phase === 'live' && (
          <Link to="/admin/review" className="flex min-h-11 items-center text-base font-bold text-orange uppercase">
            Seeds &amp; entry images →
          </Link>
        )}

        {bracket.phase !== 'draft' && (
          <Button variant="danger" disabled={busy} onClick={abandon} className="mt-4">
            Abandon bracket…
          </Button>
        )}

        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  )
}
