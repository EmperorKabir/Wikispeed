import { describe, expect, it } from 'vitest'
import { createTimer } from '../src/timer.js'

function clock(start = 0) {
  let t = start
  const now = () => t
  now.advance = (ms) => {
    t += ms
  }
  return now
}

describe('createTimer', () => {
  it('reports zero before start', () => {
    const now = clock()
    const timer = createTimer(now)
    now.advance(500)
    expect(timer.elapsed()).toBe(0)
    expect(timer.running()).toBe(false)
  })
  it('counts while running', () => {
    const now = clock(1000)
    const timer = createTimer(now)
    timer.start()
    now.advance(250)
    expect(timer.elapsed()).toBe(250)
    expect(timer.running()).toBe(true)
  })
  it('freezes while paused and resumes without the gap', () => {
    const now = clock()
    const timer = createTimer(now)
    timer.start()
    now.advance(100)
    timer.pause()
    now.advance(900)
    expect(timer.elapsed()).toBe(100)
    timer.resume()
    now.advance(50)
    expect(timer.elapsed()).toBe(150)
  })
  it('ignores repeated pause or resume calls', () => {
    const now = clock()
    const timer = createTimer(now)
    timer.start()
    timer.pause()
    timer.pause()
    now.advance(10)
    timer.resume()
    timer.resume()
    now.advance(10)
    expect(timer.elapsed()).toBe(10)
  })
})
