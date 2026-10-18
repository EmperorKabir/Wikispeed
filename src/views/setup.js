import { currentUser } from '../auth.js'
import { createSession } from '../db.js'
import { go } from '../router.js'
import { SCORING } from '../score.js'
import { back, button, el, notice, view } from '../ui.js'
import { DIFFICULTIES, articleUrl, randomArticle, resolveTitle, suggestTitles } from '../wiki.js'

export function setupView({ mode }) {
  if (mode !== 'solo' && mode !== 'multi') {
    go('/')
    return view(el('div'))
  }

  const error = el('div')

  const scoringChoices = Object.entries(SCORING).map(([key, { label }]) =>
    el(
      'label',
      { class: 'choice' },
      el('input', { type: 'radio', name: 'scoring', value: key, checked: key === 'time' }),
      el('strong', {}, label),
      el('small', {}, key === 'time' ? 'Fastest finish wins' : 'Fewest clicks wins'),
    ),
  )

  function scoring() {
    return root.querySelector('input[name="scoring"]:checked').value
  }

  const start = picker('Start article', 'start', updateQuickLabel)
  const finish = picker('Finish article', 'finish', updateQuickLabel)

  const createButton = button('Create', onCreate, { class: 'primary' })
  const quickButton = button('', onQuick, { class: 'primary' })

  function quickTiers() {
    return [start.lastTier() ?? 'medium', finish.lastTier() ?? 'medium']
  }

  function updateQuickLabel() {
    const [a, b] = quickTiers()
    quickButton.textContent = `Single Click: Fully random (${DIFFICULTIES[a].label} → ${DIFFICULTIES[b].label}), let's go!`
  }

  async function twoRandomArticles() {
    const [a, b] = quickTiers()
    const first = await randomArticle(a)
    let second = await randomArticle(b)
    for (let i = 0; i < 3 && second.key === first.key; i++) second = await randomArticle(b)
    return [first, second]
  }

  async function onQuick() {
    error.replaceChildren()
    quickButton.disabled = true
    createButton.disabled = true
    try {
      const [from, to] = await twoRandomArticles()
      const [a, b] = quickTiers()
      const code = await createSession({
        uid: currentUser().uid,
        mode,
        scoring: scoring(),
        difficulty: { start: a, target: b },
        start: { key: from.key, title: from.title },
        target: { key: to.key, title: to.title },
        hideStart: start.hidden(),
        hideTarget: finish.hidden(),
      })
      go(mode === 'solo' ? `/play/${code}` : `/s/${code}`)
    } catch (err) {
      error.replaceChildren(notice(`Could not start a random game: ${err.message}`, 'error'))
      quickButton.disabled = false
      createButton.disabled = false
    }
  }

  async function onCreate() {
    error.replaceChildren()
    createButton.disabled = true
    await Promise.all([start.settled(), finish.settled()])
    createButton.disabled = false
    const from = start.value()
    const to = finish.value()
    if (!from || !to) {
      error.replaceChildren(notice('Choose both articles first.', 'error'))
      return
    }
    if (from.key === to.key) {
      error.replaceChildren(notice('Start and finish must differ.', 'error'))
      return
    }
    createButton.disabled = true
    try {
      const code = await createSession({
        uid: currentUser().uid,
        mode,
        scoring: scoring(),
        difficulty: { start: start.tier(), target: finish.tier() },
        start: { key: from.key, title: from.title },
        target: { key: to.key, title: to.title },
        hideStart: start.hidden(),
        hideTarget: finish.hidden(),
      })
      go(`/s/${code}`)
    } catch (err) {
      error.replaceChildren(notice(`Could not create the session: ${err.message}`, 'error'))
      createButton.disabled = false
    }
  }

  const root = el(
    'div',
    { class: 'stack' },
    back(mode === 'solo' ? 'Home' : 'Multiplayer', mode === 'solo' ? '/' : '/multi'),
    el('h1', {}, mode === 'solo' ? 'New solo game' : 'New multiplayer game'),
    el('fieldset', {}, el('legend', {}, 'Scoring'), el('div', { class: 'choices' }, scoringChoices)),
    start.el,
    finish.el,
    error,
    createButton,
    el('p', { class: 'muted or' }, 'or'),
    quickButton,
  )
  updateQuickLabel()

  return view(root)
}

