import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState, type FormEvent } from 'react'
import { rpcMessage } from '../../bracket/BracketProvider'
import { Button, ErrorText } from '../../components/ui'
import { findOwnDuplicates, MAX_NOMINATIONS, moveItem } from '../../lib/normalise'
import { supabase } from '../../lib/supabase'

interface Item {
  key: string
  text: string
}

let nextKey = 0
const toItems = (texts: string[]): Item[] => texts.map((text) => ({ key: `n${nextKey++}`, text }))

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-ivory-muted hover:text-gold-500 disabled:opacity-25"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d={children} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function Row({
  item,
  index,
  count,
  duplicate,
  onChange,
  onMove,
  onRemove,
}: {
  item: Item
  index: number
  count: number
  duplicate: boolean
  onChange: (text: string) => void
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-sm border bg-ink-900 pr-1 ${
        isDragging ? 'z-10 border-gold-500 shadow-lg shadow-black' : duplicate ? 'border-gold-700' : 'border-line'
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Drag to reorder ${item.text || 'nomination'}`}
        className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-ivory-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <svg viewBox="0 0 12 20" className="h-5 w-3" fill="currentColor" aria-hidden>
          {[3, 10, 17].flatMap((y) => [<circle key={`a${y}`} cx="3" cy={y} r="1.5" />, <circle key={`b${y}`} cx="9" cy={y} r="1.5" />])}
        </svg>
      </button>
      <span className="w-6 shrink-0 text-right font-display text-gold-500">{index + 1}</span>
      <input
        value={item.text}
        onChange={(e) => onChange(e.target.value)}
        maxLength={120}
        aria-label={`Nomination ${index + 1}`}
        className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-base text-ivory outline-none focus:bg-ink-800"
      />
      <IconButton label="Move up" onClick={() => onMove(index - 1)} disabled={index === 0}>
        M6 15l6-6 6 6
      </IconButton>
      <IconButton label="Move down" onClick={() => onMove(index + 1)} disabled={index === count - 1}>
        M6 9l6 6 6-6
      </IconButton>
      <IconButton label={`Remove ${item.text || 'nomination'}`} onClick={onRemove}>
        M6 6l12 12M18 6L6 18
      </IconButton>
    </li>
  )
}

export default function NominationEditor({
  bracketId,
  initial,
  onSaved,
}: {
  bracketId: string
  initial: string[]
  onSaved: () => void
}) {
  const [items, setItems] = useState<Item[]>(() => toItems(initial))
  const [saved, setSaved] = useState<string[]>(initial)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const texts = items.map((i) => i.text.trim())
  const dirty = texts.length !== saved.length || texts.some((t, i) => t !== saved[i])
  const duplicates = findOwnDuplicates(texts)
  const dupIndexes = new Set(duplicates.flat())
  const full = items.length >= MAX_NOMINATIONS

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function edit(next: Item[]) {
    setItems(next)
    setStatus('idle')
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.key === active.id)
    const to = items.findIndex((i) => i.key === over.id)
    edit(moveItem(items, from, to))
  }

  function add(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || full) return
    edit([...items, ...toItems([text])])
    setDraft('')
  }

  async function save() {
    const clean = texts.filter(Boolean)
    setStatus('saving')
    setError(null)
    const { error } = await supabase.rpc('save_nominations', { p_bracket_id: bracketId, p_items: clean })
    if (error) {
      setStatus('idle')
      return setError(rpcMessage(error))
    }
    setItems(toItems(clean))
    setSaved(clean)
    setStatus('saved')
    onSaved()
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ivory-muted">
        Rank up to {MAX_NOMINATIONS}, favourite first. #1 is worth 15 points, #15 is worth 1. Nobody sees your list until
        Harry closes nominations.
      </p>

      {items.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-2">
              {items.map((item, i) => (
                <Row
                  key={item.key}
                  item={item}
                  index={i}
                  count={items.length}
                  duplicate={dupIndexes.has(i)}
                  onChange={(text) => edit(items.map((it) => (it.key === item.key ? { ...it, text } : it)))}
                  onMove={(to) => edit(moveItem(items, i, to))}
                  onRemove={() => edit(items.filter((it) => it.key !== item.key))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {duplicates.length > 0 && (
        <p role="status" className="rounded-sm border border-gold-700 bg-ink-800 p-3 text-sm text-ivory">
          {duplicates.map((g) => g.map((i) => `#${i + 1}`).join(' and ')).join('; ')} look like the same thing. You can keep
          both, but they'd likely be merged and only your best rank would count.
        </p>
      )}

      {full ? (
        <p className="label-caps text-center">List full: {MAX_NOMINATIONS} of {MAX_NOMINATIONS}</p>
      ) : (
        <form onSubmit={add} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={120}
            placeholder={`Add #${items.length + 1}`}
            aria-label="New nomination"
            className="min-h-11 min-w-0 flex-1 rounded-sm border border-line bg-ink-900 px-3 text-base text-ivory outline-none placeholder:text-ivory-muted/70 focus:border-gold-500"
          />
          <Button type="submit" variant="ghost" disabled={!draft.trim()}>
            Add
          </Button>
        </form>
      )}

      <ErrorText>{error}</ErrorText>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex items-center gap-3 border-t border-line bg-ink-950/95 py-3 backdrop-blur">
        <Button onClick={save} disabled={!dirty || status === 'saving'} className="flex-1">
          {status === 'saving' ? 'Saving…' : dirty ? 'Save nominations' : 'Saved'}
        </Button>
        {status === 'saved' && !dirty && (
          <span role="status" className="text-sm text-ok">
            Saved ✓
          </span>
        )}
      </div>
    </div>
  )
}
