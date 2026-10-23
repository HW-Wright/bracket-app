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

// ---------------------------------------------------------------------------
// Extended stats. Voter-based stats only ever see closed stages (RLS hides open-stage votes), and only
// decided matchups are counted, so they never leak or skew.

export interface Vote {
  matchup_id: string
  user_id: string
  entry_id: string
}

const tallyOf = (m: Matchup, tallies: Record<string, Tally>) => {
  const t = tallies[m.id]
  return { a: t?.votes_a ?? 0, b: t?.votes_b ?? 0 }
}
const winnerVotes = (m: Matchup, tallies: Record<string, Tally>) => {
  const { a, b } = tallyOf(m, tallies)
  return m.winner === m.a?.id ? [a, b] : [b, a]
}
const decided = (matchups: Matchup[]) => matchups.filter((m) => m.winner && m.a && m.b)

export interface CinderellaRound {
  round: number
  entry: EntryRef
}

/** For each round that has been drawn, the lowest seed (highest number) playing in it. */
export function cinderella(matchups: Matchup[]): CinderellaRound[] {
  const out: CinderellaRound[] = []
  for (let round = 1; round <= 6; round++) {
    const entries = matchups
      .filter((m) => m.round === round && !isThirdPlace(m))
      .flatMap((m) => [m.a, m.b])
      .filter((e): e is EntryRef => !!e && e.seed != null)
    if (entries.length === 0) continue
    out.push({ round, entry: entries.reduce((lo, e) => (e.seed! > lo.seed! ? e : lo)) })
  }
  return out
}

/** Lowest seed still in title contention right now (ignores the third-place playoff). */
export function cinderellaWatch(matchups: Matchup[]): EntryRef | null {
  const alive = new Map<string, EntryRef>()
  const lost = new Set<string>()
  for (const m of matchups) {
    if (isThirdPlace(m)) continue
    for (const e of [m.a, m.b]) if (e) alive.set(e.id, e)
    const l = loserOf(m)
    if (l) lost.add(l.id)
  }
  const candidates = [...alive.values()].filter((e) => !lost.has(e.id) && e.seed != null)
  return candidates.length ? candidates.reduce((lo, e) => (e.seed! > lo.seed! ? e : lo)) : null
}

export interface Houdini {
  entry: EntryRef
  oneVote: number
  tosses: number
}

/** Narrow escapes: wins by exactly one vote, plus coin tosses won. */
export function houdini(matchups: Matchup[], tallies: Record<string, Tally>): Houdini[] {
  const by = new Map<string, Houdini>()
  for (const m of decided(matchups)) {
    const w = winnerOf(m)!
    const [wv, lv] = winnerVotes(m, tallies)
    const oneVote = m.decided_by === 'votes' && wv - lv === 1
    const toss = m.decided_by === 'coin_toss'
    if (!oneVote && !toss) continue
    const row = by.get(w.id) ?? { entry: w, oneVote: 0, tosses: 0 }
    if (oneVote) row.oneVote++
    if (toss) row.tosses++
    by.set(w.id, row)
  }
  return [...by.values()].sort((x, y) => y.oneVote + y.tosses - (x.oneVote + x.tosses) || (y.entry.seed ?? 0) - (x.entry.seed ?? 0))
}

/** matchup -> user -> entry they voted for, restricted to decided matchups. */
function ballots(matchups: Matchup[], votes: Vote[]) {
  const ids = new Set(decided(matchups).map((m) => m.id))
  const out = new Map<string, Map<string, string>>()
  for (const v of votes) {
    if (!ids.has(v.matchup_id)) continue
    if (!out.has(v.matchup_id)) out.set(v.matchup_id, new Map())
    out.get(v.matchup_id)!.set(v.user_id, v.entry_id)
  }
  return out
}

export interface PairAgreement {
  a: string
  b: string
  shared: number
  same: number
  pct: number | null
}

export const MIN_SHARED = 3

/** Agreement for every pair of users: share of matchups both voted in where they picked the same side. */
export function tasteTwins(users: string[], matchups: Matchup[], votes: Vote[]) {
  const bal = ballots(matchups, votes)
  const grid: Record<string, Record<string, PairAgreement>> = {}
  const pairs: PairAgreement[] = []
  for (const a of users) {
    grid[a] = {}
    for (const b of users) {
      let shared = 0
      let same = 0
      if (a !== b) {
        for (const byUser of bal.values()) {
          const va = byUser.get(a)
          const vb = byUser.get(b)
          if (va && vb) {
            shared++
            if (va === vb) same++
          }
        }
      }
      const cell = { a, b, shared, same, pct: shared ? same / shared : null }
      grid[a][b] = cell
      if (a < b) pairs.push(cell)
    }
  }
  const eligible = pairs.filter((p) => p.shared >= MIN_SHARED && p.pct != null)
  const best = eligible.length ? eligible.reduce((x, y) => (y.pct! > x.pct! || (y.pct === x.pct && y.shared > x.shared) ? y : x)) : null
  const worst = eligible.length ? eligible.reduce((x, y) => (y.pct! < x.pct! || (y.pct === x.pct && y.shared > x.shared) ? y : x)) : null
  return { grid, best, worst }
}

