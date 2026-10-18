import { currentUser, displayName, setName } from '../auth.js'
import { isValidCode, normaliseCode } from '../code.js'
import { openSession, readRoute, watchRuns, watchSession } from '../db.js'
import { go } from '../router.js'
import { SCORING, attemptStatus, formatMs, playerRows } from '../score.js'
import { back, button, copyText, el, mask, notice, view } from '../ui.js'
import { titleFromKey } from '../wiki.js'

function notFound() {
  return view(el('div', { class: 'stack' }, back(), el('h1', {}, 'No session with that code')))
}

export function sessionView({ code: raw }) {
  const code = normaliseCode(raw)
  if (!isValidCode(code)) return notFound()

  const uid = currentUser().uid
  let session
  let runs = []
  let route = null
  const expanded = new Set()

  const header = el('div', { class: 'stack' })
  const action = el('div', { class: 'stack' })
  const board = el('div')
  const error = el('div')

  const root = el(
    'div',
    { class: 'stack' },
    back(),
    header,
    el('section', { class: 'card stack' }, action, error),
    board,
  )

  const stopSession = watchSession(
    code,
    async (data) => {
      session = data
      if (!session) {
        root.replaceChildren(...notFound().el.childNodes)
        return
      }
      if (revealAllowed() && !route) {
        try {
          route = await readRoute(code)
        } catch {
          route = null
        }
      }
      render()
    },
    () => error.replaceChildren(notice('Could not load the session.', 'error')),
  )

  const stopRuns = watchRuns(
    code,
    (data) => {
      runs = data
      if (session) render()
    },
    () => {},
  )

  function revealAllowed() {
    if (!session) return false
    if (session.host === uid) return true
    return session.status === 'open'
  }

  function myAttempts() {
    return runs.filter((r) => r.uid === uid).sort((a, b) => a.attempt - b.attempt)
  }

  function visiblePage(which) {
    const hidden = which === 'start' ? session.hideStart : session.hideTarget
    if (!hidden) return session[which]
    const started = session.status === 'open' && myAttempts().length > 0
    return started && route ? route[which] : null
  }

  function metric(run) {
    return session.scoring === 'time' ? formatMs(run.ms) : String(run.clicks)
  }

  function resultText(run) {
    if (!run.done) return attemptStatus(run)
    return session.scoring === 'time' ? formatMs(run.ms) : `${run.clicks} ${run.clicks === 1 ? 'click' : 'clicks'}`
  }

  function render() {
    const scoring = SCORING[session.scoring] ?? SCORING.time
    const kind = session.mode === 'solo' ? 'Solo' : 'Multiplayer'

    header.replaceChildren(
      el('h1', {}, `${kind} · ${scoring.label}`),
      el(
        'p',
        { class: 'route' },
        mask(session.hideStart, visiblePage('start')),
        el('span', { class: 'arrow', role: 'img', 'aria-label': 'to' }, '→'),
        mask(session.hideTarget, visiblePage('target')),
      ),
    )
    if (session.mode === 'multi') header.append(codeBlock())

    if (!action.contains(document.activeElement)) renderAction()
    renderBoard(scoring)
  }

  function codeBlock() {
    const url = `${location.origin}${location.pathname}#/s/${code}`
    const copy = button('Copy link', async () => {
      try {
        await copyText(url)
        copy.textContent = 'Copied'
        setTimeout(() => (copy.textContent = 'Copy link'), 1500)
      } catch {
        copy.textContent = url
      }
    }, { class: 'secondary' })
    return el('p', { class: 'row' }, el('span', { class: 'muted small' }, 'Code'), el('span', { class: 'code' }, code), copy)
  }

  function renderAction() {
    action.replaceChildren()
    const attempts = myAttempts()
    const latest = attempts[attempts.length - 1]

    if (session.status === 'lobby') {
      if (session.host === uid) {
        const start = button('Start session', async () => {
          start.disabled = true
          try {
            await openSession(code)
          } catch (err) {
            start.disabled = false
            error.replaceChildren(notice(`Could not start: ${err.message}`, 'error'))
          }
        }, { class: 'primary' })
        action.append(
          el('p', { class: 'muted' }, 'Share the code. Start when everyone has joined; players can then play whenever they like.'),
          start,
        )
      } else {
        action.append(el('p', { class: 'muted', role: 'status' }, 'Waiting for the host to start.'))
      }
      return
    }

    if (latest) {
      const text = latest.done ? `Attempt ${latest.attempt}: ${resultText(latest)}.` : `Attempt ${latest.attempt}: ${attemptStatus(latest)}.`
      action.append(el('p', { class: 'muted', role: 'status' }, text))
    }

    const name = displayName()
    const label = latest ? 'Play again' : 'Play'

    if (name) {
      action.append(button(label, () => go(`/play/${code}`), { class: 'primary' }))
      return
    }

    const nameInput = el('input', {
      type: 'text',
      name: 'nickname',
      maxlength: '32',
      placeholder: 'Your name',
      'aria-label': 'Your name',
      autocomplete: 'nickname',
    })
    const playButton = button(label, async () => {
      playButton.disabled = true
      try {
        await setName(nameInput.value)
      } catch {
        playButton.disabled = false
        return
      }
      go(`/play/${code}`)
    }, { class: 'primary', disabled: true })
    nameInput.addEventListener('input', () => {
      playButton.disabled = nameInput.value.trim().length === 0
    })
    action.append(el('div', { class: 'row' }, nameInput, playButton))
  }

  function routesVisible() {
    if (session.mode === 'solo') return true
    return myAttempts().some((a) => a.done || a.quit)
  }

  function attemptList(row, showRoutes) {
    const items = row.attempts.map((run) => {
      const parts = [el('strong', {}, `Attempt ${run.attempt}`), el('span', {}, resultText(run))]
      if (run.done) {
        parts.push(el('span', { class: 'muted small' }, session.scoring === 'time' ? `${run.clicks} ${run.clicks === 1 ? 'click' : 'clicks'}` : formatMs(run.ms)))
      }
      const line = el('div', { class: 'row attempt-line' }, parts)
      if (!showRoutes || !(run.path?.length > 1)) return el('li', {}, line)
      const steps = run.path.map((key) => el('li', {}, titleFromKey(key)))
      return el('li', {}, line, el('ol', { class: 'path' }, steps))
    })
    return el('tr', { class: 'path-row' }, el('td', { colspan: '5' }, el('ul', { class: 'attempts' }, items)))
  }

  function renderBoard(scoring) {
    board.replaceChildren()
    if (runs.length === 0) {
      if (session.status !== 'lobby') board.append(el('p', { class: 'muted' }, 'No runs yet.'))
      return
    }
    const showRoutes = routesVisible()
    const rows = playerRows(runs, session.scoring).flatMap((row, i) => {
      const open = expanded.has(row.uid)
      const toggle = button(open ? 'Hide' : 'Attempts', () => {
        if (open) expanded.delete(row.uid)
        else expanded.add(row.uid)
        renderBoard(scoring)
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
    board.append(
      el('h2', {}, 'Leaderboard'),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'board' },
          el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Player'), el('th', { class: 'num' }, `Best ${scoring.metric.toLowerCase()}`), el('th', { class: 'num' }, 'Tries'), el('th', {}, ''))),
          el('tbody', {}, rows),
        ),
      ),
    )
    if (session.mode === 'multi' && !showRoutes && session.status === 'open') {
      board.append(el('p', { class: 'muted small' }, 'Routes are shown once you have had a go.'))
    }
  }

  return view(root, () => {
    stopSession()
    stopRuns()
  })
}
