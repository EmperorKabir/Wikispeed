import { currentUser } from '../auth.js'
import { createSession } from '../db.js'
import { go } from '../router.js'
import { SCORING } from '../score.js'
import { button, el, link, notice, view } from '../ui.js'
import { articleUrl, randomArticle, resolveTitle, suggestTitles } from '../wiki.js'

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
      label,
    ),
  )

  const start = picker('Start article', 'start')
  const finish = picker('Finish article', 'finish')

  const createButton = button('Create', onCreate, { class: 'primary' })

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
        scoring: root.querySelector('input[name="scoring"]:checked').value,
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
    el('p', { class: 'crumbs' }, link('Home', '/'), el('span', {}, mode === 'solo' ? 'Solo' : 'Multiplayer')),
    el('h1', {}, 'New game'),
    el('fieldset', {}, el('legend', {}, 'Scoring'), el('div', { class: 'choices' }, scoringChoices)),
    start.el,
    finish.el,
    error,
    createButton,
  )

  return view(root)
}

function picker(label, name) {
  let page = null
  let debounce = null
  let seq = 0
  let suggestSeq = 0
  let pending = Promise.resolve()

  function track(promise) {
    pending = promise.catch(() => {})
    return promise
  }

  const list = el('datalist', { id: `${name}-suggestions` })
  const input = el('input', {
    type: 'text',
    name,
    id: `${name}-input`,
    'aria-label': label,
    autocomplete: 'off',
    list: list.id,
    placeholder: 'Type a title',
    oninput: onInput,
    onchange: () => track(resolve(input.value)),
  })
  const status = el('p', { class: 'muted small', 'aria-live': 'polite' })
  const hide = el('input', { type: 'checkbox', name: `${name}-hide`, onchange: refresh })
  const randomButton = button('Random', () => track(onRandom()), { class: 'secondary' })

  function onInput() {
    page = null
    status.textContent = ''
    clearTimeout(debounce)
    const q = input.value
    const mine = ++suggestSeq
    debounce = setTimeout(async () => {
      try {
        const pages = await suggestTitles(q)
        if (mine === suggestSeq) list.replaceChildren(...pages.map((p) => el('option', { value: p.title }, p.description)))
      } catch {
        if (mine === suggestSeq) list.replaceChildren()
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
        status.textContent = 'No article with that title'
      } else if (found.type !== 'standard') {
        page = null
        status.textContent = 'Pick a specific article, not a disambiguation page'
      } else {
        page = found
        refresh()
      }
    } catch (err) {
      if (mine === seq) status.textContent = err.message
    }
  }

  async function onRandom() {
    const mine = ++seq
    randomButton.disabled = true
    status.textContent = 'Picking'
    try {
      const found = await randomArticle()
      if (mine !== seq) return
      page = found
      refresh()
    } catch (err) {
      if (mine === seq) status.textContent = err.message
    } finally {
      randomButton.disabled = false
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
    el('div', { class: 'row' }, input, randomButton, list),
    status,
    el('label', { class: 'check' }, hide, ' Hide until the game starts'),
  )

  return {
    el: root,
    value: () => page,
    hidden: () => hide.checked,
    settled: () => pending,
  }
}
