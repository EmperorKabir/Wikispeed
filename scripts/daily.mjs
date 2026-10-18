import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { DAILY_SLUGS } from '../src/db-constants.js'
import { randomArticle } from '../src/wiki.js'

const credentials = process.env.FIREBASE_SERVICE_ACCOUNT
if (!credentials) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set')
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(credentials)) })
const db = getFirestore()

const dayKey = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)

async function makeRoute(tier) {
  const first = await randomArticle(tier)
  let second = await randomArticle(tier)
  for (let i = 0; i < 3 && second.key === first.key; i++) second = await randomArticle(tier)
  return { start: { key: first.key, title: first.title }, target: { key: second.key, title: second.title } }
}

async function ensure(date, slug) {
  const ref = db.doc(`daily/${date}/challenges/${slug}`)
  if ((await ref.get()).exists) return 'exists'
  const [tier, scoring] = slug.split('-')
  const route = await makeRoute(tier)
  await db.runTransaction(async (tx) => {
    const again = await tx.get(ref)
    if (again.exists) return
    tx.set(ref, { date, slug, scoring, difficulty: { start: tier, target: tier }, createdAt: FieldValue.serverTimestamp() })
    tx.set(ref.collection('private').doc('route'), route)
  })
  return `${route.start.title} → ${route.target.title}`
}

for (const date of [dayKey(0), dayKey(1)]) {
  for (const slug of DAILY_SLUGS) {
    try {
      console.log(date, slug.padEnd(14), await ensure(date, slug))
    } catch (error) {
      console.error(date, slug, 'failed:', error.message)
      process.exitCode = 1
    }
  }
}
