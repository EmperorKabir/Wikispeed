import { currentUser, displayName } from '../auth.js'
import {
  arenaPath,
  getDaily,
  getRound,
  getSession,
  progressRun,
  readRoute,
  recordRun,
  startRun,
  todayKey,
  watchPlayers,
  watchRuns,
} from '../db.js'
import { go } from '../router.js'
import { formatMs, playerRows } from '../score.js'
import { createTimer } from '../timer.js'
import { button, el, link, notice, view } from '../ui.js'
import { articleUrl, enhanceCollapsibles, fetchArticle, loadWikiStyles, prefetchArticle } from '../wiki.js'
import { createBoard } from './board.js'

function normaliseDifficulty(value) {
  if (value && typeof value === 'object') return { start: value.start ?? 'typed', target: value.target ?? 'typed' }
  if (typeof value === 'string') return { start: value, target: value }
  return { start: 'typed', target: 'typed' }
}

async function resolveArena(params) {
  if (params.date) {
    const arena = { kind: 'daily', date: params.date, slug: params.slug }
    if (params.date !== todayKey()) return { arena, error: 'That daily challenge has closed.' }
    const challenge = await getDaily(params.date, params.slug)
    if (!challenge) return { arena, error: 'That daily challenge is not ready yet.' }
    return {
      arena,
      scoring: challenge.scoring,
      difficulty: challenge.difficulty,
      mode: 'daily',
      history: { kind: 'daily', date: params.date, slug: params.slug },
      board: { mode: 'multi', status: 'open', scoring: challenge.scoring },
    }
  }
  const session = await getSession(params.code)
  if (!session) return { arena: { kind: 'session', code: params.code }, error: 'No session with that code.' }
  if (params.n) {
    const arena = { kind: 'round', code: params.code, n: Number(params.n) }
    const round = await getRound(params.code, arena.n)
    if (!round || round.status !== 'open') return { arena, error: 'That round is not open.' }
    return {
      arena,
      scoring: round.scoring,
      difficulty: round.difficulty,
      mode: 'multi',
      countdownAt: round.countdownAt,
      history: { kind: 'round', code: params.code, round: arena.n },
      board: { mode: 'multi', status: 'open', scoring: round.scoring },
    }
  }
  const arena = { kind: 'session', code: params.code }
  if (session.version === 2 || session.status !== 'open') return { arena, error: 'This session is not open for play.' }
  return {
    arena,
    scoring: session.scoring,
    difficulty: session.difficulty,
    mode: session.mode,
    history: { kind: 'session', code: params.code },
    board: { mode: session.mode, status: session.status, scoring: session.scoring },
  }
}

