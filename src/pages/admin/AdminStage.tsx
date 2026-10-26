import { useCallback, useEffect, useState } from 'react'
import { rpcMessage, useBracket } from '../../bracket/BracketProvider'
import { MATCHUP_SELECT, useOpenStage, type Matchup } from '../../bracket/useStage'
import { Badge, Button, Card, ErrorText, Led } from '../../components/ui'
import { supabase } from '../../lib/supabase'

function CloseDialog({
  label,
  rows,
  busy,
  onCancel,
  onConfirm,
}: {
  label: string
  rows: { m: Matchup; a: number; b: number }[]
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const ties = rows.filter((r) => r.a === r.b).length
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="close-title">
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto border-t-4 border-orange bg-navy-800 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <h2 id="close-title" className="font-display text-2xl uppercase">
          Close {label}?
        </h2>
        {ties > 0 && (
          <p className="border-2 border-danger bg-navy-900 p-3 text-base">
            {ties} tied matchup{ties === 1 ? '' : 's'} will be decided by a server-side coin toss.
          </p>
        )}
        <ol className="flex flex-col divide-y divide-line border border-line">
          {rows.map(({ m, a, b }, i) => {
            const tie = a === b
            const leader = a > b ? m.a : m.b
            return (
              <li key={m.id} className="flex flex-col gap-0.5 px-3 py-2">
                <span className="text-sm font-bold tracking-wider text-muted uppercase">Game {i + 1}</span>
                <span className="text-base">
                  {m.a?.name} <span className="font-led text-amber">{a}–{b}</span> {m.b?.name}
                </span>
                <span className={`text-sm font-extrabold uppercase ${tie ? 'text-yellow' : 'text-ok'}`}>
                  {tie ? 'Tied: coin toss' : `→ ${leader?.name}`}
                </span>
              </li>
            )
          })}
        </ol>
        <p className="text-base text-muted">This locks the votes, reveals who voted for what and opens the next stage.</p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy} className="flex-1">
            {busy ? 'Closing…' : 'Close & advance'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Matchups in the most recently closed stage that can still be overridden. */
function Override({ bracketId, stageNumber, onDone }: { bracketId: string; stageNumber: number; onDone: () => void }) {
  const [rows, setRows] = useState<Matchup[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('matchups').select(MATCHUP_SELECT).eq('bracket_id', bracketId).eq('stage', stageNumber).order('round').order('slot')
    setRows((data as unknown as Matchup[]) ?? [])
  }, [bracketId, stageNumber])

  useEffect(() => {
    load()
  }, [load])

  async function override(m: Matchup) {
    const loser = m.winner === m.a?.id ? m.a : m.b
    const other = m.winner === m.a?.id ? m.b : m.a
    const typed = prompt(
      `Admin decision: make “${other?.name}” the winner instead of “${loser?.name}”?\n\nThis is shown publicly with an Admin badge, and any votes already cast for “${loser?.name}” in the next matchup are discarded.\n\nType OVERRIDE to confirm:`,
    )
    if (typed === null || !other) return
    const { error } = await supabase.rpc('override_matchup', { p_matchup_id: m.id, p_winner: other.id, p_confirm: typed })
    setError(rpcMessage(error))
    await load()
    onDone()
  }

  return (
    <details className="border border-line bg-navy-900">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-base font-bold tracking-wider uppercase">Override a result (bug fixing only)</summary>
      <div className="flex flex-col gap-2 p-3">
        <ErrorText>{error}</ErrorText>
        {rows.map((m, i) => {
          const winner = m.winner === m.a?.id ? m.a : m.b
          return (
            <div key={m.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-base">
                <span className="font-led text-amber">G{i + 1}</span> {winner?.name}
                {m.decided_by === 'admin' && <span className="ml-1 text-danger">(admin)</span>}
              </span>
              <Button variant="danger" onClick={() => override(m)}>
                Override…
              </Button>
            </div>
          )
        })}
      </div>
    </details>
  )
}

export default function AdminStage() {
  const { bracket, refresh } = useBracket()
  const open = useOpenStage(bracket?.phase === 'live' ? bracket.id : undefined)
  const [lastClosed, setLastClosed] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadLastClosed = useCallback(async () => {
    if (!bracket) return
    const { data } = await supabase.from('stage_advances').select('closed_stage').eq('bracket_id', bracket.id).order('id', { ascending: false }).limit(1).maybeSingle()
    setLastClosed(data?.closed_stage ?? null)
  }, [bracket])

  useEffect(() => {
    loadLastClosed()
  }, [loadLastClosed])

  // Brackets locked before mystery seeds existed can have them dealt now.
  const [needsDeal, setNeedsDeal] = useState(false)
  useEffect(() => {
    if (!bracket) return
    supabase.rpc('mystery_board', { p_bracket_id: bracket.id }).then(({ data }) => setNeedsDeal((data ?? []).length === 0))
  }, [bracket])
  async function deal() {
    if (!confirm('Deal a random secret entry to every active player now?')) return
    const { error } = await supabase.rpc('deal_mystery_seeds', { p_bracket_id: bracket!.id })
    setError(rpcMessage(error))
    if (!error) setNeedsDeal(false)
  }

  if (!bracket || (bracket.phase !== 'live' && bracket.phase !== 'complete')) return null

  async function after() {
    await Promise.all([open.reload(), loadLastClosed(), refresh()])
  }

  async function close() {
    setBusy(true)
    const { error } = await supabase.rpc('close_stage_and_advance', { p_bracket_id: bracket!.id })
    setBusy(false)
    setConfirming(false)
    setError(rpcMessage(error))
    await after()
  }

  async function unlock() {
    const { data: ts } = await supabase.from('matchup_tallies').select('votes_a, votes_b').eq('bracket_id', bracket!.id)
    const votes = (ts ?? []).reduce((n, t) => n + t.votes_a + t.votes_b, 0)
    const typed = prompt(
      `Go back to review (unlock seeding)?\n\nYour merges, removals, manual entries and images are kept so you can fix duplicates and lock again.\n\nDiscarded: the bracket, ${votes} vote${votes === 1 ? '' : 's'} cast so far, any results, and the mystery-seed deal (it's re-dealt when you lock again).\n\nType UNLOCK to confirm:`,
    )
    if (typed === null) return
    const { error } = await supabase.rpc('unlock_seeding', { p_bracket_id: bracket!.id, p_confirm: typed })
    setError(rpcMessage(error))
    await after()
  }

  async function undo() {
    const warning =
      bracket!.phase === 'complete'
        ? 'Undo the final? The champion is un-crowned and the final stage reopens.'
        : `Undo the last advance? Stage ${lastClosed} reopens, and any votes already cast in ${open.stage?.label ?? 'the current stage'} are discarded. Coin tosses are kept.`
    const typed = prompt(`${warning}\n\nType UNDO to confirm:`)
    if (typed === null) return
    const { error } = await supabase.rpc('undo_last_advance', { p_bracket_id: bracket!.id, p_confirm: typed })
    setError(rpcMessage(error))
    await after()
  }

  const rows = open.matchups.map((m) => ({ m, a: open.tallies[m.id]?.votes_a ?? 0, b: open.tallies[m.id]?.votes_b ?? 0 }))

  return (
    <Card title="Stage control" aside={open.stage ? <Badge>Stage {open.stage.number}/{open.stageCount}</Badge> : <Badge>Final</Badge>}>
      <div className="flex flex-col gap-3">
        {open.stage ? (
          <>
            <p className="font-display text-xl uppercase">{open.stage.label}</p>
            {open.voters && (
              <p className="flex items-center gap-2 text-base font-bold tracking-wider text-muted uppercase">
                <Led className="py-0.5">
                  {open.voters.voters}/{open.voters.total}
                </Led>
                people have voted
              </p>
            )}
            <Button onClick={() => setConfirming(true)} disabled={busy || rows.length === 0}>
              Close stage and advance
            </Button>
          </>
        ) : (
          <p className="text-base text-muted">Every stage is closed. The bracket is complete.</p>
        )}
        {needsDeal && (
          <Button variant="ghost" onClick={deal}>
            Deal mystery seeds
          </Button>
        )}
        {lastClosed && (
          <>
            <Button variant="ghost" onClick={undo}>
              Undo last advance (stage {lastClosed})
            </Button>
            <Override key={`${lastClosed}-${open.stage?.number}`} bracketId={bracket.id} stageNumber={lastClosed} onDone={after} />
          </>
        )}
        {bracket.phase === 'live' && (
          <Button variant="danger" onClick={unlock} className="mt-2">
            Back to review (unlock seeding)…
          </Button>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
      {confirming && open.stage && <CloseDialog label={open.stage.label} rows={rows} busy={busy} onCancel={() => setConfirming(false)} onConfirm={close} />}
    </Card>
  )
}
