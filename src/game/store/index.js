// Store composition root.
//
// This is the entry point for the game store (import path `../game/store` resolves here).
// It does three things and nothing else:
//   1. Composes the initial state + every action slice into ONE zustand store.
//   2. Holds the persist config — name/version/merge/migrate/onRehydrateStorage — because
//      that's the load-bearing save/migration logic and it must stay in one authoritative
//      place. (Behavior is unchanged from the pre-split monolith; only the actions moved.)
//   3. Re-exports the public surface (`export * from './constants'` + `useGame`) so every
//      component that imports from `../game/store` keeps working with no changes.
//
// WHERE THINGS LIVE (find-it map):
//   • constants.js    — data tables & pure fns (jobs, employees, payments, upgrades, goals, gates)
//   • initialState.js — the fresh-game state factory (used here + by reset())
//   • helpers.js      — tiny shared utils (per-set ledger, fee messaging, liquidation value)
//   • ids.js          — monotonic offer / sealed-uid counters
//   • daytick.js      — the day-advance engine (advanceDaysWith + tick/settle steps)
//   • economy.js      — cash/notoriety/upgrades, goals, jobs, employees, nextDay/attendShow, reset
//   • collection.js   — pulls, quick-sell/buylist/consign, grading lifecycle
//   • selling.js      — listings, offers, wants, forum, regulars
//   • sourcing.js     — distributors, sealed inventory, inbound deals
//   • booth.js        — show floor, store shelf, resolveEncounter
//   • livestream.js   — going live + box breaks
//   • socials.js      — 📱 short-form posts + the 🃏 master set challenge (math: game/content.js)
//   • books.js        — 🧾 the quarterly tax bill + 🏦 the bank note (math: game/tax.js, loans.js)
//   • auctionhouse.js — 🔨 the BUY side of the hammer: bidding (math: game/lots.js)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { GRADING, setMarketMults, setPopAdds, cardValue, sealedValue } from '../engine'
import { makeShowVendors } from '../shows'
import { jobById, STARTER_JOB, absoluteDay, floorCapacity, rankForNotoriety } from './constants'
import { newlyUnlocked } from '../milestones'
import { seedOfferId, seedInboxId, nextInboxId } from './ids'
import { initialState } from './initialState'
import { createEconomySlice } from './economy'
import { createCollectionSlice } from './collection'
import { createSellingSlice } from './selling'
import { createSourcingSlice } from './sourcing'
import { createBoothSlice } from './booth'
import { createLivestreamSlice } from './livestream'
import { createPacksSlice } from './packs'
import { createSocialsSlice } from './socials'
import { createBooksSlice } from './books'
import { createAuctionHouseSlice } from './auctionhouse'
import { freshBooks } from '../tax'
import { refillLots } from '../lots'
import { deflateState, inflateState } from './slimsave'
import { idbAvailable, idbGet, idbSet, idbDel } from './idb'
import { defaultPackTiers } from '../mysterypacks'

// Re-export the public API (constants + pure helpers) so `import { ... } from '../game/store'`
// keeps resolving every symbol components use (PAYMENT_METHODS, UPGRADES, JOBS, absoluteDay, …).
export * from './constants'

// --- Debounced save writes --------------------------------------------------------
// persist serializes the WHOLE game on every set() — during a pack rip that's several
// full-collection JSON.stringify + synchronous localStorage writes per card, on the main
// thread, mid-animation (the single biggest jank source on iPhone). Batch them: hold the
// latest blob and write after 400ms of quiet. Flushed on pagehide / tab-hidden (so an
// iOS background-kill never loses more than the last 400ms) and before ANY direct read
// of the blob (persist reads here; cloud pushes call flushSaveWrite via readBlob).
let _pendingSave = null // [key, value] not yet written to storage
let _saveTimer = null
let _saveBlocked = false        // last write hit the quota — progress is NOT being persisted

// Which store are we on? Decided ONCE, by actually opening IndexedDB rather than sniffing for
// it — private browsing exposes the API and then refuses to open. Defaults to localStorage
// until the probe resolves, and the probe is awaited inside getItem (the first thing persist
// calls), so it's always settled before any write.
let _useIdb = false
let _idbProbe = null
function probeIdb() {
  if (!_idbProbe) _idbProbe = idbAvailable().then(ok => { _useIdb = ok; return ok }).catch(() => false)
  return _idbProbe
}
export function usingIndexedDB() { return _useIdb }

// Roughly how many UTF-16 chars this origin holds. Diagnostics only, so approximate is fine:
// it turns "out of space" into a number the player can act on.
export function storageUsedChars() {
  let n = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      n += (k?.length || 0) + (localStorage.getItem(k)?.length || 0)
    }
  } catch { /* private mode */ }
  return n
}
// Cosmetic, regenerable keys: collapsed-section memory, view/sort prefs, the stream source
// picker, and the cloud rollback breadcrumb. Never the save, auth, or the sync markers.
// Dropping these buys room and costs the player a few reopened panels.
export function freeDisposableKeys() {
  try {
    const doomed = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k === 'poke-vendor-save-prev' || k.startsWith('pv-col-')
        || k === 'pv-personal-view' || k === 'pv-personal-sort' || k === 'pv-stream-src') doomed.push(k)
    }
    for (const k of doomed) localStorage.removeItem(k)
    return doomed.length
  } catch { return 0 }
}
export function saveBlocked() { return _saveBlocked }
function announceSave(blocked) {
  if (blocked === _saveBlocked) return
  _saveBlocked = blocked
  try { window.dispatchEvent(new CustomEvent('poke-vendor-save-state', { detail: { blocked } })) } catch {}
}
// Write the pending blob, MAKING ROOM rather than failing silently.
//
// This used to be `try { setItem } catch {}` — a bare swallow. Once localStorage filled up,
// every save from then on failed without a word: the game kept playing, the player kept
// earning, and none of it was ever written. Silent progress loss is far worse than a warning.
//
// Two things matter on a full store. First, setItem holds the OLD value until the new one is
// committed, so replacing a 3MB save with a 3MB save transiently wants 6MB of an ~5MB budget —
// dropping the key first halves the peak. Second, a failed write must KEEP the pending blob so
// the next flush retries it, instead of throwing away the only copy of the last few seconds.
// The last blob persist handed us, kept in memory. This is what makes the move to an ASYNC
// store a small change instead of a sprawling one: cloud pushes and the crash-screen backup
// both need "the current save, right now, synchronously", and neither has to learn about
// promises. It's also always at least as fresh as the store, since it's set the moment persist
// serializes rather than when the write lands.
let _mirror = null
const SAVE_NAME = 'poke-vendor-save'
const PREV_NAME = SAVE_NAME + '-prev'

