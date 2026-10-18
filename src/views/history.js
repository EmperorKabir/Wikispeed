import { currentUser, isGoogleUser } from '../auth.js'
import { arenaPath, getDaily, getRound, getSession, playPath, todayKey, watchHistory, watchPlayers, watchRuns } from '../db.js'
import { go } from '../router.js'
import { SCORING, formatMs } from '../score.js'
import { back, button, el, link, notice, view } from '../ui.js'
import { describeDifficulty } from '../wiki.js'
import { createBoard } from './board.js'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

export function historyView() {
  const user = currentUser()
  const list = el('div', {}, el('p', { class: 'muted', role: 'status' }, 'Loading'))
  const open = new Map()

  const root = el(
    'div',
    { class: 'stack' },
    back(),
    el('h1', {}, 'History'),
    isGoogleUser(user) ? null : el('p', { class: 'muted small' }, 'Sign in with Google on the home page to keep this on every device.'),
    list,
  )

  const stop = watchHistory(
    user.uid,
    (entries) => {
      list.replaceChildren()
      if (entries.length === 0) {
        list.append(el('p', { class: 'muted' }, 'Nothing played yet.'))
        return
      }
      list.append(el('ul', { class: 'history' }, entries.map(row)))
    },
    () => list.replaceChildren(notice('Could not load history.', 'error')),
  )

  function closeBoard(id) {
    const entry = open.get(id)
    if (!entry) return
    entry.stop()
    entry.slot.replaceChildren()
    open.delete(id)
  }

  function arenaOf(e) {
    if (e.kind === 'daily') return { kind: 'daily', date: e.date, slug: e.slug }
    if (e.kind === 'round') return { kind: 'round', code: e.code, n: e.round }
    return { kind: 'session', code: e.code ?? e.id }
  }

  async function boardContext(arena) {
    if (arena.kind === 'daily') {
      const challenge = await getDaily(arena.date, arena.slug)
      return challenge ? { session: { mode: 'multi', status: 'open', scoring: challenge.scoring }, players: false } : null
    }
    const session = await getSession(arena.code)
    if (!session) return null
    if (arena.kind === 'round') {
      const round = await getRound(arena.code, arena.n)
      return round ? { session: { mode: 'multi', status: 'open', scoring: round.scoring }, players: true } : null
    }
    return { session, players: true }
  }

  async function openBoard(e, slot, toggle) {
    toggle.disabled = true
    const arena = arenaOf(e)
    try {
      const ctx = await boardContext(arena)
      if (!ctx) {
        slot.replaceChildren(el('p', { class: 'muted small' }, 'This game no longer exists.'))
        return
      }
      const board = createBoard(ctx.session, user.uid)
      const stopRuns = watchRuns(arena, (runs) => board.update({ runs }), () => {})
      const stopPlayers = ctx.players ? watchPlayers(arena.code, (players) => board.update({ players }), () => {}) : () => {}
      open.set(e.id, {
        slot,
        stop: () => {
          stopRuns()
          stopPlayers()
          board.dispose()
        },
      })
      slot.replaceChildren(el('div', { class: 'card' }, board.el))
    } catch (err) {
      slot.replaceChildren(notice(`Could not load the leaderboard: ${err.message}`, 'error'))
    } finally {
      toggle.disabled = false
    }
  }

  function row(e) {
    const timed = e.scoring === 'time'
    const when = e.at?.toDate ? dateFormat.format(e.at.toDate()) : ''
    const result = timed ? formatMs(e.ms ?? 0) : `${e.clicks ?? 0} ${e.clicks === 1 ? 'click' : 'clicks'}`
    const slot = el('div', { class: 'board-slot' })
    const arena = arenaOf(e)
    const isOpen = open.has(e.id)
    const toggle = button(isOpen ? 'Hide leaderboard' : 'Leaderboard', async () => {
      if (open.has(e.id)) {
        closeBoard(e.id)
        toggle.textContent = 'Leaderboard'
        toggle.setAttribute('aria-expanded', 'false')
        return
      }
      toggle.textContent = 'Hide leaderboard'
      toggle.setAttribute('aria-expanded', 'true')
      await openBoard(e, slot, toggle)
    }, { class: 'text small-button', 'aria-expanded': String(isOpen) })
    if (isOpen) {
      const entry = open.get(e.id)
      const nodes = [...entry.slot.childNodes]
      entry.slot = slot
      slot.replaceChildren(...nodes)
    }
    const replayable = arena.kind !== 'daily' || arena.date === todayKey()
    const label = e.kind === 'daily' ? `Daily ${e.date}: ` : e.kind === 'round' ? `Round ${e.round}: ` : ''
    return el(
      'li',
      {},
      el('div', { class: 'row between' }, link(`${label}${e.start} → ${e.target}`, arenaPath(arena)), el('span', { class: 'muted small' }, when)),
      el(
        'div',
        { class: 'row between' },
        el(
          'span',
          { class: 'row' },
          el('span', { class: `outcome ${e.done ? 'ok' : 'quit'}` }, e.done ? `Best: ${result}` : 'Not finished'),
          el(
            'span',
            { class: 'muted small' },
            `${e.mode === 'solo' ? 'Solo' : e.mode === 'daily' ? 'Daily' : 'Multiplayer'} · ${SCORING[e.scoring]?.label ?? ''}${describeDifficulty(e.difficulty) ? ` · ${describeDifficulty(e.difficulty)}` : ''}${e.attempts > 1 ? ` · ${e.attempts} attempts` : ''}`,
          ),
        ),
        el(
          'span',
          { class: 'row' },
          toggle,
          replayable ? button('Play again', () => go(playPath(arena)), { class: 'secondary small-button' }) : null,
        ),
      ),
      slot,
    )
  }

  return view(root, () => {
    stop()
    for (const id of [...open.keys()]) closeBoard(id)
  })
}
