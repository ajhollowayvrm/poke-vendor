// The store's initial (fresh-game) state.
//
// A FACTORY, not a constant: each call returns fresh arrays/objects (and a freshly-seeded
// showVendors roster) so it can safely seed BOTH the store's first-run state (index.js) AND
// the reset() action (economy slice) without the two sharing mutable references. Keeping it
// here means the field list lives in exactly ONE place — previously the initial-state block
// and reset() duplicated it, and could drift apart.
//
// This holds ONLY data fields. Actions live in the slice modules; the few rate props that
// historically sit alongside actions (quickSellRate, buylistRate, SHOWCASE_MAX) stay in
// their slices and intentionally survive a reset.

import { STARTING_CASH, STARTER_JOB } from './constants'
import { makeShowVendors } from '../shows'

export function initialState() {
  return {
    cash: STARTING_CASH,
    collection: [],          // owned cards (instances)
    pendingGrades: [],       // {card, tierKey, readyOnDay, submittedAt, paidFee}
    history: [],             // {t, type, detail, amount}
    stats: { packsOpened: 0, cardsPulled: 0, hits: 0, spent: 0, earned: 0, bestPull: null },
    // Per-set ledger: { [setId]: { spent, pulledValue, packsOpened, cardsPulled, hits } }.
    // `spent` = cash put into that set's sealed product; `pulledValue` = market value of
    // everything ripped from it. Drives the per-set analytics on the Stats page.
    bySet: {},
    // Set ids you've EVER completed (own one of every card) — the first-time completion
    // bonus pays once and is recorded here permanently, even if you later sell a card.
    completedSets: [],
    // Living market: per-set price multiplier (default 1.0, bounded ~0.6–1.8×) that drifts
    // each game-day and rides through cardValue/rawValue so every price moves together.
    // marketHistory keeps a short ring of recent mults per set for the Prices-tab sparkline.
    // The engine holds the live copy (module-level); we re-push it on rehydrate.
    marketMults: {},
    marketHistory: {},

    notoriety: 0,            // 0..100+, drives traffic, deals, show tiers
    upgrades: {},            // { signage:true, ... }
    showSeed: 7,             // seed for the current month's calendar
    currentDay: 1,           // calendar day; attending a show advances this
    monthsElapsed: 0,        // how many calendars have rolled (for display)
    boothInbox: [],          // pending encounters waiting at your home shop
    onlineOrdersEver: 0,     // lifetime count of online orders received (stats/telemetry)
    showsAttended: 0,
    streamHypeDaysLeft: 0,   // days of post-stream "afterglow" left (boosts ALL listing traffic)
    streamFatigue: 0,        // audience fatigue: +1 per stream, −1 per game-day of rest (drives viewer falloff)
    streamStats: { streams: 0, tips: 0, peakViewers: 0, breaks: 0 }, // lifetime livestream tallies
    generousActs: 0,
    gradesSubmitted: 0,      // total cards ever sent to the grader → loyalty tier
    consignments: [],        // {card, net, daysLeft} — pays out (net) when daysLeft hits 0 on day-advance
    listings: [],            // {card, ask, net, askMult, views, offers:[], age, stale?, expired?} — browsed by customers
    showInventory: [],       // cards you brought to the CURRENT show to sell — floor buyers only see these; unsold ones come home when you leave
    shopDisplay: [],         // cards on your STORE shelf — walk-in customers only buy/offer on these (you choose what to put out). Needs a storefront.
    supplyChannel: [],       // {label, net, daysLeft} — sealed product wholesaled to other vendors (distributor perk); pays out (net) as days pass
    distributors: {},        // { [distId]: { spend, stock:{ 'setId|type': {q,cap} } } } — per-distributor rapport ($ spent) + finite stock that restocks over days
    sealedInventory: [],     // {uid, setId, product, boughtDay, boughtPrice, vintage} — sealed product you HOLD (buy now, rip/list/flip later). Value rides the set's market mult; vintage appreciates.
    wantList: [],            // active collector wants who sought YOU out (notoriety-gated)
    regulars: [],            // persistent named customers (online/walkin) with a focus + trust; born from good deals
    showVendors: makeShowVendors(), // recurring named dealers you meet across shows; { id,name,archetype,spend } — rapport builds with deals
    vendorSpend: {},         // { [vendorId]: lifetime $ dealt with that show vendor } → rapport tier
    forumPosts: [],          // public WTB board — anyone-can-fill wants; your early-game demand engine
    dailyGoals: [],          // {key,label,target,progress,reward,done} for currentDay
    goalsDay: 0,             // which day dailyGoals were generated for
    milestones: [],          // ids of permanently-unlocked achievement badges (see game/milestones.js)
    pendingMilestones: [],   // ids unlocked but not yet announced — App drains this into toasts
    // Survival economy: a day job pays a daily wage, rent drains it. job=null means full-time
    // vendor (no wage). pendingJob holds a freshly-taken job until it starts (re-apply friction).
    // rentArrears = consecutive days behind on rent; past RENT_GRACE_DAYS with nothing to sell → gameOver.
    job: STARTER_JOB,
    pendingJob: null,        // { job, startsOnDay }
    rentArrears: 0,
    gameOver: false,
    cumWages: 0,             // lifetime wages earned — subtracted from stats.earned to isolate CARD income
    _cardAccrual: 0,         // card income accrued since the last day-tick (flushed into cardIncomeLog)
    cardIncomeLog: [],       // ring of recent per-day card-income deltas (for the full-time runway readout)
    employees: [],           // hired employee ids (brick & mortar) — each is daily payroll + throughput
    storeArrears: 0,         // consecutive days unable to cover store overhead → lose the store
    // Rip/UI prefs. ripSpeed: reveal-speed multiplier (1 = normal, >1 faster, <1 slower).
    // autoAdvance ("Auto-rip"): once a rip is underway, auto-start the next reveal. PACING ONLY.
    // ripOnBuy: a buy skips inventory and rips immediately. Off by default → buying STOCKS to inventory.
    // revealMode: 'auto' flips cards on a timer; 'manual' waits for you to tap each one.
    // sound/haptics: synthesized rip SFX + phone vibration (see game/feedback.js).
    settings: { openSealedOneByOne: false, ripSpeed: 1, autoAdvance: false, ripOnBuy: false, revealMode: 'auto', sound: true, haptics: true },
  }
}
