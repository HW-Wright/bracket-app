// Derived bracket facts used by Bracket, Entry, Stats, Home and the champion screen. Pure functions.
import type { EntryRef, Matchup, Tally } from '../bracket/useStage'
import { upsetMargin } from './bracket'

export const isThirdPlace = (m: Pick<Matchup, 'round' | 'slot'>) => m.round === 6 && m.slot === 1
export const isFinal = (m: Pick<Matchup, 'round' | 'slot'>) => m.round === 6 && m.slot === 0

export function loserOf(m: Matchup): EntryRef | null {
  if (!m.winner) return null
  return m.winner === m.a?.id ? m.b : m.a
}

export function winnerOf(m: Matchup): EntryRef | null {
  if (!m.winner) return null
  return m.winner === m.a?.id ? m.a : m.b
}

export interface Upset {
  matchup: Matchup
  winner: EntryRef
  loser: EntryRef
  margin: number
}

/** Decided matchups where the lower seed (bigger number) won, biggest seed gap first. */
export function upsets(matchups: Matchup[]): Upset[] {
  const out: Upset[] = []
  for (const m of matchups) {
    const w = winnerOf(m)
    const l = loserOf(m)
    if (!w || !l || w.seed == null || l.seed == null) continue
    const margin = upsetMargin(w.seed, l.seed)
    if (margin > 0) out.push({ matchup: m, winner: w, loser: l, margin })
  }
  return out.sort((x, y) => y.margin - x.margin || x.matchup.round - y.matchup.round || x.winner.seed! - y.winner.seed!)
}

export interface VoteTotal {
  entry: EntryRef
  votes: number
  wins: number
  losses: number
}

/** Rolling total of votes each entry has received across every matchup (live tallies included), plus W–L. */
export function voteTotals(matchups: Matchup[], tallies: Record<string, Tally>): VoteTotal[] {
  const totals = new Map<string, VoteTotal>()
  const row = (e: EntryRef) => {
    if (!totals.has(e.id)) totals.set(e.id, { entry: e, votes: 0, wins: 0, losses: 0 })
    return totals.get(e.id)!
  }
  for (const m of matchups) {
    const t = tallies[m.id]
    if (m.a) row(m.a).votes += t?.votes_a ?? 0
    if (m.b) row(m.b).votes += t?.votes_b ?? 0
    const w = winnerOf(m)
    const l = loserOf(m)
    if (w) row(w).wins++
    if (l) row(l).losses++
  }
  return [...totals.values()].sort((x, y) => y.votes - x.votes || (x.entry.seed ?? 99) - (y.entry.seed ?? 99))
}

/** Every matchup an entry has played or is playing, in round order. */
export function entryPath(entryId: string, matchups: Matchup[]): Matchup[] {
  return matchups.filter((m) => m.a?.id === entryId || m.b?.id === entryId).sort((x, y) => x.round - y.round || x.slot - y.slot)
}

export interface Podium {
  first: EntryRef | null
  second: EntryRef | null
  third: EntryRef | null
}

export function podium(matchups: Matchup[]): Podium {
  const final = matchups.find(isFinal)
  const third = matchups.find(isThirdPlace)
  return {
    first: final ? winnerOf(final) : null,
    second: final ? loserOf(final) : null,
    third: third ? winnerOf(third) : null,
  }
}

export type PickStatus =
  | { kind: 'cut' }
  | { kind: 'out'; round: number }
  | { kind: 'champion' }
  | { kind: 'playing'; state: 'leading' | 'trailing' | 'tied'; score: [number, number] }
  | { kind: 'waiting'; round: number }

/**
 * Where an entry stands right now. "Still alive" = anything but cut/out. An entry that lost its semi-final
 * is out of title contention even though it plays for third place.
 */
export function pickStatus(
  entry: { id: string; seed: number | null },
  matchups: Matchup[],
  tallies: Record<string, Tally>,
  openStage: number | null,
): PickStatus {
  if (entry.seed == null) return { kind: 'cut' }
  const path = entryPath(entry.id, matchups).filter((m) => !isThirdPlace(m))
  const lost = path.find((m) => m.winner && m.winner !== entry.id)
  if (lost) return { kind: 'out', round: lost.round }
  const final = path.find(isFinal)
  if (final?.winner === entry.id) return { kind: 'champion' }
  const current = path.find((m) => !m.winner)
  if (current && current.stage === openStage) {
    const t = tallies[current.id]
    const mine = current.a?.id === entry.id ? (t?.votes_a ?? 0) : (t?.votes_b ?? 0)
    const theirs = current.a?.id === entry.id ? (t?.votes_b ?? 0) : (t?.votes_a ?? 0)
    return { kind: 'playing', state: mine > theirs ? 'leading' : mine < theirs ? 'trailing' : 'tied', score: [mine, theirs] }
  }
  const lastWon = path.filter((m) => m.winner === entry.id).at(-1)
  return { kind: 'waiting', round: (lastWon?.round ?? 0) + 1 }
}

export const isAlive = (s: PickStatus) => s.kind !== 'cut' && s.kind !== 'out'
