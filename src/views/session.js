import { currentUser, displayName, setNickname } from '../auth.js'
import { openSession, readRoute, watchRuns, watchSession } from '../db.js'
import { go } from '../router.js'
import { SCORING, formatMs, orderRuns } from '../score.js'
import { button, copyText, el, link, mask, notice, view } from '../ui.js'

export function sessionView({ code }) {
  const uid = currentUser().uid
  let session
  let runs = []
  let route = null

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
        root.replaceChildren(
          el('p', { class: 'crumbs' }, link('Home', '/')),
          el('h1', {}, 'No session with that code'),
        )
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

  function visiblePage(which) {
    const hidden = which === 'start' ? session.hideStart : session.hideTarget
    const pub = session[which]
    if (!hidden) return pub
    const myRun = runs.find((r) => r.id === uid)
    const started = session.mode === 'multi' ? session.status === 'open' : Boolean(myRun)
    return started && route ? route[which] : null
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
        el('span', { class: 'arrow', 'aria-label': 'to' }, '→'),
        mask(session.hideTarget, visiblePage('target')),
      ),
      session.mode === 'multi' ? codeBlock() : null,
    )

    renderAction()
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
    return el('p', { class: 'row' }, el('span', { class: 'code', 'aria-label': 'Session code' }, code), copy)
  }

  function renderAction() {
    action.replaceChildren()
    const myRun = runs.find((r) => r.id === uid)

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

    if (myRun?.done) {
      action.append(
        el('p', { role: 'status' }, `You finished in ${myRun.clicks} ${myRun.clicks === 1 ? 'click' : 'clicks'}, ${formatMs(myRun.ms)}.`),
      )
      return
    }

    const name = displayName()
    const playButton = button(myRun ? 'Restart run' : 'Play', () => go(`/play/${code}`), { class: 'primary' })

    if (!name) {
      const nameInput = el('input', {
        type: 'text',
        name: 'nickname',
        maxlength: '32',
        placeholder: 'Your name',
        'aria-label': 'Your name',
        autocomplete: 'nickname',
      })
      playButton.disabled = true
      nameInput.addEventListener('input', () => {
        playButton.disabled = nameInput.value.trim().length === 0
      })
      playButton.addEventListener('click', () => setNickname(nameInput.value), { capture: true })
      action.append(el('div', { class: 'row' }, nameInput, playButton))
      return
    }

    action.append(playButton)
  }

  function renderBoard(scoring) {
    board.replaceChildren()
    if (runs.length === 0) {
      board.append(el('p', { class: 'muted' }, session.status === 'lobby' ? '' : 'No runs yet.'))
      return
    }
    const rows = orderRuns(runs, session.scoring).map((run, i) =>
      el(
        'tr',
        { class: run.id === uid ? 'me' : null },
        el('td', {}, run.done ? String(i + 1) : ''),
        el('td', {}, run.name),
        el('td', { class: 'num' }, run.done ? String(run.clicks) : '…'),
        el('td', { class: 'num' }, run.done ? formatMs(run.ms) : 'playing'),
      ),
    )
    board.append(
      el('h2', {}, 'Leaderboard'),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'board' },
          el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Player'), el('th', { class: 'num' }, 'Clicks'), el('th', { class: 'num' }, 'Time'))),
          el('tbody', {}, rows),
        ),
      ),
      el('p', { class: 'muted small' }, `Ranked by ${scoring.metric.toLowerCase()}.`),
    )
  }

  return view(root, () => {
    stopSession()
    stopRuns()
  })
}
