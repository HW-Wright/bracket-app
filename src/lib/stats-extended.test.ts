import { describe, expect, it } from 'vitest'
import type { EntryRef, Matchup, Tally } from '../bracket/useStage'
import {
  bracketSummary,
  cinderella,
  cinderellaWatch,
  consensusVsChaos,
  houdini,
  kingmaker,
  loneWolf,
  sheep,
  tasteTwins,
  type Vote,
} from './stats'

const e = (seed: number): EntryRef => ({ id: `e${seed}`, name: `Seed ${seed}`, seed, image_path: null })
const m = (id: string, round: number, slot: number, a: number, b: number, winner?: number, by: Matchup['decided_by'] = 'votes'): Matchup => ({
  id,
  round,
  slot,
  stage: round,
  a: e(a),
  b: e(b),
  winner: winner ? `e${winner}` : null,
  decided_by: winner ? by : null,
})
const v = (matchup_id: string, user_id: string, seed: number): Vote => ({ matchup_id, user_id, entry_id: `e${seed}` })

// Round 1: g1 1v64 (64 wins 2-1), g2 32v33 (32 wins 3-0), g3 16v49 (coin toss to 49, 1-1)
// Round 2: g4 64v32 live.
const ms = [m('g1', 1, 0, 1, 64, 64), m('g2', 1, 1, 32, 33, 32), m('g3', 1, 2, 16, 49, 49, 'coin_toss'), m('g4', 2, 0, 64, 32)]
const tallies: Record<string, Tally> = {
  g1: { votes_a: 1, votes_b: 2 },
  g2: { votes_a: 3, votes_b: 0 },
  g3: { votes_a: 1, votes_b: 1 },
  g4: { votes_a: 0, votes_b: 0 },
}
const votes = [
  v('g1', 'ann', 64), v('g1', 'bob', 64), v('g1', 'cat', 1),
  v('g2', 'ann', 32), v('g2', 'bob', 32), v('g2', 'cat', 32),
  v('g3', 'ann', 16), v('g3', 'bob', 49),
  v('g4', 'ann', 64), // open stage: must be ignored
]
const users = ['ann', 'bob', 'cat']

describe('cinderella', () => {
  it('finds the lowest seed in each drawn round, and who is still alive', () => {
    expect(cinderella(ms).map((c) => [c.round, c.entry.seed])).toEqual([
      [1, 64],
      [2, 64],
    ])
    expect(cinderellaWatch(ms)?.seed).toBe(64)
  })
})

describe('houdini', () => {
  it('counts one-vote wins and coin tosses won', () => {
    expect(houdini(ms, tallies).map((h) => [h.entry.seed, h.oneVote, h.tosses])).toEqual([
      [64, 1, 0],
      [49, 0, 1],
    ])
  })
})

describe('taste twins', () => {
  it('computes pairwise agreement over decided matchups only', () => {
    const { grid } = tasteTwins(users, ms, votes)
    expect(grid.ann.bob).toMatchObject({ shared: 3, same: 2 }) // g1 same, g2 same, g3 different; g4 ignored
    expect(grid.ann.cat).toMatchObject({ shared: 2, same: 1 })
    expect(grid.ann.ann.pct).toBeNull()
  })
  it('only crowns pairs with enough shared votes', () => {
    const { best, worst } = tasteTwins(users, ms, votes)
    expect([best?.a, best?.b]).toEqual(['ann', 'bob'])
    expect(worst).toEqual(best) // the only eligible pair
  })
})

describe('sheep, lone wolf, kingmaker', () => {
  it('sheep: share of votes with the majority (ties skipped)', () => {
    expect(sheep(users, ms, tallies, votes).map((r) => [r.user, r.count, r.of])).toEqual([
      ['ann', 2, 2],
      ['bob', 2, 2],
      ['cat', 1, 2],
    ])
  })
  it('lone wolf: only vote for an entry', () => {
    expect(loneWolf(users, ms, votes).map((r) => [r.user, r.count])).toEqual([
      ['ann', 1],
      ['bob', 1],
      ['cat', 1],
    ])
  })
  it('kingmaker: every winning voter in a one-vote win', () => {
    expect(kingmaker(users, ms, tallies, votes).map((r) => [r.user, r.count])).toEqual([
      ['ann', 1],
      ['bob', 1],
    ])
  })
})

describe('consensus vs chaos', () => {
  it('groups seeded entries by number of nominators and tracks how far they got', () => {
    const groups = consensusVsChaos(ms, { e1: 3, e64: 1, e32: 2, e33: 1, e16: 0, e49: 0 })
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]))
    expect(byKey.consensus).toMatchObject({ entries: 2, alive: 1 }) // e1 out, e32 alive
    expect(byKey.solo.best?.entry.seed).toBe(64) // reached R2
    expect(byKey.manual).toMatchObject({ entries: 2, alive: 1 })
  })
})

describe('bracket summary', () => {
  it('totals votes, unanimous results, coin tosses and upsets', () => {
    expect(bracketSummary(ms, tallies)).toEqual({ totalVotes: 8, decided: 3, unanimous: 1, coinTosses: 1, upsets: 2, adminDecisions: 0 })
  })
})
