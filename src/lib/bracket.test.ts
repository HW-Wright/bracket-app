import { describe, expect, it } from 'vitest'
import { bracketOrder, firstRoundPairs, stageFor, upsetMargin } from './bracket'

const order = bracketOrder(64)
const slotOfSeed = (seed: number) => Math.floor(order.indexOf(seed) / 2) // first-round slot 0..31

/** Seeds a and b can first meet in the round where their slots share a parent. */
function meetingRound(a: number, b: number): number {
  let sa = slotOfSeed(a)
  let sb = slotOfSeed(b)
  let round = 1
  while (sa !== sb) {
    sa >>= 1
    sb >>= 1
    round++
  }
  return round
}

describe('bracketOrder', () => {
  it('starts with the known standard sequence', () => {
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    expect(order.slice(0, 8)).toEqual([1, 64, 32, 33, 16, 49, 17, 48])
  })

  it('is a permutation of 1..64', () => {
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i + 1))
  })

  it('pairs sum to 65 in round one', () => {
    for (const [a, b] of firstRoundPairs()) expect(a + b).toBe(65)
  })

  it('keeps 1 and 2 apart until the final', () => {
    expect(meetingRound(1, 2)).toBe(6)
  })

  it('puts seeds 1-4 in different quarters, 1-8 in different eighths', () => {
    for (let a = 1; a <= 4; a++) for (let b = a + 1; b <= 4; b++) expect(meetingRound(a, b)).toBeGreaterThanOrEqual(5)
    for (let a = 1; a <= 8; a++) for (let b = a + 1; b <= 8; b++) expect(meetingRound(a, b)).toBeGreaterThanOrEqual(4)
  })

  it('has the higher seed meet the expected opponent each round if favourites win', () => {
    // Seed 1 should face 32 in R32, 16 in R16, 8 in QF, 4 in SF.
    expect(meetingRound(1, 32)).toBe(2)
    expect(meetingRound(1, 16)).toBe(3)
    expect(meetingRound(1, 8)).toBe(4)
    expect(meetingRound(1, 4)).toBe(5)
  })
})

describe('stageFor', () => {
  it('splits round one into four quarters of 8 matchups (16 entries each)', () => {
    const quarters = [1, 2, 3, 4].map((stage) =>
      firstRoundPairs()
        .filter((_, slot) => stageFor(1, slot) === stage)
        .flat(),
    )
    for (const q of quarters) expect(q).toHaveLength(16)
    // Each of seeds 1-4 heads a different quarter.
    expect(quarters.map((q) => Math.min(...q)).sort()).toEqual([1, 2, 3, 4])
  })

  it('maps later rounds to stages 5-10', () => {
    expect([stageFor(2, 0), stageFor(2, 7), stageFor(2, 8), stageFor(2, 15)]).toEqual([5, 5, 6, 6])
    expect([stageFor(3, 3), stageFor(4, 0), stageFor(5, 1), stageFor(6, 0), stageFor(6, 1)]).toEqual([7, 8, 9, 10, 10])
  })

  it('round-two halves line up with round-one quarters', () => {
    // R32 slot s is fed by R64 slots 2s and 2s+1, so top half (stage 5) draws from quarters A and B.
    for (let s = 0; s < 16; s++) {
      const feeders = [stageFor(1, 2 * s), stageFor(1, 2 * s + 1)]
      expect(feeders.every((f) => (stageFor(2, s) === 5 ? f <= 2 : f >= 3))).toBe(true)
    }
  })
})

describe('upsetMargin', () => {
  it('is the seed gap when the lower seed wins', () => {
    expect(upsetMargin(49, 16)).toBe(33)
    expect(upsetMargin(1, 64)).toBe(0)
  })
})
