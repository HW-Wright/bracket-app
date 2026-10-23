import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../../../auth/AuthProvider'
import { useBracket } from '../../../bracket/BracketProvider'
import EntryThumb from '../../../components/EntryThumb'
import { Badge, Button, Card, ErrorText, Led, PageTitle } from '../../../components/ui'
import EntriesTab from './EntriesTab'
import MergeDialog from './MergeDialog'
import { rootOf, useReview, type ReviewData, type Standing, type Suggestion } from './useReview'

type Act = (fn: string, args: Record<string, unknown>) => Promise<string | null>
const SEEDS = 64

function SeedRow({ s }: { s: Standing }) {
  const cut = (s.position ?? 0) > SEEDS
  return (
    <li className={`flex min-h-12 items-center gap-3 border-b border-line pr-3 last:border-0 ${cut ? 'opacity-60' : ''}`}>
      <Led className="flex h-12 w-11 shrink-0 items-center justify-center text-lg">{cut ? '—' : (s.seed ?? s.position)}</Led>
      <EntryThumb name={s.name} path={s.image_path} size={32} />
      <span className="min-w-0 flex-1 truncate text-lg font-semibold">{s.name}</span>
      <span className="shrink-0 text-right text-sm font-bold text-muted uppercase">
        {s.nominators} nom{s.nominators === 1 ? '' : 's'}
      </span>
      <Led className="w-12 shrink-0 py-1 text-center text-lg">{s.points}</Led>
    </li>
  )
}

function SeedingTab({ data, locked, onLock, busy }: { data: ReviewData; locked: boolean; onLock: () => void; busy: boolean }) {
  const live = data.standings.filter((s) => !s.removed)
  const seeded = live.slice(0, SEEDS)
  const cut = live.slice(SEEDS)
  const shortfall = Math.max(0, SEEDS - live.length)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [live.length, 'Entries'],
          [Math.min(SEEDS, live.length), 'Seeded'],
          [cut.length, 'Cut'],
        ].map(([n, label]) => (
          <div key={label} className="flex flex-col border border-line bg-navy-800 py-2">
            <span className="font-led text-3xl text-amber">{n}</span>
            <span className="label-caps">{label}</span>
          </div>
        ))}
      </div>

      {shortfall > 0 && !locked && (
        <p role="alert" className="border-2 border-danger bg-navy-900 p-3 text-base">
          {shortfall} short of 64. Add entries manually on the Entries tab (they score 0) before you can lock.
        </p>
      )}
      <p className="text-base text-muted">Order: points, then number of nominators, then a fixed random tiebreak.</p>

      <Card title={locked ? 'Locked seeds' : 'Seeds 1–64'}>
        <ol className="-m-4">
          {seeded.map((s) => (
            <SeedRow key={s.entry_id} s={s} />
          ))}
        </ol>
      </Card>

      {cut.length > 0 && (
        <>
          <div className="flex items-center gap-3" role="separator" aria-label="Cut line">
            <span className="h-0.5 flex-1 bg-danger" />
            <Badge tone="live">Cut line</Badge>
            <span className="h-0.5 flex-1 bg-danger" />
          </div>
          <Card title={`Cut · ${cut.length}`}>
            <ol className="-m-4">
              {cut.map((s) => (
                <SeedRow key={s.entry_id} s={s} />
              ))}
            </ol>
          </Card>
        </>
      )}

      {!locked && (
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] border-t border-line bg-navy-950/95 py-3 backdrop-blur">
          <Button onClick={onLock} disabled={shortfall > 0 || busy} className="w-full">
            {shortfall > 0 ? `Need ${shortfall} more to lock` : 'Lock seeding and tip off'}
          </Button>
        </div>
      )}
    </div>
  )
}

