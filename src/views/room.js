import { currentUser, displayName, setName } from '../auth.js'
import {
  closeRound,
  createRound,
  joinSession,
  playPath,
  readRoute,
  setRouteParts,
  startTogether,
  updateRoom,
  updateRound,
  watchPlayers,
  watchRounds,
  watchRuns,
  watchSession,
} from '../db.js'
import { go } from '../router.js'
import { SCORING, formatMs } from '../score.js'
import { CHOOSER_POLICIES, SYSTEMS, computeStandings, nextChooser, nextInRotation, roundResults } from '../standings.js'
import { back, button, copyText, el, notice, view } from '../ui.js'
import { createBoard } from './board.js'
import { createPicker } from './picker.js'

const START_MODES = {
  whenever: { label: 'Play whenever', hint: 'Each round opens as soon as its articles are set' },
  together: { label: 'Start together', hint: 'Host starts each round with a countdown on every screen' },
}

export function roomView(code, initial) {
  const uid = currentUser().uid
  let room = initial
  let players = []
  let rounds = []
  const runsByRound = {}
  const runStops = new Map()
  const boards = new Map()
  const routes = new Map()
  let joined = false
  let advancing = false
  let chooserPanel = null
  let overriding = false

  const header = el('div', { class: 'stack' })
  const settings = el('section', { class: 'card stack' })
  const playersSlot = el('div')
  const roundsSlot = el('div', { class: 'stack' })
  const standingsSlot = el('div')
  const error = el('div')
  const root = el('div', { class: 'stack' }, back(), header, settings, error, playersSlot, roundsSlot, standingsSlot)

  const stopSession = watchSession(code, (data) => {
    if (!data) return
    room = data
    render()
  }, () => error.replaceChildren(notice('Could not load the room.', 'error')))

  const stopPlayers = watchPlayers(code, (data) => {
    players = data
    render()
  }, () => {})

  const stopRounds = watchRounds(code, (data) => {
    rounds = data
    for (const round of rounds) {
      if (!runStops.has(round.n)) {
        runStops.set(
          round.n,
          watchRuns({ kind: 'round', code, n: round.n }, (runs) => {
            runsByRound[round.n] = runs
            boards.get(round.n)?.update({ runs, players })
            render()
          }, () => {}),
        )
      }
    }
    render()
  }, () => {})

  join()

  function join() {
    if (joined && !displayName()) return
    joined = true
    joinSession(code, uid, displayName() || 'Guest').catch(() => {})
  }

  const isHost = () => room.host === uid
  const current = () => rounds.find((r) => r.n === room.currentRound) ?? null
  const playerName = (id) => players.find((p) => p.id === id)?.name || 'a player'
  const myAttempts = (n) => (runsByRound[n] ?? []).filter((r) => r.uid === uid)
  const terminal = (n, id) => (runsByRound[n] ?? []).some((r) => r.uid === id && (r.done || r.quit))

  function render() {
    renderHeader()
    renderSettings()
    renderPlayers()
    renderRounds()
    renderStandings()
    maybeAdvance()
  }

  function renderHeader() {
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
    const state =
      room.status === 'setup' ? 'Setting up' : room.status === 'finished' ? 'Finished' : `Round ${room.currentRound} of ${room.rounds}`
    header.replaceChildren(
      el('h1', {}, 'Multiplayer room'),
      el('p', { class: 'row' }, el('span', { class: 'muted small' }, 'Code'), el('span', { class: 'code' }, code), copy),
      el('p', { class: 'muted' }, `${state} · ${SYSTEMS[room.system]?.label ?? ''} · ${CHOOSER_POLICIES[room.chooserPolicy]?.label ?? ''} · ${START_MODES[room.startMode]?.label ?? ''}`),
    )
  }

  function field(labelText, control, hint) {
    return el('div', { class: 'stack-small' }, el('label', { class: 'muted small', for: control.id }, labelText), control, hint ? el('span', { class: 'muted small' }, hint) : null)
  }

  function select(id, options, value, onchange) {
    const node = el(
      'select',
      { id, onchange: (e) => onchange(e.target.value) },
      Object.entries(options).map(([key, o]) => el('option', { value: key, selected: key === value }, o.label)),
    )
    return node
  }

  function renderSettings() {
    if (room.status === 'setup' && settings.dataset.status === 'setup' && settings.contains(document.activeElement)) return
    settings.dataset.status = room.status
    settings.replaceChildren()
    const name = displayName()
    if (!name) {
      const nameInput = el('input', { type: 'text', name: 'nickname', maxlength: '32', placeholder: 'Your name', 'aria-label': 'Your name', autocomplete: 'nickname' })
      const save = button('Join as this name', async () => {
        save.disabled = true
        try {
          await setName(nameInput.value)
        } catch {
          save.disabled = false
          return
        }
        join()
        render()
      }, { class: 'secondary', disabled: true })
      nameInput.addEventListener('input', () => {
        save.disabled = nameInput.value.trim().length === 0
      })
      settings.append(el('div', { class: 'row' }, nameInput, save))
    }

    if (room.status !== 'setup') {
      if (room.status === 'finished') settings.append(el('p', {}, 'All rounds are finished. Final standings are below.'))
      return
    }

    if (!isHost()) {
      settings.append(el('p', { class: 'muted', role: 'status' }, `${playerName(room.host)} is setting up the room. You will see round 1 here as soon as it begins.`))
      return
    }

    const save = (fields) => updateRoom(code, fields).catch((err) => error.replaceChildren(notice(`Could not save: ${err.message}`, 'error')))

    const roundsInput = el('input', { type: 'number', id: 'rounds', min: '1', max: '10', value: String(room.rounds), onchange: (e) => save({ rounds: Math.min(10, Math.max(1, Number(e.target.value) || 1)) }) })
    const scoringRow = el(
      'div',
      { class: 'row' },
      ...Object.entries(SCORING).map(([key, { label }]) =>
        el('label', { class: 'check' }, el('input', { type: 'radio', name: 'room-scoring', value: key, checked: room.scoring === key, onchange: () => save({ scoring: key }) }), ` ${label}`),
      ),
    )
    const startRow = el(
      'div',
      { class: 'stack-small' },
      ...Object.entries(START_MODES).map(([key, { label, hint }]) =>
        el('label', { class: 'check' }, el('input', { type: 'radio', name: 'room-start', value: key, checked: room.startMode === key, onchange: () => save({ startMode: key }) }), ` ${label}`, el('span', { class: 'muted small' }, ` ${hint}`)),
      ),
    )
    const begin = button('Begin round 1', beginRounds, { class: 'primary', disabled: !name })

    settings.append(
      el('h2', {}, 'Room settings'),
      el(
        'div',
        { class: 'settings' },
        field('Rounds', roundsInput, 'Best of up to 10'),
        field('Scoring for each round', scoringRow, room.chooserPicks === 'both' ? 'Each chooser may change this for their round' : null),
        field('Overall scoring', select('system', SYSTEMS, room.system, (v) => save({ system: v })), SYSTEMS[room.system]?.hint),
        field('Who chooses the articles', select('policy', CHOOSER_POLICIES, room.chooserPolicy, (v) => save({ chooserPolicy: v })), CHOOSER_POLICIES[room.chooserPolicy]?.hint),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: room.chooserPicks === 'both', onchange: (e) => save({ chooserPicks: e.target.checked ? 'both' : 'articles' }) }), ' The chooser also picks timed or fewest clicks'),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: room.split, onchange: (e) => save({ split: e.target.checked }) }), ' Start and finish chosen by different players'),
        field('How rounds start', startRow),
      ),
      el('p', { class: 'muted small' }, 'Settings save as you change them. Players who have joined see them live.'),
      begin,
    )
  }

  async function beginRounds() {
    try {
      await makeRound(1, null, [])
      await updateRoom(code, { status: 'playing', currentRound: 1 })
    } catch (err) {
      error.replaceChildren(notice(`Could not begin: ${err.message}`, 'error'))
    }
  }

  async function makeRound(n, previousResults, standings) {
    const chooser = nextChooser({ policy: room.chooserPolicy, host: room.host, players, roundNumber: n, previousResults, standings })
    const targetChooser = room.split ? nextInRotation(players, chooser) : chooser
    await createRound(code, {
      n,
      chooser,
      startChooser: chooser,
      targetChooser,
      scoring: room.scoring,
      difficulty: { start: 'typed', target: 'typed' },
      hideStart: false,
      hideTarget: false,
    })
  }

  function renderPlayers() {
    playersSlot.replaceChildren()
    if (room.status !== 'setup') return
    const ordered = [...players].sort((a, b) => (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0))
    playersSlot.append(
      el('h2', {}, `Players (${ordered.length})`),
      el('ul', { class: 'players' }, ordered.map((p) => el('li', {}, p.name, p.id === room.host ? el('span', { class: 'muted small' }, ' host') : null))),
    )
  }

  function chip(n) {
    const round = rounds.find((r) => r.n === n)
    const state = !round ? 'pending' : round.status === 'closed' ? 'closed' : n === room.currentRound ? 'current' : 'pending'
    return el('span', { class: `chip ${state}` }, `${n}`)
  }

  function renderRounds() {
    if (room.status === 'setup') {
      roundsSlot.replaceChildren()
      return
    }
    const strip = el('div', { class: 'row chips' }, el('span', { class: 'muted small' }, 'Rounds'), ...Array.from({ length: room.rounds }, (_, i) => chip(i + 1)))
    const cards = []
    const round = current()
    if (round) cards.push(roundCard(round))
    for (const past of rounds.filter((r) => r.status === 'closed' && r.n !== room.currentRound).sort((a, b) => b.n - a.n)) {
      cards.push(pastRound(past))
    }
    roundsSlot.replaceChildren(strip, ...cards)
  }

  function boardFor(round) {
    if (!boards.has(round.n)) {
      boards.set(round.n, createBoard({ mode: 'multi', status: 'open', scoring: round.scoring }, uid, { title: `Round ${round.n} leaderboard` }))
    }
    const board = boards.get(round.n)
    board.update({ runs: runsByRound[round.n] ?? [], players })
    return board.el
  }

  function routeLine(round) {
    const part = (which) => {
      const hidden = which === 'start' ? round.hideStart : round.hideTarget
      const set = which === 'start' ? round.startSet : round.targetSet
      if (!set) return el('span', { class: 'masked' }, 'not chosen yet')
      if (round[which]) return el('span', {}, round[which].title)
      const known = routes.get(round.n)?.[which]
      if (known && myAttempts(round.n).length > 0) return el('span', {}, known.title)
      if (hidden && myAttempts(round.n).length > 0 && !known) {
        readRoute({ kind: 'round', code, n: round.n }).then((r) => {
          if (r) {
            routes.set(round.n, r)
            render()
          }
        }).catch(() => {})
      }
      return el('span', { class: 'masked' }, 'Hidden until you play')
    }
    return el('p', { class: 'route' }, part('start'), el('span', { class: 'arrow', role: 'img', 'aria-label': 'to' }, '→'), part('target'))
  }

  function roundCard(round) {
    const title = el('h2', {}, `Round ${round.n} · ${SCORING[round.scoring]?.label ?? ''}`)
    const body = el('div', { class: 'stack' })
    const card = el('section', { class: 'card stack' }, title, routeLine(round), body)

    if (round.status === 'choosing') {
      const mine = []
      if (uid === round.startChooser && !round.startSet) mine.push('start')
      if (uid === round.targetChooser && !round.targetSet) mine.push('target')
      const description =
        round.startChooser === round.targetChooser
          ? `${playerName(round.chooser)} chooses both articles.`
          : `${playerName(round.startChooser)} chooses the start, ${playerName(round.targetChooser)} the finish.`
      body.append(el('p', { class: 'muted' }, description))
      if (mine.length > 0 || (isHost() && overriding)) {
        const parts = mine.length ? mine : ['start', 'target'].filter((p) => !round[`${p}Set`])
        body.append(chooserUI(round, parts))
      } else if (isHost()) {
        body.append(button("Choose on their behalf", () => {
          overriding = true
          render()
        }, { class: 'secondary' }))
      } else {
        body.append(el('p', { class: 'muted', role: 'status' }, 'Waiting for the articles to be chosen.'))
      }
      return card
    }

    if (round.status === 'ready') {
      if (isHost()) {
        body.append(
          el('p', { class: 'muted' }, 'Articles are set. Start when everyone is on this page; each screen counts down from 6.'),
          button('Start together', () => startTogether(code, round.n).catch((err) => error.replaceChildren(notice(err.message, 'error'))), { class: 'primary' }),
        )
      } else {
        body.append(el('p', { class: 'muted', role: 'status' }, `Articles are set. Waiting for ${playerName(room.host)} to start the round.`))
      }
      return card
    }

    if (round.status === 'open') {
      const left = round.countdownAt?.toMillis ? round.countdownAt.toMillis() - Date.now() : 0
      if (left > 0) {
        const count = el('span', { class: 'done' }, String(Math.ceil(left / 1000)))
        body.append(el('p', {}, 'Starting together in ', count))
        const timerId = setInterval(() => {
          const remaining = round.countdownAt.toMillis() - Date.now()
          count.textContent = String(Math.max(0, Math.ceil(remaining / 1000)))
          if (remaining <= 0) {
            clearInterval(timerId)
            if (myAttempts(round.n).length === 0 && displayName()) go(playPath({ kind: 'round', code, n: round.n }))
            else render()
          }
        }, 250)
      } else {
        const attempts = myAttempts(round.n)
        const latest = attempts[attempts.length - 1]
        if (latest) {
          const text = latest.done
            ? `Attempt ${latest.attempt}: ${round.scoring === 'time' ? formatMs(latest.ms) : `${latest.clicks} ${latest.clicks === 1 ? 'click' : 'clicks'}`}.`
            : `Attempt ${latest.attempt}: ${latest.quit ? 'gave up' : 'unfinished'}.`
          body.append(el('p', { class: 'muted', role: 'status' }, text))
        }
        const play = button(latest ? 'Play again' : 'Play', () => go(playPath({ kind: 'round', code, n: round.n })), { class: 'primary', disabled: !displayName() })
        const controls = el('p', { class: 'row' }, play)
        if (isHost()) controls.append(button('Close round now', () => advance(round), { class: 'text' }))
        body.append(controls)
      }
      body.append(boardFor(round))
      return card
    }

    body.append(boardFor(round))
    return card
  }

  function pastRound(round) {
    const details = el('details', { class: 'card' }, el('summary', {}, `Round ${round.n} · ${SCORING[round.scoring]?.label ?? ''} · results`), routeLine(round), boardFor(round))
    return details
  }

  function chooserUI(round, parts) {
    if (chooserPanel && chooserPanel.n === round.n && chooserPanel.key === parts.join()) return chooserPanel.el
    const pickers = {}
    const wrap = el('div', { class: 'stack' })
    parts.forEach((part, i) => {
      pickers[part] = createPicker(part === 'start' ? 'Start article' : 'Finish article', `${part}-${round.n}`, { legend: i === 0 })
      wrap.append(pickers[part].el)
    })
    let scoringChoice = null
    if (room.chooserPicks === 'both' && uid === round.chooser) {
      scoringChoice = el(
        'div',
        { class: 'row' },
        ...Object.entries(SCORING).map(([key, { label }]) =>
          el('label', { class: 'check' }, el('input', { type: 'radio', name: `scoring-${round.n}`, value: key, checked: round.scoring === key }), ` ${label}`),
        ),
      )
      wrap.append(el('fieldset', {}, el('legend', {}, 'Scoring for this round'), scoringChoice))
    }
    const err = el('div')
    const confirm = button(parts.length === 2 ? 'Set both articles' : `Set ${parts[0] === 'start' ? 'start' : 'finish'} article`, async () => {
      err.replaceChildren()
      confirm.disabled = true
      try {
        await Promise.all(Object.values(pickers).map((p) => p.settled()))
        const chosen = {}
        for (const part of parts) {
          const page = pickers[part].value()
          if (!page) throw new Error('Choose the article first.')
          chosen[part] = page
        }
        if (chosen.start && chosen.target && chosen.start.key === chosen.target.key) throw new Error('Start and finish must differ.')
        const other = parts.length === 1 ? (parts[0] === 'start' ? 'target' : 'start') : null
        if (other && round[`${other}Set`]) {
          const existing = routes.get(round.n) ?? (await readRoute({ kind: 'round', code, n: round.n }).catch(() => null))
          if (existing) routes.set(round.n, existing)
          if (existing?.[other]?.key === chosen[parts[0]].key) throw new Error('That is already the other article in this round.')
        }
        const routeParts = {}
        const fields = { difficulty: { ...round.difficulty } }
        for (const part of parts) {
          const page = { key: chosen[part].key, title: chosen[part].title }
          const hidden = pickers[part].hidden()
          routeParts[part] = page
          fields[part] = hidden ? null : page
          fields[`${part}Set`] = true
          fields[part === 'start' ? 'hideStart' : 'hideTarget'] = hidden
          fields.difficulty[part] = pickers[part].tier()
        }
        if (scoringChoice) fields.scoring = scoringChoice.querySelector('input:checked').value
        const allSet = (round.startSet || routeParts.start) && (round.targetSet || routeParts.target)
        await setRouteParts(code, round.n, routeParts, fields, allSet ? room.startMode : null)
        chooserPanel = null
        overriding = false
      } catch (e) {
        err.replaceChildren(notice(e.message, 'error'))
        confirm.disabled = false
      }
    }, { class: 'primary' })
    wrap.append(err, confirm)
    chooserPanel = { n: round.n, key: parts.join(), el: wrap }
    return wrap
  }

  function standingsRows() {
    return computeStandings({ rounds, runsByRound, players, system: room.system })
  }

  function renderStandings() {
    standingsSlot.replaceChildren()
    if (room.status === 'setup' || room.system === 'independent') return
    const rows = standingsRows()
    if (rows.length === 0) return
    const lower = SYSTEMS[room.system]?.higher === false
    const fmt = (t) => (room.system === 'time' ? formatMs(t.score) : String(t.score))
    standingsSlot.append(
      el(
        'section',
        { class: 'card stack-small' },
        el('h2', {}, room.status === 'finished' ? 'Final standings' : 'Standings'),
        el('p', { class: 'muted small' }, `${SYSTEMS[room.system].label}: ${SYSTEMS[room.system].hint}. ${rows[0].roundsClosed} of ${room.rounds} rounds counted.`),
        el(
          'div',
          { class: 'table-wrap' },
          el(
            'table',
            { class: 'board' },
            el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Player'), el('th', { class: 'num' }, lower ? 'Total' : 'Points'), el('th', { class: 'num' }, 'Rounds'))),
            el(
              'tbody',
              {},
              rows.map((t) =>
                el('tr', { class: t.uid === uid ? 'me' : null }, el('td', {}, t.complete ? String(t.rank) : ''), el('td', {}, t.name), el('td', { class: 'num' }, fmt(t)), el('td', { class: 'num' }, `${t.played}/${t.roundsClosed}`)),
              ),
            ),
          ),
        ),
      ),
    )
  }

  function maybeAdvance() {
    if (!isHost() || advancing || room.status !== 'playing') return
    const round = current()
    if (!round || round.status !== 'open') return
    if (round.countdownAt?.toMillis && round.countdownAt.toMillis() > Date.now()) return
    const everyone = players.filter((p) => p.name)
    if (everyone.length === 0) return
    if (!everyone.every((p) => terminal(round.n, p.id))) return
    advance(round)
  }

  async function advance(round) {
    if (advancing) return
    advancing = true
    try {
      await closeRound(code, round.n)
      const closedRounds = rounds.map((r) => (r.n === round.n ? { ...r, status: 'closed' } : r))
      const results = roundResults(runsByRound[round.n] ?? [], round.scoring)
      const standings = computeStandings({ rounds: closedRounds, runsByRound, players, system: room.system === 'independent' ? 'points' : room.system })
      if (round.n < room.rounds) {
        if (!rounds.some((r) => r.n === round.n + 1)) await makeRound(round.n + 1, results, standings)
        await updateRoom(code, { currentRound: round.n + 1 })
      } else {
        await updateRoom(code, { status: 'finished' })
      }
    } catch (err) {
      error.replaceChildren(notice(`Could not move the room on: ${err.message}`, 'error'))
    } finally {
      advancing = false
    }
  }

  if (room) render()

  return view(root, () => {
    stopSession()
    stopPlayers()
    stopRounds()
    for (const stop of runStops.values()) stop()
    for (const board of boards.values()) board.dispose()
  })
}