function picker(label, name, onTierChange) {
  let page = null
  let tier = 'typed'
  let lastTier = null
  let debounce = null
  let seq = 0
  let suggestSeq = 0
  let pending = Promise.resolve()

  function track(promise) {
    pending = promise.catch(() => {})
    return promise
  }

  const suggestions = el('ul', { class: 'suggestions', hidden: true })
  const input = el('input', {
    type: 'text',
    name,
    id: `${name}-input`,
    'aria-label': label,
    autocomplete: 'off',
    placeholder: 'Type a title',
    oninput: onInput,
    onchange: () => track(resolve(input.value)),
    onblur: () => setTimeout(() => (suggestions.hidden = true), 150),
    onfocus: () => {
      if (suggestions.childElementCount && !page) suggestions.hidden = false
    },
  })
  const status = el('p', { class: 'muted small', 'aria-live': 'polite' })
  const hide = el('input', { type: 'checkbox', name: `${name}-hide`, onchange: refresh })

  const tierButtons = Object.entries(DIFFICULTIES).map(([key, { label: tierLabel, hint }]) =>
    button(tierLabel, () => track(onRandom(key)), { class: 'tier', title: hint, 'aria-pressed': 'false', dataset: { tier: key } }),
  )

  function markTier(key) {
    for (const b of tierButtons) b.setAttribute('aria-pressed', String(b.dataset.tier === key))
  }

  function showSuggestions(pages) {
    suggestions.replaceChildren(
      ...pages.map((p) =>
        el(
          'li',
          {},
          el(
            'button',
            { type: 'button', class: 'suggestion', onmousedown: (e) => e.preventDefault(), onclick: () => choose(p) },
            el('span', {}, p.title),
            p.description ? el('span', { class: 'muted small' }, ` ${p.description}`) : null,
          ),
        ),
      ),
    )
    suggestions.hidden = pages.length === 0
  }

  function choose(p) {
    suggestions.hidden = true
    input.value = p.title
    track(resolve(p.title))
  }

  function onInput() {
    page = null
    status.textContent = ''
    clearTimeout(debounce)
    const q = input.value
    const mine = ++suggestSeq
    if (q.trim().length < 2) {
      showSuggestions([])
      return
    }
    debounce = setTimeout(async () => {
      try {
        const pages = await suggestTitles(q)
        if (mine === suggestSeq) showSuggestions(pages)
      } catch {
        if (mine === suggestSeq) showSuggestions([])
      }
    }, 250)
  }

  async function resolve(text) {
    const mine = ++seq
    if (!text.trim()) return
    status.textContent = 'Checking'
    try {
      const found = await resolveTitle(text)
      if (mine !== seq) return
      if (!found) {
        page = null
        status.textContent = 'No matching article on English Wikipedia. Try another title or a random tier.'
      } else if (found.type !== 'standard') {
        page = null
        status.textContent = 'That title covers several articles. Pick one from the suggestions.'
      } else {
        page = found
        tier = 'typed'
        markTier(null)
        suggestions.hidden = true
        refresh()
      }
    } catch (err) {
      if (mine === seq) status.textContent = err.message
    }
  }

  async function onRandom(key) {
    const mine = ++seq
    for (const b of tierButtons) b.disabled = true
    status.textContent = 'Picking'
    try {
      const found = await randomArticle(key)
      if (mine !== seq) return
      page = found
      tier = key
      lastTier = key
      markTier(key)
      onTierChange()
      refresh()
    } catch (err) {
      if (mine === seq) status.textContent = err.message
    } finally {
      for (const b of tierButtons) b.disabled = false
    }
  }

  function refresh() {
    if (!page) {
      status.replaceChildren()
      return
    }
    if (hide.checked) {
      input.value = ''
      input.placeholder = 'Hidden'
      status.replaceChildren(el('span', {}, 'Article chosen and hidden.'))
      return
    }
    input.placeholder = 'Type a title'
    input.value = page.title
    status.replaceChildren(
      el('span', {}, page.description ? `${page.title}: ${page.description} ` : `${page.title} `),
      el('a', { href: articleUrl(page.key), target: '_blank', rel: 'noopener' }, 'View on Wikipedia'),
    )
  }

  const root = el(
    'fieldset',
    {},
    el('legend', {}, label),
    input,
    suggestions,
    el('div', { class: 'row tiers' }, el('span', { class: 'muted small' }, 'Random:'), ...tierButtons),
    status,
    el('label', { class: 'check' }, hide, ' Hide until the game starts'),
  )

  return {
    el: root,
    value: () => page,
    hidden: () => hide.checked,
    tier: () => tier,
    lastTier: () => lastTier,
    settled: () => pending,
  }
}
