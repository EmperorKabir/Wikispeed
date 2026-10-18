import { currentUser, displayName, setName } from '../auth.js'
import { ensureDaily, getDaily, listDaily, playPath, readRoute, todayKey, watchRuns } from '../db.js'
import { go } from '../router.js'
import { SCORING, attemptStatus, formatMs } from '../score.js'
import { back, button, el, link, notice, view } from '../ui.js'
import { DIFFICULTIES, randomArticle } from '../wiki.js'
import { createBoard } from './board.js'

function slugParts(slug) {
  const [tier, scoring] = slug.split('-')
  return { tier, scoring, label: `${DIFFICULTIES[tier]?.label ?? tier} · ${SCORING[scoring]?.label ?? scoring}` }
}

function nextMidnightUtc() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

function resetLine() {
  const target = nextMidnightUtc()
  const local = new Date(target).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const out = el('p', { class: 'muted small', role: 'status' })
  const update = () => {
    const left = Math.max(0, target - Date.now())
    const h = Math.floor(left / 3600000)
    const m = Math.floor((left % 3600000) / 60000)
    const s = Math.floor((left % 60000) / 1000)
    out.textContent = `New challenges in ${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s, at midnight UTC (${local} your time).`
  }
  update()
  const id = setInterval(update, 1000)
  return { el: out, stop: () => clearInterval(id) }
}

async function makeRoute(tier) {
  const first = await randomArticle(tier)
  let second = await randomArticle(tier)
  for (let i = 0; i < 3 && second.key === first.key; i++) second = await randomArticle(tier)
  return { start: { key: first.key, title: first.title }, target: { key: second.key, title: second.title } }
}

function nameGate(after) {
  const nameInput = el('input', { type: 'text', name: 'nickname', maxlength: '32', placeholder: 'Your name', 'aria-label': 'Your name', autocomplete: 'nickname' })
  const save = button('Save name', async () => {
    save.disabled = true
    try {
      await setName(nameInput.value)
    } catch {
      save.disabled = false
      return
    }
    after()
  }, { class: 'secondary', disabled: true })
  nameInput.addEventListener('input', () => {
    save.disabled = nameInput.value.trim().length === 0
  })
  return el('section', { class: 'card row' }, el('span', { class: 'muted small' }, 'Pick a name to appear on the boards:'), nameInput, save)
}

export async function dailyIndexView({ date } = {}) {
  const today = todayKey()
  const day = date ?? today
  const isToday = day === today
  const reset = resetLine()
  const error = el('div')
  const existing = await listDaily(day).catch(() => [])
  const have = new Set(existing.map((c) => c.slug))

  function cell(slug) {
    const { tier } = slugParts(slug)
    const play = button('Play', async () => {
      play.disabled = true
      try {
        const challenge = await ensureDaily(day, slug, () => makeRoute(tier))
        if (!challenge) throw new Error('Could not set up the challenge.')
        go(playPath({ kind: 'daily', date: day, slug }))
      } catch (err) {
        error.replaceChildren(notice(err.message, 'error'))
        play.disabled = false
      }
    }, { class: 'primary small-button', disabled: !isToday || !displayName() })
    return el(
      'div',
      { class: 'card stack-small daily-cell' },
      el('div', { class: 'row' }, play, link('Board', `/daily/${day}/${slug}`, { class: 'button secondary small-button' })),
      el('span', { class: 'muted small' }, have.has(slug) ? 'In play' : isToday ? 'Not started by anyone yet' : 'Nobody played this one'),
    )
  }

  function grid() {
    const cells = [el('div', {}, ''), el('div', { class: 'daily-head' }, 'Timed'), el('div', { class: 'daily-head' }, 'Fewest clicks')]
    for (const tier of Object.keys(DIFFICULTIES)) {
      cells.push(
        el('div', { class: 'daily-row' }, el('strong', {}, DIFFICULTIES[tier].label), el('span', { class: 'muted small' }, DIFFICULTIES[tier].hint)),
        cell(`${tier}-time`),
        cell(`${tier}-clicks`),
      )
    }
    return el('div', { class: 'daily-grid' }, cells)
  }

  const gate = displayName() ? null : nameGate(() => go(`/daily/${day}`))
  const root = el(
    'div',
    { class: 'stack' },
    back(),
    el('h1', {}, isToday ? 'Daily challenge' : `Daily challenge, ${day}`),
    el('p', { class: 'muted' }, 'Eight fresh routes every day, one global board each. Articles stay hidden until you press Play. Every attempt counts; your best is ranked.'),
    isToday ? reset.el : el('p', { class: 'muted small' }, link('Back to today', '/daily')),
    gate,
    error,
    grid(),
    isToday ? el('p', { class: 'muted small' }, link("Yesterday's challenges", `/daily/${todayKey(new Date(Date.now() - 86400000))}`)) : null,
  )
  return view(root, () => reset.stop())
}

