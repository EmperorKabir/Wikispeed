import { describe, expect, it } from 'vitest'
import { isArticleKey, keyFromHref, keyFromUrl, sanitiseArticle, titleFromKey } from '../src/wiki.js'

describe('keyFromUrl', () => {
  it('reads the page key from a core REST url', () => {
    expect(keyFromUrl('https://en.wikipedia.org/w/rest.php/v1/page/United_Kingdom/html?redirect=no')).toBe('United_Kingdom')
  })
  it('decodes percent escapes', () => {
    expect(keyFromUrl('https://en.wikipedia.org/w/rest.php/v1/page/Caf%C3%A9/html')).toBe('Café')
  })
  it('returns null for other urls', () => {
    expect(keyFromUrl('https://en.wikipedia.org/wiki/Foo')).toBeNull()
  })
})

describe('keyFromHref', () => {
  it('strips the ./ prefix and fragment', () => {
    expect(keyFromHref('./England#History')).toBe('England')
    expect(keyFromHref('./AC/DC')).toBe('AC/DC')
    expect(keyFromHref('./Caf%C3%A9')).toBe('Café')
  })
  it('returns null for non-relative hrefs', () => {
    expect(keyFromHref('https://example.com')).toBeNull()
    expect(keyFromHref('#Section')).toBeNull()
  })
})

describe('isArticleKey', () => {
  it('accepts main-namespace keys', () => {
    expect(isArticleKey('Albert_Einstein')).toBe(true)
    expect(isArticleKey('AC/DC')).toBe(true)
    expect(isArticleKey('Dune:_Part_Two')).toBe(true)
  })
  it('rejects other namespaces', () => {
    const keys = [
      'File:X.jpg', 'Category:Physics', 'Help:Contents', 'Wikipedia:About', 'Template:Infobox',
      'Special:Random', 'Portal:Science', 'Talk:X', 'Help_talk:X', 'User:Y', 'Draft:Z',
      'Module:A', 'MediaWiki:B', 'Book:C', 'TimedText:D', 'Gadget:E',
    ]
    for (const key of keys) expect(isArticleKey(key), key).toBe(false)
  })
  it('rejects empty keys', () => {
    expect(isArticleKey('')).toBe(false)
  })
})

describe('titleFromKey', () => {
  it('replaces underscores', () => {
    expect(titleFromKey('Albert_Einstein')).toBe('Albert Einstein')
  })
})

describe('sanitiseArticle', () => {
  const html = [
    '<!doctype html><html><head><title>United Kingdom</title><link rel="stylesheet" href="x.css">',
    '<meta charset="utf-8"><script>alert(1)</script></head>',
    '<body><section><h2>Head<span class="mw-editsection">[edit]</span></h2>',
    '<style data-mw-deduplicate="TemplateStyles:r1">.infobox{border:1px solid}</style>',
    '<p>See <a rel="mw:WikiLink" href="./England#History">England</a>, ',
    '<a rel="mw:WikiLink" href="./File:Map.png">map</a>, ',
    '<a rel="mw:ExtLink" href="https://example.com">site</a> and <a href="#Notes">notes</a>.</p>',
    '<figure><img src="//upload.wikimedia.org/a.png" srcset="//upload.wikimedia.org/a2x.png 2x"></figure>',
    '<table class="infobox" style="width:22em"><tr><td>Row</td></tr></table>',
    '<p onclick="x()">Event</p><div class="navbox">nav</div>',
    '<audio controls><source src="//upload.wikimedia.org/a.ogg"></audio></section></body></html>',
  ].join('')

  const { title, body } = sanitiseArticle(html)

  it('extracts the title', () => {
    expect(title).toBe('United Kingdom')
  })
  it('removes scripts, head links, edit links, navboxes and media players', () => {
    for (const sel of ['script', 'link', 'meta', '.mw-editsection', '.navbox', 'audio', 'source']) {
      expect(body.querySelector(sel), sel).toBeNull()
    }
  })
  it('keeps template styles and inline styles so pages look like Wikipedia', () => {
    expect(body.querySelector('style[data-mw-deduplicate]')).not.toBeNull()
    expect(body.querySelector('table.infobox').getAttribute('style')).toBe('width:22em')
  })
  it('keeps article links with a data-key', () => {
    const a = body.querySelector('a[data-key]')
    expect(a.getAttribute('data-key')).toBe('England')
    expect(a.getAttribute('href')).toBe('#')
    expect(a.textContent).toBe('England')
  })
  it('turns file, external and fragment links into plain text', () => {
    expect(body.querySelectorAll('a')).toHaveLength(1)
    expect(body.textContent).toContain('map')
    expect(body.textContent).toContain('site')
    expect(body.textContent).toContain('notes')
  })
  it('strips inline event handlers and lazy-loads images', () => {
    expect(body.querySelector('[onclick]')).toBeNull()
    expect(body.querySelector('img').getAttribute('loading')).toBe('lazy')
  })
})
