export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

function secureRandom() {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] / 2 ** 32
}

export function makeCode(random = secureRandom) {
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
