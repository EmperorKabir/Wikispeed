import { describe, expect, it } from 'vitest'
import { attemptStatus, formatMs, orderRuns, playerRows } from '../src/score.js'

const runs = [
  { id: 'a', name: 'A', clicks: 5, ms: 90000, done: true },
  { id: 'b', name: 'B', clicks: 3, ms: 120000, done: true },
  { id: 'c', name: 'C', clicks: 3, ms: 100000, done: true },
  { id: 'd', name: 'D', clicks: 1, ms: 5000, done: false },
]

describe('orderRuns', () => {
  it('orders timed runs by time with unfinished last', () => {
    expect(orderRuns(runs, 'time').map((r) => r.id)).toEqual(['a', 'c', 'b', 'd'])
  })
  it('orders click runs by clicks then time with unfinished last', () => {
    expect(orderRuns(runs, 'clicks').map((r) => r.id)).toEqual(['c', 'b', 'a', 'd'])
  })
  it('does not mutate the input', () => {
    const copy = [...runs]
    orderRuns(runs, 'time')
    expect(runs).toEqual(copy)
  })
  it('orders unfinished runs by start time using Firestore timestamps', () => {
    const pending = [
      { id: 'x', done: false, startedAt: { toMillis: () => 20 } },
      { id: 'y', done: false, startedAt: { toMillis: () => 10 } },
    ]
    expect(orderRuns(pending, 'time').map((r) => r.id)).toEqual(['y', 'x'])
  })
})

describe('playerRows', () => {
  const attempts = [
    { id: 'p1-1', uid: 'p1', attempt: 1, name: 'Pat', clicks: 4, ms: 50000, done: false, quit: true },
    { id: 'p1-2', uid: 'p1', attempt: 2, name: 'Pat', clicks: 2, ms: 30000, done: true },
    { id: 'p1-3', uid: 'p1', attempt: 3, name: 'Pat', clicks: 3, ms: 20000, done: true },
    { id: 'p2', name: 'Old', clicks: 2, ms: 40000, done: true },
    { id: 'p3-1', uid: 'p3', attempt: 1, name: 'Sam', clicks: 0, ms: 0, done: false, quit: false },
  ]

  it('groups attempts per player and ranks by the best finished attempt', () => {
    const rows = playerRows(attempts, 'clicks')
    expect(rows.map((r) => r.uid)).toEqual(['p1', 'p2', 'p3'])
    expect(rows[0].best.attempt).toBe(2)
    expect(rows[0].attempts.map((a) => a.attempt)).toEqual([1, 2, 3])
    expect(rows[0].finished).toBe(2)
  })
  it('picks the fastest attempt in timed mode', () => {
    const rows = playerRows(attempts, 'time')
    expect(rows[0].uid).toBe('p1')
    expect(rows[0].best.attempt).toBe(3)
  })
  it('treats a legacy run without uid or attempt as attempt one', () => {
    const rows = playerRows(attempts, 'time')
    const old = rows.find((r) => r.uid === 'p2')
    expect(old.attempts[0].attempt).toBe(1)
    expect(old.best.ms).toBe(40000)
  })
  it('lists players with no finished attempt last, using their latest attempt', () => {
    const rows = playerRows(attempts, 'time')
    expect(rows[2].uid).toBe('p3')
    expect(rows[2].finished).toBe(0)
  })
})

describe('attemptStatus', () => {
  it('describes each attempt', () => {
    expect(attemptStatus({ done: true })).toBe('finished')
    expect(attemptStatus({ done: false, quit: true })).toBe('gave up')
    expect(attemptStatus({ done: false, quit: false })).toBe('unfinished')
  })
})

describe('formatMs', () => {
  it('formats minutes, seconds and tenths', () => {
    expect(formatMs(61500)).toBe('1:01.5')
    expect(formatMs(500)).toBe('0:00.5')
    expect(formatMs(0)).toBe('0:00.0')
    expect(formatMs(3600000)).toBe('60:00.0')
    expect(formatMs(-5)).toBe('0:00.0')
  })
})
