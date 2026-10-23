import { describe, expect, it } from 'vitest'
import type { EntryRef, Matchup } from '../bracket/useStage'
import { entryPath, isAlive, pickStatus, podium, upsets, voteTotals } from './stats'

const e = (seed: number): EntryRef => ({ id: `e${seed}`, name: `Seed ${seed}`, seed, image_path: null })
let n = 0
const m = (round: number, slot: number, a: number, b: number, winner?: number, decided_by: Matchup['decided_by'] = 'votes'): Matchup => ({
  id: `m${n++}`,
  round,
  slot,
  stage: round,
  a: e(a),
  b: e(b),
  winner: winner ? `e${winner}` : null,
  decided_by: winner ? decided_by : null,
})

describe('upsets', () => {
  it('lists lower seeds beating higher seeds, biggest gap first', () => {
    const ms = [m(1, 0, 1, 64, 1), m(1, 1, 16, 49, 49), m(1, 2, 32, 33, 33), m(1, 3, 8, 57, 57, 'coin_toss')]
    expect(upsets(ms).map((u) => [u.winner.seed, u.loser.seed, u.margin])).toEqual([
      [57, 8, 49],
      [49, 16, 33],
      [33, 32, 1],
    ])
  })
  it('ignores undecided matchups', () => {
    expect(upsets([m(1, 0, 1, 64)])).toEqual([])
  })
})

describe('voteTotals', () => {
  it('adds votes across rounds and counts wins and losses', () => {
    const r1 = m(1, 0, 1, 64, 1)
    const r2 = m(2, 0, 1, 32) // live
    const totals = voteTotals([r1, r2], { [r1.id]: { votes_a: 5, votes_b: 3 }, [r2.id]: { votes_a: 2, votes_b: 4 } })
    expect(totals.map((t) => [t.entry.seed, t.votes, t.wins, t.losses])).toEqual([
      [1, 7, 1, 0],
      [32, 4, 0, 0],
      [64, 3, 0, 1],
    ])
  })
})

describe('entryPath and podium', () => {
  it('follows an entry through the bracket in round order', () => {
    const ms = [m(2, 0, 1, 32, 1), m(1, 0, 1, 64, 1), m(1, 1, 32, 33, 32)]
    expect(entryPath('e1', ms).map((x) => x.round)).toEqual([1, 2])
  })
  it('reads 1st/2nd from the final and 3rd from the playoff', () => {
    const p = podium([m(6, 0, 1, 2, 2), m(6, 1, 3, 4, 4)])
    expect([p.first?.seed, p.second?.seed, p.third?.seed]).toEqual([2, 1, 4])
  })
})

describe('pickStatus', () => {
  const r1 = m(1, 0, 1, 64, 1)
  const r1b = m(1, 1, 32, 33, 33)
  const r2 = m(2, 0, 1, 33)
  const ms = [r1, r1b, r2]
  it('cut when the entry has no seed', () => {
    expect(pickStatus({ id: 'x', seed: null }, ms, {}, 2)).toEqual({ kind: 'cut' })
  })
  it('out once it has lost', () => {
    expect(pickStatus({ id: 'e64', seed: 64 }, ms, {}, 2)).toEqual({ kind: 'out', round: 1 })
    expect(isAlive(pickStatus({ id: 'e64', seed: 64 }, ms, {}, 2))).toBe(false)
  })
  it('leading / trailing / tied in the open stage, from the live tally', () => {
    expect(pickStatus({ id: 'e1', seed: 1 }, ms, { [r2.id]: { votes_a: 3, votes_b: 1 } }, 2)).toMatchObject({ kind: 'playing', state: 'leading', score: [3, 1] })
    expect(pickStatus({ id: 'e33', seed: 33 }, ms, { [r2.id]: { votes_a: 3, votes_b: 1 } }, 2)).toMatchObject({ state: 'trailing', score: [1, 3] })
    expect(pickStatus({ id: 'e33', seed: 33 }, ms, {}, 2)).toMatchObject({ state: 'tied' })
  })
  it('waiting when alive but not playing in the open stage', () => {
    expect(pickStatus({ id: 'e1', seed: 1 }, [r1], {}, 3)).toEqual({ kind: 'waiting', round: 2 })
  })
  it('champion, and a semi-final loser is out even if they play for third', () => {
    const sf = m(5, 0, 1, 4, 1)
    const final = m(6, 0, 1, 2, 1)
    const third = m(6, 1, 4, 3, 4)
    expect(pickStatus({ id: 'e1', seed: 1 }, [sf, final, third], {}, null)).toEqual({ kind: 'champion' })
    expect(pickStatus({ id: 'e4', seed: 4 }, [sf, final, third], {}, null)).toEqual({ kind: 'out', round: 5 })
  })
})