// Synchronous read of the live save as a STRING, for the cloud push and the crash-screen backup.
// The mirror holds the state OBJECT (see debouncedStorage) so the hot path never stringifies;
// this is the one place that pays for it, and only when something actually asks.
let _mirrorStr = null
export function currentSaveBlob() {
  if (_mirrorStr != null) return _mirrorStr
  if (_mirror != null) { try { _mirrorStr = JSON.stringify(_mirror) } catch { return null } ; return _mirrorStr }
  try { return localStorage.getItem(SAVE_NAME) } catch { return null }
}
// Replace the save wholesale — what loadFromCloud does. Async because the destination may be.
// Returns false if it couldn't be written, so the caller can keep the device's own game.
export async function replaceSaveBlob(blob) {
  _pendingSave = null; clearTimeout(_saveTimer)
  if (_useIdb) {
    try { await idbSet(SAVE_NAME, blob); _mirrorStr = blob; _mirror = parseSave(blob); announceSave(false); return true }
    catch { /* fall through to localStorage */ }
  }
  const ok = writeLocalStorage(SAVE_NAME, blob)
  if (ok) { _mirrorStr = blob; _mirror = parseSave(blob) }
  announceSave(!ok)
  return ok
}
// The cloud rollback breadcrumb: a full second copy of the save. On localStorage that was
// half the budget (and the likely reason a device ran out); in IndexedDB it's free.
export async function writePrevBlob(blob) {
  if (!blob) return
  if (_useIdb) { try { await idbSet(PREV_NAME, blob); return } catch { /* fall through */ } }
  try { localStorage.setItem(PREV_NAME, blob) } catch { /* no room — it's only a breadcrumb */ }
}
export async function dropPrevBlob() {
  try { localStorage.removeItem(PREV_NAME) } catch { /* private mode */ }
  if (_useIdb) await idbDel(PREV_NAME).catch(() => {})
}

// localStorage fallback, used only when IndexedDB is unavailable (private browsing, hardened
// browsers). Keeps the old escalate-to-make-room behaviour, since that's the store with the
// tight cap. IDB writes don't need any of it.
function writeLocalStorage(k, v) {
  try { localStorage.setItem(k, v); return true } catch { /* full — make room and retry */ }
  const prior = (() => { try { return localStorage.getItem(k) } catch { return null } })()
  try { localStorage.removeItem(k); localStorage.setItem(k, v); return true } catch { /* still full */ }
  if (freeDisposableKeys()) {
    try { localStorage.setItem(k, v); return true } catch { /* nothing left to free */ }
  }
  // Put back whatever was there so the device isn't left with NO save at all.
  if (prior) { try { localStorage.setItem(k, prior) } catch { /* nothing more to do */ } }
  return false
}

// Write the pending blob. Never swallows a failure: this was `try { setItem } catch {}` once,
// and when localStorage filled up every save from then on failed wordlessly while the game
// carried on. A failed write KEEPS the pending blob so the next flush retries it.
// The in-flight write, so callers that MUST NOT navigate away early can await it. Writing to
// IndexedDB is asynchronous — a reload fired straight after flushSaveWrite() would race it and
// lose the last few seconds, which is exactly what the app-update reload used to do safely when
// the store was synchronous localStorage.
let _writePromise = null
export function flushSaveNow() { flushSaveWrite(); return _writePromise || Promise.resolve() }

function parseSave(raw) {
  if (raw == null) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function flushSaveWrite() {
  if (!_pendingSave) return
  const [k, obj] = _pendingSave
  // The ONE stringify per debounce window, instead of one per set().
  let v
  try { v = typeof obj === 'string' ? obj : JSON.stringify(obj) } catch { _pendingSave = null; return }
  _mirrorStr = v
  if (_useIdb) {
    // Fire and don't await — IndexedDB writes off the main thread, which is the point. A
    // transaction opened here still commits while the page is being frozen or hidden, so the
    // pagehide flush works without blocking the way localStorage did.
    _pendingSave = null
    _writePromise = idbSet(k, v).then(() => announceSave(false)).catch(() => {
      // Don't lose it: put it back so the next flush (or pagehide) tries again, and fall back
      // to localStorage right now in case this is the last chance we get.
      if (!_pendingSave) _pendingSave = [k, obj]
      announceSave(!writeLocalStorage(k, v))
    })
    return
  }
  _pendingSave = null
  if (writeLocalStorage(k, v)) announceSave(false)
  else { _pendingSave = [k, obj]; announceSave(true) }
}

// persist's storage. getItem is async (IDB is), which is why the app gates its first render on
// hydration — see hasHydrated in main.jsx.
//
// ⚡ This is a raw PersistStorage, NOT createJSONStorage, and that is the single biggest
// performance decision in the app. createJSONStorage runs JSON.stringify over the WHOLE game on
// every set() — and a rip fires several, while claiming set-completion rewards fired 489 of them
// on a large save. At 20,000 cards that measured **11.6 SECONDS** of main-thread work and roughly
// a gigabyte of transient garbage for one rip, which is exactly how an iPhone kills the tab
// mid-animation. Taking the state OBJECT here instead lets the stringify happen once per debounce
// window rather than once per state change: the same 400ms batching the write already had.
const debouncedStorage = {
  async getItem(k) {
    flushSaveWrite()
    await probeIdb()
    if (_useIdb) {
      const fromIdb = await idbGet(k)
      if (fromIdb != null) {
        _mirrorStr = fromIdb; _mirror = parseSave(fromIdb)
        // A leftover localStorage copy from before the move keeps occupying the ~5MB budget
        // for nothing. Drop it — but ONLY when it is byte-identical to what IndexedDB holds.
        // If they differ it might be the newer game (a session that fell back to localStorage
        // after an IDB write failed), and no amount of reclaimed space is worth that risk.
        try {
          if (localStorage.getItem(k) === fromIdb) { localStorage.removeItem(k); localStorage.removeItem(PREV_NAME) }
        } catch { /* private mode */ }
        return _mirror
      }
      // First run on IndexedDB: adopt whatever localStorage already holds, so an existing game
      // survives the switch. Only once the IDB copy is safely written do we drop the old one —
      // and dropping it matters, because leaving a 2.4MB blob behind would keep occupying the
      // very ~5MB budget this move exists to escape. If the write fails we keep the original
      // and simply stay on localStorage; nothing is lost either way.
      const legacy = (() => { try { return localStorage.getItem(k) } catch { return null } })()
      if (legacy != null) {
        _mirrorStr = legacy; _mirror = parseSave(legacy)
        idbSet(k, legacy)
          .then(() => { try { localStorage.removeItem(k); localStorage.removeItem(PREV_NAME) } catch { /* private mode */ } })
          .catch(() => { _useIdb = false })   // couldn't migrate — stay where the game already is
      }
      return _mirror
    }
    const v = (() => { try { return localStorage.getItem(k) } catch { return null } })()
    _mirrorStr = v; _mirror = parseSave(v)
    return _mirror
  },
  setItem(k, v) {
    _mirror = v            // the state OBJECT — cheap. No stringify on the hot path.
    _mirrorStr = null      // invalidated; rebuilt on demand by currentSaveBlob()
    _pendingSave = [k, v]
    clearTimeout(_saveTimer)
    _saveTimer = setTimeout(flushSaveWrite, 400)
  },
  removeItem(k) {
    _mirror = null; _mirrorStr = null; _pendingSave = null; clearTimeout(_saveTimer)
    try { localStorage.removeItem(k) } catch { /* private mode */ }
    if (_useIdb) idbDel(k).catch(() => {})
  },
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSaveWrite)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSaveWrite() })
}

