import { SCORING, attemptStatus, formatMs, playerRows } from '../score.js'
import { button, el } from '../ui.js'
import { articleUrl, titleFromKey } from '../wiki.js'

const STALE_MS = 150 * 1000

function millis(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value.toMillis === 'function') return value.toMillis()
  return 0
}

export function liveElapsed(run, now = Date.now()) {
  const started = millis(run.startedAt)
  if (!started) return 0
  return Math.max(0, now - started - (run.loadMs ?? 0))
}

export function isLive(run, now = Date.now()) {
  if (run.done || run.quit) return false
  const last = millis(run.updatedAt) || millis(run.startedAt)
  return last > 0 && now - last < STALE_MS
}

export function createBoard(session, uid, { title = 'Leaderboard', firstOnly = false } = {}) {
  const root = el('div', { class: 'stack' })
  const expanded = new Set()
  const scoring = SCORING[session.scoring] ?? SCORING.time
  const timed = session.scoring === 'time'
  let runs = []
  let players = []
  let ticker = null

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

  function liveCell(run) {
    if (run.quit) return el('span', { class: 'muted' }, 'gave up')
    if (!isLive(run)) return el('span', { class: 'muted' }, 'unfinished')
    const clock = el('span', { class: 'stat live-clock', dataset: { live: '1' } }, formatMs(liveElapsed(run)))
    clock.run = run
    return el(
      'span',
      { class: 'live' },
      clock,
      el('span', { class: 'muted small' }, ` · ${run.clicks} ${run.clicks === 1 ? 'click' : 'clicks'}`),
      run.currentKey ? el('span', { class: 'muted small' }, ` · on ${titleFromKey(run.currentKey)}`) : null,
    )
  }

  function attemptList(row, showRoutes) {
    const items = row.attempts.map((run) => {
      const heading = firstOnly && run.attempt > 1 ? `Practice ${run.attempt - 1}` : `Attempt ${run.attempt}`
      const parts = [el('strong', {}, heading), run.done ? el('span', {}, resultText(run)) : liveCell(run)]
      if (firstOnly && run.attempt > 1) parts.push(el('span', { class: 'muted small' }, 'not ranked'))
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

  function tick() {
    for (const clock of root.querySelectorAll('[data-live]')) {
      clock.textContent = formatMs(liveElapsed(clock.run))
    }
  }

  function render() {
    root.replaceChildren()
    const rows = playerRows(runs, session.scoring, { firstOnly })
    const waiting = players.filter((p) => !rows.some((r) => r.uid === p.id))
    if (rows.length === 0 && waiting.length === 0) {
      if (session.status !== 'lobby') root.append(el('p', { class: 'muted' }, 'No runs yet.'))
      return
    }
    const showRoutes = routesVisible()
    const trs = rows.flatMap((row, i) => {
      const open = expanded.has(row.uid)
      const toggle = button(open ? 'Hide attempts' : 'Show attempts', () => {
        if (open) expanded.delete(row.uid)
        else expanded.add(row.uid)
        render()
      }, { class: 'secondary small-button', 'aria-expanded': String(open) })
      const label = players.find((p) => p.id === row.uid)?.name || row.name
      const latest = row.attempts[row.attempts.length - 1]
      const cell = row.best.done
        ? el('td', { class: 'num' }, metric(row.best))
        : el('td', { class: 'num' }, liveCell(latest))
      const tr = el(
        'tr',
        { class: row.uid === uid ? 'me' : null },
        el('td', {}, row.best.done ? String(i + 1) : ''),
        el('td', {}, label),
        cell,
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
      el('h2', {}, title),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'board' },
          el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Player'), el('th', { class: 'num' }, firstOnly ? `First ${scoring.metric.toLowerCase()}` : `Best ${scoring.metric.toLowerCase()}`), el('th', { class: 'num' }, 'Tries'), el('th', {}, ''))),
          el('tbody', {}, trs),
        ),
      ),
    )
    if (firstOnly) root.append(el('p', { class: 'muted small' }, 'Only each player’s first attempt is ranked on this leaderboard. Later tries are practice and are listed but not scored.'))
    if (session.mode === 'multi' && !showRoutes && session.status !== 'lobby') {
      root.append(el('p', { class: 'muted small' }, 'Routes are shown once you have had a go.'))
    }
    if (showRoutes) {
      const best = shortestRoute()
      if (best) root.append(best)
    }
    const anyLive = runs.some((r) => isLive(r))
    if (anyLive && !ticker) ticker = setInterval(tick, 1000)
    if (!anyLive && ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  return {
    el: root,
    update({ runs: nextRuns, players: nextPlayers } = {}) {
      if (nextRuns) runs = nextRuns
      if (nextPlayers) players = nextPlayers
      render()
    },
    dispose() {
      clearInterval(ticker)
      ticker = null
    },
  }
}
