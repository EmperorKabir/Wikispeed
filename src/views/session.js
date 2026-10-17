import { currentUser, displayName, setName } from '../auth.js'
import { isValidCode, normaliseCode } from '../code.js'
import { openSession, readRoute, watchRuns, watchSession } from '../db.js'
import { go } from '../router.js'
import { SCORING, formatMs, orderRuns } from '../score.js'
import { button, copyText, el, link, mask, notice, view } from '../ui.js'
import { titleFromKey } from '../wiki.js'

function notFound() {
  return view(el('div', { class: 'stack' }, el('p', { class: 'crumbs' }, link('Home', '/')), el('h1', {}, 'No session with that code')))
}

export function sessionView({ code: raw }) {
  const code = normaliseCode(raw)
  if (!isValidCode(code)) return notFound()

  const uid = currentUser().uid
  let session
  let runs = []
  let route = null
  const openPaths = new Set()

  const header = el('div', { class: 'stack' })
  const action = el('div', { class: 'stack' })
  const board = el('div')
  const error = el('div')

  const root = el(
    'div',
    { class: 'stack' },
    el('p', { class: 'crumbs' }, link('Home', '/'), el('span', {}, 'Session')),
    header,
    action,
    error,
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

  function myRun() {
    return runs.find((r) => r.id === uid)
  }

  function visiblePage(which) {
    const hidden = which === 'start' ? session.hideStart : session.hideTarget
    if (!hidden) return session[which]
    const started = session.mode === 'multi' ? session.status === 'open' : Boolean(myRun())
    return started && route ? route[which] : null
  }

  function metric(run) {
    return session.scoring === 'time' ? formatMs(run.ms) : String(run.clicks)
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
    const run = myRun()

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

    if (run?.done) {
      const label = session.scoring === 'time' ? formatMs(run.ms) : `${run.clicks} ${run.clicks === 1 ? 'click' : 'clicks'}`
      action.append(el('p', { role: 'status' }, `You finished: ${label}.`))
      return
    }

    const name = displayName()
    const label = run ? (run.quit ? 'Try again' : 'Restart run') : 'Play'
    if (run?.quit) action.append(el('p', { class: 'muted', role: 'status' }, 'You gave up on this one.'))

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

  function pathsVisible() {
    const mine = myRun()
    return session.mode === 'multi' && Boolean(mine && (mine.done || mine.quit))
  }

  function pathRow(run) {
    const steps = (run.path ?? []).map((key, i) =>
      el('li', {}, i === 0 ? el('span', { class: 'muted small' }, 'Start: ') : null, titleFromKey(key)),
    )
    return el(
      'tr',
      { class: 'path-row' },
      el('td', { colspan: '4' }, steps.length ? el('ol', { class: 'path' }, steps) : el('span', { class: 'muted small' }, 'No path recorded.')),
    )
  }

  function renderBoard(scoring) {
    board.replaceChildren()
    if (runs.length === 0) {
      if (session.status !== 'lobby') board.append(el('p', { class: 'muted' }, 'No runs yet.'))
      return
    }
    const showPaths = pathsVisible()
    const rows = orderRuns(runs, session.scoring).flatMap((run, i) => {
      const open = openPaths.has(run.id)
      const cells = [
        el('td', {}, run.done ? String(i + 1) : ''),
        el('td', {}, run.name),
        el('td', { class: 'num' }, run.done ? metric(run) : run.quit ? 'gave up' : 'playing'),
      ]
      if (showPaths) {
        const toggle = button(open ? 'Hide path' : 'Path', () => {
          if (open) openPaths.delete(run.id)
          else openPaths.add(run.id)
          renderBoard(scoring)
        }, { class: 'text small', 'aria-expanded': String(open) })
        cells.push(el('td', { class: 'num' }, run.path?.length > 1 || run.done ? toggle : ''))
      }
      const row = el('tr', { class: run.id === uid ? 'me' : null }, cells)
      return showPaths && open ? [row, pathRow(run)] : [row]
    })
    const head = [el('th', {}, '#'), el('th', {}, 'Player'), el('th', { class: 'num' }, scoring.metric)]
    if (showPaths) head.push(el('th', { class: 'num' }, 'Route'))
    board.append(
      el('h2', {}, 'Leaderboard'),
      el(
        'div',
        { class: 'table-wrap' },
        el('table', { class: 'board' }, el('thead', {}, el('tr', {}, head)), el('tbody', {}, rows)),
      ),
      session.mode === 'multi' && !showPaths && session.status === 'open'
        ? el('p', { class: 'muted small' }, 'Routes are shown once you have had a go.')
        : null,
    )
  }

  return view(root, () => {
    stopSession()
    stopRuns()
  })
}