export interface PersonCount {
  user: string
  count: number
  of?: number
}

/** How often each person voted with the majority (matchups with a clear majority only). */
export function sheep(users: string[], matchups: Matchup[], tallies: Record<string, Tally>, votes: Vote[]): PersonCount[] {
  const bal = ballots(matchups, votes)
  const rows = new Map(users.map((u) => [u, { user: u, count: 0, of: 0 }]))
  for (const m of decided(matchups)) {
    const { a, b } = tallyOf(m, tallies)
    if (a === b) continue
    const majority = a > b ? m.a!.id : m.b!.id
    for (const [u, e] of bal.get(m.id) ?? []) {
      const r = rows.get(u)
      if (!r) continue
      r.of++
      if (e === majority) r.count++
    }
  }
  return [...rows.values()].filter((r) => r.of > 0).sort((x, y) => y.count / y.of - x.count / x.of || y.of - x.of)
}

/** Times someone was the only vote an entry got in a matchup. */
export function loneWolf(users: string[], matchups: Matchup[], votes: Vote[]): PersonCount[] {
  const bal = ballots(matchups, votes)
  const rows = new Map(users.map((u) => [u, { user: u, count: 0 }]))
  for (const byUser of bal.values()) {
    const backers = new Map<string, string[]>()
    for (const [u, e] of byUser) backers.set(e, [...(backers.get(e) ?? []), u])
    for (const who of backers.values()) if (who.length === 1 && rows.has(who[0])) rows.get(who[0])!.count++
  }
  return [...rows.values()].filter((r) => r.count > 0).sort((x, y) => y.count - x.count)
}

/** Times someone's vote decided a matchup won by one vote (every winning voter was decisive). */
export function kingmaker(users: string[], matchups: Matchup[], tallies: Record<string, Tally>, votes: Vote[]): PersonCount[] {
  const bal = ballots(matchups, votes)
  const rows = new Map(users.map((u) => [u, { user: u, count: 0 }]))
  for (const m of decided(matchups)) {
    const [wv, lv] = winnerVotes(m, tallies)
    if (m.decided_by !== 'votes' || wv - lv !== 1) continue
    for (const [u, e] of bal.get(m.id) ?? []) if (e === m.winner && rows.has(u)) rows.get(u)!.count++
  }
  return [...rows.values()].filter((r) => r.count > 0).sort((x, y) => y.count - x.count)
}

export interface ConsensusGroup {
  key: 'consensus' | 'solo' | 'manual'
  entries: number
  avgRound: number
  alive: number
  best: { entry: EntryRef; round: number } | null
}

/** Furthest round an entry reached (third-place playoff doesn't count as going further than the semis). */
function furthestRound(entryId: string, matchups: Matchup[]): number {
  return Math.max(0, ...entryPath(entryId, matchups).filter((m) => !isThirdPlace(m)).map((m) => m.round))
}

/** Entries nominated by several people vs one-person picks vs manual fill-ins, and how far each group got. */
export function consensusVsChaos(matchups: Matchup[], nominators: Record<string, number>): ConsensusGroup[] {
  const seeded = new Map<string, EntryRef>()
  for (const m of matchups) if (m.round === 1) for (const e of [m.a, m.b]) if (e) seeded.set(e.id, e)
  const lost = new Set(matchups.filter((m) => !isThirdPlace(m)).map(loserOf).filter(Boolean).map((e) => e!.id))
  const groups: ConsensusGroup[] = (['consensus', 'solo', 'manual'] as const).map((key) => ({ key, entries: 0, avgRound: 0, alive: 0, best: null }))
  const sums = [0, 0, 0]
  for (const e of seeded.values()) {
    const n = nominators[e.id] ?? 0
    const i = n >= 2 ? 0 : n === 1 ? 1 : 2
    const g = groups[i]
    const round = furthestRound(e.id, matchups)
    g.entries++
    sums[i] += round
    if (!lost.has(e.id)) g.alive++
    if (!g.best || round > g.best.round || (round === g.best.round && (e.seed ?? 99) > (g.best.entry.seed ?? 99))) g.best = { entry: e, round }
  }
  groups.forEach((g, i) => (g.avgRound = g.entries ? sums[i] / g.entries : 0))
  return groups.filter((g) => g.entries > 0)
}

export interface BracketSummary {
  totalVotes: number
  decided: number
  unanimous: number
  coinTosses: number
  upsets: number
  adminDecisions: number
}

export function bracketSummary(matchups: Matchup[], tallies: Record<string, Tally>): BracketSummary {
  const done = decided(matchups)
  return {
    totalVotes: matchups.reduce((n, m) => n + tallyOf(m, tallies).a + tallyOf(m, tallies).b, 0),
    decided: done.length,
    unanimous: done.filter((m) => {
      const [wv, lv] = winnerVotes(m, tallies)
      return m.decided_by === 'votes' && lv === 0 && wv >= 2
    }).length,
    coinTosses: done.filter((m) => m.decided_by === 'coin_toss').length,
    upsets: upsets(matchups).length,
    adminDecisions: done.filter((m) => m.decided_by === 'admin').length,
  }
}
