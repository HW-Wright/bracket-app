import { describe, expect, it } from 'vitest'
import type { EntryRef, Matchup } from '../bracket/useStage'
import { playerPicks, type Vote } from './stats'

const e = (seed: number): EntryRef => ({ id: `e${seed}`, name: `Seed ${seed}`, seed, image_path: null })
const m = (id: string, slot: number, a: number, b: number, winner?: number): Matchup => ({
  id,
  round: 1,
  slot,
  stage: 1,
  a: e(a),
  b: e(b),
  winner: winner ? `e${winner}` : null,
  decided_by: winner ? 'votes' : null,
})
const v = (matchup_id: string, user_id: string, seed: number): Vote => ({ matchup_id, user_id, entry_id: `e${seed}` })
const names = { u1: 'Joe', u2: 'Harry', u3: 'Sean' }

describe('playerPicks', () => {
  const games = [m('g1', 0, 1, 64, 1), m('g2', 1, 32, 33, 33), m('g3', 2, 16, 49)]
  const votes = [v('g2', 'u1', 32), v('g1', 'u1', 1), v('g1', 'u2', 64), v('g2', 'u2', 33), v('g3', 'u2', 16), v('other', 'u3', 1)]

  it('lists each player by name with their picks in game order', () => {
    const rows = playerPicks(games, votes, names)
    expect(rows.map((r) => names[r.userId as keyof typeof names])).toEqual(['Harry', 'Joe'])
    expect(rows[1].picks.map((p) => [p.matchup.id, p.picked.seed])).toEqual([
      ['g1', 1],
      ['g2', 32],
    ])
  })

  it('counts picks that went through; undecided games are neither', () => {
    const [harry, joe] = playerPicks(games, votes, names)
    expect(harry.correct).toBe(1)
    expect(harry.picks.map((p) => p.won)).toEqual([false, true, null])
    expect(joe.correct).toBe(1)
  })

  it('ignores votes for games outside the list (Sean voted elsewhere)', () => {
    expect(playerPicks(games, votes, names).some((r) => r.userId === 'u3')).toBe(false)
  })
})
