const routes = []
let current = null
let outlet = null

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
  const path = currentPath()
  if (current?.dispose) current.dispose()
  current = null

  for (const { regex, names, handler } of routes) {
    const match = regex.exec(path)
    if (!match) continue
    const params = Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(match[i + 1])]))
    const view = await handler(params)
    if (currentPath() !== path) return
    current = view
    outlet.replaceChildren(view.el)
    scrollTo(0, 0)
    return
  }
  go('/')
}
