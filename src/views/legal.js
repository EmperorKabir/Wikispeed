import { el, link, view } from '../ui.js'

const CONTACT = 'bhasin.kabir@gmail.com'

function page(title, ...sections) {
  return view(
    el(
      'div',
      { class: 'stack legal' },
      el('p', { class: 'crumbs' }, link('Home', '/'), el('span', {}, title)),
      el('h1', {}, title),
      el('p', { class: 'muted small' }, 'Last updated 17 October 2026.'),
      ...sections,
    ),
  )
}

function section(heading, ...paragraphs) {
  return el('section', { class: 'stack-small' }, el('h2', {}, heading), ...paragraphs.map((text) => el('p', {}, text)))
}

export function privacyView() {
  return page(
    'Privacy',
    section(
      'What is stored',
      'Playing as a guest stores a random account identifier and, on your own device, the name you type. Signing in with Google additionally stores your Google name and email address so that your history follows you between devices.',
      'Each game you play stores the session code, the start and finish articles, your clicks, your time, whether you finished, the date, and the name shown to other players in that session.',
    ),
    section(
      'Where it is stored',
      'Data is held in Google Firebase (Authentication and Cloud Firestore) in the europe-west2 region (London). Google processes it on our behalf under its own terms and privacy policy. No advertising or analytics cookies are used; Firebase keeps a sign-in token in your browser so you stay signed in.',
    ),
    section(
      'Who can see it',
      'Players in the same session can see your displayed name and results for that session. Your history is visible only to you. Nothing is sold or shared with anyone else.',
    ),
    section(
      'Wikipedia',
      'Article pages are fetched directly from Wikipedia when you play. Wikimedia receives those requests, including your IP address, under the Wikimedia Foundation privacy policy.',
    ),
    section(
      'Your choices',
      `Results are kept until you ask for them to be removed. To delete your account and history, or to ask anything about this policy, email ${CONTACT}.`,
    ),
  )
}

export function termsView() {
  return page(
    'Terms',
    section(
      'The game',
      'Wixpert is a free game. You may use it for personal, non-commercial play. Reach the finish article using only the links inside articles; opening other tabs, using search, or editing requests to gain an advantage spoils the game for others and may lead to results being removed.',
    ),
    section(
      'Content',
      'Article text comes from Wikipedia and is available under the Creative Commons Attribution-ShareAlike 4.0 licence. Wikipedia is a trademark of the Wikimedia Foundation; Wixpert is not affiliated with or endorsed by it. Images are served from Wikimedia and are subject to their own licences.',
    ),
    section(
      'Accounts and names',
      'Choose a name that is not offensive and does not impersonate anyone. Sessions, names or accounts that break this may be removed without notice.',
    ),
    section(
      'No warranty',
      'The game is provided as is, without any guarantee of availability, accuracy of timing, or preservation of results. Wikipedia content may change or disappear at any time.',
    ),
    section('Law', `These terms are governed by the law of England and Wales. Questions: ${CONTACT}.`),
  )
}
