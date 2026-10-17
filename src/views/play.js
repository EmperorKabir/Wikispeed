import { currentUser, displayName } from '../auth.js'
import { finishRun, getSession, readRoute, saveHistory, startRun } from '../db.js'
import { go } from '../router.js'
import { formatMs } from '../score.js'
import { createTimer } from '../timer.js'
import { button, el, link, notice, view } from '../ui.js'
import { articleUrl, fetchArticle } from '../wiki.js'

export async function playView({ code }) {
  const user = currentUser()
  const name = displayName(user)
  const session = await getSession(code)

  if (!session || session.status !== 'open' || !name) {
    go(`/s/${code}`)
    return view(el('div'))
  }

  const route = await readRoute(code)
  if (!route) {
    go(`/s/${code}`)
    return view(el('div'))
  }

  const timer = createTimer()
  const path = [route.start.key]
  let clicks = 0
  let finished = false
  let tick = null

  const clicksOut = el('span', { class: 'stat' }, '0')
  const timeOut = el('span', { class: 'stat' }, '0:00.0')
  const heading = el('h1', { class: 'article-title' })
  const article = el('article', { class: 'article', 'aria-busy': 'true', onclick: onArticleClick })
  const status = el('div')

  const bar = el(
    'div',
    { class: 'playbar' },
    el('div', { class: 'target' }, el('span', { class: 'muted small' }, 'Find'), el('strong', {}, route.target.title)),
    el(
      'div',
      { class: 'stats' },
      el('span', { class: session.scoring === 'clicks' ? 'primary-stat' : null }, el('span', { class: 'muted small' }, 'Clicks '), clicksOut),
      el('span', { class: session.scoring === 'time' ? 'primary-stat' : null }, el('span', { class: 'muted small' }, 'Time '), timeOut),
      button('Give up', () => go(`/s/${code}`), { class: 'text' }),
    ),
  )

  const root = el('div', { class: 'play' }, bar, status, heading, article)

  await startRun(code, user.uid, name, route.start.key)
  timer.start()
  timer.pause()
  tick = setInterval(() => {
    timeOut.textContent = formatMs(timer.elapsed())
  }, 100)

  load(route.start.key)

  async function load(key) {
    timer.pause()
    article.setAttribute('aria-busy', 'true')
    status.replaceChildren(el('p', { class: 'muted', role: 'status' }, 'Loading'))
    try {
      const page = await fetchArticle(key)
      if (finished) return
      path[path.length - 1] = page.key
      heading.textContent = page.title
      article.replaceChildren(...page.body.childNodes)
      article.setAttribute('aria-busy', 'false')
      status.replaceChildren()
      scrollTo(0, 0)
      if (page.key === route.target.key) {
        await finish()
        return
      }
      timer.resume()
    } catch (err) {
      status.replaceChildren(
        notice(err.message, 'error'),
        button('Retry', () => load(key), { class: 'secondary' }),
      )
    }
  }

  function onArticleClick(event) {
    const anchor = event.target.closest('a[data-key]')
    if (!anchor || finished) return
    event.preventDefault()
    if (article.getAttribute('aria-busy') === 'true') return
    const key = anchor.dataset.key
    clicks += 1
    clicksOut.textContent = String(clicks)
    path.push(key)
    load(key)
  }

  async function finish() {
    finished = true
    timer.pause()
    clearInterval(tick)
    const ms = Math.round(timer.elapsed())
    timeOut.textContent = formatMs(ms)
    status.replaceChildren(el('p', { class: 'muted', role: 'status' }, 'Saving'))
    try {
      await finishRun(code, user.uid, { name, clicks, ms, path })
      await saveHistory(user.uid, code, {
        mode: session.mode,
        scoring: session.scoring,
        start: route.start.title,
        target: route.target.title,
        clicks,
        ms,
        done: true,
      })
      status.replaceChildren(
        el('p', { class: 'done', role: 'status' }, `Done in ${clicks} ${clicks === 1 ? 'click' : 'clicks'}, ${formatMs(ms)}.`),
        el('p', { class: 'row' }, link('See results', `/s/${code}`, { class: 'button primary' }), el('a', { href: articleUrl(route.target.key), target: '_blank', rel: 'noopener', class: 'small' }, 'Open on Wikipedia')),
      )
    } catch (err) {
      status.replaceChildren(
        notice(`Finished, but saving failed: ${err.message}`, 'error'),
        button('Retry', finish, { class: 'secondary' }),
      )
    }
  }

  return view(root, () => {
    finished = true
    clearInterval(tick)
  })
}
