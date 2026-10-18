import { currentUser } from '../auth.js'
import { isValidCode, normaliseCode } from '../code.js'
import { createRoom } from '../db.js'
import { go } from '../router.js'
import { back, button, el, notice, view } from '../ui.js'

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
    'aria-label': 'Room code',
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

  const createButton = button('Create a room', onCreate, { class: 'choice' })

  async function onCreate() {
    error.replaceChildren()
    createButton.disabled = true
    try {
      const code = await createRoom(currentUser().uid)
      go(`/s/${code}`)
    } catch (err) {
      error.replaceChildren(notice(`Could not create a room: ${err.message}`, 'error'))
      createButton.disabled = false
    }
  }

  const root = el(
    'div',
    { class: 'stack' },
    back(),
    el('h1', {}, 'Multiplayer'),
    el('p', { class: 'muted' }, 'Create a room to get a code straight away, then set it up while friends join. Or join with a code from a friend.'),
    el('div', { class: 'choices' }, createButton),
    el('section', { class: 'card stack' }, el('fieldset', {}, el('legend', {}, 'Join with a code'), joinForm), error),
  )

  return view(root)
}
