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
import { useGame, flushSaveWrite } from './store'
import { SYNC_URL } from './syncConfig'
import { authConfigured, currentUser, getIdToken } from './auth'

const SAVE_KEY = 'poke-vendor-save'             // zustand persist blob (the whole game)
const SAVEDAT_KEY = 'poke-vendor-cloud-savedAt' // logical save time of the local data
const AUTO_KEY = 'poke-vendor-cloud-auto'       // '0' | '1' auto-sync toggle
const OWNER_KEY = 'poke-vendor-cloud-owner'     // which account (sub) the local data is synced with
const BASE_KEY = 'poke-vendor-cloud-base'       // cloud savedAt this device last synced against (the CAS token)
const BACKUP_DAY_KEY = 'poke-vendor-cloud-backupday' // calendar day we last rotated the cloud #prev backup

// A DynamoDB item caps at 400KB; the backend rejects past 350KB. Checked client-side too
// so an oversized save surfaces as a clear "too large" instead of a network error.
const MAX_PUSH_BYTES = 350_000

export function cloudConfigured() { return !!SYNC_URL && authConfigured() }

// How big this save is on the wire: the EXACT bytes saveToCloud would push, gzipped and
// base64'd the same way. Surfaced in ⚙️ → Account so a collection heading for the cap is
// visible while there's still room to do something about it — before auto-sync stops dead
// and the only signal is a red line in a settings panel.
// → { payload, cap, raw } | null when there's nothing saved yet.
export async function measureSave() {
  const data = readBlob()
  if (!data) return null
  let payload = data
  if (typeof CompressionStream !== 'undefined') {
    try { payload = await gzipToB64(data) } catch { /* uncompressed, like the push would be */ }
  }
  return { payload: payload.length, cap: MAX_PUSH_BYTES, raw: data.length }
}

// --- sync status -----------------------------------------------------------------
// One tiny observable so the UI can tell "synced" apart from "silently failing".
// states: idle | ok | offline | error | conflict | toolarge
let syncStatus = { state: 'idle', at: 0, message: null }
export function getSyncStatus() { return syncStatus }
function setSyncStatus(state, message = null) {
  syncStatus = { state, at: Date.now(), message }
  try { window.dispatchEvent(new CustomEvent('poke-vendor-sync', { detail: syncStatus })) } catch {}
}

// True after a 409 fork (the cloud moved past what this device last synced AND this
// device has its own changes). Auto-sync stops pushing until the player picks a side
// (load cloud, or force-push this device) — retrying would just clobber one of them.
let syncBlocked = false

export function autoSyncOn() { return localStorage.getItem(AUTO_KEY) !== '0' } // default ON
export function setAutoSync(on) { localStorage.setItem(AUTO_KEY, on ? '1' : '0') }

// Persist writes are debounced (store/index.js) — flush the pending one first so a
// cloud push never uploads a blob that's up to 400ms behind the live game.
function readBlob() { flushSaveWrite(); return localStorage.getItem(SAVE_KEY) }
function localSavedAt() { return Number(localStorage.getItem(SAVEDAT_KEY)) || 0 }
function setLocalSavedAt(ts) { localStorage.setItem(SAVEDAT_KEY, String(ts || Date.now())) }
function baseSavedAt() { const n = Number(localStorage.getItem(BASE_KEY)); return n > 0 ? n : null }
function setBaseSavedAt(ts) {
  if (ts) localStorage.setItem(BASE_KEY, String(ts))
  else localStorage.removeItem(BASE_KEY)
}
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

async function authedFetch(method, body, query = '') {
  const token = await getIdToken()
  if (!token) { const e = new Error('Sign in to use cloud save.'); e.code = 'signedout'; throw e }
  const res = await fetch(SYNC_URL + query, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 401) { const e = new Error('Session expired — sign in again.'); e.code = 'signedout'; throw e }
  return res
}

