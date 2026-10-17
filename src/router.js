import { el, notice } from './ui.js'

const routes = []
let current = null
let outlet = null
let renderId = 0

export function route(pattern, handler) {
  const names = []
  const source = pattern.replace(/:(\w+)/g, (_, name) => {
    names.push(name)
    return '([^/]+)'
  })
  routes.push({ regex: new RegExp(`^${source}$`), names, handler })
}

export function go(path) {
  location.hash = `#${path}`
}

function currentPath() {
  const hash = location.hash.replace(/^#/, '')
  return hash || '/'
}

export function startRouter(element) {
  outlet = element
  addEventListener('hashchange', render)
  return render()
}

async function render() {
  const id = ++renderId
  const path = currentPath()
  if (current?.dispose) current.dispose()
  current = null

  for (const { regex, names, handler } of routes) {
    const match = regex.exec(path)
    if (!match) continue
    const params = Object.fromEntries(
      names.map((name, i) => {
        try {
          return [name, decodeURIComponent(match[i + 1])]
        } catch {
          return [name, match[i + 1]]
        }
      }),
    )
    let view
    try {
      view = await handler(params)
    } catch (error) {
      if (id !== renderId) return
      outlet.replaceChildren(errorView(error))
      return
    }
    if (id !== renderId) {
      view?.dispose?.()
      return
    }
    current = view
    outlet.replaceChildren(view.el)
    scrollTo(0, 0)
    const heading = view.el.querySelector('h1')
    if (heading) {
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
    return
  }
  go('/')
}

function errorView(error) {
  return el(
    'div',
    { class: 'stack' },
    el('h1', {}, 'Something went wrong'),
    notice(error?.message ?? String(error), 'error'),
    el('a', { href: '#/' }, 'Home'),
  )
}
