export const SCORING = {
  time: { label: 'Timed', metric: 'Time' },
  clicks: { label: 'Fewest clicks', metric: 'Clicks' },
}

function comparator(scoring) {
  if (scoring === 'clicks') return (a, b) => a.clicks - b.clicks || a.ms - b.ms
  return (a, b) => a.ms - b.ms
}

export function orderRuns(runs, scoring) {
  const compare = comparator(scoring)
  return [...runs].sort((a, b) => {
    if (a.done !== b.done) return a.done ? -1 : 1
    if (!a.done) return millis(a.startedAt) - millis(b.startedAt)
    return compare(a, b)
  })
}

export function playerRows(runs, scoring) {
  const compare = comparator(scoring)
  const byPlayer = new Map()
  for (const run of runs) {
    const uid = run.uid ?? run.id
    if (!byPlayer.has(uid)) byPlayer.set(uid, [])
    byPlayer.get(uid).push({ ...run, uid, attempt: run.attempt ?? 1 })
  }
  const rows = []
  for (const [uid, attempts] of byPlayer) {
    attempts.sort((a, b) => a.attempt - b.attempt)
    const finished = attempts.filter((a) => a.done).sort(compare)
    const best = finished[0] ?? attempts[attempts.length - 1]
    rows.push({ uid, name: best.name, attempts, best, finished: finished.length })
  }
  const ordered = orderRuns(rows.map((r) => r.best), scoring)
  return ordered.map((best) => rows.find((r) => r.best === best))
}

export function attemptStatus(run) {
  if (run.done) return 'finished'
  if (run.quit) return 'gave up'
  return 'unfinished'
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
