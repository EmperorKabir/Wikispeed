import { playerRows } from './score.js'

export const SYSTEMS = {
  points: {
    label: 'Podium points',
    hint: 'Each round, the winner gets as many points as there were finishers, second one fewer, and so on down to 1. Highest total after all rounds wins.',
    higher: true,
  },
  wins: {
    label: 'Most rounds won',
    hint: 'Only the winner of each round scores, one point per round. Most rounds won takes the room.',
    higher: true,
  },
  golf: {
    label: 'Fewest clicks in total',
    hint: 'Add up every player’s clicks across all rounds. Lowest total wins; you must finish every round to be ranked.',
    higher: false,
  },
  time: {
    label: 'Fastest time in total',
    hint: 'Add up every player’s time across all rounds. Lowest total wins; you must finish every round to be ranked.',
    higher: false,
  },
  independent: {
    label: 'No overall score',
    hint: 'Each round has its own board and nothing is added up.',
    higher: true,
  },
}

export const CHOOSER_POLICIES = {
  host: { label: 'Host every round', hint: 'The host picks the articles for every round.' },
  rotate: { label: 'Take turns', hint: 'Players take turns in the order they joined the room: round 1 the first to join, round 2 the second, and round again.' },
  prevWinner: { label: "Previous round's winner", hint: 'Whoever won the last round picks the next one. Round 1 is picked by the host.' },
  prevLoser: { label: "Previous round's loser", hint: 'Whoever finished last in the previous round picks the next one. Round 1 is picked by the host.' },
  leader: { label: 'Current leader', hint: 'Whoever is top of the overall standings picks. Round 1 is picked by the host.' },
  last: { label: 'Current last place', hint: 'Whoever is bottom of the overall standings picks. Round 1 is picked by the host.' },
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
