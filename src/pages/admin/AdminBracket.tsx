import { useState, type FormEvent } from 'react'
import { rpcMessage, useBracket, type Bracket, type BracketPhase } from '../../bracket/BracketProvider'
import { useProgress } from '../../bracket/useProgress'
import { Button, Card, ErrorText, TextField } from '../../components/ui'
import { supabase } from '../../lib/supabase'

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
          className="rounded-sm border border-line bg-ink-900 px-3 py-2 text-base text-ivory outline-none focus:border-gold-500"
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
  const { progress } = useProgress(bracket?.phase === 'nominations' ? bracket.id : undefined)
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

  const setPhase = (to: BracketPhase, text: string) =>
    run(() => supabase.rpc('set_bracket_phase', { p_bracket_id: bracket!.id, p_to: to }), text)

  if (!bracket || bracket.phase === 'complete') {
    return (
      <Card>
        <h2 className="label-caps mb-4">Start a new bracket</h2>
        {bracket && (
          <p className="mb-4 text-sm text-ivory-muted">“{bracket.title}” will move to the archive.</p>
        )}
        <BracketForm onDone={refresh} />
      </Card>
    )
  }

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="label-caps">Current bracket · {bracket.phase}</h2>
          <p className="mt-1 font-display text-xl text-gold-500">{bracket.title}</p>
        </div>
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
            {progress && (
              <p className="label-caps" role="status">
                {progress.submitted} of {progress.total} have submitted
              </p>
            )}
            <Button
              disabled={busy}
              onClick={() =>
                setPhase(
                  'review',
                  `${progress?.submitted ?? '?'} of ${progress?.total ?? '?'} have submitted.\n\nClose nominations and reveal everyone's lists?`,
                )
              }
            >
              Close nominations and reveal
            </Button>
          </>
        )}

        {bracket.phase === 'review' && (
          <>
            <p className="text-sm text-ivory-muted">Review, merging and seeding arrive in the next build phase.</p>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                setPhase('nominations', 'Reopen nominations? Everyone can edit their lists again, and lists go back to private until you close again.')
              }
            >
              Reopen nominations
            </Button>
          </>
        )}

        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  )
}
