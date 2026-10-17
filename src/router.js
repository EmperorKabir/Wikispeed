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

export function currentPath() {
  const hash = location.hash.replace(/^#/, '')
  return hash || '/'
}

export function startRouter(element) {
  outlet = element
  addEventListener('hashchange', render)
  render()
}

async function render() {
  const id = ++renderId
  const path = currentPath()
  if (current?.dispose) current.dispose()
  current = null

  for (const { regex, names, handler } of routes) {
    const match = regex.exec(path)
    if (!match) continue
    const params = Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(match[i + 1])]))
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
    return
  }
  go('/')
}

function errorView(error) {
  const wrap = document.createElement('div')
  wrap.className = 'stack'
  const heading = document.createElement('h1')
  heading.textContent = 'Something went wrong'
  const message = document.createElement('p')
  message.className = 'notice notice-error'
  message.setAttribute('role', 'alert')
  message.textContent = error?.message ?? String(error)
  const home = document.createElement('a')
  home.href = '#/'
  home.textContent = 'Home'
  wrap.append(heading, message, home)
  return wrap
}