export async function dailyChallengeView({ date, slug }) {
  const uid = currentUser().uid
  const today = todayKey()
  const isToday = date === today
  const { tier, scoring, label } = slugParts(slug)
  const challenge = isToday ? await ensureDaily(date, slug, () => makeRoute(tier)).catch(() => null) : await getDaily(date, slug)
  const reset = resetLine()
  const arena = { kind: 'daily', date, slug }
  let route = null
  let runs = []

  const header = el('div', { class: 'stack' })
  const action = el('div', { class: 'stack' })
  const error = el('div')
  const board = createBoard({ mode: 'multi', status: 'open', scoring }, uid, { title: 'Global leaderboard' })
  const root = el(
    'div',
    { class: 'stack' },
    back('Daily challenge', `/daily/${date}`),
    header,
    isToday ? reset.el : null,
    el('section', { class: 'card stack' }, action, error),
    board.el,
  )

  if (!challenge) {
    header.append(el('h1', {}, label), el('p', { class: 'muted' }, isToday ? 'Could not set up this challenge. Try again in a moment.' : 'Nobody played this challenge that day.'))
    return view(root, () => reset.stop())
  }

  const stopRuns = watchRuns(arena, (data) => {
    runs = data
    board.update({ runs })
    render()
  }, () => {})

  function myAttempts() {
    return runs.filter((r) => r.uid === uid).sort((a, b) => a.attempt - b.attempt)
  }

  async function reveal() {
    if (route || myAttempts().length === 0) return
    route = await readRoute(arena).catch(() => null)
    if (route) render()
  }

  function render() {
    reveal()
    const shown = route && myAttempts().length > 0
    header.replaceChildren(
      el('h1', {}, `${label} · ${date}`),
      el(
        'p',
        { class: 'route' },
        el('span', { class: shown ? '' : 'masked' }, shown ? route.start.title : 'Hidden until you play'),
        el('span', { class: 'arrow', role: 'img', 'aria-label': 'to' }, '→'),
        el('span', { class: shown ? '' : 'masked' }, shown ? route.target.title : 'Hidden until you play'),
      ),
    )
    action.replaceChildren()
    const attempts = myAttempts()
    const latest = attempts[attempts.length - 1]
    if (latest) {
      const text = latest.done
        ? `Attempt ${latest.attempt}: ${scoring === 'time' ? formatMs(latest.ms) : `${latest.clicks} ${latest.clicks === 1 ? 'click' : 'clicks'}`}.`
        : `Attempt ${latest.attempt}: ${attemptStatus(latest)}.`
      action.append(el('p', { class: 'muted', role: 'status' }, text))
    }
    if (!isToday) {
      action.append(el('p', { class: 'muted' }, 'This challenge has closed. The board is final.'))
      return
    }
    if (!displayName()) {
      action.append(nameGate(render))
      return
    }
    action.append(button(latest ? 'Play again' : 'Play', () => go(playPath(arena)), { class: 'primary' }))
  }

  render()
  return view(root, () => {
    stopRuns()
    board.dispose()
    reset.stop()
  })
}
