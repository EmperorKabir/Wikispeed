import { isValidCode, normaliseCode } from '../code.js'
import { go } from '../router.js'
import { back, el, link, notice, view } from '../ui.js'

export function multiView() {
  const error = el('div')

  const codeInput = el('input', {
    type: 'text',
    name: 'code',
    id: 'code',
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: 'false',
    maxlength: '8',
    placeholder: 'ABC234',
    'aria-label': 'Session code',
  })

  const joinForm = el(
    'form',
    {
      class: 'join',
      onsubmit: (event) => {
        event.preventDefault()
        const code = normaliseCode(codeInput.value)
        if (!isValidCode(code)) {
          error.replaceChildren(notice('Codes are six letters or numbers.', 'error'))
          return
        }
        go(`/s/${code}`)
      },
    },
    codeInput,
    el('button', { type: 'submit', class: 'secondary' }, 'Join'),
  )

  const root = el(
    'div',
    { class: 'stack' },
    back(),
    el('h1', {}, 'Multiplayer'),
    el('p', { class: 'muted' }, 'Create a game and share its code, or join with a code from a friend.'),
    el(
      'div',
      { class: 'choices' },
      link([el('strong', {}, 'Create a game'), el('small', {}, 'You pick the articles and share the code')], '/new/multi', { class: 'choice' }),
    ),
    el('section', { class: 'card stack' }, el('fieldset', {}, el('legend', {}, 'Join with a code'), joinForm), error),
  )

  return view(root)
}
