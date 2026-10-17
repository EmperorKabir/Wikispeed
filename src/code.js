export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export function makeCode(random = Math.random) {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    const index = Math.min(CODE_ALPHABET.length - 1, Math.floor(random() * CODE_ALPHABET.length))
    code += CODE_ALPHABET[index]
  }
  return code
}

export function normaliseCode(input) {
  return String(input ?? '').replace(/\s+/g, '').toUpperCase()
}

export function isValidCode(input) {
  const code = normaliseCode(input)
  if (code.length !== CODE_LENGTH) return false
  for (const ch of code) {
    if (!CODE_ALPHABET.includes(ch)) return false
  }
  return true
}
