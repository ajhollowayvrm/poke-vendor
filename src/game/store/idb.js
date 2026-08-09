// IndexedDB, wrapped in about as little code as it takes.
//
// WHY: the save used to live in localStorage, which caps around 5MB of RAW string and writes
// SYNCHRONOUSLY on the main thread. Both hurt. The cloud stores the same save gzipped, at a
// measured ~7× smaller, so a save sitting exactly at the 350KB cloud limit is ~2.4MB on disk —
// and loading it needs the incoming copy, the outgoing copy and the `-prev` breadcrumb resident
// at once, about 7MB against a 5MB cap. A save the cloud accepts could not be loaded back. That
// is the bug this fixes; the removed main-thread jank is a bonus.
//
// No library: this is one object store holding one row, and a dependency would be more code
// than the thing it wraps.
const DB_NAME = 'poke-vendor'
const STORE = 'kv'
const DB_VERSION = 1

let dbPromise = null
let unavailable = false     // IDB is blocked (private browsing, hardened settings) — caller falls back

function openDb() {
  if (unavailable) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    let req
    try { req = indexedDB.open(DB_NAME, DB_VERSION) } catch { unavailable = true; return resolve(null) }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    // Blocked or refused — Firefox private mode throws here rather than at open().
    req.onerror = () => { unavailable = true; resolve(null) }
    req.onblocked = () => { unavailable = true; resolve(null) }
  })
  return dbPromise
}

// Is IndexedDB usable at all? Resolves false in private browsing / locked-down browsers, which
// is the signal to keep using localStorage rather than silently losing the player's game.
export async function idbAvailable() {
  if (typeof indexedDB === 'undefined') return false
  return !!(await openDb())
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    let t
    try { t = db.transaction(STORE, mode) } catch (e) { return reject(e) }
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error('idb aborted'))
  })
}

export async function idbGet(key) {
  const db = await openDb()
  if (!db) return null
  try { return (await tx(db, 'readonly', (s) => s.get(key))) ?? null } catch { return null }
}

// Rejects on failure (quota, aborted transaction) rather than swallowing — the caller decides
// whether that means "fall back to localStorage" or "tell the player their game isn't saving".
// A save write that fails silently is the exact bug that cost this project a session.
export async function idbSet(key, value) {
  const db = await openDb()
  if (!db) throw new Error('indexeddb-unavailable')
  await tx(db, 'readwrite', (s) => s.put(value, key))
}

export async function idbDel(key) {
  const db = await openDb()
  if (!db) return
  try { await tx(db, 'readwrite', (s) => s.delete(key)) } catch { /* nothing to do */ }
}

// Roughly how much room this origin has and has used, across IndexedDB + CacheStorage +
// localStorage. Supported in Chrome/Edge/Firefox and Safari 17+; null where it isn't.
export async function storageEstimate() {
  try {
    if (!navigator.storage?.estimate) return null
    const { usage, quota } = await navigator.storage.estimate()
    return { usage, quota }
  } catch { return null }
}