// --- save compression -----------------------------------------------------------
// Saves gzip ~5-10× smaller, so syncs are faster on mobile and stay far from
// DynamoDB's 400KB item cap as a collection grows. CompressionStream is everywhere
// the game runs (iOS 16.4+, Chrome 80+); without it we just upload the raw JSON.
// The backend stores the bytes opaquely (enc:'gz'); old uncompressed saves load as-is.
async function gzipToB64(str) {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
async function gunzipFromB64(b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

// Push the current local save under its logical savedAt.
//
// Writes are compare-and-swap: we send the cloud savedAt this device last synced against
// (baseSavedAt) and the backend only overwrites that exact revision. ANY fork — a second
// device that pushed meanwhile, clock skew, whatever — comes back as an honest 409
// ({ code:'stale' }) instead of newest-wins silently discarding one side.
//
// `force` (conflict "keep this device", reset-everywhere, prev-restore) overwrites
// unconditionally — but the backend snapshots the save it's replacing to a #prev slot
// first, so even a forced overwrite is one restore away from undone. A once-a-day
// `backup` flag rotates that same #prev slot during normal play, giving a rolling
// "yesterday" backup on top of the pre-force snapshots.
export async function saveToCloud({ force = false } = {}) {
  if (!cloudConfigured()) throw new Error('Cloud sync isn’t set up')
  const data = readBlob(); if (!data) throw new Error('Nothing saved locally yet')
  let savedAt = localSavedAt()
  if (!savedAt) { savedAt = Date.now(); setLocalSavedAt(savedAt) } // first ever save
  let payload = { data, savedAt, version: schemaVersion() }
  const base = baseSavedAt()
  if (force) payload.force = true
  else if (base) payload.baseSavedAt = base // no base yet (pre-CAS device): backend falls back to the legacy newest-wins guard
  const today = new Date().toDateString()
  if (localStorage.getItem(BACKUP_DAY_KEY) !== today) payload.backup = true
  if (typeof CompressionStream !== 'undefined') {
    try { payload = { ...payload, data: await gzipToB64(data), enc: 'gz' } } catch {}
  }
  if (payload.data.length > MAX_PUSH_BYTES) {
    const e = new Error('This save is too large to sync to the cloud.')
    e.code = 'toolarge'; setSyncStatus('toolarge', e.message); throw e
  }
  const res = await authedFetch('PUT', payload)
  if (res.status === 409) {
    const j = await res.json().catch(() => ({}))
    syncBlocked = true
    setSyncStatus('conflict', 'The cloud save changed since this device last synced.')
    const e = new Error('The cloud save changed since this device last synced — pick which to keep in ⚙️ → Account.')
    e.code = 'stale'; e.savedAt = j.savedAt; throw e
  }
  if (res.status === 413) {
    const e = new Error('This save is too large to sync to the cloud.')
    e.code = 'toolarge'; setSyncStatus('toolarge', e.message); throw e
  }
  if (!res.ok) { setSyncStatus('error', `Save failed (${res.status})`); throw new Error(`Save failed (${res.status})`) }
  const j = await res.json().catch(() => ({}))
  const ts = j.savedAt || savedAt
  setLocalSavedAt(ts)
  setBaseSavedAt(ts) // in sync with the exact revision we just wrote
  if (payload.backup) localStorage.setItem(BACKUP_DAY_KEY, today)
  claimLocalForCurrentUser()
  syncBlocked = false
  setSyncStatus('ok')
  return { savedAt: ts }
}

// Mark the local data as freshly changed (advance its logical time to now) and push.
// Used by the manual Save button, auto-sync, and — with { force:true } — the deliberate
// overwrites: "keep this device's game" in a conflict, reset-everywhere, prev-restore.
export async function pushLocalChange(opts) {
  setLocalSavedAt(Date.now())
  return saveToCloud(opts)
}

// Fetch the signed-in account's cloud save and apply it locally. { prev:true } fetches
// the one-deep #prev backup instead (see restorePrevCloudSave).
export async function loadFromCloud({ prev = false } = {}) {
  if (!cloudConfigured()) throw new Error('Cloud sync isn’t set up')
  const res = await authedFetch('GET', null, prev ? '?prev=1' : '')
  if (res.status === 404) {
    const e = new Error(prev ? 'No previous cloud version exists yet' : 'No cloud save on this account yet')
    e.code = 'notfound'; throw e
  }
  if (!res.ok) throw new Error(`Load failed (${res.status})`)
  const j = await res.json()
  if (!j.data) throw new Error('The cloud save is empty')
  let blob = j.data
  if (j.enc === 'gz') {
    try { blob = await gunzipFromB64(blob) } catch { blob = null }
  }
  // Never apply a blob that isn't a real zustand save ({ state, version }) — a corrupted
  // cloud copy must not nuke the local game (rehydrating garbage destroys the store).
  let parsed
  try { parsed = JSON.parse(blob) } catch { parsed = null }
  if (!parsed || typeof parsed.state !== 'object' || parsed.state === null) {
    throw new Error('The cloud save looks corrupted — keeping this device’s game.')
  }
  clearTimeout(timer)     // drop any pending push of the about-to-be-replaced local data
  applyingRemote = true
  try {
    const prior = readBlob()
    const priorSavedAt = localSavedAt()
    const priorBase = baseSavedAt()
    // Drop the old rollback slot BEFORE writing the incoming save. localStorage caps at
    // ~5MB and a grown collection is a big blob: holding the outgoing save, its old -prev
    // copy AND the incoming one at once is what used to blow the quota mid-load. The
    // rehydrate rollback below reads `prior` from memory, so the key is only a manual
    // recovery breadcrumb — freeing it costs nothing and buys the room for the write.
    localStorage.removeItem(SAVE_KEY + '-prev')
    try {
      localStorage.setItem(SAVE_KEY, blob)
    } catch {
      const e = new Error('This browser is out of storage space, so the cloud save couldn’t be written — kept this device’s game.')
      e.code = 'quota'; setSyncStatus('error', 'Out of local storage space.'); throw e
    }
    // Re-file the replaced save as the rollback breadcrumb, but never at the cost of the
    // load we just completed: if there's no room left, go without it.
    if (prior) { try { localStorage.setItem(SAVE_KEY + '-prev', prior) } catch {} }
    setLocalSavedAt(j.savedAt || Date.now()) // adopt the cloud data's logical time
    // Loading the CURRENT cloud save puts us exactly in sync with it (CAS base = its
    // savedAt). Loading the #prev backup does NOT — the cloud current is still something
    // else, so clear the base and let the caller force-push (restorePrevCloudSave).
    setBaseSavedAt(prev ? null : (j.savedAt || Date.now()))
    claimLocalForCurrentUser()
    try {
      await useGame.persist.rehydrate()      // reload the store from the new blob (runs migrations)
    } catch (err) {
      if (prior) {
        // Roll everything back — data AND sync markers, so this device doesn't claim
        // to be in sync with a cloud save it failed to load. The rollback write must not
        // be the thing that fails: clear the breadcrumb copy first so there's room for it.
        localStorage.removeItem(SAVE_KEY + '-prev')
        localStorage.setItem(SAVE_KEY, prior)
        setLocalSavedAt(priorSavedAt || Date.now())
        setBaseSavedAt(priorBase)
        await useGame.persist.rehydrate().catch(() => {})
      }
      throw new Error('The cloud save couldn’t be loaded — kept this device’s game.')
    }
    if (!prev) { syncBlocked = false; setSyncStatus('ok') }
  } finally { applyingRemote = false }
  return { savedAt: j.savedAt }
}

// Restore the cloud's one-deep backup: pull #prev, apply it locally, then force-push it
// back as the CURRENT cloud save. The force-push snapshots the save it replaces into
// #prev — so restoring twice swaps back, and nothing is ever more than one step gone.
// Recovers from any bad overwrite: an accidental "wipe cloud too" reset, a wrong
// "keep this device's game" call, a fork resolved the wrong way.
export async function restorePrevCloudSave() {
  await loadFromCloud({ prev: true })
  return pushLocalChange({ force: true })
}

// Forget this device's cloud linkage WITHOUT touching the cloud: cancel any pending
// auto-push and drop the ownership/sync markers. Used by "reset this device only" —
// the fresh local game becomes a foreign save, so auto-sync stays paused (the cloud
// copy is safe) until the player deliberately reconnects via ⚙️ → Account.
export function disownLocalSave() {
  clearTimeout(timer); timer = null
  syncBlocked = false
  localStorage.removeItem(OWNER_KEY)
  localStorage.removeItem(SAVEDAT_KEY)
  localStorage.removeItem(BASE_KEY)
  setSyncStatus('idle')
}

// Look at the account's cloud save without applying it — metadata only (?peek=1),
// so boots and sign-ins never download the whole blob just to compare timestamps.
// → { exists, savedAt } | null when signed out / unreachable.
export async function peekCloud() {
  if (!cloudConfigured() || !currentUser()) return null
  try {
    const res = await authedFetch('GET', null, '?peek=1')
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
    if (!remote) { setSyncStatus('offline'); return { action: 'offline' } }
    const hasLocal = !!readBlob()
    if (!remote.exists) {
      if (!hasLocal) return { action: 'none' }
      await pushLocalChange()
      return { action: 'pushed' }
    }
    if (hasLocal && !localOwnedByCurrentUser() && !localIsPristine()) {
      return { action: 'conflict', cloudAt: remote.savedAt }
    }
    // Two-sided fork: the cloud moved past the revision this device last synced against
    // AND this device has local changes since then (a failed/blocked push left its
    // logical time ahead of the base). Silently picking a side at boot would discard
    // one of them — surface it instead; the Account panel offers the choice.
    const base = baseSavedAt()
    if (hasLocal && localOwnedByCurrentUser() && base &&
        remote.savedAt !== base && localSavedAt() > base) {
      syncBlocked = true
      setSyncStatus('conflict', 'This device and the cloud both changed since they last synced.')
      return { action: 'conflict', cloudAt: remote.savedAt }
    }
    if (!hasLocal || !localOwnedByCurrentUser() || remote.savedAt > localSavedAt()) {
      const r = await loadFromCloud()
      return { action: 'pulled', savedAt: r.savedAt }
    }
    if (localSavedAt() > remote.savedAt) await saveToCloud()
    return { action: 'pushed' }
  } catch { setSyncStatus('offline'); return { action: 'offline' } }
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
    if (applyingRemote || syncBlocked || !autoSyncOn() || !localOwnedByCurrentUser()) return
    clearTimeout(timer)
    // Errors here set the sync status (conflict/toolarge/error) inside saveToCloud, so a
    // failing auto-push is visible in ⚙️ → Account instead of swallowed. A 409 also sets
    // syncBlocked, which stops further pushes until the player picks a side.
    timer = setTimeout(() => { pushLocalChange().catch(() => {}) }, 2500)
  })
  if (currentUser() && autoSyncOn() && localOwnedByCurrentUser()) {
    try { await reconcile() } catch {}
  }
}
