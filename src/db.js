import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { makeCode } from './code.js'
import { db } from './firebase.js'

const sessionRef = (code) => doc(db, 'sessions', code)
const playersRef = (code) => collection(db, 'sessions', code, 'players')
const roundsRef = (code) => collection(db, 'sessions', code, 'rounds')
const roundRef = (code, n) => doc(db, 'sessions', code, 'rounds', String(n))
const dailyRef = (date, slug) => doc(db, 'daily', date, 'challenges', slug)
const historyRef = (uid) => collection(db, 'users', uid, 'history')

export const DAILY_SLUGS = ['easy-time', 'easy-clicks', 'medium-time', 'medium-clicks', 'hard-time', 'hard-clicks', 'any-time', 'any-clicks']

function arenaDoc(arena) {
  if (arena.kind === 'round') return roundRef(arena.code, arena.n)
  if (arena.kind === 'daily') return dailyRef(arena.date, arena.slug)
  return sessionRef(arena.code)
}

const runsRef = (arena) => collection(arenaDoc(arena), 'runs')
const runRef = (arena, id) => doc(runsRef(arena), id)
const routeRef = (arena) => doc(arenaDoc(arena), 'private', 'route')

export function historyId(arena) {
  if (arena.kind === 'round') return `${arena.code}-r${arena.n}`
  if (arena.kind === 'daily') return `daily-${arena.date}-${arena.slug}`
  return arena.code
}

export function arenaPath(arena) {
  if (arena.kind === 'round') return `/s/${arena.code}`
  if (arena.kind === 'daily') return `/daily/${arena.date}/${arena.slug}`
  return `/s/${arena.code}`
}

export function playPath(arena) {
  if (arena.kind === 'round') return `/play/${arena.code}/${arena.n}`
  if (arena.kind === 'daily') return `/daily/${arena.date}/${arena.slug}/play`
  return `/play/${arena.code}`
}

function normaliseRun(snap) {
  const data = snap.data()
  return { id: snap.id, uid: data.uid ?? snap.id, attempt: data.attempt ?? 1, ...data }
}

async function allocateCode(build) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode()
    const created = await runTransaction(db, async (tx) => {
      const existing = await tx.get(sessionRef(code))
      if (existing.exists()) return false
      build(tx, code)
      return true
    })
    if (created) return code
  }
  throw new Error('Could not allocate a session code')
}

export function createSession({ uid, mode, scoring, difficulty, start, target, hideStart, hideTarget }) {
  const solo = mode === 'solo'
  return allocateCode((tx, code) => {
    tx.set(sessionRef(code), {
      mode,
      scoring,
      difficulty,
      host: uid,
      hideStart,
      hideTarget,
      start: hideStart ? null : start,
      target: hideTarget ? null : target,
      status: solo ? 'open' : 'lobby',
      createdAt: serverTimestamp(),
      startedAt: solo ? serverTimestamp() : null,
    })
    tx.set(routeRef({ kind: 'session', code }), { start, target })
  })
}

export const ROOM_DEFAULTS = {
  rounds: 1,
  scoring: 'time',
  system: 'points',
  chooserPolicy: 'rotate',
  chooserPicks: 'articles',
  split: false,
  startMode: 'whenever',
}

export function createRoom(uid) {
  return allocateCode((tx, code) => {
    tx.set(sessionRef(code), {
      version: 2,
      mode: 'multi',
      host: uid,
      status: 'setup',
      currentRound: 0,
      ...ROOM_DEFAULTS,
      createdAt: serverTimestamp(),
    })
  })
}

export async function updateRoom(code, fields) {
  await updateDoc(sessionRef(code), fields)
}

export async function getSession(code) {
  const snap = await getDoc(sessionRef(code))
  return snap.exists() ? { code, ...snap.data() } : null
}

export function watchSession(code, onChange, onError) {
  return onSnapshot(
    sessionRef(code),
    (snap) => onChange(snap.exists() ? { code, ...snap.data() } : null),
    onError,
  )
}

export async function openSession(code) {
  await updateDoc(sessionRef(code), { status: 'open', startedAt: serverTimestamp() })
}

export async function joinSession(code, uid, name) {
  const ref = doc(playersRef(code), uid)
  const existing = await getDoc(ref)
  if (existing.exists()) {
    if (existing.data().name !== name) await updateDoc(ref, { name })
    return
  }
  await setDoc(ref, { name, joinedAt: serverTimestamp() })
}

