import { currentUser, displayName, isGoogleUser, onUser, setName, signInWithGoogle, signOutUser } from '../auth.js'
import { button, el, link, notice, view } from '../ui.js'

export function homeView() {
  const account = el('section', { class: 'account' })
  const error = el('div')

  function renderAccount() {
    const user = currentUser()
    const name = displayName(user)
    const google = isGoogleUser(user)
    account.replaceChildren()

    const nameInput = el('input', {
      type: 'text',
      name: 'nickname',
      id: 'nickname',
      maxlength: '32',
      autocomplete: 'nickname',
      placeholder: 'Your name',
      'aria-label': 'Your name',
      value: name,
      onchange: async (event) => {
        try {
          await setName(event.target.value)
        } catch {
          error.replaceChildren(notice('Could not save the name.', 'error'))
        }
        renderAccount()
      },
    })

    account.append(el('p', { class: 'row' }, el('label', { class: 'muted', for: 'nickname' }, 'Playing as'), nameInput))

    if (google) {
      account.append(
        el(
          'p',
          { class: 'row' },
          el('span', { class: 'muted small' }, `Signed in with Google as ${user.email ?? name}.`),
          button('Sign out', onSignOut, { class: 'text' }),
        ),
        el('p', {}, link('History', '/history')),
      )
      return
    }

    account.append(
      el(
        'p',
        { class: 'row' },
        button('Sign in with Google', onGoogle, { class: 'secondary' }),
        el('span', { class: 'muted small' }, 'Keeps your history on every device.'),
      ),
      el('p', {}, link('History on this device', '/history')),
    )
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
    renderAccount()
  }

  async function onSignOut() {
    error.replaceChildren()
    await signOutUser()
    renderAccount()
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
      link('Multiplayer', '/multi', { class: 'choice' }),
    ),
    error,
    account,
  )

  return view(root, stop)
}
