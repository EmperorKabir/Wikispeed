import { currentUser, isGoogleUser } from '../auth.js'
import { watchHistory } from '../db.js'
import { SCORING, formatMs } from '../score.js'
import { el, link, notice, view } from '../ui.js'

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
      list.append(
        el(
          'ul',
          { class: 'history' },
          entries.map((e) =>
            el(
              'li',
              {},
              link(`${e.start} → ${e.target}`, `/s/${e.code}`),
              el(
                'span',
                { class: 'muted small' },
                `${e.mode === 'solo' ? 'Solo' : 'Multiplayer'} · ${SCORING[e.scoring]?.label ?? ''} · ${e.clicks} ${e.clicks === 1 ? 'click' : 'clicks'} · ${formatMs(e.ms)}`,
              ),
            ),
          ),
        ),
      )
    },
    () => list.replaceChildren(notice('Could not load history.', 'error')),
  )

  return view(root, stop)
}
