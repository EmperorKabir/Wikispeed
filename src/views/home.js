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

  const stop = onUser(() => {
    if (document.activeElement?.id !== 'nickname') renderAccount()
  })
  renderAccount()

  const root = el(
    'div',
    { class: 'stack' },
    el('h1', {}, 'Wixpert'),
    el(
      'p',
      { class: 'muted' },
      'Get from one Wikipedia article to another using only the links. You can play aiming for either the fewest clicks or the fastest time. You can play alone or with others. When playing with others, you share a group code, so you don’t have to play at the same time; you can see how others are doing in your History section as they play.',
    ),
    el(
      'div',
      { class: 'choices' },
      link([el('strong', {}, 'Solo'), el('small', {}, 'Race on your own')], '/new/solo', { class: 'choice' }),
      link([el('strong', {}, 'Multiplayer'), el('small', {}, 'Share a code, play together or later')], '/multi', { class: 'choice' }),
      link([el('strong', {}, 'Daily challenge'), el('small', {}, 'Eight routes a day, global leaderboards')], '/daily', { class: 'choice' }),
    ),
    error,
    account,
  )
  account.classList.add('card')

  return view(root, stop)
}
