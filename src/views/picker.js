import { button, el } from '../ui.js'
import { DIFFICULTIES, articleUrl, randomArticle, resolveTitle, suggestTitles } from '../wiki.js'

export function createPicker(label, name, { hideOption = true } = {}) {
  let page = null
  let tier = 'typed'
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
      markTier(key)
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
      status.replaceChildren(el('span', {}, 'Article chosen and kept secret.'))
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
    hideOption
      ? el(
          'div',
          { class: 'stack-small' },
          el('label', { class: 'check' }, hide, ' Keep secret until each player starts'),
          el('span', { class: 'muted small' }, 'Use with Random; a typed title is known to you.'),
        )
      : null,
  )

  return {
    el: root,
    value: () => page,
    hidden: () => hideOption && hide.checked,
    tier: () => tier,
    settled: () => pending,
  }
}
