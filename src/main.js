import { app } from './firebase.js'

const view = document.getElementById('view')

function render() {
  view.replaceChildren()

  const heading = document.createElement('h1')
  heading.textContent = 'Wikispeed'

  const lede = document.createElement('p')
  lede.textContent =
    'Race from one Wikipedia article to another. Play against the clock or for the fewest clicks, together or whenever suits.'

  const status = document.createElement('span')
  status.className = 'status'
  const projectId = app.options.projectId
  status.dataset.state = projectId ? 'ready' : 'error'
  status.textContent = projectId ? `Connected to ${projectId}` : 'Firebase not configured'

  view.append(heading, lede, status)
}

render()
