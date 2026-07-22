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
import { defaultPackTiers } from '../mysterypacks'

export function initialState() {
  return {
    cash: STARTING_CASH,
    // Owned cards (instances). With a storefront each carries a `loc` ('floor' | 'storeroom')
    // splitting it into Shop Floor (the only stock walk-ins/counter buy) vs Storeroom backstock;
    // a `locked` card is PERSONAL (kept, not for sale). Missing loc reads as storeroom. See the
    // three-inventory notes in constants.js (floorCapacity) + the migration in index.js (v43).
    collection: [],
    binder: [],              // cards physically slotted into your masterset binder — moved OUT of the collection (protected from bulk actions); one per {set,card,variant} slot

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
    // Rolling net-worth / cash trend: one {d, worth, cash} sample per day-advance,
    // capped to WORTH_HISTORY_LEN. Powers the Stats trend sparkline + the daily recap.
    worthHistory: [],
    // Quick-sells done TODAY. Dumping many cards at once floods the buylist and each
    // subsequent quick-sell pays a little less (diminishing returns). Reset every day.
    quickSellsToday: 0,
    giveawaysToday: 0,      // giveaways done today — each successive one pays less rep (anti-farm). Reset daily.

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
    followers: 0,            // channel followers: your returning audience — a reliable baseline crowd that grows with good streams
    streamStats: { streams: 0, tips: 0, peakViewers: 0, breaks: 0 }, // lifetime livestream tallies
    streamEscrow: null,      // live-session escrow: { entries:[{invUid,item,packs,packsDone,spotGross}], ts } — non-null = ON AIR; settled at endStream or boot rescue
    generousActs: 0,
    gradesSubmitted: 0,      // total cards ever sent to the grader → loyalty tier
    consignments: [],        // {card, net, daysLeft} — pays out (net) when daysLeft hits 0 on day-advance
    listings: [],            // {card, ask, net, askMult, views, offers:[], age, stale?, expired?} — browsed by customers
    showInventory: [],       // cards you brought to the CURRENT show to sell — floor buyers only see these; unsold ones come home when you leave
    showSealed: [],          // SEALED product you brought to the current show to sell at your booth — floor buyers can buy it; unsold comes home (to sealedInventory) when you leave
    showReserve: 0,          // cash you deliberately LEFT AT HOME when attending a show: while the show is active, `cash` holds only what you brought (your floor wallet); endShow() folds this back in. Counted in net worth so leaving money home never reads as losing it.
    shopDisplay: [],         // LEGACY (pre-v42): cards once lived on a separate store shelf. With a storefront the whole COLLECTION is store stock now (🔒 locked = not for sale, _featured = display-case spotlight, _heldFor = behind the counter). Kept empty for save-merge compat.
    shopSealed: [],          // LEGACY (pre-v42): sealed shelf — sealedInventory IS the store's sealed stock now. Kept empty for save-merge compat.
    storeConsignRequests: [], // locals waiting on an answer: {id, who, card, ask, commissionPct, days, pendingDays} — carry their card for a cut, or pass
    storeConsignments: [],   // cards you're carrying for locals: {id, who, card, ask, commissionPct, daysLeft} — NOT yours; a sale pays your commission, unsold goes home
    giveawayDaysLeft: 0,     // store buzz window (giveaways + hosted events): walk-in traffic boost days remaining
    buyinOffers: [],         // locals selling YOU their cards: {id, who, hint, cards, askCash, estimate, estimateTight, pendingDays} — pay cash or store credit
    buylistPolicy: 'fair',   // the posted "we pay ~X%" sign (BUYLIST_POLICIES): volume-vs-margin dial on walk-in collections
    demandLog: [],           // the DEMAND BOARD: walk-in requests you couldn't fill — {what, kind, setId, day}; a fortnight's worth, surfaced on the Shop floor tab so you stock what the town wants
    storeCredit: 0,          // outstanding store credit you've issued (a liability — drains from counter takings as locals spend it; counts against net worth)
    lgsCredit: 0,            // in-store credit YOU hold at the Local Game Store (an ASSET) — earned by turning in bulk at 5¢/card, spent automatically on LGS purchases
    // Distributor credit line: buy sealed on credit (net terms) and carry a revolving balance.
    // balance = what you owe (principal + accrued interest); frozen = line suspended after a
    // missed monthly minimum (cash-only until you catch up). Limit scales with net worth.
    credit: { balance: 0, frozen: false },
    distributorSince: null,  // absolute day you first became a distributor (Household Name + millionaire); null until then. Gates the passive wholesale income + the one-time unlock notice.
    storeEventPlanned: null, // tonight's hosted event: {type, cost, prizeCard?} — resolves on the next day-advance
    eventCooldownLeft: 0,    // days before you can host another event
    packTiers: defaultPackTiers(), // your mystery-pack PRODUCT LINES: {id,name,icon,price,bandLo,bandHi,channels:{show,store,online,stream}} — price + advertised band are yours to set
    builtPacks: [],          // assembled mystery packs: {uid, tierId, cards:[...], sealed:[...], builtDay} — contents moved OUT of collection/inventory; sold sight-unseen at the tier price
    packRep: 50,             // 0..100 repack reputation (50 = unproven) — moved by what buyers find inside; drives pack demand
    packStats: { built: 0, sold: 0, revenue: 0, delighted: 0, burned: 0 }, // lifetime mystery-pack tallies
    // 🎰 The Pack Machine: a vending fixture you STOCK with real individual booster packs and
    // set ONE flat price for. Walk-ins pay that price for a RANDOM pack out of it — a sealed-pack
    // mystery box. `stock` holds full sealed items moved out of sealedInventory (one bucket per uid).
    packMachine: { price: 0, stock: [], sold: 0, revenue: 0 },
    // 🗑️ The Bulk Bin: the quarter box kids dig through. Toss raw cheap cards in (they move
    // OUT of the collection, like machine stock), set one flat price, and it drains daily
    // with foot traffic — the patient 5× alternative to the instant LGS bulk turn-in.
    bulkBin: { price: 0.25, stock: [], sold: 0, revenue: 0 },
    supplies: {},            // 🧢 accessory rack stock, { [supplyId]: qty } — fungible units bought wholesale (SUPPLIES in constants.js), sold at retail through the counter; storage-fee exempt
    suppliesStats: { sold: 0, revenue: 0 }, // lifetime accessory tallies (Shop floor readout)
    supplyChannel: [],       // {label, net, daysLeft} — sealed product wholesaled to other vendors (distributor perk); pays out (net) as days pass
    distributors: {},        // { [distId]: { spend, stock:{ 'setId|type': {q,cap} } } } — per-distributor rapport ($ spent) + finite stock that restocks over days
    standingOrder: null,     // 📋 { distId, setId, type, qty, lastDay } — one product on weekly auto-ship from a distributor (Standing Order upgrade)
    // 📰 The active (or just-finished, cooling-down) reprint wave: hot sets restock in
    // announced waves — preorder window (allocCap via rapport, locals pay deposits), then
    // drop day lands the stock + a launch rush. null until the first announcement.
    reprintWave: null,
    sealedInventory: [],     // {uid, setId, product, boughtDay, boughtPrice, vintage} — sealed product you HOLD (buy now, rip/list/flip later). Value rides the set's market mult; vintage appreciates.
    wantList: [],            // active collector wants who sought YOU out (notoriety-gated)
    showLeads: [],           // pre-show DMs: vendors holding an item for you / buyers arranging to meet you AT an upcoming show. Claimed on entry (→ activeShow._leads); expire if the show passes unattended.
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
    // keepOne ("Protect set singles"): bulk sells skip your last copy of each card so a
    // sweep only dumps duplicates — the master-set safety net (see engine.bulkSellableUids).
    // binderReserveCut: a CEILING — a raw copy whose cut is at/above this tier is held OUT of the
    // masterset (by hand or by the overnight Curator), free to grade & sell; only lesser copies get
    // filed. 'off' by default = file everything, which is how the binder behaved before it existed.
    settings: { openSealedOneByOne: false, ripSpeed: 1, autoAdvance: false, ripOnBuy: false, revealMode: 'auto', sound: true, haptics: true, keepOne: false,
      binderReserveCut: 'off',
      // Deal detector (needs the 🤝 Dealer Network upgrade to show). Defaults reproduce the
      // old "15%+ under market, any card" rule; customize what YOU call a deal.
      dealMaxMult: 0.85, dealCondition: 'any', dealUngradedOnly: false, dealMinValue: 0, dealCut: 'any' },
  }
}
