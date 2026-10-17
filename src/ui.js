export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue
    if (name === 'class') node.className = value
    else if (name === 'text') node.textContent = value
    else if (name === 'html') node.innerHTML = value
    else if (name.startsWith('on') && typeof value === 'function') node.addEventListener(name.slice(2), value)
    else if (name === 'dataset') Object.assign(node.dataset, value)
    else if (value === true) node.setAttribute(name, '')
    else node.setAttribute(name, value)
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false))
  return node
}

export function button(label, onclick, attrs = {}) {
  return el('button', { type: 'button', onclick, ...attrs }, label)
}

export function link(label, href, attrs = {}) {
  return el('a', { href: `#${href}`, ...attrs }, label)
}

export function notice(message, kind = 'info') {
  return el('p', { class: `notice notice-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message)
}

export function spinner(label = 'Loading') {
  return el('p', { class: 'muted', role: 'status' }, label)
}

export function view(el, dispose) {
  return { el, dispose }
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  return Promise.reject(new Error('Clipboard unavailable'))
}

export function mask(hidden, page, placeholder = 'Hidden until start') {
  if (hidden && !page) return el('span', { class: 'masked' }, placeholder)
  return el('span', {}, page?.title ?? '')
}