export const useGame = create(persist((set, get) => ({
  ...initialState(),
  ...createEconomySlice(set, get),
  ...createCollectionSlice(set, get),
  ...createSellingSlice(set, get),
  ...createSourcingSlice(set, get),
  ...createBoothSlice(set, get),
  ...createLivestreamSlice(set, get),
  ...createPacksSlice(set, get),
  ...createSocialsSlice(set, get),
  ...createBooksSlice(set, get),
  ...createAuctionHouseSlice(set, get),
}), {
  name: 'poke-vendor-save',
  version: 65,
  storage: debouncedStorage,
  // Every card you own used to be saved with a full copy of its catalog row (name, rarity,
  // price, psa comps…) — the game's own bundled data, written back into the save once per
  // card. Past ~7,500 cards that blew the cloud item cap and the save stopped syncing at
  // all. Strip anything the catalog can reproduce exactly on the way out; slimsave.js puts
  // it back on the way in (see there for why this can't lose a card's own values).
  partialize: deflateState,
  // Runs on EVERY load (after migrate). Dedupe any card uid that somehow appears in
  // more than one bucket (collection / pendingGrades / listings / consignments) — a
  // card can only be in one place at a time. First-seen wins, in that priority order.
  merge(persisted, current) {
    // Lay the catalog rows back under every slimmed card before anything reads the state.
    // No-op on a save that migrate() already inflated, and on pre-v58 fat saves.
    const state = { ...current, ...inflateState(persisted || {}) }
    const seen = new Set()
    const keepFlat = (arr) => (arr || []).filter(c => c?.uid && !seen.has(c.uid) && seen.add(c.uid))
    const keepWrapped = (arr) => (arr || []).filter(e => e?.card?.uid && !seen.has(e.card.uid) && seen.add(e.card.uid))
    // Built mystery packs hold SEALED-IN copies (out of the collection/inventory). A pack's
    // contents are never filtered (the pack must stay intact for its eventual buyer), so
    // register their uids FIRST — a stray duplicate in any other bucket gets dropped.
    for (const p of (state.builtPacks || [])) {
      for (const c of (p?.cards || [])) if (c?.uid) seen.add(c.uid)
      for (const it of (p?.sealed || [])) if (it?.uid) seen.add(it.uid)
    }
    // Pack Machine stock is sealed packs pulled out of sealedInventory (one bucket per uid) —
    // register them too so a stray duplicate elsewhere gets dropped, not the machine's copy.
    for (const it of (state.packMachine?.stock || [])) if (it?.uid) seen.add(it.uid)
    // 🔨 A card at auction is out of the collection and under a promise to the bidders —
    // register it first so a stray duplicate never survives at the auctioned copy's expense.
    for (const a of (state.auctions || [])) if (a?.card?.uid) seen.add(a.card.uid)
    // 📦🔟 Sealed product out at a sealed grader is money already spent on a fee, so it wins
    // over a stray duplicate for exactly the same reason pendingGrades does.
    for (const p of (state.pendingSealed || [])) if (p?.item?.uid) seen.add(p.item.uid)
    // Bulk Bin stock is cards pulled out of the collection — same rule as the machine.
    for (const c of (state.bulkBin?.stock || [])) if (c?.uid) seen.add(c.uid)
    // 🏬 Stock allocated to the second location lives out there, not on your shelves.
    for (const c of (state.secondLoc?.cards || [])) if (c?.uid) seen.add(c.uid)
    for (const it of (state.secondLoc?.sealed || [])) if (it?.uid) seen.add(it.uid)
    // 🚢 Import shipments hold paid-for sealed rows still on the water — register them so a
    // stray duplicate in a landed bucket gets dropped, never the copy your money is riding on.
    for (const sh of (state.imports || [])) for (const it of (sh?.rows || [])) if (it?.uid) seen.add(it.uid)
    // Priority: the IN-FLIGHT money-bearing buckets win over a stray collection duplicate,
    // so a corruption-repair never silently discards a card you've already paid a grading
    // fee for (pendingGrades) or are owed proceeds on (listings/consignments). The card
    // survives either way; this just makes sure the entry that carries owed money is kept.
    state.pendingGrades = keepWrapped(state.pendingGrades)
    state.listings = keepWrapped(state.listings)
    state.consignments = keepWrapped(state.consignments)
    // Binder holds PLACED copies (out of the collection). It wins over a stray collection
    // duplicate so a corruption-repair never yanks a card you've deliberately slotted.
    state.binder = keepFlat(state.binder)
    state.collection = keepFlat(state.collection)
    state.showInventory = keepFlat(state.showInventory)
    state.shopDisplay = keepFlat(state.shopDisplay)
    state.sealedInventory = keepFlat(state.sealedInventory) // sealed items carry a uid too
    state.showSealed = keepFlat(state.showSealed)           // sealed brought to a show carries a uid too
    state.shopSealed = keepFlat(state.shopSealed)           // sealed on the store shelf carries a uid too
    return state
  },
  // backfill fields added across versions so old saves keep working.
  migrate(state, version) {
    if (!state) return state
    // Saves from v58 on are stored slim (see slimsave.js) — inflate FIRST so every step
    // below reads whole cards. Migrations here compute over card data (v32's retro-credit
    // walks net worth, v43 seeds the shop floor by cardValue); handing them a card with no
    // price would silently mis-migrate. No-op on the fat saves that v1–57 wrote.
    state = inflateState(state)
    // Corrupt-save guard: drop null/garbage entries from every card/item bucket BEFORE any
    // migration step maps over them. A single null in `collection` would otherwise throw
    // inside migrate (e.g. the v32 retro-credit reads card values), which aborts rehydrate
    // and boots the player into a FRESH GAME while their real save sits unreadable in
    // localStorage. merge()'s dedupe runs after migrate, so it can't catch this first.
    for (const k of ['collection', 'binder', 'showInventory', 'sealedInventory', 'showSealed',
      'shopDisplay', 'shopSealed', 'pendingGrades', 'pendingSealed', 'listings', 'consignments',
      'builtPacks', 'imports', 'auctionLots']) {
      if (state[k] !== undefined && Array.isArray(state[k])) {
        state[k] = state[k].filter(x => x && typeof x === 'object')
      }
    }
    if (version < 2) {
      state.notoriety = state.notoriety ?? 0
      state.upgrades = state.upgrades ?? {}
      state.showSeed = state.showSeed ?? 7
      state.boothInbox = state.boothInbox ?? []
      state.showsAttended = state.showsAttended ?? 0
      state.generousActs = state.generousActs ?? 0
    }
    if (version < 3) {
      state.currentDay = state.currentDay ?? 1
      state.monthsElapsed = state.monthsElapsed ?? 0
      state.gradesSubmitted = state.gradesSubmitted ?? 0
    }
    if (version < 4) {
      state.consignments = state.consignments ?? []
      state.wantList = state.wantList ?? []
      state.dailyGoals = state.dailyGoals ?? []
      state.goalsDay = state.goalsDay ?? 0
      // backfill condition on any existing cards
      const fix = c => ({ ...c, condition: c.condition ?? 'NM' })
      state.collection = (state.collection ?? []).map(fix)
    }
    if (version < 5) {
      state.settings = state.settings ?? { openSealedOneByOne: false }
    }
    if (version < 6) {
      state.settings = { openSealedOneByOne: false, ripSpeed: 1, autoAdvance: false, ...(state.settings || {}) }
      state.settings.ripSpeed = state.settings.ripSpeed ?? 1
      state.settings.autoAdvance = state.settings.autoAdvance ?? false
    }
    if (version < 7) {
      state.listings = state.listings ?? []
    }
    if (version < 8) {
      // Backfill the lifetime online-order counter. Existing saves are mid-game, so
      // assume they've already had their first order (don't re-trigger the guarantee).
      state.onlineOrdersEver = state.onlineOrdersEver ?? ((state.currentDay ?? 1) > 5 ? 1 : 0)
    }
    if (version < 10) {
      // Per-set ledger is new — start it empty for existing saves (history before
      // this version isn't attributable to a set, so we begin tracking from now).
      state.bySet = state.bySet ?? {}
    }
    if (version < 11) {
      // Real-time clock migration (now obsolete — v24 cleans it up).
      state.lastTick = Date.now()
      state.settings = { ...(state.settings || {}) }
      state.settings.dayMinutes = state.settings.dayMinutes ?? 15
      // Survival economy. Keep existing cash (don't retro-grant the new $10k start);
      // employ them at the starter job so rent doesn't immediately bury them.
      state.job = state.job ?? STARTER_JOB
      state.pendingJob = state.pendingJob ?? null
      state.rentArrears = state.rentArrears ?? 0
      state.gameOver = state.gameOver ?? false
    }
    if (version < 12) {
      // Full-time readout + brick & mortar employees.
      state.cumWages = state.cumWages ?? 0
      state.cardIncomeLog = state.cardIncomeLog ?? []
      state.employees = state.employees ?? []
      state.storeArrears = state.storeArrears ?? 0
    }
    if (version < 13) {
      // Listings are now browsed by real customers (no pre-rolled willSell / daysLeft
      // countdown). Normalize existing listings to the new shape: drop the timer fields,
      // start their browsing fresh. Old `expired` flag is preserved as awaiting-action.
      state.listings = (state.listings ?? []).map(l => {
        const { willSell, daysLeft, ...rest } = l
        return { ...rest, views: rest.views ?? 0, offers: rest.offers ?? [], age: rest.age ?? 0 }
      })
    }
    if (version < 14) {
      // Show inventory (cards you bring to a show to sell) is new. Existing saves
      // aren't mid-show, so start it empty — no migration of card data needed.
      state.showInventory = state.showInventory ?? []
    }
    if (version < 15) {
      // Livestream feature. Backfill the afterglow window + lifetime tallies.
      state.streamHypeDaysLeft = state.streamHypeDaysLeft ?? 0
      state.streamStats = state.streamStats ?? { streams: 0, tips: 0, peakViewers: 0, breaks: 0 }
    }
    if (version < 16) {
      // Audience fatigue (over-streaming thins your crowd).
      state.streamFatigue = state.streamFatigue ?? 0
    }
    if (version < 17) {
      // Distributor program — the wholesale supply channel.
      state.supplyChannel = state.supplyChannel ?? []
    }
    if (version < 18) {
      // Master-set completion. Start empty; if an existing save already owns a full
      // set, checkCompletions() on next card-add will (correctly) award it then.
      state.completedSets = state.completedSets ?? []
    }
    if (version < 19) {
      // Living market. Start every set at a neutral 1.0× (empty map = neutral) and let
      // it drift from the next day-advance. No history yet — the sparkline fills in.
      state.marketMults = state.marketMults ?? {}
      state.marketHistory = state.marketHistory ?? {}
    }
    if (version < 20) {
      // Store display case. Walk-in customers now buy only from this shelf (you choose
      // what to put out); start it empty for existing saves.
      state.shopDisplay = state.shopDisplay ?? []
    }
    if (version < 21) {
      // Harder economy. The liquidation rates are balance constants (not player choices),
      // so push the tighter values onto existing saves. Quick-sell 0.80→0.65, buylist
      // 0.55→0.45. (Rent/start cash read from module constants live.)
      state.quickSellRate = 0.65
      state.buylistRate = 0.45
      // The active/pending job is a frozen snapshot that still carries its OLD wage; re-resolve
      // it against the current JOBS table so the tighter wages actually apply to this save.
      if (state.job?.id) state.job = jobById(state.job.id) || state.job
      if (state.pendingJob?.job?.id) {
        const j = jobById(state.pendingJob.job.id)
        if (j) state.pendingJob = { ...state.pendingJob, job: j }
      }
    }
    if (version < 22) {
      // Forum board (early-game demand engine) — start empty; it fills on the next day-tick.
      state.forumPosts = state.forumPosts ?? []
      // Tap-to-pay was folded into the Smartphone upgrade and removed as a standalone rail;
      // drop the dead payTap upgrade flag so it no longer shows as an accepted method.
      if (state.upgrades?.payTap) { const up = { ...state.upgrades }; delete up.payTap; state.upgrades = up }
    }
    if (version < 23) {
      // Goals moved from daily to weekly (persist 7 days). Old saves stored goalsDay as a
      // small in-month day number and held a daily-sized goal set; reset both so the next
      // day-tick / mount rolls a fresh weekly set keyed off the absolute day.
      state.dailyGoals = []
      state.goalsDay = 0
      // Quick-sell nerf: instant no-effort dumping was paying 65% of market, too close to
      // properly listing. Drop to 50% (just above the 45% buylist) so it's a convenience
      // tax — listing/consigning should clearly beat it. Balance constant, push onto saves.
      state.quickSellRate = 0.50
    }
    if (version < 24) {
      // Switched from real-time clock to manual "Next Day" button.
      // Convert any in-flight wall-clock grades to day-count: set readyOnDay = currentDay
      // so they resolve on the first resolveGrades() call (in onRehydrateStorage).
      const currentDay = state.currentDay ?? 1
      state.pendingGrades = (state.pendingGrades ?? []).map(p => ({
        ...p,
        readyOnDay: p.readyOnDay ?? currentDay,
        // drop obsolete wall-clock fields
        readyAt: undefined,
        dayMsAtSubmit: undefined,
      }))
      // Remove obsolete real-time settings
      if (state.settings?.dayMinutes !== undefined) {
        const { dayMinutes, ...rest } = state.settings
        state.settings = rest
      }
      // Drop lastTick — no longer used
      delete state.lastTick
    }
    if (version < 25) {
      // Sealed inventory (buy & hold product, rip/list/flip later). New bucket — start
      // empty for existing saves; nothing to migrate (buying still worked, it just ripped
      // on the spot before).
      state.sealedInventory = state.sealedInventory ?? []
    }
    if (version < 26) {
      // Multiple distributors with per-distributor rapport + finite, restocking stock,
      // replacing the single global volume tier. Start fresh: no rapport with anyone,
      // every shelf full (an empty stock map reads as fully stocked).
      state.distributors = state.distributors ?? {}
    }
    if (version < 27) {
      // Decouple the on-buy rip from the rip-animation pacing. `autoAdvance` used to mean
      // BOTH "auto-advance the rip animation" AND "a buy skips inventory and rips now," so
      // anyone who turned Auto-rip on for pacing was silently bypassing the new inventory.
      // Split off `ripOnBuy` and default it OFF for everyone — buying now stocks to inventory
      // regardless of the pacing toggle. (autoAdvance keeps its animation-only meaning.)
      state.settings = state.settings || {}
      state.settings.ripOnBuy = state.settings.ripOnBuy ?? false
    }
    if (version < 28) {
      // Grading day-wrap fix. pendingGrades used to stamp readyOnDay against the in-month
      // currentDay (which resets to 1 every 30 days), so any grade with readyOnDay > 30 —
      // ALWAYS the case for the 45-day economy tier, and for standard/express submitted
      // late in a month — could never be reached, stranding the card + fee forever. Re-base
      // every in-flight grade onto the month-safe absolute day (treat as freshly submitted
      // now) so it resolves within at most tier.days. Never loses a card.
      const today = absoluteDay(state.currentDay ?? 1, state.monthsElapsed ?? 0)
      state.pendingGrades = (state.pendingGrades || []).map(p => {
        const days = GRADING[p.tierKey]?.days ?? 20
        return { ...p, submittedAt: today, readyOnDay: today + days }
      })
    }
    if (version < 29) {
      // Regulars: persistent named customers. Start empty for existing saves — they'll
      // form naturally from the next good deals (see formRegular).
      state.regulars = state.regulars ?? []
    }
    if (version < 30) {
      // Retailers re-themed (local game store + real online sellers). Remap old
      // distributor rapport/stock keys by role so players keep what they built:
      //   sunrise (reliable full catalog) → amazon
      //   prohobby (cases/supply)         → dna
      //   apex (first dibs)               → pokecenter
      //   greg (rotating/clearance)       → lgs
      const remap = { sunrise: 'amazon', prohobby: 'dna', apex: 'pokecenter', greg: 'lgs' }
      const old = state.distributors || {}
      const next = {}
      for (const [id, rec] of Object.entries(old)) next[remap[id] || id] = rec
      state.distributors = next
    }
    if (version < 31) {
      // Recurring show vendors (rapport across the circuit). Seed the roster once; start
      // with no rapport. showVendors holds stable identities, vendorSpend the lifetime deal $.
      if (!state.showVendors?.length) state.showVendors = makeShowVendors()
      state.vendorSpend = state.vendorSpend ?? {}
    }
    if (version < 32) {
      // Milestones (achievement badges). Silently retro-credit everything this save has
      // ALREADY earned — mark them unlocked with no reward/toast flood — so only NEW
      // milestones from here on pay out and announce. pendingMilestones starts empty.
      state.milestones = state.milestones ?? []
      state.pendingMilestones = []
      // Defensive: this is the one migration step that computes over card data (net worth
      // walks the whole collection). If a weird save still trips it, skipping retro-credit
      // is strictly better than aborting the whole migration — milestones re-check on the
      // next action anyway (checkMilestones is called from rips/day-ticks/encounters).
      try {
        const already = newlyUnlocked(state, state.milestones).map(x => x.id)
        if (already.length) state.milestones = [...state.milestones, ...already]
      } catch { /* retro-credit skipped; unlocks arrive naturally with rewards */ }
    }
    if (version < 33) {
      // Channel followers (returning stream audience) + the "Protect set singles"
      // bulk-sell guard. Start followers at 0 and default the guard off so existing
      // saves behave exactly as before until the player opts in.
      state.followers = state.followers ?? 0
      state.settings = state.settings || {}
      state.settings.keepOne = state.settings.keepOne ?? false
    }
    if (version < 34) {
      // Net-worth trend history (Stats sparkline + daily recap), the daily quick-sell
      // counter (diminishing-returns dump penalty), and inventory carrying cost. All new,
      // additive fields — start empty/zero so existing saves behave the same until the next
      // day-advance begins sampling worth and (if over the free allowance) charging storage.
      state.worthHistory = state.worthHistory ?? []
      state.quickSellsToday = state.quickSellsToday ?? 0
    }
    if (version < 35) {
      // Masterset binder — cards you physically slot into a per-set masterset (moved out of
      // the collection, protected from bulk actions). New bucket; start it empty.
      state.binder = state.binder ?? []
    }
    if (version < 36) {
      // Sealed product you bring to a show to sell at your booth. New bucket; start empty
      // (existing saves aren't mid-show, so nothing to migrate).
      state.showSealed = state.showSealed ?? []
    }
    if (version < 37) {
      // Sealed product on your store shelf (walk-ins buy it in person). New bucket; start empty.
      state.shopSealed = state.shopSealed ?? []
    }
    if (version < 38) {
      // Pre-show leads (vendor holds + buyer appointments at upcoming shows). New list;
      // start empty — the next day-advances will generate them.
      state.showLeads = state.showLeads ?? []
    }
    if (version < 39) {
      // In-store services: the consignment case (carry locals' cards for a cut),
      // holds for regulars, and giveaway buzz. All new, additive — start empty/zero.
      state.storeConsignRequests = state.storeConsignRequests ?? []
      state.storeConsignments = state.storeConsignments ?? []
      state.giveawayDaysLeft = state.giveawayDaysLeft ?? 0
    }
    if (version < 40) {
      // Collection buy-ins (locals selling you their cards), store credit, and
      // hosted store events. All new, additive — start empty/zero.
      state.buyinOffers = state.buyinOffers ?? []
      state.storeCredit = state.storeCredit ?? 0
      state.storeEventPlanned = state.storeEventPlanned ?? null
      state.eventCooldownLeft = state.eventCooldownLeft ?? 0
    }
    if (version < 41) {
      // Custom mystery packs: player-built repack product lines. Seed the starter tiers
      // (basic/premium/royal — fully editable), no packs built yet, neutral pack rep.
      state.packTiers = state.packTiers?.length ? state.packTiers : defaultPackTiers()
      state.builtPacks = state.builtPacks ?? []
      state.packRep = state.packRep ?? 50
      state.packStats = state.packStats ?? { built: 0, sold: 0, revenue: 0, delighted: 0, burned: 0 }
    }
    if (version < 42) {
      // ONE store inventory: with a storefront, your collection + sealed inventory ARE the
      // store stock (walk-ins buy from them directly; 🔒 locked = not for sale). The old
      // separate shelf buckets merge home — holds (_heldFor) ride along untouched.
      if ((state.shopDisplay || []).length) {
        state.collection = [...state.shopDisplay, ...(state.collection || [])]
        state.shopDisplay = []
      }
      if ((state.shopSealed || []).length) {
        state.sealedInventory = [...state.shopSealed, ...(state.sealedInventory || [])]
        state.shopSealed = []
      }
    }
    if (version < 43) {
      // Three inventories (Shop Floor / Storeroom / Personal). Every single & sealed row now
      // carries a `loc`. Seed the FLOOR from existing sellable stock so a running store keeps
      // trading through the update: featured pieces first (they were already the case draw),
      // then the highest-value stock, up to the floor's capacity. Everything else falls back
      // to the STOREROOM. Kept (🔒 locked) stock is left as-is → it reads as Personal.
      if (state.upgrades?.storefront) {
        const cap = floorCapacity(state)
        // Candidates for the floor: unlocked, not-held singles + sealed, tagged by kind so we
        // can write the loc back onto the right array afterward.
        const cand = [
          ...(state.collection || []).map((c, i) => ({ kind: 'c', i, v: cardValue(c), feat: !!c._featured, locked: !!c.locked, held: !!c._heldFor })),
          ...(state.sealedInventory || []).map((it, i) => ({ kind: 's', i, v: sealedValue(it), feat: false, locked: !!it.locked, held: !!it._heldFor })),
        ].filter(x => !x.locked && !x.held)
        cand.sort((a, b) => (b.feat - a.feat) || (b.v - a.v))
        const onFloorC = new Set(), onFloorS = new Set()
        for (const x of cand.slice(0, cap)) (x.kind === 'c' ? onFloorC : onFloorS).add(x.i)
        state.collection = (state.collection || []).map((c, i) =>
          c.locked ? c : { ...c, loc: onFloorC.has(i) ? 'floor' : 'storeroom' })
        state.sealedInventory = (state.sealedInventory || []).map((it, i) =>
          it.locked ? it : { ...it, loc: onFloorS.has(i) ? 'floor' : 'storeroom' })
      } else {
        // No storefront yet: no floor exists. Park everything in the storeroom so the moment
        // they open a shop the Store tab is populated and ready to stock.
        state.collection = (state.collection || []).map(c => c.locked ? c : { ...c, loc: c.loc || 'storeroom' })
        state.sealedInventory = (state.sealedInventory || []).map(it => it.locked ? it : { ...it, loc: it.loc || 'storeroom' })
      }
    }
    if (version < 44) {
      // Bulk turn-in now pays LGS store credit (an asset you hold) instead of the old cash
      // buylist/sell-raw exits; and the top of the game turns YOU into a distributor. Both new
      // and additive — start empty. `buylistRate` is retired; leaving a stale copy is harmless.
      state.lgsCredit = state.lgsCredit ?? 0
      state.distributorSince = state.distributorSince ?? null
    }
    if (version < 45) {
      // The DEMAND BOARD: missed walk-in requests aggregate into a "what the town's asking
      // for" panel on the Shop floor. New list; starts empty. (In-flight buy-in offers from
      // older saves also lack the new hidden haggle floor — counterBuyin defaults it.)
      state.demandLog = state.demandLog ?? []
    }
    if (version < 46) {
      // 🧢 Supplies & accessories: the rack starts empty — stock it from the Shop floor tab.
      state.supplies = state.supplies ?? {}
      state.suppliesStats = state.suppliesStats ?? { sold: 0, revenue: 0 }
    }
    if (version < 47) {
      // 🗑️ The Bulk Bin: the storefront's quarter box (the patient alternative to the LGS
      // bulk turn-in). Starts empty at the classic 25¢.
      state.bulkBin = state.bulkBin ?? { price: 0.25, stock: [], sold: 0, revenue: 0 }
    }
    if (version < 48) {
      // 🛍️ Posted buylist policy: every existing shop was running market-standard rates.
      state.buylistPolicy = state.buylistPolicy ?? 'fair'
    }
    if (version < 49) {
      // 📰 Reprint waves: no wave in flight on an old save — the day tick announces the first.
      state.reprintWave = state.reprintWave ?? null
    }
    if (version < 50) {
      // 📣 Announced streams: nothing promised on an old save.
      state.streamPromo = state.streamPromo ?? null
    }
    if (version < 51) {
      // ❤️ Subs / 🎬 clips / 📆 weekly rhythm — the streaming channel becomes a living thing.
      state.subs = state.subs ?? 0
      state.streamClip = state.streamClip ?? null
      state.rhythmStreak = state.rhythmStreak ?? 0
      state.lastStreamDay = state.lastStreamDay ?? null
    }
    if (version < 52) {
      // ⛩️ Import License → 🎌 Japan Direct: shipments on the water. Nothing in transit on an old save.
      state.imports = state.imports ?? []
    }
    if (version < 53) {
      // 🎪 Events Coordinator's standing weekly night — no recurring event chosen on an old save.
      state.weeklyEvent = state.weeklyEvent ?? null
    }
    if (version < 54) {
      // 🧮 Purchasing Agent's reorder points — no minimums set on an old save.
      state.reorderPoints = state.reorderPoints ?? {}
    }
    if (version < 55) {
      // 🏬 Brick-and-mortar branding (name/tagline/icon/accent). New; start from the default
      // identity so an existing store reads as "Your Store 🏬" until the owner customizes it.
      state.store = { name: '', tagline: '', icon: '🏬', accent: '', ...(state.store || {}) }
    }
    if (version < 56) {
      // 🔥 Mystery-pack hype streak. New counter; start at 0 (existing pack lines stay
      // unpublished — an absent tier.published reads as false everywhere).
      state.packStreak = state.packStreak ?? 0
    }
    if (version < 57) {
      // 🗑️ The quarter box became a real demand channel (diggers take handfuls, and an empty
      // box turns kids away). Existing bins start with a clean sheet — nobody's been let down
      // yet, so an old save isn't retroactively in the hole.
      state.bulkBin = { price: 0.25, stock: [], sold: 0, revenue: 0, ...(state.bulkBin || {}), missed: state.bulkBin?.missed ?? 0, dryDays: state.bulkBin?.dryDays ?? 0 }
    }
    // v58 is the slim save format (catalog fields stripped from every card — see
    // slimsave.js). There's no data step: the inflate at the top of this function has
    // already put the catalog back, and the next write goes out slim. The bump exists so
    // the version number honestly tracks the format on disk.
    if (version < 59) {
      // Six new systems land together (one bump per batch, house style):
      //   🔨 auctions      — cards out on the block; nothing in flight on an old save
      //   📇 specialOrders — promises taken at the counter; the book starts empty
      //   🏪 rival         — the shop across town. Left NULL on purpose: the day tick
      //                      opens them the first time it sees a storefront, so an
      //                      existing shop meets them tomorrow with the same fanfare a
      //                      new one gets, instead of silently starting mid-rivalry.
      //   🏬 secondLoc     — the branch; null until the upgrade is bought AND opened
      //   🏅 graders       — a grade with no `company` reads as PSA everywhere
      //                      (slabMultiplier/slabLabel default it), so every slab already
      //                      in a save keeps exactly the value it had. No backfill needed.
      //   🎓 onboarding    — the first-run guide is localStorage-only (a UI preference,
      //                      deliberately not part of the save), so nothing to seed.
      state.auctions = state.auctions ?? []
      state.specialOrders = state.specialOrders ?? []
      state.rival = state.rival ?? null
      state.secondLoc = state.secondLoc ?? null
    }
    if (version < 60) {
      // ⭐/🔥 Reputation rework (two-speed rep): notoriety itself is untouched — it stays
      // the permanent standing every formula reads. New alongside it:
      //   🔥 hype       — fast meter; an old save starts cold (nothing hot happened today)
      //   🎫 clout      — spendable favors; seeded 2 per grandfathered rank below so the
      //                   new toy is usable on day one, matching what rank-ups would pay
      //   🏅 rank       — BANKED tier. GRANDFATHER: every rank the standing already clears
      //                   is granted with deeds waived — a noto-300 save keeps Worlds /
      //                   Dave & Adam's / tournament access permanently (ranks never drop).
      //   📒 repLedger  — ⭐-delta attribution; starts empty (history wasn't tagged)
      //   pendingRanks  — left EMPTY on purpose: no rank-up toast flood on migration
      state.hype = state.hype ?? 0
      // Edge case in the grandfather: Dave & Adam's used to open at ⭐75, but 75-79 only
      // maps to rank 2 and the account is now rank-3-gated — bank rank 3 for those saves
      // so an open wholesale account never closes. (The few days of early national-show
      // access this over-grants is nothing next to losing a distributor.)
      const gRank = Math.max(rankForNotoriety(state.notoriety || 0), (state.notoriety || 0) >= 75 ? 3 : 0)
      state.clout = state.clout ?? (gRank * 2)
      state.rank = state.rank ?? gRank
      state.pendingRanks = state.pendingRanks ?? []
      state.streamBoostNext = state.streamBoostNext ?? false
      state.repLedger = state.repLedger ?? { today: {}, days: [] }
    }
    if (version < 61) {
      // ⚡→🛒 The Pokémon Center MSRP shelf was removed (sells out to bots IRL — a shop owner
      // buys fresh drops scalped like everyone else). A standing order pointed there re-homes
      // to TCGplayer (the every-set-at-market marketplace) so the weekly auto-ship keeps
      // shipping instead of silently going dead; the orphaned rapport record is dropped.
      if (state.standingOrder?.distId === 'pokecenter') state.standingOrder = { ...state.standingOrder, distId: 'tcgplayer' }
      if (state.distributors?.pokecenter) { const { pokecenter, ...rest } = state.distributors; state.distributors = rest }
    }
    if (version < 62) {
      // 🖼️ Masterset showcase rework: completed sets on display draw the shop real traffic,
      // and collectors occasionally offer to buy the intact page at a premium. Nothing to
      // grandfather — the showcase derives live from completedSets + ownership.
      state.binderOffer = state.binderOffer ?? null
      state.binderOfferLastDay = state.binderOfferLastDay ?? 0
    }
    if (version < 63) {
      // 📱 The content batch (8 upgrades): building an audience without going live. Every
      // field is additive and starts empty — an existing save simply hasn't posted anything
      // yet, and nothing here is retroactive (no backdated followers, no free sponsor).
      //   posts/postQueue/postStreak/lastPostDay — the short-form feed + the calendar bank
      //   challenge  — no set declared on an old save
      //   collab     — no guest spots yet; rapport builds from the first one
      //   podcastDay — 0 means "no episode ever", so the first tick with the upgrade records one
      //   sponsor    — nobody's called; the desk rolls its first offer once followers qualify
      state.posts = state.posts ?? []
      state.postQueue = state.postQueue ?? []
      state.postStreak = state.postStreak ?? 0
      state.lastPostDay = state.lastPostDay ?? null
      state.challenge = state.challenge ?? null
      state.collab = state.collab ?? { lastDay: 0, rapport: {} }
      state.podcastDay = state.podcastDay ?? 0
      state.sponsor = state.sponsor ?? null
      state.sponsorLapsedDay = state.sponsorLapsedDay ?? 0
    }
    if (version < 64) {
      // 📜 Rip log + 🎲 luck tracking. Neither is backfilled, deliberately. The log can't invent
      // rips it never watched, and the luck panel counts against its own per-set `luckPacks`
      // denominator rather than lifetime packsOpened — reusing packsOpened would open an existing
      // save on a spectacular cold streak it never actually had.
      state.ripLog = state.ripLog ?? []
    }
    if (version < 65) {
      // Seven systems land together (one bump per batch, house style). Every field is
      // additive and every one starts empty, because none of them can be honestly backdated:
      //   🔨 auctionLots  — the buy-side board. The day tick fills it tomorrow.
      //   🧾 books        — THE QUARTER STARTS TODAY. Deliberately not backdated: billing an
      //                     existing save for a quarter it played under no tax rules would be
      //                     charging for the past. The first bill lands 90 days from now.
      //   🏦 loan         — nobody is carrying a note, and nobody has defaulted.
      //   📦🔟 pendingSealed — no sealed product is out at a grader.
      //   📊 popAdds      — the census counts YOUR submissions, and an old save's slabs were
      //                     minted before the census existed. Starting at zero means those
      //                     slabs keep exactly the value they had; only new ones report in.
      //   🖨️ misprints    — errors come out of packs, so they arrive with the next rip. No
      //                     card already in a collection is retroactively a misprint.
      //   🎯 stats.cracks / stats.misprints — new counters, from zero.
      // Seeded rather than left empty, for the same reason a fresh game seeds it: an existing
      // save should find the board already running, not a blank panel that fills tomorrow.
      const lotDay = absoluteDay(state.currentDay ?? 1, state.monthsElapsed ?? 0)
      state.auctionLots = state.auctionLots ?? refillLots([], state.notoriety || 0, lotDay)
      state.auctionLotsDay = state.auctionLotsDay ?? lotDay
      state.auctionStats = state.auctionStats ?? { won: 0, lost: 0, spent: 0, burned: 0 }
      state.books = state.books ?? freshBooks(absoluteDay(state.currentDay ?? 1, state.monthsElapsed ?? 0))
      state.loan = state.loan ?? null
      state.loanDefaultedUntil = state.loanDefaultedUntil ?? 0
      state.pendingSealed = state.pendingSealed ?? []
      state.sealedGradesSubmitted = state.sealedGradesSubmitted ?? 0
      state.popAdds = state.popAdds ?? {}
      state.stats = { cracks: 0, misprints: 0, ...(state.stats || {}) }
    }
    return state
  },
  // The pricing engine holds the live market multipliers in module state, which is empty
  // on every page load. Re-push the rehydrated map so saved drift survives a refresh.
  // Also resolve any grades that became ready on or before currentDay (handles migrated saves).
  onRehydrateStorage() {
    return (state) => {
      if (!state) return
      setMarketMults(state.marketMults || {})
      // 📊 The census of your own submissions lives in engine module state for the same
      // reason the market multipliers do: pricing is synchronous and cannot reach the store.
      // Re-push it or every slab you have ever sent back would price as though the census
      // were untouched.
      setPopAdds(state.popAdds || {})
      // Re-seed the module-level offer-id counter past the highest persisted offer id.
      // The counter resets to 0 on every page load but offers persist inside listings, so
      // without this the first post-reload offer would reuse id 1 — colliding with a
      // persisted offer and making accept/decline match (or drop) the wrong one.
      let maxOffer = 0
      for (const l of (state.listings || [])) for (const o of (l.offers || [])) if (typeof o.id === 'number' && o.id > maxOffer) maxOffer = o.id
      seedOfferId(maxOffer)
      // Same for the booth inbox: seed the id counter past the highest persisted id, then
      // backfill an id onto any pre-fix order that predates ids — so identity-based clear /
      // authenticate can't hit the wrong (or a shifted-away) slot after a resolve/prune.
      let maxInbox = 0
      for (const e of (state.boothInbox || [])) { const n = typeof e.id === 'string' && e.id.startsWith('ib') ? parseInt(e.id.slice(2), 10) : 0; if (n > maxInbox) maxInbox = n }
      seedInboxId(maxInbox)
      for (const e of (state.boothInbox || [])) if (!e.id) e.id = nextInboxId()
      // Settle any grades whose readyOnDay <= currentDay (e.g. migrated from wall-clock).
      state.resolveGrades?.()
    }
  },
}))
