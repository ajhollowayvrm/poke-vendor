// Cloud save: mirror the local game to a DynamoDB table (via the Lambda Function URL
// in syncConfig), one save per signed-in account. auth.js owns the Cognito session;
// every request here carries its id token, and the backend keys the save by the
// account — so there's no game id to copy around anymore: sign in on another device
// and the same game is just there.
//
// The unit we sync is the EXACT string zustand's persist middleware writes to
// localStorage (key `poke-vendor-save`). Pushing/pulling that blob reuses the store's
// own serialization and migrations on rehydrate, so there's nothing to keep in sync
// by hand.
//
// `savedAt` is the data's LOGICAL save time, not the wall-clock of the upload: it
// advances only on a real local change and travels with the save. That's what lets the
// backend's "refuse a push older than the cloud copy" guard work, and lets reconcile
// pull a newer cloud save before you start playing on a device that's behind.
import { useGame } from './store'
import { SYNC_URL } from './syncConfig'
import { authConfigured, currentUser, getIdToken } from './auth'

const SAVE_KEY = 'poke-vendor-save'             // zustand persist blob (the whole game)
const SAVEDAT_KEY = 'poke-vendor-cloud-savedAt' // logical save time of the local data
const AUTO_KEY = 'poke-vendor-cloud-auto'       // '0' | '1' auto-sync toggle
const OWNER_KEY = 'poke-vendor-cloud-owner'     // which account (sub) the local data is synced with

export function cloudConfigured() { return !!SYNC_URL && authConfigured() }

export function autoSyncOn() { return localStorage.getItem(AUTO_KEY) !== '0' } // default ON
export function setAutoSync(on) { localStorage.setItem(AUTO_KEY, on ? '1' : '0') }

function readBlob() { return localStorage.getItem(SAVE_KEY) }
function localSavedAt() { return Number(localStorage.getItem(SAVEDAT_KEY)) || 0 }
function setLocalSavedAt(ts) { localStorage.setItem(SAVEDAT_KEY, String(ts || Date.now())) }
function schemaVersion() {
  try { return useGame.persist.getOptions().version ?? 0 } catch { return 0 }
}

// The local savedAt only means something for the account that produced it. After a
// sign-in under a DIFFERENT account, the local game is "foreign": newest-wins must not
// run against the new account's cloud save until the player picks a side (reconcile
// returns 'conflict' and auto-sync stays paused).
export function localOwnedByCurrentUser() {
  const u = currentUser()
  return !!u && localStorage.getItem(OWNER_KEY) === u.sub
}
function claimLocalForCurrentUser() {
  const u = currentUser()
  if (u) localStorage.setItem(OWNER_KEY, u.sub)
}

// A local game that hasn't really been played — day 1, nothing bought, opened, or
// owned — isn't worth a conflict prompt: signing in just adopts the cloud save.
function localIsPristine() {
  try {
    const s = useGame.getState()
    return (s.currentDay ?? 1) <= 1 && !(s.collection || []).length &&
      !(s.sealedInventory || []).length && !s.stats?.packsOpened && !s.stats?.spent
  } catch { return false }
}

let applyingRemote = false // true while we're rehydrating from a cloud load (don't echo a push)
let timer = null           // debounce handle for auto-sync pushes

async function authedFetch(method, body) {
  const token = await getIdToken()
  if (!token) { const e = new Error('Sign in to use cloud save.'); e.code = 'signedout'; throw e }
  const res = await fetch(SYNC_URL, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 401) { const e = new Error('Session expired — sign in again.'); e.code = 'signedout'; throw e }
  return res
}

// Push the current local save under its logical savedAt. Throws { code:'stale' } if the
// cloud already holds a NEWER save (the device is behind — load it first).
export async function saveToCloud() {
  if (!cloudConfigured()) throw new Error('Cloud sync isn’t set up')
  const data = readBlob(); if (!data) throw new Error('Nothing saved locally yet')
  let savedAt = localSavedAt()
  if (!savedAt) { savedAt = Date.now(); setLocalSavedAt(savedAt) } // first ever save
  const res = await authedFetch('PUT', { data, savedAt, version: schemaVersion() })
  if (res.status === 409) {
    const j = await res.json().catch(() => ({}))
    const e = new Error('The cloud save is newer — load it before saving.')
    e.code = 'stale'; e.savedAt = j.savedAt; throw e
  }
  if (!res.ok) throw new Error(`Save failed (${res.status})`)
  claimLocalForCurrentUser()
  return { savedAt }
}