export function watchPlayers(code, onChange, onError) {
  return onSnapshot(playersRef(code), (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError)
}

export async function createRound(code, round) {
  await setDoc(roundRef(code, round.n), {
    ...round,
    status: 'choosing',
    start: null,
    target: null,
    startSet: false,
    targetSet: false,
    openedAt: null,
    countdownAt: null,
    closedAt: null,
    createdAt: serverTimestamp(),
  })
}

export async function updateRound(code, n, fields) {
  await updateDoc(roundRef(code, n), fields)
}

export async function setRouteParts(code, n, parts, fields, open) {
  const batch = writeBatch(db)
  batch.set(routeRef({ kind: 'round', code, n }), parts, { merge: true })
  const update = { ...fields }
  if (open === 'whenever') Object.assign(update, { status: 'open', openedAt: serverTimestamp() })
  else if (open === 'together') Object.assign(update, { status: 'ready' })
  batch.update(roundRef(code, n), update)
  await batch.commit()
}

export async function getRound(code, n) {
  const snap = await getDoc(roundRef(code, n))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function listDaily(date) {
  const snap = await getDocs(collection(db, 'daily', date, 'challenges'))
  return snap.docs.map((d) => ({ date, slug: d.id, ...d.data() }))
}

export async function startTogether(code, n, seconds = 6) {
  await updateDoc(roundRef(code, n), {
    status: 'open',
    openedAt: serverTimestamp(),
    countdownAt: Timestamp.fromMillis(Date.now() + seconds * 1000),
  })
}

export async function closeRound(code, n) {
  await updateDoc(roundRef(code, n), { status: 'closed', closedAt: serverTimestamp() })
}

export function watchRounds(code, onChange, onError) {
  return onSnapshot(
    roundsRef(code),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.n - b.n)),
    onError,
  )
}

export async function readRoute(arena) {
  const snap = await getDoc(routeRef(arena))
  return snap.exists() ? snap.data() : null
}

export function watchRuns(arena, onChange, onError) {
  return onSnapshot(runsRef(arena), (snap) => onChange(snap.docs.map(normaliseRun)), onError)
}

export async function startRun(arena, uid, name, startKey) {
  const all = await getDocs(runsRef(arena))
  const previous = all.docs.map(normaliseRun).filter((run) => run.uid === uid)
  const attempt = previous.length + 1
  const id = `${uid}-${attempt}`
  await setDoc(runRef(arena, id), {
    uid,
    attempt,
    name,
    clicks: 0,
    ms: 0,
    path: [startKey],
    currentKey: startKey,
    loadMs: 0,
    done: false,
    quit: false,
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    finishedAt: null,
  })
  return { id, attempt, previous }
}

export function progressRun(arena, runId, { clicks, path, currentKey, loadMs }) {
  return updateDoc(runRef(arena, runId), {
    clicks,
    path: path.slice(0, 500),
    currentKey,
    loadMs,
    updatedAt: serverTimestamp(),
  })
}

export async function recordRun(arena, runId, uid, { name, clicks, ms, path, done }, history) {
  const batch = writeBatch(db)
  batch.set(
    runRef(arena, runId),
    { name, clicks, ms, path: path.slice(0, 500), done, quit: !done, finishedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  )
  batch.set(doc(historyRef(uid), historyId(arena)), { ...history, at: serverTimestamp() })
  await batch.commit()
}

export function watchHistory(uid, onChange, onError) {
  const q = query(historyRef(uid), orderBy('at', 'desc'), limit(300))
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  )
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export async function ensureDaily(date, slug, makeRoute) {
  const ref = dailyRef(date, slug)
  const existing = await getDoc(ref)
  if (existing.exists()) return { date, slug, ...existing.data() }
  const route = await makeRoute()
  const [tier, scoring] = slug.split('-')
  try {
    await runTransaction(db, async (tx) => {
      const again = await tx.get(ref)
      if (again.exists()) return
      tx.set(ref, {
        date,
        slug,
        scoring,
        difficulty: { start: tier, target: tier },
        createdAt: serverTimestamp(),
      })
      tx.set(routeRef({ kind: 'daily', date, slug }), route)
    })
  } catch {
    // another player created it first; fall through to read it
  }
  const snap = await getDoc(ref)
  return snap.exists() ? { date, slug, ...snap.data() } : null
}

export async function getDaily(date, slug) {
  const snap = await getDoc(dailyRef(date, slug))
  return snap.exists() ? { date, slug, ...snap.data() } : null
}
