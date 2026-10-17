import { describe, expect, it } from 'vitest'
import { formatMs, orderRuns } from '../src/score.js'

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
})

describe('formatMs', () => {
  it('formats minutes, seconds and tenths', () => {
    expect(formatMs(61500)).toBe('1:01.5')
    expect(formatMs(500)).toBe('0:00.5')
    expect(formatMs(0)).toBe('0:00.0')
    expect(formatMs(3600000)).toBe('60:00.0')
  })
})
