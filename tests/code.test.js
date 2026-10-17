import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, isValidCode, makeCode, normaliseCode } from '../src/code.js'

describe('session codes', () => {
  it('alphabet omits ambiguous characters', () => {
    for (const ch of '0O1I') expect(CODE_ALPHABET).not.toContain(ch)
    expect(CODE_ALPHABET).toHaveLength(32)
  })

  it('makes six characters from the alphabet', () => {
    expect(makeCode(() => 0)).toBe('AAAAAA')
    expect(makeCode(() => 0.999)).toBe('999999')
    const code = makeCode(Math.random)
    expect(code).toHaveLength(6)
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch)
  })

  it('normalises user input', () => {
    expect(normaliseCode(' abc 234 ')).toBe('ABC234')
  })

  it('validates codes', () => {
    expect(isValidCode('ABC234')).toBe(true)
    expect(isValidCode('abc234')).toBe(true)
    expect(isValidCode('ABC12O')).toBe(false)
    expect(isValidCode('ABC23')).toBe(false)
    expect(isValidCode('')).toBe(false)
  })
})