function SuggestionsTab({ data, act }: { data: ReviewData; act: Act }) {
  const [merging, setMerging] = useState<Suggestion | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (data.suggestions.length === 0) {
    return <p className="text-base text-muted">No likely duplicates left. Exact matches were already combined when nominations closed.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-muted">Close matches only: nothing is merged unless you confirm it.</p>
      <ErrorText>{error}</ErrorText>
      {data.suggestions.map((s) => (
        <article key={`${s.entry_a}-${s.entry_b}`} className="border-2 border-line bg-navy-900">
          <div className="led flex justify-between border-b-2 border-line px-3 py-1 font-bold tracking-widest text-muted uppercase">
            <span className="font-led text-amber">Possible match</span>
            <span>{Math.round(s.score * 100)}%</span>
          </div>
          <div className="flex flex-col gap-1 p-3 text-lg font-semibold">
            <span>{s.name_a}</span>
            <span className="slant self-start bg-yellow px-2 font-display text-sm text-navy-950">VS</span>
            <span>{s.name_b}</span>
          </div>
          <div className="flex gap-2 p-3 pt-0">
            <Button variant="ghost" className="flex-1" onClick={async () => setError(await act('dismiss_suggestion', { p_a: s.entry_a, p_b: s.entry_b }))}>
              Not the same
            </Button>
            <Button className="flex-1" onClick={() => setMerging(s)}>
              Merge…
            </Button>
          </div>
        </article>
      ))}
      {merging && (
        <MergeDialog
          a={{ id: merging.entry_a, name: merging.name_a }}
          b={{ id: merging.entry_b, name: merging.name_b }}
          onCancel={() => setMerging(null)}
          onMerge={async (name) => {
            const err = await act('merge_entries', { p_a: merging.entry_a, p_b: merging.entry_b, p_name: name })
            if (!err) setMerging(null)
            return err
          }}
        />
      )}
    </div>
  )
}

type SortKey = 'nominator' | 'rank' | 'text' | 'entry'

