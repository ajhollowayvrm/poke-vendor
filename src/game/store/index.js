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

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { GRADING, setMarketMults } from '../engine'
import { makeShowVendors } from '../shows'
import { jobById, STARTER_JOB, absoluteDay } from './constants'
import { seedOfferId } from './ids'
import { initialState } from './initialState'
import { createEconomySlice } from './economy'
import { createCollectionSlice } from './collection'
import { createSellingSlice } from './selling'
import { createSourcingSlice } from './sourcing'
import { createBoothSlice } from './booth'
import { createLivestreamSlice } from './livestream'

// Re-export the public API (constants + pure helpers) so `import { ... } from '../game/store'`
// keeps resolving every symbol components use (PAYMENT_METHODS, UPGRADES, JOBS, absoluteDay, …).
export * from './constants'

export const useGame = create(persist((set, get) => ({
  ...initialState(),
  ...createEconomySlice(set, get),
  ...createCollectionSlice(set, get),
  ...createSellingSlice(set, get),
  ...createSourcingSlice(set, get),
  ...createBoothSlice(set, get),
  ...createLivestreamSlice(set, get),
}), {
  name: 'poke-vendor-save',
  version: 31,
  // Runs on EVERY load (after migrate). Dedupe any card uid that somehow appears in
  // more than one bucket (collection / pendingGrades / listings / consignments) — a
  // card can only be in one place at a time. First-seen wins, in that priority order.
  merge(persisted, current) {
    const state = { ...current, ...(persisted || {}) }
    const seen = new Set()
    const keepFlat = (arr) => (arr || []).filter(c => c?.uid && !seen.has(c.uid) && seen.add(c.uid))
    const keepWrapped = (arr) => (arr || []).filter(e => e?.card?.uid && !seen.has(e.card.uid) && seen.add(e.card.uid))
    // Priority: the IN-FLIGHT money-bearing buckets win over a stray collection duplicate,
    // so a corruption-repair never silently discards a card you've already paid a grading
    // fee for (pendingGrades) or are owed proceeds on (listings/consignments). The card
    // survives either way; this just makes sure the entry that carries owed money is kept.
    state.pendingGrades = keepWrapped(state.pendingGrades)
    state.listings = keepWrapped(state.listings)
    state.consignments = keepWrapped(state.consignments)
    state.collection = keepFlat(state.collection)
    state.showInventory = keepFlat(state.showInventory)
    state.shopDisplay = keepFlat(state.shopDisplay)
    state.sealedInventory = keepFlat(state.sealedInventory) // sealed items carry a uid too
    return state
  },
  // backfill fields added across versions so old saves keep working.
  migrate(state, version) {
    if (!state) return state
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
    return state
  },
  // The pricing engine holds the live market multipliers in module state, which is empty
  // on every page load. Re-push the rehydrated map so saved drift survives a refresh.
  // Also resolve any grades that became ready on or before currentDay (handles migrated saves).
  onRehydrateStorage() {
    return (state) => {
      if (!state) return
      setMarketMults(state.marketMults || {})
      // Re-seed the module-level offer-id counter past the highest persisted offer id.
      // The counter resets to 0 on every page load but offers persist inside listings, so
      // without this the first post-reload offer would reuse id 1 — colliding with a
      // persisted offer and making accept/decline match (or drop) the wrong one.
      let maxOffer = 0
      for (const l of (state.listings || [])) for (const o of (l.offers || [])) if (typeof o.id === 'number' && o.id > maxOffer) maxOffer = o.id
      seedOfferId(maxOffer)
      // Settle any grades whose readyOnDay <= currentDay (e.g. migrated from wall-clock).
      state.resolveGrades?.()
    }
  },
}))
