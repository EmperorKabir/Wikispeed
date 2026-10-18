import { playerRows } from './score.js'

export const SYSTEMS = {
  points: { label: 'Placing points', hint: 'First place scores most each round; totals decide', higher: true },
  wins: { label: 'Round wins', hint: 'One point for winning a round', higher: true },
  golf: { label: 'Golf', hint: 'Total clicks across rounds; lowest wins', higher: false },
  time: { label: 'Cumulative time', hint: 'Total time across rounds; lowest wins', higher: false },
  independent: { label: 'Independent rounds', hint: 'Each round stands alone; no overall table', higher: true },
}

export const CHOOSER_POLICIES = {
  host: { label: 'Host every round' },
  rotate: { label: 'Take turns', hint: 'In the order players joined' },
  prevWinner: { label: "Previous round's winner" },
  prevLoser: { label: "Previous round's loser" },
  leader: { label: 'Current leader' },
  last: { label: 'Current last place' },
}

export function roundResults(runs, scoring) {
  const rows = playerRows(runs, scoring).filter((row) => row.best.done)
  return rows.map((row, i) => ({ uid: row.uid, name: row.name, rank: i + 1, clicks: row.best.clicks, ms: row.best.ms }))
}

export function computeStandings({ rounds, runsByRound, players, system }) {
  if (system === 'independent') return []
  const totals = new Map()
  const ensure = (uid, name) => {
    if (!totals.has(uid)) totals.set(uid, { uid, name, score: 0, played: 0 })
    const t = totals.get(uid)
    if (name) t.name = name
    return t
  }
  for (const p of players) ensure(p.id, p.name)
  const closed = rounds.filter((r) => r.status === 'closed')
  for (const round of closed) {
    const results = roundResults(runsByRound[round.n] ?? [], round.scoring)
    const finishers = results.length
    for (const res of results) {
      const t = ensure(res.uid, res.name)
      t.played += 1
      if (system === 'wins') t.score += res.rank === 1 ? 1 : 0
      else if (system === 'points') t.score += finishers - res.rank + 1
      else if (system === 'golf') t.score += res.clicks
      else if (system === 'time') t.score += res.ms
    }
  }
  const higher = SYSTEMS[system]?.higher ?? true
  const list = [...totals.values()]
  const complete = (t) => t.played === closed.length
  list.sort((a, b) => {
    if (closed.length && complete(a) !== complete(b)) return complete(a) ? -1 : 1
    if (a.score !== b.score) return higher ? b.score - a.score : a.score - b.score
    return b.played - a.played
  })
  return list.map((t, i) => ({ ...t, rank: i + 1, complete: complete(t), roundsClosed: closed.length }))
}

export function nextChooser({ policy, host, players, roundNumber, previousResults, standings }) {
  const ordered = [...players].sort((a, b) => millis(a.joinedAt) - millis(b.joinedAt))
  const ids = ordered.map((p) => p.id)
  if (ids.length === 0) return host
  switch (policy) {
    case 'rotate':
      return ids[(roundNumber - 1) % ids.length]
    case 'prevWinner':
      return previousResults?.[0]?.uid ?? host
    case 'prevLoser':
      return previousResults?.length ? previousResults[previousResults.length - 1].uid : host
    case 'leader':
      return standings?.[0]?.uid ?? host
    case 'last':
      return standings?.length ? standings[standings.length - 1].uid : host
    default:
      return host
  }
}

export function nextInRotation(players, uid) {
  const ordered = [...players].sort((a, b) => millis(a.joinedAt) - millis(b.joinedAt)).map((p) => p.id)
  if (ordered.length < 2) return uid
  const i = ordered.indexOf(uid)
  return ordered[(i + 1) % ordered.length]
}

function millis(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value.toMillis === 'function') return value.toMillis()
  return 0
}
