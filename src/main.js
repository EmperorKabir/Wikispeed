import { ensureSignedIn } from './auth.js'
import { route, startRouter } from './router.js'
import { el, notice } from './ui.js'
import { historyView } from './views/history.js'
import { homeView } from './views/home.js'
import { playView } from './views/play.js'
import { sessionView } from './views/session.js'
import { setupView } from './views/setup.js'

const outlet = document.getElementById('view')

route('/', homeView)
route('/new/:mode', setupView)
route('/s/:code', sessionView)
route('/play/:code', playView)
route('/history', historyView)

ensureSignedIn()
  .then(() => startRouter(outlet))
  .catch((err) => {
    outlet.replaceChildren(
      el('h1', {}, 'Wikispeed'),
      notice(`Could not connect: ${err.message}`, 'error'),
    )
  })
