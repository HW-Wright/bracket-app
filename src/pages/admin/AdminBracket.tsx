import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { rpcMessage, useBracket, type Bracket, type BracketPhase } from '../../bracket/BracketProvider'
import { useProgress } from '../../bracket/useProgress'
import { ActionLink, Badge, Button, Card, ErrorText, Led, TextField } from '../../components/ui'
import { BRACKET_SIZES, DEFAULT_SIZE } from '../../lib/bracket'
import { IMAGE_BUCKET } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import { AllNominations, type NominationRow } from '../nominate/Nominate'

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

/** Admin only: everyone's lists (drafts included) while nominations are open. */
function OpenNominations({ bracketId }: { bracketId: string }) {
  const [rows, setRows] = useState<NominationRow[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('nominations')
      .select('user_id, rank, text, profiles(display_name)')
      .eq('bracket_id', bracketId)
      .order('rank')
    setRows((data as unknown as NominationRow[]) ?? [])
  }, [bracketId])
  return (
    <details className="border border-line bg-navy-900" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-base font-extrabold tracking-wide uppercase italic">
        View everyone's nominations
      </summary>
      <div className="flex flex-col gap-2 p-3">
        <p className="text-sm font-semibold text-muted">Only you can see these while nominations are open. Lists are live drafts and may still change.</p>
        {rows === null ? <p className="text-base text-muted">Loading…</p> : <AllNominations rows={rows} open title="Live lists" />}
        <button type="button" onClick={load} className="min-h-11 self-start text-base font-bold text-orange uppercase">
          Refresh
        </button>
      </div>
    </details>
  )
}

function BracketForm({ bracket, onDone }: { bracket?: Bracket; onDone: () => void }) {
  const [title, setTitle] = useState(bracket?.title ?? '')
  const [description, setDescription] = useState(bracket?.description ?? '')
  const [size, setSize] = useState<number>(bracket?.size ?? DEFAULT_SIZE)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = bracket
      ? await supabase.rpc('update_bracket', { p_bracket_id: bracket.id, p_title: title, p_description: description, p_size: size })
      : await supabase.rpc('create_bracket', { p_title: title, p_description: description, p_size: size })
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
      <fieldset className="flex flex-col gap-1.5">
        <legend className="label-caps mb-1.5">Bracket size (seeds)</legend>
        <div className="grid grid-cols-5 gap-1">
          {BRACKET_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={size === n}
              onClick={() => setSize(n)}
              className={`slant min-h-11 text-lg font-extrabold ${size === n ? 'bg-orange text-navy-950' : 'bg-navy-900 text-muted hover:text-white'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted">
          {size === 128
            ? 'Can be changed until seeding is locked. Eight full lists give at most 120 different entries, so expect to add some by hand.'
            : 'Can be changed until seeding is locked.'}
        </span>
      </fieldset>
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
      <div className="flex flex-col gap-6">
        {bracket && (
          <Card title="Finished bracket" aside={<Badge>complete</Badge>}>
            <p className="mb-1 font-display text-2xl leading-tight uppercase">{bracket.title}</p>
            <p className="mb-4 text-base text-muted">
              Archive it now to clear the decks, or leave it up: starting the next bracket archives it anyway. Archived
              brackets keep everything and stay viewable under Past brackets.
            </p>
            <div className="flex flex-col gap-3">
              <Button
                disabled={busy}
                onClick={() =>
                  run(
                    () => supabase.rpc('archive_bracket', { p_bracket_id: bracket.id }),
                    `Archive “${bracket.title}” now?\n\nIt moves to Past brackets with every vote and result kept. Home shows no bracket until you start the next one.`,
                  )
                }
              >
                Archive now
              </Button>
              <Button variant="danger" disabled={busy} onClick={abandon}>
                Delete “{bracket.title}” instead of archiving…
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </Card>
        )}
        <Card title="Start a new bracket">
          {bracket && <p className="mb-4 text-base text-muted">Starting one also archives “{bracket.title}”.</p>}
          <BracketForm onDone={refresh} />
        </Card>
      </div>
    )
  }

  return (
    <Card
      title="Current bracket"
      aside={<Badge>{bracket.phase}</Badge>}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl leading-tight uppercase">{bracket.title}</p>
          <p className="label-caps mt-1">{bracket.size} seeds</p>
        </div>
        {(bracket.phase === 'draft' || bracket.phase === 'nominations' || bracket.phase === 'review') && (
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
            <OpenNominations bracketId={bracket.id} />
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
            <ActionLink to="/admin/review">Review & seeding</ActionLink>
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
