import {
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
const routeRef = (code) => doc(db, 'sessions', code, 'private', 'route')
const runsRef = (code) => collection(db, 'sessions', code, 'runs')
const runRef = (code, id) => doc(db, 'sessions', code, 'runs', id)
const historyRef = (uid) => collection(db, 'users', uid, 'history')
const playersRef = (code) => collection(db, 'sessions', code, 'players')

export async function joinSession(code, uid, name) {
  await setDoc(doc(playersRef(code), uid), { name, joinedAt: serverTimestamp() }, { merge: true })
}

export function watchPlayers(code, onChange, onError) {
  return onSnapshot(playersRef(code), (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError)
}

function normaliseRun(snap) {
  const data = snap.data()
  return { id: snap.id, uid: data.uid ?? snap.id, attempt: data.attempt ?? 1, ...data }
}

export async function createSession({ uid, mode, scoring, start, target, hideStart, hideTarget }) {
  const solo = mode === 'solo'
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode()
    const created = await runTransaction(db, async (tx) => {
      const existing = await tx.get(sessionRef(code))
      if (existing.exists()) return false
      tx.set(sessionRef(code), {
        mode,
        scoring,
        host: uid,
        hideStart,
        hideTarget,
        start: hideStart ? null : start,
        target: hideTarget ? null : target,
        status: solo ? 'open' : 'lobby',
        createdAt: serverTimestamp(),
        startedAt: solo ? serverTimestamp() : null,
      })
      tx.set(routeRef(code), { start, target })
      return true
    })
    if (created) return code
  }
  throw new Error('Could not allocate a session code')
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

export function watchRuns(code, onChange, onError) {
  return onSnapshot(runsRef(code), (snap) => onChange(snap.docs.map(normaliseRun)), onError)
}

export async function openSession(code) {
  await updateDoc(sessionRef(code), { status: 'open', startedAt: serverTimestamp() })
}

export async function readRoute(code) {
  const snap = await getDoc(routeRef(code))
  return snap.exists() ? snap.data() : null
}

export async function startRun(code, uid, name, startKey) {
  const all = await getDocs(runsRef(code))
  const previous = all.docs.map(normaliseRun).filter((run) => run.uid === uid)
  const attempt = previous.length + 1
  const id = `${uid}-${attempt}`
  await setDoc(runRef(code, id), {
    uid,
    attempt,
    name,
    clicks: 0,
    ms: 0,
    path: [startKey],
    done: false,
    quit: false,
    startedAt: serverTimestamp(),
    finishedAt: null,
  })
  return { id, attempt, previous }
}

export async function recordRun(code, runId, uid, { name, clicks, ms, path, done }, history) {
  const batch = writeBatch(db)
  batch.set(
    runRef(code, runId),
    { name, clicks, ms, path: path.slice(0, 500), done, quit: !done, finishedAt: serverTimestamp() },
    { merge: true },
  )
  batch.set(doc(historyRef(uid), code), { ...history, at: serverTimestamp() })
  await batch.commit()
}

export function watchHistory(uid, onChange, onError) {
  const q = query(historyRef(uid), orderBy('at', 'desc'), limit(300))
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ code: d.id, ...d.data() }))),
    onError,
  )
}
