import { currentUser, displayName } from '../auth.js'
import { getSession, readRoute, recordRun, startRun } from '../db.js'
import { go } from '../router.js'
import { formatMs } from '../score.js'
import { createTimer } from '../timer.js'
import { button, el, link, notice, view } from '../ui.js'
import { articleUrl, fetchArticle, loadWikiStyles } from '../wiki.js'

export async function playView({ code }) {
  const user = currentUser()
  const name = displayName(user)
  const [session, route] = await Promise.all([getSession(code), readRoute(code).catch(() => null)])

  if (!session || session.status !== 'open' || !name || !route) {
    go(`/s/${code}`)
    return view(el('div'))
  }

  const timed = session.scoring === 'time'
  const timer = createTimer()
  const path = [route.start.key]
  let clicks = 0
  let finished = false
  let currentKey = route.start.key
  let tick = null

  const metricOut = el('span', { class: 'stat' }, timed ? '0:00.0' : '0')
  const titleOut = el('span', { class: 'article-title' })
  const wikiLink = el('a', { class: 'small', target: '_blank', rel: 'noopener' }, 'Open on Wikipedia')
  const content = el('div', { class: 'mw-parser-output' })
  const article = el('article', { class: 'wiki-paper', 'aria-busy': 'true', onclick: onArticleClick }, content)
  const status = el('div')

  const bar = el(
    'div',
    { class: 'playbar' },
    el('div', { class: 'target' }, el('span', { class: 'muted small' }, 'Find'), el('strong', {}, route.target.title)),
    el(
      'div',
      { class: 'stats' },
      el('span', { class: 'primary-stat' }, el('span', { class: 'muted small' }, timed ? 'Time ' : 'Clicks '), metricOut),
      button('Give up', giveUp, { class: 'text' }),
    ),
  )

  const root = el(
    'div',
    { class: 'play' },
    bar,
    status,
    el('div', { class: 'article-head' }, titleOut, wikiLink),
    article,
  )

  try {
    await startRun(code, user.uid, name, route.start.key)
  } catch {
    go(`/s/${code}`)
    return view(el('div'))
  }

  const unloadStyles = loadWikiStyles()
  timer.start()
  timer.pause()
  if (timed) {
    tick = setInterval(() => {
      metricOut.textContent = formatMs(timer.elapsed())
    }, 100)
  }

  load(route.start.key)

  async function load(key) {
    timer.pause()
    article.setAttribute('aria-busy', 'true')
    status.replaceChildren(el('p', { class: 'muted', role: 'status' }, 'Loading'))
    try {
      const page = await fetchArticle(key)
      if (finished) return
      currentKey = page.key
      path[path.length - 1] = page.key
      titleOut.textContent = page.title
      wikiLink.setAttribute('href', articleUrl(page.key))
      content.replaceChildren(...page.body.childNodes)
      status.replaceChildren()
      scrollTo(0, 0)
      if (page.key === route.target.key) {
        article.setAttribute('aria-busy', 'false')
        await finish()
        return
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (finished) return
          article.setAttribute('aria-busy', 'false')
          timer.resume()
        }),
      )
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
    if (key === currentKey) return
    clicks += 1
    if (!timed) metricOut.textContent = String(clicks)
    path.push(key)
    load(key)
  }

  function result() {
    return timed ? formatMs(Math.round(timer.elapsed())) : `${clicks} ${clicks === 1 ? 'click' : 'clicks'}`
  }

  function record(done) {
    const ms = Math.round(timer.elapsed())
    return recordRun(
      code,
      user.uid,
      { name, clicks, ms, path, done },
      {
        mode: session.mode,
        scoring: session.scoring,
        start: route.start.title,
        target: route.target.title,
        clicks,
        ms,
        done,
      },
    )
  }

  async function finish() {
    finished = true
    timer.pause()
    clearInterval(tick)
    metricOut.textContent = timed ? formatMs(Math.round(timer.elapsed())) : String(clicks)
    status.replaceChildren(el('p', { class: 'muted', role: 'status' }, 'Saving'))
    try {
      await record(true)
      status.replaceChildren(
        el('p', { class: 'done', role: 'status' }, `Done: ${result()}.`),
        el('p', { class: 'row' }, link('See results', `/s/${code}`, { class: 'button primary' })),
      )
    } catch (err) {
      status.replaceChildren(
        notice(`Finished, but saving failed: ${err.message}`, 'error'),
        button('Retry', finish, { class: 'secondary' }),
      )
    }
  }

  async function giveUp() {
    if (finished) return
    finished = true
    timer.pause()
    clearInterval(tick)
    status.replaceChildren(el('p', { class: 'muted', role: 'status' }, 'Saving'))
    try {
      await record(false)
    } catch {
      // the run stays marked as in progress; nothing else to do here
    }
    go(`/s/${code}`)
  }

  return view(root, () => {
    finished = true
    clearInterval(tick)
    unloadStyles()
  })
}
