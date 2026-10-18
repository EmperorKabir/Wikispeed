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
  '.mw-editsection', '.navbox', '.sistersitebox', '.ambox',
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
  const key = String(title).trim().replace(/\s+/g, '_')
  return key.charAt(0).toUpperCase() + key.slice(1)
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

const inBrowser = typeof window !== 'undefined'

function headers() {
  const base = { 'Api-User-Agent': WIKI_UA, Accept: 'application/json' }
  if (!inBrowser) base['User-Agent'] = WIKI_UA
  return base
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Wikipedia did not answer in time. Check your connection and try again.')
    throw new Error('Could not reach Wikipedia. Check your connection and try again.')
  } finally {
    clearTimeout(timer)
  }
}

async function getJson(url, retry = true) {
  const response = await fetchWithTimeout(url, { headers: headers() })
  if (response.status === 404) return null
  if (response.status === 429 && retry) {
    await wait(2500)
    return getJson(url, false)
  }
  if (response.status === 429) throw new Error('Wikipedia is asking us to slow down. Wait a few seconds and try again.')
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

async function lookup(key) {
  return pageFromSummary(await getJson(`${REST}/page/summary/${encodeURIComponent(key)}`))
}

function titleCase(key) {
  return key.replace(/(^|_|\(|-)([a-z])/g, (m, before, letter) => before + letter.toUpperCase())
}

export async function resolveTitle(text) {
  const key = keyFromTitle(text)
  if (!key) return null
  const exact = await lookup(key)
  if (exact && exact.type === 'standard') return exact
  const cased = titleCase(key)
  if (cased !== key) {
    const page = await lookup(cased)
    if (page && page.type === 'standard') return page
  }
  for (const candidate of await suggestTitles(text, 5)) {
    const page = await lookup(candidate.key)
    if (page && page.type === 'standard') return page
  }
  return exact
}

const API = `${ORIGIN}/w/api.php`

export const DIFFICULTIES = {
  easy: { level: 3, label: 'Easy', hint: "Wikipedia's 1,000 most important topics" },
  medium: { level: 4, label: 'Medium', hint: 'The next 9,000 notable topics' },
  hard: { level: 5, label: 'Hard', hint: 'The next 40,000: real but specialist' },
  any: { level: 0, label: 'Anything', hint: 'Any of the other 7 million articles, usually obscure' },
}

export const TIER_LEGEND = 'Four separate pools, no overlap: Easy is the top 1,000 topics, Medium the next 9,000, Hard the next 40,000, and Anything is everything else on Wikipedia, never one of those 50,000.'

export function describeDifficulty(value) {
  const name = (tier) => DIFFICULTIES[tier]?.label ?? 'Chosen'
  if (typeof value === 'string') return DIFFICULTIES[value] ? `${name(value)} → ${name(value)}` : ''
  if (!value || typeof value !== 'object') return ''
  if (!DIFFICULTIES[value.start] && !DIFFICULTIES[value.target]) return ''
  return `${name(value.start)} → ${name(value.target)}`
}

const VITAL_TOPICS = [
  'Arts',
  'Biology and health sciences',
  'Everyday life',
  'Geography',
  'History',
  'Mathematics',
  'People',
  'Philosophy and religion',
  'Physical sciences',
  'Society and social sciences',
  'Technology',
]

const LETTERS = 'ABCDEFGHIJKLMNOPRSTUVW'

export function vitalCategory(level, topic) {
  return `Category:Wikipedia level-${level} vital articles in ${topic}`
}

export function articleFromTalk(title) {
  return String(title).replace(/^Talk:/, '')
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function easyLevel() {
  const r = Math.random()
  if (r < 0.01) return 1
  if (r < 0.1) return 2
  return 3
}

async function randomVital(level, tries) {
  for (let i = 0; i < tries; i++) {
    const pool = level === 3 ? easyLevel() : level
    const category = vitalCategory(pool, pickRandom(VITAL_TOPICS))
    const url =
      `${API}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}` +
      `&cmnamespace=1&cmlimit=50&cmstartsortkeyprefix=${pickRandom(LETTERS)}&format=json&origin=*`
    const data = await getJson(url)
    const members = data?.query?.categorymembers ?? []
    if (members.length === 0) continue
    const page = await lookup(keyFromTitle(articleFromTalk(pickRandom(members).title)))
    if (page && page.type === 'standard') return page
  }
  throw new Error('Could not find a random article')
}

async function isVital(key) {
  const url =
    `${API}?action=query&prop=categories&titles=${encodeURIComponent(`Talk:${key}`)}` +
    `&cllimit=max&format=json&origin=*`
  const data = await getJson(url).catch(() => null)
  const page = data?.query?.pages ? Object.values(data.query.pages)[0] : null
  return (page?.categories ?? []).some((c) => /vital articles/i.test(c.title))
}

async function randomCandidates() {
  const url =
    `${API}?action=query&generator=random&grnnamespace=0&grnfilterredir=nonredirects&grnlimit=8` +
    `&prop=pageprops&ppprop=disambiguation&format=json&origin=*`
  const data = await getJson(url).catch(() => null)
  const pages = data?.query?.pages ? Object.values(data.query.pages) : []
  return pages.filter((p) => !p.pageprops || !('disambiguation' in p.pageprops)).map((p) => keyFromTitle(p.title))
}

export async function randomArticle(difficulty = 'any', tries = 6) {
  const level = DIFFICULTIES[difficulty]?.level ?? 0
  if (level) return randomVital(level, tries)
  let candidates = await randomCandidates()
  for (let i = 0; i < tries; i++) {
    let page
    if (candidates.length) {
      const key = candidates.shift()
      if (await isVital(key)) continue
      page = await lookup(key)
    } else {
      page = pageFromSummary(await getJson(`${REST}/page/random/summary`))
      if (page && (await isVital(page.key))) continue
    }
    if (page && page.type === 'standard') return page
  }
  throw new Error('Could not find a random article')
}

async function searchPages(kind, q, limit) {
  const data = await getJson(`${CORE}/search/${kind}?q=${encodeURIComponent(q)}&limit=${limit}`).catch(() => null)
  return (data?.pages ?? []).map((page) => ({
    key: page.key,
    title: page.title,
    description: page.description ?? '',
  }))
}

export async function suggestTitles(query, limit = 20) {
  const q = String(query).trim()
  if (q.length < 2) return []
  const [byTitle, byText] = await Promise.all([searchPages('title', q, limit), searchPages('page', q, limit)])
  const seen = new Set()
  const merged = []
  for (const page of [...byTitle, ...byText]) {
    if (seen.has(page.key)) continue
    seen.add(page.key)
    merged.push(page)
  }
  return merged.slice(0, limit)
}

const prefetched = new Map()

async function downloadArticle(key) {
  const response = await fetchWithTimeout(`${CORE}/page/${encodeURIComponent(key)}/html`, {
    headers: inBrowser ? { 'Api-User-Agent': WIKI_UA } : { 'Api-User-Agent': WIKI_UA, 'User-Agent': WIKI_UA },
  }, 45000)
  if (response.status === 404) throw new Error('That article does not exist')
  if (!response.ok) throw new Error(`Wikipedia responded ${response.status}`)
  return { html: await response.text(), canonical: keyFromUrl(response.url) ?? key }
}

export function prefetchArticle(key) {
  if (!prefetched.has(key)) {
    const promise = downloadArticle(key)
    promise.catch(() => prefetched.delete(key))
    prefetched.set(key, promise)
  }
  return prefetched.get(key)
}

export async function fetchArticle(key) {
  const pending = prefetched.get(key)
  prefetched.delete(key)
  const { html, canonical } = await (pending ?? downloadArticle(key))
  const { title, body } = sanitiseArticle(html)
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

export function enhanceCollapsibles(root) {
  for (const box of root.querySelectorAll('.mw-collapsible')) {
    const content = box.querySelector(':scope > .mw-collapsible-content') ?? box.querySelector('.mw-collapsible-content')
    if (!content) continue
    const toggle = root.ownerDocument.createElement('button')
    toggle.type = 'button'
    toggle.className = 'mw-toggle'
    const sync = () => {
      toggle.textContent = box.classList.contains('mw-collapsed') ? 'show' : 'hide'
    }
    toggle.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      box.classList.toggle('mw-collapsed')
      sync()
    })
    sync()
    const title = box.firstElementChild && box.firstElementChild !== content ? box.firstElementChild : box
    title.append(toggle)
  }
}
