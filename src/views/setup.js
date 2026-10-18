import { currentUser } from '../auth.js'
import { createSession } from '../db.js'
import { go } from '../router.js'
import { SCORING } from '../score.js'
import { back, button, el, notice, view } from '../ui.js'
import { DIFFICULTIES, randomArticle } from '../wiki.js'
import { createPicker } from './picker.js'

export function setupView({ mode }) {
  if (mode !== 'solo') {
    go('/multi')
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

  const start = createPicker('Start article', 'start', { legend: true })
  const finish = createPicker('Finish article', 'finish')

  const createButton = button('Create', onCreate, { class: 'primary' })
  const quickButtons = Object.entries(DIFFICULTIES).map(([key, { label }]) =>
    button(`${label} → ${label}`, () => onQuick(key), { class: 'primary', title: `Two random ${label.toLowerCase()} articles` }),
  )

  function setBusy(busy) {
    createButton.disabled = busy
    for (const b of quickButtons) b.disabled = busy
  }

  async function twoRandomArticles(tier) {
    const first = await randomArticle(tier)
    let second = await randomArticle(tier)
    for (let i = 0; i < 3 && second.key === first.key; i++) second = await randomArticle(tier)
    return [first, second]
  }

  async function create(from, to, difficulty) {
    const code = await createSession({
      uid: currentUser().uid,
      mode: 'solo',
      scoring: scoring(),
      difficulty,
      start: { key: from.key, title: from.title },
      target: { key: to.key, title: to.title },
      hideStart: start.hidden(),
      hideTarget: finish.hidden(),
    })
    go(`/play/${code}`)
  }

  async function onQuick(tier) {
    error.replaceChildren()
    setBusy(true)
    try {
      const [from, to] = await twoRandomArticles(tier)
      await create(from, to, { start: tier, target: tier })
    } catch (err) {
      error.replaceChildren(notice(`Could not start a random game: ${err.message}`, 'error'))
      setBusy(false)
    }
  }

  async function onCreate() {
    error.replaceChildren()
    setBusy(true)
    await Promise.all([start.settled(), finish.settled()])
    const from = start.value()
    const to = finish.value()
    if (!from || !to) {
      error.replaceChildren(notice('Choose both articles first.', 'error'))
      setBusy(false)
      return
    }
    if (from.key === to.key) {
      error.replaceChildren(notice('Start and finish must differ.', 'error'))
      setBusy(false)
      return
    }
    try {
      await create(from, to, { start: start.tier(), target: finish.tier() })
    } catch (err) {
      error.replaceChildren(notice(`Could not create the game: ${err.message}`, 'error'))
      setBusy(false)
    }
  }

  const root = el(
    'div',
    { class: 'stack' },
    back(),
    el('h1', {}, 'New solo game'),
    el('fieldset', {}, el('legend', {}, 'Scoring'), el('div', { class: 'choices' }, scoringChoices)),
    start.el,
    finish.el,
    error,
    createButton,
    el('p', { class: 'muted or' }, 'or'),
    el('fieldset', {}, el('legend', {}, "Single click, fully random, let's go!"), el('div', { class: 'choices quick' }, quickButtons)),
  )

  return view(root)
}