export async function playView(params) {
  const user = currentUser()
  const name = displayName(user)
  const ctx = await resolveArena(params)
  const backPath = arenaPath(ctx.arena)

  if (ctx.error || !name) {
    go(backPath)
    return view(el('div'))
  }

  const route = await readRoute(ctx.arena).catch(() => null)
  if (!route) {
    go(backPath)
    return view(el('div'))
  }

  const { arena, scoring } = ctx
  const timed = scoring === 'time'
  const timer = createTimer()
  const path = [route.start.key]
  let clicks = 0
  let loadMs = 0
  let finished = false
  let currentKey = route.start.key
  let tick = null
  let stopBoard = () => {}

  const metricOut = el('span', { class: 'stat' }, timed ? '0:00.0' : '0')
  const titleOut = el('span', { class: 'article-title' })
  const wikiLink = el('a', { class: 'small', target: '_blank', rel: 'noopener' }, 'Open on Wikipedia')
  const content = el('div', { class: 'mw-parser-output' })
  const article = el('article', { class: 'wiki-paper', 'aria-busy': 'true', onclick: onArticleClick }, content)
  const status = el('div')
  const attemptOut = el('span', { class: 'muted small' })

  const SIZES = [0.75, 0.875, 1, 1.125, 1.25, 1.4]
  const SIZE_KEY = 'wixpert.articleSize'
  let sizeIndex = 1
  try {
    const saved = Number(localStorage.getItem(SIZE_KEY))
    if (saved >= 0 && saved < SIZES.length) sizeIndex = saved
  } catch {
    // storage unavailable; use the default size
  }
  const giveUpButton = button('Give up', () => giveUp(backPath), { class: 'danger' })
  const smaller = button('A−', () => setSize(sizeIndex - 1), { class: 'text size', 'aria-label': 'Smaller text' })
  const larger = button('A+', () => setSize(sizeIndex + 1), { class: 'text size', 'aria-label': 'Larger text' })

  function setSize(index) {
    sizeIndex = Math.min(SIZES.length - 1, Math.max(0, index))
    article.style.fontSize = `${SIZES[sizeIndex]}rem`
    smaller.disabled = sizeIndex === 0
    larger.disabled = sizeIndex === SIZES.length - 1
    try {
      localStorage.setItem(SIZE_KEY, String(sizeIndex))
    } catch {
      // storage unavailable; the size lasts for this page only
    }
  }

  const bar = el(
    'div',
    { class: 'playbar' },
    el('div', { class: 'target' }, el('span', { class: 'muted small' }, 'Find'), el('strong', {}, route.target.title)),
    el(
      'div',
      { class: 'stats' },
      attemptOut,
      el('span', { class: 'primary-stat' }, el('span', { class: 'muted small' }, timed ? 'Time ' : 'Clicks '), metricOut),
      el('span', { class: 'sizes' }, smaller, larger),
      giveUpButton,
      button('Home', () => giveUp('/'), { class: 'text' }),
    ),
  )
  setSize(sizeIndex)

  const root = el(
    'div',
    { class: 'play' },
    bar,
    status,
    el('div', { class: 'article-head' }, titleOut, wikiLink),
    article,
  )

  prefetchArticle(route.start.key)
  prefetchArticle(route.target.key)

  const countdownMs = ctx.countdownAt?.toMillis ? ctx.countdownAt.toMillis() - Date.now() : 0
  if (countdownMs > 0) {
    const count = el('p', { class: 'done', role: 'status' })
    status.replaceChildren(el('div', { class: 'card stack-small' }, el('p', { class: 'muted' }, 'Everyone starts together in'), count))
    await new Promise((resolve) => {
      const update = () => {
        const left = Math.ceil((ctx.countdownAt.toMillis() - Date.now()) / 1000)
        count.textContent = String(Math.max(0, left))
        if (left <= 0) {
          clearInterval(cd)
          resolve()
        }
      }
      const cd = setInterval(update, 200)
      update()
    })
    status.replaceChildren()
  }

  let run
  try {
    run = await startRun(arena, user.uid, name, route.start.key)
  } catch {
    go(backPath)
    return view(el('div'))
  }
  if (run.attempt > 1) attemptOut.textContent = arena.kind === 'daily' ? `Practice ${run.attempt - 1}, not ranked` : `Attempt ${run.attempt}`

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
    const loadStart = performance.now()
    article.setAttribute('aria-busy', 'true')
    const loading = el('p', { class: 'muted', role: 'status' }, 'Loading')
    status.replaceChildren(loading)
    const slow = setTimeout(() => {
      loading.textContent = 'Still loading. Wikipedia is slow to serve this article; the clock is paused.'
    }, 4000)
    try {
      const page = await fetchArticle(key)
      clearTimeout(slow)
      if (finished) return
      loadMs += performance.now() - loadStart
      currentKey = page.key
      path[path.length - 1] = page.key
      titleOut.textContent = page.title
      wikiLink.setAttribute('href', articleUrl(page.key))
      content.replaceChildren(...page.body.childNodes)
      enhanceCollapsibles(content)
      status.replaceChildren()
      scrollTo(0, 0)
      if (page.key === route.target.key) {
        article.setAttribute('aria-busy', 'false')
        await finish()
        return
      }
      if (clicks > 0) progressRun(arena, run.id, { clicks, path, currentKey, loadMs: Math.round(loadMs) }).catch(() => {})
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (finished) return
          article.setAttribute('aria-busy', 'false')
          timer.resume()
        }),
      )
    } catch (err) {
      clearTimeout(slow)
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
    const current = { uid: user.uid, attempt: run.attempt, name, clicks, ms, done, quit: !done }
    const best = playerRows([...run.previous, current], scoring, { firstOnly: arena.kind === 'daily' })[0].best
    return recordRun(
      arena,
      run.id,
      user.uid,
      { name, clicks, ms, path, done },
      {
        mode: ctx.mode,
        scoring,
        difficulty: normaliseDifficulty(ctx.difficulty),
        start: route.start.title,
        target: route.target.title,
        clicks: best.clicks,
        ms: best.ms,
        done: Boolean(best.done),
        attempts: run.attempt,
        ...ctx.history,
      },
    )
  }

  async function finish() {
    finished = true
    giveUpButton.hidden = true
    timer.pause()
    clearInterval(tick)
    metricOut.textContent = timed ? formatMs(Math.round(timer.elapsed())) : String(clicks)
    status.replaceChildren(el('p', { class: 'muted', role: 'status' }, 'Saving'))
    try {
      await record(true)
      const board = createBoard({ ...ctx.board, mode: ctx.mode === 'solo' ? 'solo' : 'multi' }, user.uid, { firstOnly: arena.kind === 'daily' })
      const stopRuns = watchRuns(arena, (runs) => board.update({ runs }), () => {})
      const stopPlayers = arena.kind === 'daily' ? () => {} : watchPlayers(arena.code, (players) => board.update({ players }), () => {})
      stopBoard = () => {
        stopRuns()
        stopPlayers()
        board.dispose()
      }
      status.replaceChildren(
        el(
          'section',
          { class: 'card stack' },
          el('p', { class: 'done', role: 'status' }, `Done: ${result()}.`),
          el('p', { class: 'row' }, link(arena.kind === 'daily' ? 'Challenge page' : 'Session page', backPath, { class: 'button primary' }), link('Home', '/', { class: 'button secondary' })),
          board.el,
        ),
      )
    } catch (err) {
      status.replaceChildren(
        notice(`Finished, but saving failed: ${err.message}`, 'error'),
        button('Retry', finish, { class: 'secondary' }),
      )
    }
  }

  async function giveUp(destination) {
    if (finished) {
      go(destination)
      return
    }
    finished = true
    timer.pause()
    clearInterval(tick)
    status.replaceChildren(el('p', { class: 'muted', role: 'status' }, 'Saving'))
    try {
      await record(false)
    } catch {
      // the attempt stays marked as unfinished; nothing else to do here
    }
    go(destination)
  }

  return view(root, () => {
    finished = true
    clearInterval(tick)
    stopBoard()
    unloadStyles()
  })
}
