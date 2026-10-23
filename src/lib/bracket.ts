// Bracket structure. Mirrors public.bracket_order() / public.stage_for() in SQL (parity checked in pgTAP).

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

export const ROUNDS = [
  { round: 1, name: 'Round of 64', matchups: 32 },
  { round: 2, name: 'Round of 32', matchups: 16 },
  { round: 3, name: 'Round of 16', matchups: 8 },
  { round: 4, name: 'Quarter-finals', matchups: 4 },
  { round: 5, name: 'Semi-finals', matchups: 2 },
  { round: 6, name: 'Final', matchups: 1 },
] as const

/** One stage per round (Harry, 2026-10-23): each round is released in its entirety. */
export const STAGE_LABELS = [
  'Round of 64',
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Final + third-place playoff',
] as const

/** Which stage a matchup belongs to: its round. Round 6 slot 1 is the third-place playoff. */
export function stageFor(round: number, _slot: number): number {
  return round
}

/** Seed-gap of an upset (winner seed minus loser seed), or 0 if the favourite won. */
export function upsetMargin(winnerSeed: number, loserSeed: number): number {
  return Math.max(0, winnerSeed - loserSeed)
}
