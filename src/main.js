import { completeRedirect, ensureSignedIn } from './auth.js'
import { route, startRouter } from './router.js'
import { el, notice } from './ui.js'
import { historyView } from './views/history.js'
import { homeView } from './views/home.js'
import { privacyView, termsView } from './views/legal.js'
import { multiView } from './views/multi.js'
import { playView } from './views/play.js'
import { sessionView } from './views/session.js'
import { setupView } from './views/setup.js'

const outlet = document.getElementById('view')

route('/', homeView)
route('/multi', multiView)
route('/new/:mode', setupView)
route('/s/:code', sessionView)
route('/play/:code', playView)
route('/history', historyView)
route('/privacy', privacyView)
route('/terms', termsView)

let redirectError = null

completeRedirect()
  .catch((err) => {
    redirectError = err
  })
  .then(ensureSignedIn)
  .then(() => startRouter(outlet))
  .then(() => {
    if (redirectError) outlet.prepend(notice(`Google sign-in did not complete: ${redirectError.message}`, 'error'))
  })
  .catch((err) => {
    outlet.replaceChildren(
      el('h1', {}, 'Wixpert'),
      notice(`Could not connect: ${err.message}`, 'error'),
    )
  })
