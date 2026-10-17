import { completeRedirect, ensureSignedIn } from './auth.js'
import { route, startRouter } from './router.js'
import { el, notice } from './ui.js'
import { historyView } from './views/history.js'
import { homeView } from './views/home.js'
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

completeRedirect()
  .catch((err) => {
    outlet.replaceChildren(notice(`Google sign-in did not complete: ${err.message}`, 'error'))
  })
  .then(ensureSignedIn)
  .then(() => startRouter(outlet))
  .catch((err) => {
    outlet.replaceChildren(
      el('h1', {}, 'Wixpert'),
      notice(`Could not connect: ${err.message}`, 'error'),
    )
  })
