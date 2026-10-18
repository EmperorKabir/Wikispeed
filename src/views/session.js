import { currentUser, displayName, setName } from '../auth.js'
import { isValidCode, normaliseCode } from '../code.js'
import { getSession, joinSession, openSession, readRoute, watchPlayers, watchRuns, watchSession } from '../db.js'
import { go } from '../router.js'
import { SCORING, attemptStatus, formatMs } from '../score.js'
import { back, button, copyText, el, mask, notice, view } from '../ui.js'
import { describeDifficulty } from '../wiki.js'
import { createBoard } from './board.js'
import { roomView } from './room.js'

function notFound() {
  return view(el('div', { class: 'stack' }, back(), el('h1', {}, 'No session with that code')))
}

export async function sessionView({ code: raw }) {
  const code = normaliseCode(raw)
  if (!isValidCode(code)) return notFound()
  const session = await getSession(code)
  if (!session) return notFound()
  if (session.version === 2) return roomView(code, session)
  return legacySessionView(code)
}

function legacySessionView(code) {
  const uid = currentUser().uid
  const arena = { kind: 'session', code }
  let session
  let runs = []
  let route = null
  let board = null
  let joined = false
  let stopRuns = () => {}
  let stopPlayers = () => {}

  const header = el('div', { class: 'stack' })
  const action = el('div', { class: 'stack' })
  const boardSlot = el('div')
  const error = el('div')

  const root = el(
    'div',
    { class: 'stack' },
    back(),
    header,
    el('section', { class: 'card stack' }, action, error),
    boardSlot,
  )

  const stopSession = watchSession(
    code,
    async (data) => {
      session = data
      if (!session) {
        stopRuns()
        stopPlayers()
        root.replaceChildren(...notFound().el.childNodes)
        return
      }
      if (!board) {
        board = createBoard(session, uid)
        boardSlot.replaceChildren(board.el)
        stopRuns = watchRuns(
          arena,
          (data) => {
            runs = data
            board.update({ runs })
            render()
          },
          () => {},
        )
        stopPlayers = watchPlayers(code, (players) => board.update({ players }), () => {})
        join()
      }
      if (revealAllowed() && !route) {
        try {
          route = await readRoute(arena)
        } catch {
          route = null
        }
      }
      render()
    },
    () => error.replaceChildren(notice('Could not load the session.', 'error')),
  )

  function join() {
    if (joined && !displayName()) return
    joined = true
    joinSession(code, uid, displayName() || 'Guest').catch(() => {})
  }

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

  function resultText(run) {
    if (!run.done) return attemptStatus(run)
    return session.scoring === 'time' ? formatMs(run.ms) : `${run.clicks} ${run.clicks === 1 ? 'click' : 'clicks'}`
  }

  function render() {
    const scoring = SCORING[session.scoring] ?? SCORING.time
    const kind = session.mode === 'solo' ? 'Solo' : 'Multiplayer'
    const level = describeDifficulty(session.difficulty)
    header.replaceChildren(
      el('h1', {}, `${kind} · ${scoring.label}`),
      el(
        'p',
        { class: 'route' },
        mask(session.hideStart, visiblePage('start')),
        el('span', { class: 'arrow', role: 'img', 'aria-label': 'to' }, '→'),
        mask(session.hideTarget, visiblePage('target')),
        level ? el('span', { class: 'muted small' }, `Random: ${level}`) : null,
      ),
    )
    if (session.mode === 'multi') header.append(codeBlock())
    if (!action.contains(document.activeElement)) renderAction()
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

  function nameForm(label, after) {
    const nameInput = el('input', { type: 'text', name: 'nickname', maxlength: '32', placeholder: 'Your name', 'aria-label': 'Your name', autocomplete: 'nickname' })
    const save = button(label, async () => {
      save.disabled = true
      try {
        await setName(nameInput.value)
      } catch {
        save.disabled = false
        return
      }
      join()
      after()
    }, { class: 'primary', disabled: true })
    nameInput.addEventListener('input', () => {
      save.disabled = nameInput.value.trim().length === 0
    })
    return el('div', { class: 'row' }, nameInput, save)
  }

  function renderAction() {
    action.replaceChildren()
    const attempts = myAttempts()
    const latest = attempts[attempts.length - 1]

    if (session.status === 'lobby') {
      if (!displayName()) action.append(nameForm('Join as this name', renderAction))
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
        action.append(el('p', { class: 'muted' }, 'Share the code. Start when everyone has joined; players can then play whenever they like.'), start)
      } else {
        action.append(el('p', { class: 'muted', role: 'status' }, 'Waiting for the host to start.'))
      }
      return
    }

    if (latest) {
      const text = latest.done ? `Attempt ${latest.attempt}: ${resultText(latest)}.` : `Attempt ${latest.attempt}: ${attemptStatus(latest)}.`
      action.append(el('p', { class: 'muted', role: 'status' }, text))
    }
    const label = latest ? 'Play again' : 'Play'
    if (displayName()) action.append(button(label, () => go(`/play/${code}`), { class: 'primary' }))
    else action.append(nameForm(label, () => go(`/play/${code}`)))
  }

  return view(root, () => {
    stopSession()
    stopRuns()
    stopPlayers()
    board?.dispose()
  })
}
