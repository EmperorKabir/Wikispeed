import { SCORING, attemptStatus, formatMs, playerRows } from '../score.js'
import { button, el } from '../ui.js'
import { articleUrl, titleFromKey } from '../wiki.js'

export function createBoard(session, uid) {
  const root = el('div', { class: 'stack' })
  const expanded = new Set()
  const scoring = SCORING[session.scoring] ?? SCORING.time
  const timed = session.scoring === 'time'
  let runs = []
  let players = []

  function metric(run) {
    return timed ? formatMs(run.ms) : String(run.clicks)
  }

  function resultText(run) {
    if (!run.done) return attemptStatus(run)
    return timed ? formatMs(run.ms) : `${run.clicks} ${run.clicks === 1 ? 'click' : 'clicks'}`
  }

  function routesVisible() {
    if (session.mode === 'solo') return true
    return runs.some((r) => r.uid === uid && (r.done || r.quit))
  }

  function routeList(path) {
    return el(
      'ol',
      { class: 'path' },
      path.map((key) => el('li', {}, el('a', { href: articleUrl(key), target: '_blank', rel: 'noopener' }, titleFromKey(key)))),
    )
  }

  function attemptList(row, showRoutes) {
    const items = row.attempts.map((run) => {
      const parts = [el('strong', {}, `Attempt ${run.attempt}`), el('span', {}, resultText(run))]
      if (run.done) {
        parts.push(el('span', { class: 'muted small' }, timed ? `${run.clicks} ${run.clicks === 1 ? 'click' : 'clicks'}` : formatMs(run.ms)))
      }
      const line = el('div', { class: 'row attempt-line' }, parts)
      if (!showRoutes || !(run.path?.length > 1)) return el('li', {}, line)
      return el('li', {}, line, routeList(run.path))
    })
    return el('tr', { class: 'path-row' }, el('td', { colspan: '5' }, el('ul', { class: 'attempts' }, items)))
  }

  function shortestRoute() {
    const finished = runs.filter((r) => r.done && r.path?.length > 1).sort((a, b) => a.clicks - b.clicks || a.ms - b.ms)
    const best = finished[0]
    if (!best) return null
    return el(
      'section',
      { class: 'card stack-small' },
      el('h2', {}, 'Shortest route found'),
      el('p', { class: 'muted small' }, `${best.name}, ${best.clicks} ${best.clicks === 1 ? 'click' : 'clicks'} in ${formatMs(best.ms)}. Tap a step to read that article.`),
      routeList(best.path),
    )
  }

  function render() {
    root.replaceChildren()
    const rows = playerRows(runs, session.scoring)
    const waiting = players.filter((p) => !rows.some((r) => r.uid === p.id))
    if (rows.length === 0 && waiting.length === 0) {
      if (session.status !== 'lobby') root.append(el('p', { class: 'muted' }, 'No runs yet.'))
      return
    }
    const showRoutes = routesVisible()
    const trs = rows.flatMap((row, i) => {
      const open = expanded.has(row.uid)
      const toggle = button(open ? 'Hide' : 'Attempts', () => {
        if (open) expanded.delete(row.uid)
        else expanded.add(row.uid)
        render()
      }, { class: 'text small', 'aria-expanded': String(open) })
      const tr = el(
        'tr',
        { class: row.uid === uid ? 'me' : null },
        el('td', {}, row.best.done ? String(i + 1) : ''),
        el('td', {}, row.name),
        el('td', { class: 'num' }, row.best.done ? metric(row.best) : attemptStatus(row.best)),
        el('td', { class: 'num' }, String(row.attempts.length)),
        el('td', { class: 'num' }, toggle),
      )
      return open ? [tr, attemptList(row, showRoutes)] : [tr]
    })
    for (const p of waiting) {
      trs.push(
        el(
          'tr',
          { class: p.id === uid ? 'me' : null },
          el('td', {}, ''),
          el('td', {}, p.name),
          el('td', { class: 'num muted' }, 'not yet played'),
          el('td', { class: 'num' }, '0'),
          el('td', {}, ''),
        ),
      )
    }
    root.append(
      el('h2', {}, 'Leaderboard'),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'board' },
          el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Player'), el('th', { class: 'num' }, `Best ${scoring.metric.toLowerCase()}`), el('th', { class: 'num' }, 'Tries'), el('th', {}, ''))),
          el('tbody', {}, trs),
        ),
      ),
    )
    if (session.mode === 'multi' && !showRoutes && session.status === 'open') {
      root.append(el('p', { class: 'muted small' }, 'Routes are shown once you have had a go.'))
    }
    if (showRoutes) {
      const best = shortestRoute()
      if (best) root.append(best)
    }
  }

  return {
    el: root,
    update({ runs: nextRuns, players: nextPlayers } = {}) {
      if (nextRuns) runs = nextRuns
      if (nextPlayers) players = nextPlayers
      render()
    },
  }
}
