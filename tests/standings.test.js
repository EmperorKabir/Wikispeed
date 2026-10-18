import { describe, expect, it } from 'vitest'
import { computeStandings, nextChooser, nextInRotation, roundResults } from '../src/standings.js'

const players = [
  { id: 'a', name: 'Ann', joinedAt: 1 },
  { id: 'b', name: 'Ben', joinedAt: 2 },
  { id: 'c', name: 'Cat', joinedAt: 3 },
]

const run = (uid, attempt, clicks, ms, done = true) => ({ id: `${uid}-${attempt}`, uid, attempt, name: uid.toUpperCase(), clicks, ms, done, quit: !done })

const rounds = [
  { n: 1, status: 'closed', scoring: 'clicks' },
  { n: 2, status: 'closed', scoring: 'time' },
  { n: 3, status: 'open', scoring: 'time' },
]
const runsByRound = {
  1: [run('a', 1, 3, 50000), run('b', 1, 2, 70000), run('c', 1, 5, 20000)],
  2: [run('a', 1, 4, 30000), run('b', 1, 4, 45000), run('c', 1, 1, 10000, false)],
  3: [run('a', 1, 1, 5000)],
}

describe('roundResults', () => {
  it('ranks finished best attempts only', () => {
    const results = roundResults(runsByRound[2], 'time')
    expect(results.map((r) => r.uid)).toEqual(['a', 'b'])
    expect(results[0].rank).toBe(1)
  })
})

describe('computeStandings', () => {
  it('awards placing points per closed round', () => {
    const rows = computeStandings({ rounds, runsByRound, players, system: 'points' })
    expect(rows.map((r) => [r.uid, r.score])).toEqual([
      ['a', 4],
      ['b', 4],
      ['c', 1],
    ])
    expect(rows[2].complete).toBe(false)
  })
  it('counts round wins', () => {
    const rows = computeStandings({ rounds, runsByRound, players, system: 'wins' })
    expect(rows.map((r) => [r.uid, r.score])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 0],
    ])
  })
  it('golf sums clicks with lowest first and incomplete players last', () => {
    const rows = computeStandings({ rounds, runsByRound, players, system: 'golf' })
    expect(rows.map((r) => r.uid)).toEqual(['b', 'a', 'c'])
    expect(rows[0].score).toBe(6)
  })
  it('cumulative time sums milliseconds', () => {
    const rows = computeStandings({ rounds, runsByRound, players, system: 'time' })
    expect(rows[0].uid).toBe('a')
    expect(rows[0].score).toBe(80000)
  })
  it('independent rounds have no table', () => {
    expect(computeStandings({ rounds, runsByRound, players, system: 'independent' })).toEqual([])
  })
})

describe('nextChooser', () => {
  const standings = [{ uid: 'b' }, { uid: 'a' }, { uid: 'c' }]
  const previousResults = [{ uid: 'c' }, { uid: 'a' }]
  it('rotates in join order', () => {
    expect(nextChooser({ policy: 'rotate', host: 'a', players, roundNumber: 1 })).toBe('a')
    expect(nextChooser({ policy: 'rotate', host: 'a', players, roundNumber: 2 })).toBe('b')
    expect(nextChooser({ policy: 'rotate', host: 'a', players, roundNumber: 4 })).toBe('a')
  })
  it('uses results and standings for the other policies', () => {
    expect(nextChooser({ policy: 'prevWinner', host: 'a', players, roundNumber: 2, previousResults })).toBe('c')
    expect(nextChooser({ policy: 'prevLoser', host: 'a', players, roundNumber: 2, previousResults })).toBe('a')
    expect(nextChooser({ policy: 'leader', host: 'a', players, roundNumber: 2, standings })).toBe('b')
    expect(nextChooser({ policy: 'last', host: 'a', players, roundNumber: 2, standings })).toBe('c')
    expect(nextChooser({ policy: 'host', host: 'a', players, roundNumber: 2 })).toBe('a')
  })
  it('falls back to the host when there is nothing to go on', () => {
    expect(nextChooser({ policy: 'prevWinner', host: 'a', players, roundNumber: 1 })).toBe('a')
    expect(nextChooser({ policy: 'rotate', host: 'z', players: [], roundNumber: 3 })).toBe('z')
  })
  it('finds the next player in rotation', () => {
    expect(nextInRotation(players, 'c')).toBe('a')
    expect(nextInRotation([players[0]], 'a')).toBe('a')
  })
})
