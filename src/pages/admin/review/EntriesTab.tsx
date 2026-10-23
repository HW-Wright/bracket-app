import { useState, type FormEvent } from 'react'
import EntryThumb from '../../../components/EntryThumb'
import { Badge, Button, ErrorText, Led } from '../../../components/ui'
import { clearEntryImage, uploadEntryImage } from '../../../lib/image'
import MergeDialog from './MergeDialog'
import type { ReviewData, Standing } from './useReview'

type Act = (fn: string, args: Record<string, unknown>) => Promise<string | null>

function EntryRow({
  entry,
  data,
  bracketId,
  locked,
  selected,
  onToggle,
  act,
  reload,
}: {
  entry: Standing
  data: ReviewData
  bracketId: string
  locked: boolean
  selected: boolean
  onToggle: () => void
  act: Act
  reload: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const children = data.children.filter((c) => c.merged_into === entry.entry_id)

  async function run(p: Promise<string | null>) {
    setBusy(true)
    setError(await p)
    setBusy(false)
  }

  function rename() {
    const name = prompt('New name', entry.name)
    if (name && name.trim() !== entry.name) run(act('rename_entry', { p_entry_id: entry.entry_id, p_name: name }))
  }

  async function onImage(file: File | undefined) {
    if (!file) return
    await run(uploadEntryImage(bracketId, entry.entry_id, file, entry.image_path))
    await reload()
  }

  return (
    <li className={`border ${selected ? 'border-orange bg-navy-700' : 'border-line bg-navy-800'}`}>
      <div className="flex items-center gap-2 pr-2">
        {!locked && (
          <label className="flex h-14 w-11 shrink-0 cursor-pointer items-center justify-center" aria-label={`Select ${entry.name} to merge`}>
            <input type="checkbox" checked={selected} onChange={onToggle} className="h-5 w-5 accent-orange" />
          </label>
        )}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left ${locked ? 'pl-2' : ''}`}>
          <EntryThumb name={entry.name} path={entry.image_path} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold">{entry.name}</span>
            <span className="flex flex-wrap gap-x-2 text-sm font-semibold text-muted uppercase">
              <span>
                {entry.nominators} nom{entry.nominators === 1 ? '' : 's'}
              </span>
              {entry.spellings.length > 1 && <span className="text-yellow">{entry.spellings.length} spellings</span>}
              {entry.merged_count > 0 && <span className="text-yellow">merged ×{entry.merged_count + 1}</span>}
              {entry.manual && <span>manual</span>}
            </span>
          </span>
          <Led className="w-12 py-1 text-center text-lg">{entry.points}</Led>
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          {entry.spellings.length > 0 && (
            <p className="text-base">
              <span className="label-caps mr-2">Spellings</span>
              {entry.spellings.join(' · ')}
            </p>
          )}
          {children.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="label-caps">Merged in</span>
              {children.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2">
                  <span className="text-base">{c.name}</span>
                  {!locked && (
                    <Button variant="ghost" disabled={busy} onClick={() => run(act('unmerge_entry', { p_entry_id: c.id }))}>
                      Unmerge
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <label className="flex min-h-11 cursor-pointer items-center border-2 border-line bg-navy-800 px-4 text-base font-bold tracking-wider uppercase hover:border-orange">
              {entry.image_path ? 'Replace image' : 'Add image'}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onImage(e.target.files?.[0])} disabled={busy} />
            </label>
            {entry.image_path && (
              <Button variant="ghost" disabled={busy} onClick={async () => { await run(clearEntryImage(entry.entry_id, entry.image_path)); await reload() }}>
                Remove image
              </Button>
            )}
            {!locked && (
              <>
                <Button variant="ghost" disabled={busy} onClick={rename}>
                  Rename
                </Button>
                {entry.spellings.length > 1 && entry.merged_count === 0 && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      confirm(`Split “${entry.name}” into ${entry.spellings.length} separate entries, one per spelling?`) &&
                      run(act('split_entry', { p_entry_id: entry.entry_id }))
                    }
                  >
                    Split spellings
                  </Button>
                )}
                {entry.merged_count === 0 && (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      confirm(`Remove “${entry.name}” (${entry.points} pts)? It goes to the Removed list and can be restored until you lock.`) &&
                      run(act('set_entry_removed', { p_entry_id: entry.entry_id, p_removed: true }))
                    }
                  >
                    Remove
                  </Button>
                )}
              </>
            )}
          </div>
          {busy && <p className="text-base text-muted">Working…</p>}
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </li>
  )
}

function AddManual({ bracketId, act }: { bracketId: string; act: Act }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const err = await act('add_manual_entry', { p_bracket_id: bracketId, p_name: name })
    setError(err)
    if (!err) setName('')
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Add an entry manually (scores 0)"
          aria-label="Manual entry name"
          className="min-h-11 min-w-0 flex-1 border-2 border-line bg-navy-800 px-3 text-lg text-white outline-none placeholder:text-muted/80 focus:border-orange"
        />
        <Button type="submit" variant="ghost" disabled={!name.trim()}>
          Add
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  )
}

export default function EntriesTab({
  bracketId,
  data,
  locked,
  act,
  reload,
}: {
  bracketId: string
  data: ReviewData
  locked: boolean
  act: Act
  reload: () => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [merging, setMerging] = useState(false)

  const live = data.standings.filter((s) => !s.removed)
  const shown = query.trim() ? live.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()) || s.spellings.some((t) => t.toLowerCase().includes(query.trim().toLowerCase()))) : live
  const pick = selected.map((id) => live.find((s) => s.entry_id === id)).filter((s): s is Standing => !!s)

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2)))
  }

  return (
    <div className="flex flex-col gap-4">
      {!locked && <AddManual bracketId={bracketId} act={act} />}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${live.length} entries`}
        aria-label="Search entries"
        className="min-h-11 border-2 border-line bg-navy-800 px-3 text-lg text-white outline-none placeholder:text-muted/80 focus:border-orange"
      />
      {!locked && <p className="text-base text-muted">Tick two entries to merge them. Tap an entry for its spellings, image, rename, split and remove.</p>}
      <ol className="flex flex-col gap-2">
        {shown.map((s) => (
          <EntryRow
            key={s.entry_id}
            entry={s}
            data={data}
            bracketId={bracketId}
            locked={locked}
            selected={selected.includes(s.entry_id)}
            onToggle={() => toggle(s.entry_id)}
            act={act}
            reload={reload}
          />
        ))}
      </ol>

      {pick.length > 0 && (
        <div className="unstick-with-keyboard sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] flex items-center gap-3 border-t border-line bg-navy-950/95 py-3 backdrop-blur">
          <span className="min-w-0 flex-1 truncate text-base">
            <Badge tone="yellow" className="mr-2">
              {pick.length}/2
            </Badge>
            {pick.map((p) => p.name).join(' + ')}
          </span>
          <Button variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
          <Button disabled={pick.length !== 2} onClick={() => setMerging(true)}>
            Merge
          </Button>
        </div>
      )}

      {merging && pick.length === 2 && (
        <MergeDialog
          a={{ id: pick[0].entry_id, name: pick[0].name }}
          b={{ id: pick[1].entry_id, name: pick[1].name }}
          onCancel={() => setMerging(false)}
          onMerge={async (name) => {
            const err = await act('merge_entries', { p_a: pick[0].entry_id, p_b: pick[1].entry_id, p_name: name })
            if (!err) {
              setMerging(false)
              setSelected([])
            }
            return err
          }}
        />
      )}
    </div>
  )
}
