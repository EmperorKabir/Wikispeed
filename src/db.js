import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { makeCode } from './code.js'
import { db } from './firebase.js'

const sessionRef = (code) => doc(db, 'sessions', code)
const routeRef = (code) => doc(db, 'sessions', code, 'private', 'route')
const runsRef = (code) => collection(db, 'sessions', code, 'runs')
const runRef = (code, uid) => doc(db, 'sessions', code, 'runs', uid)
const historyRef = (uid) => collection(db, 'users', uid, 'history')

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
  return onSnapshot(
    runsRef(code),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  )
}

export async function openSession(code) {
  await updateDoc(sessionRef(code), { status: 'open', startedAt: serverTimestamp() })
}

export async function readRoute(code) {
  const snap = await getDoc(routeRef(code))
  return snap.exists() ? snap.data() : null
}

export async function getRun(code, uid) {
  const snap = await getDoc(runRef(code, uid))
  return snap.exists() ? { id: uid, ...snap.data() } : null
}

export async function startRun(code, uid, name, startKey) {
  await setDoc(runRef(code, uid), {
    name,
    clicks: 0,
    ms: 0,
    path: [startKey],
    done: false,
    startedAt: serverTimestamp(),
    finishedAt: null,
  })
}

export async function finishRun(code, uid, { name, clicks, ms, path }) {
  await setDoc(runRef(code, uid), {
    name,
    clicks,
    ms,
    path: path.slice(0, 500),
    done: true,
    finishedAt: serverTimestamp(),
  }, { merge: true })
}

export async function saveHistory(uid, code, entry) {
  await setDoc(doc(historyRef(uid), code), { ...entry, at: serverTimestamp() })
}

export function watchHistory(uid, onChange, onError) {
  const q = query(historyRef(uid), orderBy('at', 'desc'), limit(100))
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ code: d.id, ...d.data() }))),
    onError,
  )
}
