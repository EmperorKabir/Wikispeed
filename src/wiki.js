const ORIGIN = 'https://en.wikipedia.org'
const CORE = `${ORIGIN}/w/rest.php/v1`
const REST = `${ORIGIN}/api/rest_v1`

const WIKI_UA ='Wixpert/0.1 (https://wixpert.web.app; bhasin.kabir@gmail.com)'

const STYLE_MODULES = [
  'site.styles',
  'ext.cite.styles',
  'ext.cite.parsoid.styles',
  'mediawiki.skinning.content.parsoid',
  'ext.math.styles',
  'mediawiki.page.gallery.styles',
]

const WIKI_STYLES_URL = `${ORIGIN}/w/load.php?lang=en&modules=${encodeURIComponent(STYLE_MODULES.join('|'))}&only=styles&skin=vector`

const BLOCKED_NAMESPACES = [
  'file', 'image', 'media', 'category', 'help', 'wikipedia', 'wp', 'project', 'template', 'special',
  'portal', 'talk', 'user', 'draft', 'module', 'mediawiki', 'book', 'timedtext', 'gadget',
  'gadget definition', 'education program', 'event',
]

const STRIP_SELECTOR = [
  'script', 'link', 'meta', 'noscript', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'audio', 'video', 'source', 'track', 'map', 'area',
  '.mw-editsection', '.navbox', '.sistersitebox', '.ambox', '.mw-empty-elt',
  '#coordinates', '.mw-indicators', '.noprint', '[typeof~="mw:Extension/indicator"]',
].join(',')

export function keyFromUrl(url) {
  const match = /\/w\/rest\.php\/v1\/page\/([^/?#]+)\/html/.exec(String(url))
  return match ? safeDecode(match[1]) : null
}

export function keyFromHref(href) {
  if (typeof href !== 'string' || !href.startsWith('./')) return null
  const path = href.slice(2).split('#')[0]
  if (!path || path.includes('?')) return null
  return safeDecode(path)
}

export function isArticleKey(key) {
  if (typeof key !== 'string' || key.length === 0) return false
  const colon = key.indexOf(':')
  if (colon <= 0) return true
  const prefix = key.slice(0, colon).replace(/_/g, ' ').trim().toLowerCase()
  if (BLOCKED_NAMESPACES.includes(prefix)) return false
  if (prefix.endsWith(' talk')) return false
  return true
}

export function titleFromKey(key) {
  return String(key).replace(/_/g, ' ')
}

function keyFromTitle(title) {
  return String(title).trim().replace(/\s+/g, '_')
}

export function sanitiseArticle(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const title = doc.querySelector('title')?.textContent?.trim() ?? ''
  const body = doc.body ?? doc.createElement('body')

  for (const node of body.querySelectorAll(STRIP_SELECTOR)) node.remove()

  for (const node of body.querySelectorAll('*')) {
    for (const name of node.getAttributeNames()) {
      if (name.startsWith('on') || name === 'tabindex' || name === 'contenteditable') node.removeAttribute(name)
    }
    if (node.localName === 'img') {
      node.setAttribute('loading', 'lazy')
      node.setAttribute('decoding', 'async')
    }
  }

  for (const anchor of body.querySelectorAll('a')) {
    const key = keyFromHref(anchor.getAttribute('href'))
    if (key && isArticleKey(key) && !anchor.classList.contains('new')) {
      anchor.setAttribute('href', '#')
      anchor.setAttribute('data-key', key)
      anchor.removeAttribute('target')
      anchor.removeAttribute('rel')
    } else {
      const span = doc.createElement('span')
      span.className = 'dead-link'
      span.append(...anchor.childNodes)
      anchor.replaceWith(span)
    }
  }

  return { title, body }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function headers() {
  return { 'Api-User-Agent': WIKI_UA, Accept: 'application/json' }
}

async function getJson(url) {
  const response = await fetch(url, { headers: headers() })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Wikipedia responded ${response.status}`)
  return response.json()
}

function pageFromSummary(summary) {
  if (!summary) return null
  return {
    key: summary.titles?.canonical ?? keyFromTitle(summary.title),
    title: summary.titles?.normalized ?? summary.title,
    type: summary.type,
    description: summary.description ?? '',
  }
}

export async function resolveTitle(text) {
  const key = keyFromTitle(text)
  if (!key) return null
  const summary = await getJson(`${REST}/page/summary/${encodeURIComponent(key)}`)
  return pageFromSummary(summary)
}

export async function randomArticle(tries = 6) {
  for (let i = 0; i < tries; i++) {
    const page = pageFromSummary(await getJson(`${REST}/page/random/summary`))
    if (page && page.type === 'standard') return page
  }
  throw new Error('Could not find a random article')
}

export async function suggestTitles(query, limit = 5) {
  const q = String(query).trim()
  if (q.length < 2) return []
  const data = await getJson(`${CORE}/search/title?q=${encodeURIComponent(q)}&limit=${limit}`)
  return (data?.pages ?? []).map((page) => ({
    key: page.key,
    title: page.title,
    description: page.description ?? '',
  }))
}

export async function fetchArticle(key) {
  const response = await fetch(`${CORE}/page/${encodeURIComponent(key)}/html`, {
    headers: { 'Api-User-Agent': WIKI_UA },
  })
  if (response.status === 404) throw new Error('That article does not exist')
  if (!response.ok) throw new Error(`Wikipedia responded ${response.status}`)
  const html = await response.text()
  const { title, body } = sanitiseArticle(html)
  const canonical = keyFromUrl(response.url) ?? key
  return { key: canonical, title: title || titleFromKey(canonical), body }
}

export function articleUrl(key) {
  return `${ORIGIN}/wiki/${encodeURIComponent(key)}`
}

export function loadWikiStyles() {
  const id = 'wiki-styles'
  let link = document.getElementById(id)
  if (!link) {
    link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = WIKI_STYLES_URL
    document.head.append(link)
  }
  link.disabled = false
  return () => {
    link.disabled = true
  }
}
