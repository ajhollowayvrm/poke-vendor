// Cloud save: mirror the local game to a DynamoDB table (via the Lambda Function URL in
// syncConfig) keyed by a per-game UUID. The UUID is the only identity — carry it to another
// device and Load to continue the same game there.
//
// The unit we sync is the EXACT string zustand's persist middleware writes to localStorage
// (key `poke-vendor-save`). Pushing/pulling that blob reuses the store's own serialization
// and migrations on rehydrate, so there's nothing to keep in sync by hand.
//
// `savedAt` is the data's LOGICAL save time, not the wall-clock of the upload: it advances
// only on a real local change and travels with the save. That's what lets the backend's
// "refuse a push older than the cloud copy" guard work, and lets boot reconcile pull a newer
// cloud save before you start playing on a device that's behind.
import { useGame } from './store'
import { SYNC_URL } from './syncConfig'

const SAVE_KEY = 'poke-vendor-save'             // zustand persist blob (the whole game)
const ID_KEY = 'poke-vendor-cloud-id'           // this device's game id (UUID)
const SAVEDAT_KEY = 'poke-vendor-cloud-savedAt' // logical save time of the local data
const AUTO_KEY = 'poke-vendor-cloud-auto'       // '0' | '1' auto-sync toggle

export function cloudConfigured() { return !!SYNC_URL }

export function getGameId() { return localStorage.getItem(ID_KEY) || '' }
export function setGameId(id) {
  const v = (id || '').trim()
  if (v) localStorage.setItem(ID_KEY, v)
  else localStorage.removeItem(ID_KEY)
}
export function newGameId() {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  setGameId(id)
  return id
}

export function autoSyncOn() { return localStorage.getItem(AUTO_KEY) !== '0' } // default ON
export function setAutoSync(on) { localStorage.setItem(AUTO_KEY, on ? '1' : '0') }

function readBlob() { return localStorage.getItem(SAVE_KEY) }
function localSavedAt() { return Number(localStorage.getItem(SAVEDAT_KEY)) || 0 }
function setLocalSavedAt(ts) { localStorage.setItem(SAVEDAT_KEY, String(ts || Date.now())) }
function schemaVersion() {
  try { return useGame.persist.getOptions().version ?? 0 } catch { return 0 }
}

let applyingRemote = false // true while we're rehydrating from a cloud load (don't echo a push)
let timer = null           // debounce handle for auto-sync pushes

// Push the current local save under its logical savedAt. Throws { code:'stale' } if the
// cloud already holds a NEWER save (the device is behind — load it first).
export async function saveToCloud() {
  if (!cloudConfigured()) throw new Error('Cloud sync isn’t set up')
  const id = getGameId(); if (!id) throw new Error('No game ID yet')
  const data = readBlob(); if (!data) throw new Error('Nothing saved locally yet')
  let savedAt = localSavedAt()
  if (!savedAt) { savedAt = Date.now(); setLocalSavedAt(savedAt) } // first ever save
  const res = await fetch(SYNC_URL, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, data, savedAt, version: schemaVersion() }),
  })
  if (res.status === 409) {
    const j = await res.json().catch(() => ({}))
    const e = new Error('The cloud save is newer — load it before saving.')
    e.code = 'stale'; e.savedAt = j.savedAt; throw e
  }
  if (!res.ok) throw new Error(`Save failed (${res.status})`)
  return { savedAt }
}

// Mark the local data as freshly changed (advance its logical time to now) and push.
// Used by the manual Save button and by auto-sync on a gameplay change.
export async function pushLocalChange() {
  setLocalSavedAt(Date.now())
  return saveToCloud()
}

// Fetch the cloud save for an id (defaults to the stored one) and apply it locally.
export async function loadFromCloud(id = getGameId()) {
  if (!cloudConfigured()) throw new Error('Cloud sync isn’t set up')
  if (!id) throw new Error('Enter a game ID first')
  const res = await fetch(`${SYNC_URL}?id=${encodeURIComponent(id)}`)
  if (res.status === 404) { const e = new Error('No cloud save found for that ID'); e.code = 'notfound'; throw e }
  if (!res.ok) throw new Error(`Load failed (${res.status})`)
  const j = await res.json()
  if (!j.data) throw new Error('That cloud save is empty')
  clearTimeout(timer)     // drop any pending push of the about-to-be-replaced local data
  applyingRemote = true
  try {
    localStorage.setItem(SAVE_KEY, j.data)
    setGameId(id)
    setLocalSavedAt(j.savedAt || Date.now()) // adopt the cloud data's logical time
    await useGame.persist.rehydrate()        // reload the store from the new blob (runs migrations)
  } finally { applyingRemote = false }
  return { savedAt: j.savedAt }
}

// Read the cloud save's timestamp without applying it (for the "cloud updated …" hint).
export async function peekCloud(id = getGameId()) {
  if (!cloudConfigured() || !id) return null
  try {
    const res = await fetch(`${SYNC_URL}?id=${encodeURIComponent(id)}`)
    if (!res.ok) return null
    const j = await res.json()
    return { savedAt: j.savedAt || 0 }
  } catch { return null }
}

// On boot, reconcile local vs cloud so switching devices doesn't clobber: adopt the cloud
// save if it's newer than our data, otherwise push ours up. Best-effort (offline → no-op).
async function reconcileOnBoot() {
  const id = getGameId(); if (!id) return
  const remote = await peekCloud(id)
  const local = localSavedAt()
  if (remote && remote.savedAt > local) {
    await loadFromCloud(id).catch(() => {})          // cloud is ahead → adopt it
  } else if (readBlob() && local >= (remote?.savedAt || 0)) {
    await saveToCloud().catch(() => {})              // we're current/ahead → push ours
  }
}

// Start cloud auto-sync. Called once at app boot; no-ops unless a Function URL is set.
// Reconciles first, then debounce-pushes real local changes.
let started = false
export async function startAutoSync() {
  if (started || !cloudConfigured()) return
  started = true
  if (getGameId() && autoSyncOn()) { try { await reconcileOnBoot() } catch {} }
  useGame.subscribe(() => {
    if (applyingRemote || !getGameId() || !autoSyncOn()) return
    clearTimeout(timer)
    timer = setTimeout(() => { pushLocalChange().catch(() => {}) }, 2500)
  })
}
