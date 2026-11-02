// Bracket structure. Mirrors public.bracket_order() / public.first_round() in SQL (parity checked in pgTAP).

/** Standard seeding order: adjacent pairs are first-round matchups ([1, 64, 32, 33, 16, 49, ...] for 64). */
export function bracketOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const m = order.length * 2
    order = order.flatMap((s) => [s, m + 1 - s])
  }
  return order
}

/** First-round pairs as [seedA, seedB], in slot order. */
export function firstRoundPairs(size = 64): [number, number][] {
  const order = bracketOrder(size)
  return Array.from({ length: size / 2 }, (_, i) => [order[2 * i], order[2 * i + 1]])
}

/** Bracket sizes (seeds) Harry can pick per bracket (2026-11-02). */
export const BRACKET_SIZES = [8, 16, 32, 64, 128] as const
export const DEFAULT_SIZE = 64
export const FINAL_ROUND = 6

/**
 * Rounds are numbered by how many entries are left, on one scale for every size: round r holds 2^(7-r)
 * entries. So the final is always round 6 (slot 1 is the third-place playoff) and smaller brackets start
 * later: a 128 bracket starts at round 0, an 8 bracket at round 4 (the quarter-finals).
 */
export const ROUNDS = [
  { round: 0, name: 'Round of 128', short: 'R128' },
  { round: 1, name: 'Round of 64', short: 'R64' },
  { round: 2, name: 'Round of 32', short: 'R32' },
  { round: 3, name: 'Round of 16', short: 'R16' },
  { round: 4, name: 'Quarter-finals', short: 'QF' },
  { round: 5, name: 'Semi-finals', short: 'SF' },
  { round: 6, name: 'Final', short: 'Final' },
] as const

const clampRound = (round: number) => Math.min(Math.max(round, 0), FINAL_ROUND)
export const roundName = (round: number): string => ROUNDS[clampRound(round)].name
export const roundShort = (round: number): string => ROUNDS[clampRound(round)].short

/** First round a bracket of this size plays. Mirrors public.first_round() in SQL. */
export function firstRound(size: number): number {
  return FINAL_ROUND + 1 - Math.log2(size)
}

/** One stage per round (Harry, 2026-10-23), numbered from 1 in play order. */
export function stageOf(round: number, size: number): number {
  return round - firstRound(size) + 1
}

/** The rounds a bracket of this size plays, first to final. */
export function roundsFor(size: number) {
  return ROUNDS.filter((r) => r.round >= firstRound(size))
}

/** Seed-gap of an upset (winner seed minus loser seed), or 0 if the favourite won. */
export function upsetMargin(winnerSeed: number, loserSeed: number): number {
  return Math.max(0, winnerSeed - loserSeed)
}
