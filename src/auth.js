import {
  GoogleAuthProvider,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  onIdTokenChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
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

function prefersRedirect() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

async function adoptGoogleName() {
  const user = auth.currentUser
  const google = googleProfile(user)
  if (user && google && !user.displayName && google.displayName) {
    await updateProfile(user, { displayName: google.displayName.slice(0, NAME_LIMIT) })
  }
  await user?.reload()
}

async function useExistingAccount(error) {
  const credential = GoogleAuthProvider.credentialFromError(error)
  if (!credential) throw error
  await signInWithCredential(auth, credential)
}

async function startRedirect(provider) {
  const user = auth.currentUser
  if (user?.isAnonymous) await linkWithRedirect(user, provider)
  else await signInWithRedirect(auth, provider)
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  if (prefersRedirect()) {
    await startRedirect(provider)
    return null
  }

  const user = auth.currentUser
  try {
    if (user?.isAnonymous) {
      try {
        await linkWithPopup(user, provider)
      } catch (error) {
        if (error?.code !== 'auth/credential-already-in-use') throw error
        await useExistingAccount(error)
      }
    } else {
      await signInWithPopup(auth, provider)
    }
  } catch (error) {
    if (error?.code === 'auth/popup-blocked') {
      await startRedirect(provider)
      return null
    }
    throw error
  }

  await adoptGoogleName()
  return auth.currentUser
}

export async function completeRedirect() {
  try {
    const result = await getRedirectResult(auth)
    if (result) await adoptGoogleName()
  } catch (error) {
    if (error?.code !== 'auth/credential-already-in-use') throw error
    await useExistingAccount(error)
    await adoptGoogleName()
  }
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

function setNickname(name) {
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
