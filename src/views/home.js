import { currentUser, displayName, isGoogleUser, onUser, setNickname, signInWithGoogle, signOutUser } from '../auth.js'
import { isValidCode, normaliseCode } from '../code.js'
import { go } from '../router.js'
import { button, el, link, notice, view } from '../ui.js'

export function homeView() {
  const account = el('section', { class: 'account' })
  const error = el('div')

  const codeInput = el('input', {
    type: 'text',
    name: 'code',
    inputmode: 'text',
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: 'false',
    maxlength: '8',
    placeholder: 'Session code',
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

  function renderAccount() {
    const user = currentUser()
    const name = displayName(user)
    account.replaceChildren()

    if (isGoogleUser(user)) {
      account.append(
        el('p', {}, el('span', { class: 'muted' }, 'Signed in as '), el('strong', {}, name)),
        el('p', { class: 'row' }, link('History', '/history'), button('Sign out', onSignOut, { class: 'text' })),
      )
      return
    }

    const nameInput = el('input', {
      type: 'text',
      name: 'nickname',
      maxlength: '32',
      autocomplete: 'nickname',
      placeholder: 'Your name',
      'aria-label': 'Your name',
      value: name,
      onchange: (event) => {
        setNickname(event.target.value)
        renderAccount()
      },
    })

    account.append(
      el('p', { class: 'row' }, el('label', { class: 'muted', for: 'nickname' }, 'Playing as'), nameInput),
      el(
        'p',
        { class: 'row' },
        button('Sign in with Google', onGoogle, { class: 'secondary' }),
        el('span', { class: 'muted small' }, 'Keeps your history on every device.'),
      ),
      el('p', {}, link('History on this device', '/history')),
    )
    nameInput.id = 'nickname'
  }

  async function onGoogle() {
    error.replaceChildren()
    try {
      await signInWithGoogle()
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        error.replaceChildren(notice('Google sign-in failed. Try again.', 'error'))
      }
    }
  }

  async function onSignOut() {
    error.replaceChildren()
    await signOutUser()
  }

  const stop = onUser(renderAccount)
  renderAccount()

  const root = el(
    'div',
    { class: 'stack' },
    el('h1', {}, 'Wikispeed'),
    el('p', { class: 'lede' }, 'Get from one Wikipedia article to another using only the links.'),
    el(
      'div',
      { class: 'choices' },
      link('Solo', '/new/solo', { class: 'choice' }),
      link('Multiplayer', '/new/multi', { class: 'choice' }),
    ),
    joinForm,
    error,
    account,
  )

  return view(root, stop)
}