// Mark the local data as freshly changed (advance its logical time to now) and push.
// Used by the manual Save button, auto-sync, and "keep this device's game" in a
// conflict (now > the cloud's savedAt, so the push wins the backend's guard).
export async function pushLocalChange() {
  setLocalSavedAt(Date.now())
  return saveToCloud()
}

// Fetch the signed-in account's cloud save and apply it locally.
export async function loadFromCloud() {
  if (!cloudConfigured()) throw new Error('Cloud sync isn’t set up')
  const res = await authedFetch('GET')
  if (res.status === 404) { const e = new Error('No cloud save on this account yet'); e.code = 'notfound'; throw e }
  if (!res.ok) throw new Error(`Load failed (${res.status})`)
  const j = await res.json()
  if (!j.data) throw new Error('The cloud save is empty')
  // Never apply a blob that isn't a real zustand save ({ state, version }) — a corrupted
  // cloud copy must not nuke the local game (rehydrating garbage destroys the store).
  let parsed
  try { parsed = JSON.parse(j.data) } catch { parsed = null }
  if (!parsed || typeof parsed.state !== 'object' || parsed.state === null) {
    throw new Error('The cloud save looks corrupted — keeping this device’s game.')
  }
  clearTimeout(timer)     // drop any pending push of the about-to-be-replaced local data
  applyingRemote = true
  try {
    localStorage.setItem(SAVE_KEY, j.data)
    setLocalSavedAt(j.savedAt || Date.now()) // adopt the cloud data's logical time
    claimLocalForCurrentUser()
    await useGame.persist.rehydrate()        // reload the store from the new blob (runs migrations)
  } finally { applyingRemote = false }
  return { savedAt: j.savedAt }
}

// Look at the account's cloud save without applying it.
// → { exists, savedAt } | null when signed out / unreachable.
export async function peekCloud() {
  if (!cloudConfigured() || !currentUser()) return null
  try {
    const res = await authedFetch('GET')
    if (res.status === 404) return { exists: false, savedAt: 0 }
    if (!res.ok) return null
    const j = await res.json()
    return { exists: true, savedAt: j.savedAt || 0 }
  } catch { return null }
}

// Bring this device and the account's cloud save in line. Returns { action }:
//   'pulled'   — cloud was ahead (or this device had nothing) → adopted the cloud save
//   'pushed'   — this device was current/ahead (or cloud was empty) → pushed local up
//   'none'     — nothing local AND nothing in the cloud — a brand-new game
//   'conflict' — both sides have saves with no shared history (fresh sign-in on a device
//                with its own game) → NOTHING changed; the caller asks the player, then
//                runs loadFromCloud() ("use cloud") or pushLocalChange() ("keep this")
//   'offline'  — couldn't reach the cloud (or signed out) → nothing happened
export async function reconcile() {
  try {
    const remote = await peekCloud()
    if (!remote) return { action: 'offline' }
    const hasLocal = !!readBlob()
    if (!remote.exists) {
      if (!hasLocal) return { action: 'none' }
      await pushLocalChange()
      return { action: 'pushed' }
    }
    if (hasLocal && !localOwnedByCurrentUser() && !localIsPristine()) {
      return { action: 'conflict', cloudAt: remote.savedAt }
    }
    if (!hasLocal || !localOwnedByCurrentUser() || remote.savedAt > localSavedAt()) {
      const r = await loadFromCloud()
      return { action: 'pulled', savedAt: r.savedAt }
    }
    if (localSavedAt() > remote.savedAt) await saveToCloud()
    return { action: 'pushed' }
  } catch { return { action: 'offline' } }
}

// Start cloud auto-sync. Called once at app boot; no-ops unless the backend is
// configured. Reconciles the signed-in account first (newest wins, exactly like
// closing and reopening the app on another device), then debounce-pushes real local
// changes. Pushes pause whenever nobody's signed in, auto-sync is off, or the local
// game isn't the signed-in account's (an unresolved conflict).
let started = false
export async function startAutoSync() {
  if (started || !cloudConfigured()) return
  started = true
  useGame.subscribe(() => {
    if (applyingRemote || !autoSyncOn() || !localOwnedByCurrentUser()) return
    clearTimeout(timer)
    timer = setTimeout(() => { pushLocalChange().catch(() => {}) }, 2500)
  })
  if (currentUser() && autoSyncOn() && localOwnedByCurrentUser()) {
    try { await reconcile() } catch {}
  }
}
