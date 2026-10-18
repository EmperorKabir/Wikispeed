import { currentUser, isGoogleUser } from '../auth.js'
import { getSession, watchHistory, watchPlayers, watchRuns } from '../db.js'
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

  function closeBoard(code) {
    const entry = open.get(code)
    if (!entry) return
    entry.stop()
    entry.slot.replaceChildren()
    open.delete(code)
  }

  async function openBoard(code, slot, toggle) {
    toggle.disabled = true
    try {
      const session = await getSession(code)
      if (!session) {
        slot.replaceChildren(el('p', { class: 'muted small' }, 'This session no longer exists.'))
        return
      }
      const board = createBoard(session, user.uid)
      const stopRuns = watchRuns(code, (runs) => board.update({ runs }), () => {})
      const stopPlayers = watchPlayers(code, (players) => board.update({ players }), () => {})
      open.set(code, {
        slot,
        stop: () => {
          stopRuns()
          stopPlayers()
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
    const isOpen = open.has(e.code)
    const toggle = button(isOpen ? 'Hide leaderboard' : 'Leaderboard', async () => {
      if (open.has(e.code)) {
        closeBoard(e.code)
        toggle.textContent = 'Leaderboard'
        toggle.setAttribute('aria-expanded', 'false')
        return
      }
      toggle.textContent = 'Hide leaderboard'
      toggle.setAttribute('aria-expanded', 'true')
      await openBoard(e.code, slot, toggle)
    }, { class: 'text small-button', 'aria-expanded': String(isOpen) })
    if (isOpen) {
      const entry = open.get(e.code)
      entry.slot = slot
      slot.replaceChildren(...entry.slot.childNodes)
    }
    return el(
      'li',
      {},
      el('div', { class: 'row between' }, link(`${e.start} → ${e.target}`, `/s/${e.code}`), el('span', { class: 'muted small' }, when)),
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
            `${e.mode === 'solo' ? 'Solo' : 'Multiplayer'} · ${SCORING[e.scoring]?.label ?? ''}${describeDifficulty(e.difficulty) ? ` · ${describeDifficulty(e.difficulty)}` : ''}${e.attempts > 1 ? ` · ${e.attempts} attempts` : ''}`,
          ),
        ),
        el('span', { class: 'row' }, toggle, button('Play again', () => go(`/play/${e.code}`), { class: 'secondary small-button' })),
      ),
      slot,
    )
  }

  return view(root, () => {
    stop()
    for (const code of [...open.keys()]) closeBoard(code)
  })
}
