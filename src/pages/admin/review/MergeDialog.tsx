import { useState, type FormEvent } from 'react'
import { Button, ErrorText, TextField } from '../../../components/ui'

interface Side {
  id: string
  name: string
}

/** Confirm a merge and choose (or type) the canonical name. */
export default function MergeDialog({
  a,
  b,
  onCancel,
  onMerge,
}: {
  a: Side
  b: Side
  onCancel: () => void
  onMerge: (name: string) => Promise<string | null>
}) {
  const [choice, setChoice] = useState<'a' | 'b' | 'custom'>('a')
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const name = choice === 'a' ? a.name : choice === 'b' ? b.name : custom.trim()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name) return setError('Type a name')
    setBusy(true)
    const err = await onMerge(name)
    setBusy(false)
    if (err) setError(err)
  }

  const option = (value: 'a' | 'b', label: string) => (
    <label className={`flex min-h-12 cursor-pointer items-center gap-3 border-2 px-3 ${choice === value ? 'border-orange bg-navy-700' : 'border-line'}`}>
      <input type="radio" name="merge-name" checked={choice === value} onChange={() => setChoice(value)} className="h-5 w-5 accent-orange" />
      <span className="text-lg font-semibold">{label}</span>
    </label>
  )

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="merge-title">
      <form onSubmit={submit} className="flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto border-t-4 border-orange bg-navy-800 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <h2 id="merge-title" className="font-display text-2xl uppercase">
          Merge entries
        </h2>
        <p className="text-base text-muted">
          Points add up. Anyone who nominated both counts once, at their better rank. You can unmerge until seeding is
          locked.
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="label-caps mb-2">Name to keep</legend>
          {option('a', a.name)}
          {option('b', b.name)}
          <label className={`flex min-h-12 cursor-pointer items-center gap-3 border-2 px-3 ${choice === 'custom' ? 'border-orange bg-navy-700' : 'border-line'}`}>
            <input type="radio" name="merge-name" checked={choice === 'custom'} onChange={() => setChoice('custom')} className="h-5 w-5 accent-orange" />
            <span className="text-lg font-semibold">Something else…</span>
          </label>
          {choice === 'custom' && (
            <TextField label="Merged name" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={120} autoFocus />
          )}
        </fieldset>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={busy} className="flex-1">
            {busy ? 'Merging…' : 'Merge'}
          </Button>
        </div>
      </form>
    </div>
  )
}
