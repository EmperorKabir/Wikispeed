import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase.js'

const NICKNAME_KEY = 'wikispeed.nickname'

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
  return onAuthStateChanged(auth, callback)
}

export function currentUser() {
  return auth.currentUser
}

export function isGoogleUser(user = auth.currentUser) {
  return Boolean(user?.providerData?.some((p) => p.providerId === 'google.com'))
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  const user = auth.currentUser
  if (user?.isAnonymous) {
    try {
      await linkWithPopup(user, provider)
      return auth.currentUser
    } catch (error) {
      if (error?.code !== 'auth/credential-already-in-use') throw error
    }
  }
  const credential = await signInWithPopup(auth, provider)
  return credential.user
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
  const trimmed = String(name ?? '').trim().slice(0, 32)
  try {
    if (trimmed) localStorage.setItem(NICKNAME_KEY, trimmed)
    else localStorage.removeItem(NICKNAME_KEY)
  } catch {
    // storage unavailable; the name lives only for this page load
  }
  return trimmed
}

export function displayName(user = auth.currentUser) {
  const google = user?.displayName?.trim()
  if (google) return google.slice(0, 32)
  return nickname()
}
