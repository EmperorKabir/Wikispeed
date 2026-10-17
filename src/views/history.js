import { currentUser, isGoogleUser } from '../auth.js'
import { watchHistory } from '../db.js'
import { SCORING, formatMs } from '../score.js'
import { el, link, notice, view } from '../ui.js'

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

  const root = el(
    'div',
    { class: 'stack' },
    el('p', { class: 'crumbs' }, link('Home', '/'), el('span', {}, 'History')),
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

  function row(e) {
    const timed = e.scoring === 'time'
    const when = e.at?.toDate ? dateFormat.format(e.at.toDate()) : ''
    const result = timed ? formatMs(e.ms ?? 0) : `${e.clicks ?? 0} ${e.clicks === 1 ? 'click' : 'clicks'}`
    return el(
      'li',
      {},
      el('div', { class: 'row between' }, link(`${e.start} → ${e.target}`, `/s/${e.code}`), el('span', { class: 'muted small' }, when)),
      el(
        'div',
        { class: 'row' },
        el('span', { class: `outcome ${e.done ? 'ok' : 'quit'}` }, e.done ? `Best: ${result}` : 'Not finished'),
        el(
          'span',
          { class: 'muted small' },
          `${e.mode === 'solo' ? 'Solo' : 'Multiplayer'} · ${SCORING[e.scoring]?.label ?? ''}${e.attempts > 1 ? ` · ${e.attempts} attempts` : ''}`,
        ),
      ),
    )
  }

  return view(root, stop)
}
