export const SCORING = {
  time: { label: 'Timed', metric: 'Time' },
  clicks: { label: 'Fewest clicks', metric: 'Clicks' },
}

export function orderRuns(runs, scoring) {
  const byTime = (a, b) => a.ms - b.ms
  const byClicks = (a, b) => a.clicks - b.clicks || a.ms - b.ms
  const compare = scoring === 'clicks' ? byClicks : byTime
  return [...runs].sort((a, b) => {
    if (a.done !== b.done) return a.done ? -1 : 1
    if (!a.done) return millis(a.startedAt) - millis(b.startedAt)
    return compare(a, b)
  })
}

function millis(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value.toMillis === 'function') return value.toMillis()
  return 0
}

export function formatMs(ms) {
  const total = Math.max(0, Math.floor(ms / 100))
  const tenths = total % 10
  const seconds = Math.floor(total / 10) % 60
  const minutes = Math.floor(total / 600)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
}
