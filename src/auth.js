import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  onIdTokenChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth } from './firebase.js'

const NICKNAME_KEY = 'wikispeed.nickname'
const NAME_LIMIT = 32

export function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      async (user) => {
        stop()
        if (user) return resolve(user)
        try {
          const credential = await signInAnonymously(auth)
          resolve(credential.user)
        } catch (error) {
          reject(error)
        }
      },
      reject,
    )
  })
}

export function onUser(callback) {
  return onIdTokenChanged(auth, callback)
}

export function currentUser() {
  return auth.currentUser
}

function googleProfile(user) {
  return user?.providerData?.find((p) => p.providerId === 'google.com') ?? null
}

export function isGoogleUser(user = auth.currentUser) {
  return googleProfile(user) !== null
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  const user = auth.currentUser
  let linked = false
  if (user?.isAnonymous) {
    try {
      await linkWithPopup(user, provider)
      linked = true
    } catch (error) {
      if (error?.code !== 'auth/credential-already-in-use') throw error
    }
  }
  if (!linked) await signInWithPopup(auth, provider)

  const current = auth.currentUser
  const google = googleProfile(current)
  if (current && google && !current.displayName && google.displayName) {
    await updateProfile(current, { displayName: google.displayName.slice(0, NAME_LIMIT) })
  }
  await current?.reload()
  return auth.currentUser
}

export async function signOutUser() {
  await signOut(auth)
  await ensureSignedIn()
}

export function nickname() {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setNickname(name) {
  const trimmed = String(name ?? '').trim().slice(0, NAME_LIMIT)
  try {
    if (trimmed) localStorage.setItem(NICKNAME_KEY, trimmed)
    else localStorage.removeItem(NICKNAME_KEY)
  } catch {
    // storage unavailable; the name lives only for this page load
  }
  return trimmed
}

export async function setName(name) {
  const trimmed = String(name ?? '').trim().slice(0, NAME_LIMIT)
  const user = auth.currentUser
  if (user && isGoogleUser(user)) {
    await updateProfile(user, { displayName: trimmed || googleProfile(user)?.displayName || '' })
    return displayName(user)
  }
  return setNickname(trimmed)
}

export function displayName(user = auth.currentUser) {
  if (isGoogleUser(user)) {
    const name = user.displayName?.trim() || googleProfile(user)?.displayName?.trim() || ''
    return name.slice(0, NAME_LIMIT)
  }
  return nickname()
}