function NominationsTab({ data }: { data: ReviewData }) {
  const [sort, setSort] = useState<SortKey>('nominator')
  const [who, setWho] = useState('all')
  const [query, setQuery] = useState('')
  const names = new Map(data.standings.map((s) => [s.entry_id, s.name]))
  const people = [...new Map(data.nominations.map((n) => [n.user_id, n.profiles?.display_name ?? '?'])).entries()].sort((a, b) => a[1].localeCompare(b[1]))

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = data.nominations
      .map((n) => ({
        ...n,
        who: n.profiles?.display_name ?? '?',
        entry: n.entry_id ? (names.get(rootOf(n.entry_id, data.children)) ?? '?') : null,
      }))
      .filter((n) => (who === 'all' || n.user_id === who) && (!q || n.text.toLowerCase().includes(q) || n.entry?.toLowerCase().includes(q)))
    const by: Record<SortKey, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      nominator: (a, b) => a.who.localeCompare(b.who) || a.rank - b.rank,
      rank: (a, b) => a.rank - b.rank || a.who.localeCompare(b.who),
      text: (a, b) => a.text.localeCompare(b.text),
      entry: (a, b) => (a.entry ?? '~').localeCompare(b.entry ?? '~') || a.rank - b.rank,
    }
    return list.sort(by[sort])
  }, [data, sort, who, query]) // eslint-disable-line react-hooks/exhaustive-deps

  const select = 'min-h-11 border-2 border-line bg-navy-800 px-2 text-base text-white outline-none focus:border-orange'
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Nominator" value={who} onChange={(e) => setWho(e.target.value)} className={select}>
          <option value="all">Everyone</option>
          {people.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={select}>
          <option value="nominator">Sort: nominator</option>
          <option value="rank">Sort: rank</option>
          <option value="text">Sort: text</option>
          <option value="entry">Sort: entry</option>
        </select>
      </div>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter text or entry" aria-label="Filter nominations" className={select + ' px-3 text-lg'} />
      <p className="label-caps">{rows.length} nominations</p>
      <ol className="border border-line bg-navy-800">
        {rows.map((n) => (
          <li key={n.id} className="flex items-center gap-3 border-b border-line pr-3 last:border-0">
            <Led className="flex h-12 w-10 shrink-0 items-center justify-center">{n.rank}</Led>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-semibold">{n.text}</span>
              <span className="block truncate text-sm font-semibold text-muted uppercase">
                {n.who} ·{' '}
                {n.entry ? (n.entry === n.text.trim() ? 'own entry' : `→ ${n.entry}`) : <span className="text-danger">not counted (incomplete list)</span>}
              </span>
            </span>
            <span className="shrink-0 font-led text-amber">{n.entry ? 16 - n.rank : 0}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function RemovedTab({ data, act, locked }: { data: ReviewData; act: Act; locked: boolean }) {
  const removed = data.standings.filter((s) => s.removed)
  const [error, setError] = useState<string | null>(null)
  if (removed.length === 0) return <p className="text-base text-muted">Nothing removed.</p>
  return (
    <div className="flex flex-col gap-2">
      <ErrorText>{error}</ErrorText>
      {removed.map((s) => (
        <div key={s.entry_id} className="flex min-h-14 items-center gap-3 border border-line bg-navy-800 px-3">
          <span className="min-w-0 flex-1 truncate text-lg font-semibold">{s.name}</span>
          <Led className="w-12 py-1 text-center">{s.points}</Led>
          {!locked && (
            <Button variant="ghost" onClick={async () => setError(await act('set_entry_removed', { p_entry_id: s.entry_id, p_removed: false }))}>
              Restore
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

const TABS = ['Seeding', 'Entries', 'Suggestions', 'Nominations', 'Removed'] as const

export default function AdminReview() {
  const { profile } = useAuth()
  const { bracket, refresh } = useBracket()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Seeding')
  const [busy, setBusy] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)
  const review = useReview(bracket?.id ?? '')

  if (!profile?.is_admin) return <Navigate to="/" replace />
  if (!bracket || !['review', 'live', 'complete'].includes(bracket.phase)) return <Navigate to="/admin" replace />
  const locked = bracket.phase !== 'review'
  const { data } = review

  async function lock() {
    if (!data) return
    const live = data.standings.filter((s) => !s.removed)
    const cut = live.slice(SEEDS)
    const msg = `Lock seeding for “${bracket!.title}”?\n\n${live.length} entries: seeds 1–64 are fixed${cut.length ? `, ${cut.length} cut` : ''}. Merges and edits are frozen (images can still be added). Voting opens for Round of 64 · Quarter A.`
    if (!confirm(msg)) return
    setBusy(true)
    const err = await review.act('lock_seeding', { p_bracket_id: bracket!.id })
    setBusy(false)
    setLockError(err)
    if (!err) await refresh()
  }

  const counts: Partial<Record<(typeof TABS)[number], number>> = data
    ? { Suggestions: data.suggestions.length, Removed: data.standings.filter((s) => s.removed).length }
    : {}

  return (
    <>
      <Link to="/admin" className="mb-3 inline-flex min-h-11 items-center text-base font-bold text-orange uppercase">
        ← Admin
      </Link>
      <PageTitle eyebrow={locked ? 'Seeding locked' : 'Review & seeding'}>{bracket.title}</PageTitle>

      <div role="tablist" className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1">
        {TABS.filter((t) => !locked || t === 'Seeding' || t === 'Entries').map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`slant min-h-11 shrink-0 px-3 text-base font-extrabold tracking-wider uppercase ${tab === t ? 'bg-orange text-navy-950' : 'bg-navy-800 text-muted'}`}
          >
            {t}
            {counts[t] ? <span className="ml-1.5 font-led">{counts[t]}</span> : null}
          </button>
        ))}
      </div>

      <ErrorText>{review.error ?? lockError}</ErrorText>
      {!data ? (
        <p className="text-base text-muted">Loading…</p>
      ) : tab === 'Seeding' ? (
        <SeedingTab data={data} locked={locked} onLock={lock} busy={busy} />
      ) : tab === 'Entries' ? (
        <EntriesTab bracketId={bracket.id} data={data} locked={locked} act={review.act} reload={review.reload} />
      ) : tab === 'Suggestions' ? (
        <SuggestionsTab data={data} act={review.act} />
      ) : tab === 'Nominations' ? (
        <NominationsTab data={data} />
      ) : (
        <RemovedTab data={data} act={review.act} locked={locked} />
      )}
    </>
  )
}
