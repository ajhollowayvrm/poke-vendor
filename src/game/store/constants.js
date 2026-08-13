// Store constants & pure data tables.
//
// Everything here is PURE — data tables and functions with no access to the store's
// set/get. These are the game's tuning knobs and reference tables, split out of the old
// monolithic store so they can be imported by any slice (and re-exported from the store's
// public surface for components). If you're looking for "what does X cost / how big is the
// window / what are the odds", it's here.
//
// Contents:
//   • Survival economy: STARTING_CASH, RENT_PER_DAY, JOBS, RENT_GRACE_DAYS, INCOME_WINDOW_DAYS
//   • Brick & mortar:   STORE_LEASE_PER_DAY, STORE_GRACE_DAYS, EMPLOYEES
//   • Payments:         PAYMENT_METHODS, acceptedMethods, processingFee, netsZero
//   • Calendar/inbox:   CALENDAR_DAYS, INBOX_CAP, absoluteDay
//   • Weekly goals:     GOAL_POOL, GOAL_PERIOD_DAYS, makeWeeklyGoals
//   • Fame curve:       fameMult, fameBeyond (re-exported from engine) — the one dial notoriety turns
//   • Demand gates:     INBOUND_NOTORIETY_GATE, REGULAR_FORM_GATE, BARGAIN_ASK_MULT, dayOrderRate
//   • Livestream:       STREAM_HYPE_DAYS
//   • Upgrades table:   UPGRADES

import { round2, fameMult } from '../engine'

export const STARTING_CASH = 2500

// --- Survival economy ------------------------------------------------------
// Each game-day you earn your job's wage and pay rent. The job is a SAFETY NET, not a
// living: it's tuned to barely clear rent, so working it keeps the lights on but builds
// almost no wealth — the only real way up is cards. Going full-time means giving up that
// thin cushion, so it's a real decision. Run out of money with nothing left to sell → lose.
export const RENT_PER_DAY = 40
// Cost of living CREEPS UP: every month elapsed adds this to the daily rent. A fixed job
// wage (the starter clerk clears rent by +$5/day at month 0) stops covering it within a
// couple of months, so idling on a job is no longer free — card income has to grow.
export const RENT_MONTHLY_HIKE = 10
export function rentPerDay(monthsElapsed = 0) {
  return RENT_PER_DAY + Math.max(0, monthsElapsed || 0) * RENT_MONTHLY_HIKE
}
// Low-level jobs, ascending wage. Better jobs gate behind notoriety (you're more
// hireable as your name gets around). Wage is per game-day. `start` = days until a
// newly-taken job begins paying (re-apply friction); the starter job starts instantly.
// Wages are deliberately thin vs the $40/day rent: the starter clerk nets just +$5/day,
// and even the top job is a grind, not a path — cards are where the money is.
export const JOBS = [
  { id: 'none',     title: 'Unemployed',          wage: 0,   minNoto: 0,   start: 0 },
  { id: 'retail',   title: 'Card shop clerk',     wage: 45,  minNoto: 0,   start: 0 },
  { id: 'barista',  title: 'Barista',             wage: 60,  minNoto: 10,  start: 1 },
  { id: 'warehouse',title: 'Warehouse picker',    wage: 80,  minNoto: 25,  start: 1 },
  { id: 'manager',  title: 'Retail manager',      wage: 115, minNoto: 60,  start: 2 },
  { id: 'broker',   title: 'Card-shop buyer',     wage: 160, minNoto: 120, start: 2 },
]
export const STARTER_JOB = JOBS.find(j => j.id === 'retail')
export function jobById(id) { return JOBS.find(j => j.id === id) || null }
// Days you can stay behind on rent before it's game over (the grace/comeback window).
export const RENT_GRACE_DAYS = 3

// --- Distributor credit line ------------------------------------------------
// Buy sealed on credit and carry a revolving balance you pay down monthly. The line
// scales with net worth (they lend against what you're worth); the balance accrues
// interest each month, a minimum is auto-paid from cash at each month rollover, and
// missing it freezes the line (cash-only) plus a small rep ding until you catch up.
export const CREDIT_LIMIT_PCT = 0.5      // credit line = 50% of (debt-free) net worth
export const CREDIT_MONTHLY_RATE = 0.04  // 4%/mo interest applied to the carried balance
// 🏦 Preferred Account: the distributor finance desk matures — cheaper carry, deeper line.
export function creditMonthlyRate(upgrades) { return upgrades?.preferredAccount ? 0.025 : CREDIT_MONTHLY_RATE }
export function creditLimitPct(upgrades) { return upgrades?.preferredAccount ? 0.65 : CREDIT_LIMIT_PCT }
export const CREDIT_MIN_PCT = 0.10       // monthly minimum = 10% of the balance...
export const CREDIT_MIN_FLOOR = 50       // ...but at least this much (capped at the balance)
export const CREDIT_MISS_NOTORIETY = 3   // small notoriety hit when you miss the minimum
// Rolling window (game-days) used to estimate your card income/day for the full-time
// sustainability readout. Long enough to smooth out spiky sale days.
export const INCOME_WINDOW_DAYS = 7

// --- Inventory carrying cost (an idle sealed hoard BITES) --------------------
// Sitting on a case of unsold boxes isn't free — you're renting space and capital
// is frozen. You get a free allowance; every IDLE sealed unit beyond it drains a
// small daily fee, keeping "buy the whole case and let it ripen in the back" a
// real decision. The fee taxes ONLY the idle hoard, never active selling:
//   COUNTED — sealed sitting in the back, unsold and unspoken-for.
//   EXEMPT  — floor sealed (out for sale in space the lease already pays for),
//             live listings + consignments (actively selling / not your stock),
//             built packs (store product, like the pack machine + bulk bin +
//             supplies rack), 🔒 kept sealed (frozen capital is already the
//             cost of a keepsake), and _heldFor (promised to a regular).
export const STORAGE_FREE_UNITS = 15   // free idle-sealed allowance without a storefront
export const STORAGE_STORE_BONUS = 25  // a leased storeroom holds this much more for free
export const STORAGE_PER_UNIT = 2      // $/day for each idle unit beyond the allowance
// The free allowance scales with your footprint: a storefront's lease is already
// paying for a real storeroom, so it shouldn't bill like an apartment closet.
export function storageFreeUnits(s) {
  return STORAGE_FREE_UNITS + (s?.upgrades?.storefront ? STORAGE_STORE_BONUS : 0)
    + (s?.upgrades?.storageUnit ? STORAGE_UNIT_BONUS : 0) // 🏗️ a rented unit down the road
    + ((s?.rank || 0) >= 4 ? RANK_STORAGE_BONUS : 0)      // 🏛️ Hobby Fixture banked perk
}
// 🏗️ Storage Unit upgrade: +allowance ONLY — the heldUnits definition (what counts as an
// idle unit, what's exempt) is pinned by sim section 5 and must never widen here.
export const STORAGE_UNIT_BONUS = 15
// 🏛️ Rank 4 banked perk — same rule as the Storage Unit: allowance only, never heldUnits.
export const RANK_STORAGE_BONUS = 5
// Loose packs RACK: 36 single-pack units fit the shelf space of one box (that's literally
// what a box is), so billing each loose pack as a full unit would charge 36× for the crime
// of breaking early. Backstock boosters bill by the tray, not the pack.
export const PACKS_PER_RACK = 36
// Idle sealed units right now (drives the fee + the finance readout). Pre-v43 rows
// with no `loc` read as storeroom — for a flipper with no store, everything's "the back".
export function heldUnits(s) {
  const idle = (s.sealedInventory || []).filter(it => it.loc !== 'floor' && !it.locked && !it._heldFor)
  const loose = idle.reduce((n, it) => n + ((it.product?.packs || 1) === 1 ? 1 : 0), 0)
  return (idle.length - loose) + Math.ceil(loose / PACKS_PER_RACK)
}
// Daily storage fee for the current idle hoard (0 while under the free allowance).
export function storageFee(s) {
  if (s.upgrades?.vault) return 0 // 🏛️ The Vault & Showroom — storage is a solved problem
  const over = Math.max(0, heldUnits(s) - storageFreeUnits(s))
  return round2(over * STORAGE_PER_UNIT)
}

// --- Three inventories: Shop Floor / Storeroom / Personal -------------------
// With a storefront your stock lives in three places, tracked by a per-item `loc`:
//   • 'floor'     — out on the SALES FLOOR. The ONLY stock walk-ins & the counter can buy.
//                   Capacity-limited (floorCapacity) — a real shop floor only holds so much.
//   • 'storeroom' — backstock (the default for anything you buy). Safe, but sells nothing
//                   until you move it out front. This is what makes merchandise actually MOVE.
//   • (personal)  — NOT a loc value: "Personal" = your keepsakes, modelled by the existing
//                   `locked` (🔒 not-for-sale) flag + the masterset binder. Locked stock is
//                   already excluded from every sell path, so Personal needs no new plumbing.
// Singles (collection) and sealed rows (sealedInventory) both carry `loc`. A pre-v43 save
// with no `loc` reads as storeroom; the v43 migration seeds the floor from existing stock.
export const FLOOR_BASE = 60         // sales-floor slots before any upgrades
export const FLOOR_CASES_BONUS = 30  // 🗄️ Glass Display Cases add shelf space
export const FLOOR_VAULT_BONUS = 60  // 🏛️ The Vault & Showroom's lit showroom floor
// How many items fit on the sales floor right now (0 without a storefront — no floor exists).
export function floorCapacity(s) {
  if (!s?.upgrades?.storefront) return 0
  return FLOOR_BASE + (s.upgrades.cases ? FLOOR_CASES_BONUS : 0) + (s.upgrades.vault ? FLOOR_VAULT_BONUS : 0)
}
// One sellable item is "on the floor": loc==='floor', not kept (locked), not held for a regular.
export const onFloor = (it) => it?.loc === 'floor' && !it?.locked && !it?._heldFor
// Items currently occupying floor slots (held-for-a-regular still counts — it came off a slot).
export function floorCount(s) {
  const f = (arr) => (arr || []).filter(x => x.loc === 'floor' && !x.locked).length
  return f(s.collection) + f(s.sealedInventory)
}
export function floorFreeSlots(s) { return Math.max(0, floorCapacity(s) - floorCount(s)) }

// --- Per-SKU floor depth (replaces the old flat slot ceiling) ----------------
// A real shop floor limits DEPTH per line, not total count: you show a few copies of each
// card/product, not fifty of one common. So the floor cap is per-SKU (how many of ONE thing
// can be out at once), with unlimited VARIETY. Vintage sealed is exempt — it lives in its own
// bucket (display-worthy; show as many as you like). Upgrades add depth, not a global ceiling.
export const FLOOR_SKU_BASE = 4       // copies of one SKU out on the floor at once
export const FLOOR_SKU_CASES = 2      // 🗄️ Glass Display Cases add depth
export const FLOOR_SKU_VAULT = 2      // 🏛️ The Vault & Showroom adds more
export function floorSkuCap(s) {
  if (!s?.upgrades?.storefront) return 0
  return FLOOR_SKU_BASE + (s.upgrades.cases ? FLOOR_SKU_CASES : 0) + (s.upgrades.vault ? FLOOR_SKU_VAULT : 0)
}
// Loose booster packs are the exception: a real shop puts out a whole bin of them, not a few of
// each. So single-pack sealed gets its own, much deeper depth — and that depth is a BUILD-OUT you
// purchase: a storefront starts with a modest bin, and the 🧺 Pack Bin / 🧱 Wall of Packs upgrades
// deepen it. Everything else — singles, boxes, ETBs — uses the standard per-SKU cap above.
export const FLOOR_PACK_BASE = 12     // loose packs on the floor with just a storefront
export const FLOOR_PACK_BIN = 12      // 🧺 Pack Bin adds depth
export const FLOOR_PACK_WALL = 12     // 🧱 Wall of Packs adds more
export function isLoosePackItem(kind, it) { return kind === 'sealed' && (it?.product?.packs || 0) === 1 }
// The floor depth cap for a SPECIFIC item — loose packs get the (upgradeable) bin, everything else
// the standard cap. Use this (not floorSkuCap) wherever a real item is in hand.
export function floorItemCap(s, kind, it) {
  const base = floorSkuCap(s)
  if (base <= 0) return 0
  if (isLoosePackItem(kind, it)) {
    return FLOOR_PACK_BASE + (s.upgrades.packBin ? FLOOR_PACK_BIN : 0) + (s.upgrades.packWall ? FLOOR_PACK_WALL : 0)
  }
  return base
}
// A vintage sealed pack/box is exempt from the per-SKU depth cap (its own bucket).
export function isVintageFloorItem(kind, it) { return kind === 'sealed' && !!it?.vintage }
// SKU identity for the depth cap: a card by its printing, a sealed row by set + product type.
export function floorSkuKey(kind, it) {
  return kind === 'sealed' ? `s:${it.setId}:${it.product?.type || ''}` : `c:${it.id || it.uid}`
}
// Current floor DEPTH per SKU (non-vintage only; vintage is uncapped and not counted).
export function floorSkuCounts(s) {
  const m = new Map()
  const add = (kind, it) => {
    if (it.loc !== 'floor' || it.locked || isVintageFloorItem(kind, it)) return
    const k = floorSkuKey(kind, it); m.set(k, (m.get(k) || 0) + 1)
  }
  for (const c of (s.collection || [])) add('card', c)
  for (const it of (s.sealedInventory || [])) add('sealed', it)
  return m
}

// Rolling window (game-days) of net-worth / cash samples kept for the Stats trend
// sparkline and the daily recap's "net worth" line. One sample per day-advance.
export const WORTH_HISTORY_LEN = 30

// --- Brick & mortar (Phase 4) ----------------------------------------------
// The storefront upgrade (UPGRADES.storefront) flips you from flipper to store owner:
// walk-in customers, Cash payments — and a real daily LEASE you must keep funded.
// Once open you can hire EMPLOYEES: each adds daily payroll but boosts order throughput
// (and covers the store while you're at shows). Fail to cover store overhead (lease +
// payroll) for STORE_GRACE_DAYS and you lose the store (close it) — back to flipping.
export const STORE_LEASE_PER_DAY = 120
export const STORE_GRACE_DAYS = 4
export const EMPLOYEES = [
  { id: 'clerk',    title: 'Store Clerk',     wage: 45, throughput: 0.25, desc: 'Handles the counter — more walk-in & online orders land.' },
  { id: 'buyer',    title: 'Floor Buyer',     wage: 80, throughput: 0.45, desc: 'Works the floor and online — a big bump to order volume.' },
  { id: 'manager',  title: 'Store Manager',   wage: 130, throughput: 0.70, desc: 'Runs the shop end to end — the most throughput, the most payroll.' },
]
export function employeeById(id) { return EMPLOYEES.find(e => e.id === id) || null }

// --- 🏪 The shop across town ---------------------------------------------------
// Your copy has always referred to a competitor — haggle a collection too hard and "you
// lose the whole lot to the shop across town." This makes them a real business instead of
// a turn of phrase, because a town with one card shop in it isn't a market, it's a monopoly.
//
// `heat` (0–100) is how much of the town they're winning. It is not a doom clock: it moves
// BOTH ways, every day, off things you actually do. Sit still and it climbs — they're
// working while you aren't. Host nights, give cards away, post a generous buylist, keep a
// stocked floor, build a name, and it falls. Above HEAT_PROMO_GATE they start running
// promotions that visibly pull your walk-ins for a few days, which is the point at which
// ignoring them stops being free.
export const RIVAL_NAMES = [
  'Twin Pines Cards', 'Route 9 Collectibles', 'The Card Vault', 'Sunset Sports & TCG',
  'Grandmaster Games', 'Pallet Town Trading Co.', 'Dragonspiral Hobby',
]
export const RIVAL_HEAT_START = 45
export const RIVAL_HEAT_DRIFT = 1.6      // per day, if you give them a free run at the town
export const RIVAL_PROMO_GATE = 62       // heat at which they start running promotions
export const RIVAL_PROMO_CHANCE = 0.22   // per day, once they're hot enough
export const RIVAL_PROMO_DAYS = [2, 4]
export const RIVAL_PROMOS = [
  { label: 'a 20%-off sealed weekend', drag: 0.18 },
  { label: 'a "we pay MORE for your collection" push', drag: 0.12, buyinDrag: true },
  { label: 'a free-pack-with-every-purchase promo', drag: 0.15 },
  { label: 'a big grand-reopening event', drag: 0.24 },
]
// How much of your walk-in traffic a live rival promo takes.
export function rivalDrag(rival) {
  return rival?.promo ? Math.max(0, 1 - (rival.promo.drag || 0)) : 1
}

// --- 🏬 Second Location --------------------------------------------------------
// A manager-run satellite. It is deliberately NOT a second UI to micromanage: you hire a
// manager, you send it stock, and it trades on its own. What makes it a decision rather
// than free money is that it has a lease and a payroll whether or not you keep it stocked —
// an empty branch is a hole in the floor you pour money into.
export const BRANCH_LEASE_PER_DAY = 95
export const BRANCH_SALE_SHARE = 0.4     // it does ~40% of the main store's daily volume
export const BRANCH_GRACE_DAYS = 6       // days underwater before the manager locks the doors
export const BRANCH_PREMIUM = 0.10       // its own counter premium (a captive local market)

// --- 📇 Special orders --------------------------------------------------------
// A walk-in asks for a sealed product you don't stock. Without the Special Orders Book
// that's a miss: a rep ding and a line on the demand board. With it there's a third
// answer — take a deposit and order it in. That turns your worst outcome into your best
// margin, because a customer who's already paid a deposit isn't price-shopping you.
//
// The catch is that it's a PROMISE. You owe them the item by `dueDay`; the sourcing runs
// through the same distributors (and the same lead times) as everything else, so an order
// you can't fill is a refund, a rep hit, and a demand-board entry that says you let them
// down. Promising more than you can source is the failure mode, exactly as it should be.
export const SPECIAL_ORDER_DEPOSIT = 0.35   // fraction of retail taken up front
export const SPECIAL_ORDER_PREMIUM = 0.10   // markup on top of shop retail — the convenience fee
export const SPECIAL_ORDER_DUE_DAYS = 7     // how long you promise them — enough for any lead time
export const SPECIAL_ORDER_GRACE = 4        // days past the promise before they give up on you
export const SPECIAL_ORDER_CAP = 6          // how many promises you can have outstanding

// --- Payment methods ---------------------------------------------------------
// You start accepting only Venmo. Buyers each prefer a method; if you can't take
// it, the sale falls through. Some methods are unlocked by upgrades.
// Each method carries a processing-fee drag: pct of the sale + a flat per-txn fee.
// Cash/Venmo are free; the card rails skim a cut (realistic merchant rates).
export const PAYMENT_METHODS = {
  venmo:  { name: 'Venmo',              short: 'Venmo',   icon: '💸', startsUnlocked: true,   feePct: 0,     feeFlat: 0 },
  cash:   { name: 'Cash',              short: 'Cash',    icon: '💵', viaUpgrade: 'storefront', feePct: 0,     feeFlat: 0 },
  paypal: { name: 'PayPal',            short: 'PayPal',  icon: '🅿️', viaUpgrade: 'payPaypal', feePct: 0.029, feeFlat: 0.30 },
  card:   { name: 'Credit/Debit Cards', short: 'Cards',  icon: '💳', viaUpgrade: 'payCard',   feePct: 0.029, feeFlat: 0.30 },
  tap:    { name: 'Tap to Pay',         short: 'Tap',    icon: '📲', viaUpgrade: 'payTap',    feePct: 0.026, feeFlat: 0.10 }, // in-person only (see INPERSON_METHODS)
}

// Which payment methods can the player currently accept?
export function acceptedMethods(upgrades) {
  const accepted = new Set(['venmo'])
  for (const [key, m] of Object.entries(PAYMENT_METHODS)) {
    if (m.viaUpgrade && upgrades[m.viaUpgrade]) accepted.add(key)
  }
  return accepted
}
// Processing fee on a sale of `gross` via `payMethod`. Returns {fee, net}.
export function processingFee(gross, payMethod) {
  const m = PAYMENT_METHODS[payMethod]
  if (!m || (!m.feePct && !m.feeFlat) || gross <= 0) return { fee: 0, net: round2(gross) }
  const fee = round2(gross * m.feePct + m.feeFlat)
  return { fee, net: Math.max(0, round2(gross - fee)) }
}
// True when this gross on this rail would net ~nothing after fees.
export function netsZero(gross, payMethod) {
  return processingFee(gross, payMethod).net <= 0.005 && gross > 0
}

// --- Online sale drag (marketplace fee + shipping & packing) -----------------
// Selling online is convenient but it BLEEDS: every online sale pays the ~5%
// marketplace fee AND a shipping & packing cost (mailer, sleeve, label, postage).
// In-person sales pay neither — that's the store's edge (on top of the +12%
// in-person premium): the same card simply nets more across your counter.
// Shipping is flat + a slice of the sale, capped at a share of small sales so
// listing bulk stays viable (you batch cheap cards into cheap envelopes).
export const ONLINE_FEE_PCT = 0.05
export const SHIP_FLAT = 0.60
export const SHIP_PCT = 0.03
export const SHIP_MAX_SHARE = 0.25
// 📦 The Shipping Station upgrade HALVES the flat+pct drag (thermal labels, bulk mailers) —
// halves, never removes: online must keep paying something so in-person keeps its edge.
// Callers that know the player pass `upgrades`; pure callers omit it and get full freight.
export function shippingCost(amount, upgrades) {
  if (!(amount > 0)) return 0
  const m = upgrades?.shipStation ? 0.5 : 1
  return round2(Math.min((SHIP_FLAT + SHIP_PCT * amount) * m, amount * SHIP_MAX_SHARE))
}

// --- Omni-channel listings ("list everywhere") --------------------------------
// With a storefront, a listing can be flagged `everywhere`: the SAME physical card
// is up on your site AND out in your store case, sold from whichever channel finds
// a buyer first. The card object lives ONLY in `listings` (the save-repair dedupe
// in index.js allows one bucket per uid); everything walk-in-facing pulls these in
// via this helper. Sealed-wrapped listings stay online-only (sealed has its own
// shelf, shopSealed).
export function omniShelfCards(listings) {
  return (listings || []).filter(l => l.everywhere && !l.expired && !l.card?._sealed).map(l => l.card)
}

// --- In-store services (holds, giveaways, the consignment case) ---------------
// Real card shops run on favors and community: holding a piece behind the counter
// for a regular, raffling something off to pack the room, and carrying locals'
// cards on consignment for a cut. Tuning for all three lives here.
export const HOLD_DAYS_STORE = 4        // how long you'll hold an item for a regular before it goes back out
export const HOLD_PICKUP_PREMIUM = 0.05 // they pay a little extra on top of the in-person premium — the favor is worth it
export const CONCIERGE_HOLDS_PER_TICK = 2 // new holds the Client Concierge sets aside per day-advance
export const GIVEAWAY_BUZZ_DAYS = 3     // how long giveaway word-of-mouth pumps walk-in traffic
export const GIVEAWAY_TRAFFIC_MULT = 1.35
export const CONSIGN_REQ_CAP = 2        // at most this many locals waiting on a consignment answer
// 🗄️ Locking Consignment Case: a proper secured case carries more locals' cards at once.
export function consignReqCap(upgrades) { return upgrades?.consignCase ? 5 : CONSIGN_REQ_CAP }
export const CONSIGN_REQ_CHANCE = 0.22  // per-day chance a local walks in asking you to carry their card
export const CONSIGN_MIN_NOTO = 15      // nobody trusts an unknown shop with their cards

// --- Collection buy-ins + store credit -----------------------------------------
// Locals walk in wanting to SELL you their cards — the store as a SOURCING channel.
// You appraise the lot (a noisy estimate; the Loupe tightens it), then pay CASH now
// or STORE CREDIT at a bonus. Credit is the real LGS trick: no cash leaves today,
// the seller comes back as a customer, and their credit drains out of your daily
// counter takings over time (with a little breakage that's never redeemed at all).
// A storefront makes you the place people bring collections — so sellers walk in a LOT more
// often, and some are leaving the hobby entirely: whole-collection "estate" lots that come with
// SEALED product mixed in (and once in a while, they just give it away).
export const BUYIN_CHANCE = 0.30        // per-day chance a seller walks in (storefront + a bit of a name)
export const BUYIN_CAP = 4              // at most this many lots waiting on an answer
// 🪑 Appraisal Desk: a real intake setup queues more lots (and buys a third haggle round — booth.js).
// 📦 Known Local (rank 2) banked perk: word gets around — one more walk-in fits the queue.
export function buyinCap(upgrades, rank = 0) { return (upgrades?.appraisalDesk ? 6 : BUYIN_CAP) + (rank >= 2 ? 1 : 0) }
export const BUYIN_MIN_NOTO = 10
export const BUYIN_ESTATE_CHANCE = 0.35 // share of buy-ins that are a whole "leaving the hobby" collection (incl. sealed)
export const STORE_CREDIT_BONUS = 0.25  // credit offer = cash ask × (1 + bonus) — they take more in credit
export const CREDIT_REDEEM_SHARE = 0.6  // share of each day's counter takings credit-holders can spend down
export const CREDIT_BREAKAGE = 0.02     // daily % of outstanding credit that's simply never redeemed
// Locals stop accepting credit when you owe too much of it (scales with your name).
export function creditIssueCap(notoriety) { return 200 + (notoriety || 0) * 2 }
// --- Posted buylist policy: the sign on the counter ---------------------------------
// "We pay ~X% on collections" — the shop's standing posture, chosen by the player.
// Volume vs margin, ~EV-neutral by construction: generous pulls ~50% more sellers through
// the door at ~8pp higher asks; tight is the inverse. Applied to the buy-in arrival roll
// (chanceMult, day-tick) and the ask distribution (askShift, makeBuyinOffer — the hidden
// haggle floor derives AFTER the shift, so it scales with your posted rate). Free lots
// and crown-jewel firmness are untouched — the policy never nerfs the loop, it aims it.
export const BUYLIST_POLICIES = {
  tight:    { label: 'We pay ~40%', chanceMult: 0.6, askShift: -0.08,
    blurb: 'Sharky rates: fewer sellers walk in, but the lots that do come carry fatter margin.' },
  fair:     { label: 'We pay ~55%', chanceMult: 1.0, askShift: 0,
    blurb: 'Market-standard buylist — the normal flow of walk-in collections.' },
  generous: { label: 'We pay ~70%', chanceMult: 1.5, askShift: 0.08,
    blurb: 'The shop that pays: ~50% more sellers at thinner margins, and cash sellers tend to become regulars.' },
}

// --- Hosted store events ---------------------------------------------------------
// Real shops live on recurring events — they create foot traffic, community, and
// predictable revenue. Plan one tonight from the Shop floor; it happens when the
// day turns. `buzzDays` feeds the same walk-in traffic boost giveaways use.
export const EVENT_COOLDOWN_DAYS = 2 // the room (and you) need a breather between events
export const STORE_EVENTS = {
  tradeNight: { name: 'Trade Night', icon: '🔁', cost: 60, minNoto: 0,
    desc: 'Open the tables — locals bring binders. Builds trust with every regular, puts fresh trade offers in your inbox, and a night of browsers works your case.',
    buzzDays: 1, extraWalkins: 2, trust: 4, noto: 3, hype: 4 },
  leagueNight: { name: 'League Night', icon: '🎮', cost: 100, minNoto: 0,
    desc: 'Host the local league — snacks, sleeves and singles move all night, and a kid at the counter tonight is a regular next month.',
    buzzDays: 1, extraWalkins: 1, trust: 3, noto: 2, hype: 4, income: (noto) => 40 + noto * 0.5, formsRegular: true, suppliesBurst: true },
  // ⭐ rework: the tournament rides the BANKED rank ladder (minRank; minNoto kept for copy) —
  // sanctioning wants a résumé (📣 Known Local), not just a number.
  tournament: { name: 'Tournament', icon: '🏆', cost: 250, minNoto: 40, minRank: 2,
    desc: 'A sanctioned tournament: entry fees in, prize support out (covered by the fee). Serious players travel for it — a real notoriety pop and days of buzz.',
    buzzDays: 2, extraWalkins: 2, trust: 2, noto: 8, hype: 10, income: (noto) => 140 + noto * 1.2, suppliesBurst: true },
  raffle: { name: 'Raffle Night', icon: '🎟️', cost: 40, minNoto: 0, needsPrize: true,
    desc: 'Put up a prize card and sell tickets. Ticket money in, the prize goes home with a winner — generosity with a box-office.',
    buzzDays: 2, extraWalkins: 1, trust: 3, hype: 4, income: (noto) => Math.min(400, 50 + noto * 1.5) },
}

// --- 🧢 Supplies & accessories (the real-LGS margin engine) --------------------
// Sleeves, toploaders, binders — the ~50%-margin steady trade that pays a real shop's
// lease while card prices fluctuate. Bought wholesale by the case, sold at retail through
// the counter as footfall passes; league/tournament crowds burst-buy (players sleeve
// decks at the table). Fungible stock (a quantity per line, no uids) in `supplies`;
// deliberately EXEMPT from heldUnits storage fees (a rack of accessories isn't a hoard).
export const SUPPLY_CASE = 10 // units per wholesale case
export const SUPPLIES = [
  { id: 'sleeves',    name: 'Card Sleeves (100ct)', icon: '🃏', cost: 2.5, retail: 5,  demandWeight: 5 },
  { id: 'toploaders', name: 'Toploaders (25ct)',    icon: '🗂️', cost: 3,   retail: 6,  demandWeight: 4 },
  { id: 'deckbox',    name: 'Deck Box',             icon: '🎴', cost: 3.5, retail: 8,  demandWeight: 3 },
  { id: 'dice',       name: 'Dice & Counters',      icon: '🎲', cost: 1.5, retail: 4,  demandWeight: 3 },
  { id: 'binder9',    name: '9-Pocket Binder',      icon: '📒', cost: 12,  retail: 25, demandWeight: 2 },
  { id: 'playmat',    name: 'Playmat',              icon: '🖼️', cost: 9,   retail: 20, demandWeight: 2 },
]
export function supplyById(id) { return SUPPLIES.find(x => x.id === id) || null }
// Weighted pick of one in-stock supply line (sleeves move most). Returns an id or null.
export function pickSupplyId(supplies, rnd = Math.random) {
  const inStock = SUPPLIES.filter(x => (supplies?.[x.id] || 0) > 0)
  if (!inStock.length) return null
  let tot = 0; for (const x of inStock) tot += x.demandWeight
  let r = rnd() * tot
  for (const x of inStock) { r -= x.demandWeight; if (r <= 0) return x.id }
  return inStock[inStock.length - 1].id
}

export const CALENDAR_DAYS = 30
export const INBOX_CAP = 8

// --- Daily goals -----------------------------------------------------------
// Pool of small objectives; 2–3 roll each game-day. Reward scales a touch with
// notoriety. Progress is bumped by gameplay actions and auto-pays on completion.
export const GOAL_POOL = [
  { key: 'sell',   label: n => `Sell ${n} card${n>1?'s':''}`,        targets: [2,3,4],  cash: 25, noto: 1 },
  { key: 'grade',  label: n => `Submit ${n} card${n>1?'s':''} to grade`, targets: [1,2], cash: 30, noto: 1 },
  { key: 'rip',    label: n => `Rip ${n} pack${n>1?'s':''}`,         targets: [3,5,8],  cash: 20, noto: 1 },
  { key: 'buy',    label: n => `Buy ${n} card${n>1?'s':''} from a vendor`, targets: [1,2], cash: 25, noto: 1 },
  { key: 'help',   label: () => `Make someone's day (give a card free)`, targets: [1], cash: 0, noto: 4 },
  { key: 'want',   label: n => `Fill ${n} collector want${n>1?'s':''}`, targets: [1], cash: 40, noto: 2 },
  { key: 'attend', label: () => `Attend a card show`,                targets: [1], cash: 30, noto: 1 },
  { key: 'profit', label: n => `Earn $${n} in sales`,               targets: [100,250], cash: 30, noto: 1 },
]
// Goals run on a WEEKLY cadence: a fresh set is rolled and then sticks for 7 days
// before the next refresh. Targets/rewards are scaled up for the week-long window.
export const GOAL_PERIOD_DAYS = 7
// Absolute day counter that doesn't wrap at the month boundary (currentDay resets to 1
// each new calendar month). Goal cadence keys off this so a week spans months cleanly.
export function absoluteDay(currentDay, monthsElapsed) { return (monthsElapsed || 0) * CALENDAR_DAYS + currentDay }
// Which WEEK we're in, absolute (month-safe). The distributors' rotating catalogue, the
// clearance lot, and the weekly vintage find all key off this — and so does the record of
// how much of that find you've already bought. Shop UI and store MUST agree on the number,
// or a find could look in-stock in one place and sold-out in the other; hence one helper.
export function weekIndexOf(currentDay, monthsElapsed) {
  return Math.floor(absoluteDay(currentDay, monthsElapsed) / 7)
}

// --- Day of week: the rhythm of retail ----------------------------------------
// Real card shops live Friday→Sunday. Absolute day 1 is a Monday; weeks run straight
// across month boundaries (30-day months mean the weekend drifts through the calendar,
// like real retail). Walk-in traffic, the counter, and the pack machine ride
// walkinDayMult; collection sellers cluster on weekends (attic-cleaning is a Saturday
// job) via buyinDayMult. Online demand is untouched — the internet is open 24/7.
// Both tables average ~1.0 across a week, so overall fame tuning is unchanged;
// the week just has a SHAPE now (dead Tuesdays, packed Saturdays).
// --- Seasons: the year has a shape too ------------------------------------------
// monthsElapsed maps onto a real calendar (the game opens in September — back-to-school
// straight away, the December gift rush lands ~M4, the summer lull ~M10; START_MONTH is
// the tunable). Each month carries { walkin, kids, gift }: `walkin` rides the same per-day
// multiplier as weekdays (so the counter/supplies/machine follow through footWeight),
// `kids` boosts the kid channels (pack machine + bulk bin), and `gift` is the share of
// walk-ins who are GIFT BUYERS (Nov–Dec only — see makeGiftBuyer in shows.js).
// A December Saturday is the biggest day of the year, which is exactly right.
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const START_MONTH = 8 // game month 0 = September
export function monthIndexOf(monthsElapsed) { return (START_MONTH + Math.max(0, monthsElapsed || 0)) % 12 }
export function monthName(monthsElapsed) { return MONTH_NAMES[monthIndexOf(monthsElapsed)] }
export function yearOf(monthsElapsed) { return 1 + Math.floor((START_MONTH + Math.max(0, monthsElapsed || 0)) / 12) }
const SEASON_MULTS = [
  /* Jan */ { walkin: 0.85, kids: 1.0,  gift: 0    }, // post-holiday lull
  /* Feb */ { walkin: 0.95, kids: 1.0,  gift: 0    },
  /* Mar */ { walkin: 1.0,  kids: 1.0,  gift: 0    },
  /* Apr */ { walkin: 1.0,  kids: 1.0,  gift: 0    },
  /* May */ { walkin: 1.0,  kids: 1.0,  gift: 0    },
  /* Jun */ { walkin: 0.9,  kids: 1.25, gift: 0    }, // summer: slower retail, school's out
  /* Jul */ { walkin: 0.9,  kids: 1.25, gift: 0    },
  /* Aug */ { walkin: 0.9,  kids: 1.25, gift: 0    },
  /* Sep */ { walkin: 1.05, kids: 1.3,  gift: 0    }, // back-to-school
  /* Oct */ { walkin: 1.0,  kids: 1.0,  gift: 0    },
  /* Nov */ { walkin: 1.15, kids: 1.0,  gift: 0.10 }, // the ramp begins
  /* Dec */ { walkin: 1.3,  kids: 1.1,  gift: 0.22 }, // gift rush
]
export function seasonOf(monthsElapsed) { return SEASON_MULTS[monthIndexOf(monthsElapsed)] }

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export function weekdayOf(absDay) { return WEEKDAYS[((absDay - 1) % 7 + 7) % 7] }
const WALKIN_DAY_MULT = { Mon: 0.8, Tue: 0.75, Wed: 0.85, Thu: 0.95, Fri: 1.15, Sat: 1.45, Sun: 1.2 }
const BUYIN_DAY_MULT  = { Mon: 0.9, Tue: 0.9,  Wed: 0.9,  Thu: 0.9,  Fri: 0.9,  Sat: 1.4,  Sun: 1.4 }
export function walkinDayMult(absDay) { return WALKIN_DAY_MULT[weekdayOf(absDay)] }
export function buyinDayMult(absDay) { return BUYIN_DAY_MULT[weekdayOf(absDay)] }

export function makeWeeklyGoals(noto, rank = 0) {
  const shuffled = [...GOAL_POOL].sort(() => Math.random() - 0.5)
  const count = 3 + (Math.random() < 0.5 ? 1 : 0) // 3–4 goals for the week
  // Reward scales with fame so a week's goals stay worth chasing as the economy grows — a
  // famous vendor's goal pays real money, not a rounding error. (Was noto/150 — far too flat.)
  // 👑 Hobby Legend (rank 5) banked perk: sponsors chip in — cash payouts ×1.15.
  const mult = (1 + noto / 45) * (rank >= 5 ? 1.15 : 1)
  return shuffled.slice(0, count).map(g => {
    // Scale the daily target up toward a week's worth (×~5, capped by the biggest tier
    // so a "rip 3" doesn't balloon absurdly), then pick from there.
    const base = g.targets[Math.floor(Math.random() * g.targets.length)]
    const target = g.key === 'profit' ? base * 5 : Math.min(base * 5, Math.max(base, Math.round(base * (3 + Math.random() * 2))))
    return {
      key: g.key, target, progress: 0, done: false,
      label: g.label(target),
      cash: round2(g.cash * mult * 3), noto: g.noto * 3, // bigger payout for a week-long goal
    }
  })
}

// FAME lives in engine.js (pure game math — shows.js and the components need it too, and
// constants.js already depends on engine, so it can't be the other way round). Re-exported
// here so the store slices can keep importing their tuning from one place.
export { fameMult, fameBeyond, FAME_KNEE, FAME_POWER } from '../engine'

// ⭐/🔥 Reputation-rework math (two-speed rep: permanent standing + decaying hype,
// rank ladder, attribution ledger) lives in rep.js — same re-export arrangement.
export {
  applyNotoGain, NOTO_SOFT_CAP,
  hypeGain, bumpHype, decayHype, hypeDemandMult, hypePriceMult,
  HYPE_MAX, HYPE_HALF_LIFE, HYPE_CURE_RATE, HYPE_CURE_DAILY_CAP,
  ledgerAdd, ledgerRoll, repSourceLabel, REP_SOURCES, REP_LEDGER_DAYS,
  RANKS, DEEDS_NEEDED, rankForNotoriety, deedsDone, rankEligible, rankOf,
} from '../rep'

// 📱 Content & audience math (short-form posts, the master set challenge, show vlogs,
// collabs, the podcast, brand deals) lives in content.js — same re-export arrangement as
// rep.js above, so slices keep importing their tuning from this one place.
export {
  POST_DAYS, MAX_LIVE_POSTS, POST_QUEUE_CAP, POST_KINDS, postIcon,
  POST_MIN_VALUE, worthPosting, postDrip, makePost, pushPost, postPatch, cadenceMult,
  VIRAL_CHANCE, VIRAL_MULT, rollViral,
  CHALLENGE_BIAS, challengeScale, huntFollowers, HUNT_EPISODE_EVERY, challengeBounty,
  CHALLENGE_ABANDON_DING,
  vlogFollowers, VLOG_AFTERGLOW_DAYS, VLOG_BOOTH_MULT,
  DISCORD_WANT_BONUS, DISCORD_WANT_CAP_BONUS, DISCORD_HOLD_SKEW, discordRegularChance,
  COLLAB_CREATORS, COLLAB_CHANCE, COLLAB_MIN_FOLLOWERS, collabGain,
  PODCAST_PERIOD, PODCAST_REP, podcastFollowers, PODCAST_WAVE_LEAD_DAYS,
  SPONSOR_BRANDS, SPONSOR_MONTHLY_CAP, SPONSOR_MIN_FOLLOWERS, SPONSOR_PERIOD,
  SPONSOR_WINDOW_DAYS, SPONSOR_FEATURE_PACKS, SPONSOR_LAPSE_DING, sponsorMonthly,
} from '../content'

// Notoriety you must earn before strangers seek YOU out with unsolicited orders. Below
// this you're a nobody — nobody DMs you to buy. Your early-game demand is the public
// FORUM (people posting what they want; you go find/rip it). See FORUM_* + forumPosts.
export const INBOUND_NOTORIETY_GATE = 12
// You need a bit of a name before any walk-up wants to become a "regular" of yours.
export const REGULAR_FORM_GATE = 8
// A live listing priced at or below this fraction of market is a bargain that
// online deal-hunters will find on their own — even for an unknown vendor below the
// notoriety gate. (askMult is "fraction of market"; see listOnSite.)
export const BARGAIN_ASK_MULT = 0.70
// EXPECTED NUMBER of unsolicited orders per day on a channel — a RATE, not a probability.
// That distinction is the whole point: this used to return a chance capped at 0.85/0.95, so
// no matter how famous you got, at most ONE walk-in and ONE online order could ever arrive
// in a day. Fame saturated at noto ~212 and the busiest shop in the world had the same
// footfall as a locally-known one. Now the ramp sets the early shape and fameMult multiplies
// it, so a real name means a genuine QUEUE:
//   walk-ins/day: noto 12 → 0.16 · 100 → ~1.0 · 200 → ~2.3 · 300 → ~3.3 · 800 → ~6.1
//   online/day:   noto 12 → 0.10 · 100 → ~0.9 · 200 → ~2.1 · 300 → ~3.0 · 800 → ~5.5
// Zero until you've made a name (INBOUND_NOTORIETY_GATE) — below that you're a nobody.
// EXCEPTION: if you've listed something really cheap (hasBargain), online bargain-hunters
// trickle in regardless of fame — a deliberate fire-sale is the other way to start the loop.
// Callers draw an integer count from this via drawCount() in the day tick.
export function dayOrderRate(channel, notoriety, hasBargain = false) {
  if (notoriety < INBOUND_NOTORIETY_GATE) {
    // unknown vendor → no inbound from reputation; the only draw is a steep deal.
    return channel === 'online' && hasBargain ? 0.18 : 0
  }
  // A physical store is your biggest DEMAND engine — local foot traffic beats an unknown
  // web listing, so walk-ins come MORE often than online orders (that's what the lease buys).
  const floor = channel === 'online' ? 0.10 : 0.16 // rate just past the gate
  const cap   = channel === 'online' ? 0.85 : 0.95 // the old (flatlining) ceiling
  const ramp  = Math.min(1, (notoriety - INBOUND_NOTORIETY_GATE) / 200)
  const base  = floor + (cap - floor) * ramp
  // Fame relative to the gate — exactly 1.0× for an unknown, so the early game is unchanged
  // and the multiplier only bites once you've actually built a name.
  const vol = fameMult(notoriety) / fameMult(INBOUND_NOTORIETY_GATE)
  const rate = base * vol
  // A bargain listing adds extra pull on top of your reputation, too.
  return channel === 'online' && hasBargain ? rate + 0.12 : rate
}

// Draw an integer count of events from an expected rate (e.g. 2.4 orders/day → 2, sometimes
// 3). The whole number is guaranteed; the fraction is the odds of one more.
export function drawCount(rate, rnd = Math.random) {
  if (!(rate > 0)) return 0
  const whole = Math.floor(rate)
  return whole + (rnd() < rate - whole ? 1 : 0)
}
// Sanity rail: however famous you get, one channel can't bury you in more than this many
// encounters in a single day. Fame should make you rich, not unplayable.
export const MAX_ORDERS_PER_DAY = 6
// Ceiling on the day's counter TRADE BUDGET (dollars of everyday goods locals buy). Generous
// (a famous shop SHOULD tick over nicely) but firmly finite. The counter no longer prints free
// cash — it now sells REAL floor stock up to this budget, so it only earns while the floor is
// kept stocked with everyday product. Reached around noto 700.
export const COUNTER_MAX_PER_DAY = 1200

// 🎰 Pack Machine: the most single packs it can vend in one day (a hard rail so a fully-loaded
// machine can't drain in a single tick). Demand also scales with fame + how good a deal the
// flat price is versus the average pack's value.
export const MACHINE_MAX_PER_DAY = 8
// 🗑️ Bulk Bin: same idea — a sanity rail on how many cards can leave the quarter box in a
// day, however deep it is. Deliberately far above normal demand (see binDemand below): the
// box is limited by what you put IN it, not by an arbitrary ceiling.
export const BIN_MAX_PER_DAY = 90
// 🎰 High-Capacity Vend Unit / 🗑️ Second Quarter Box: the daily rails deepen with the build-out.
export function machineMaxPerDay(upgrades) { return upgrades?.vendUnit ? 14 : MACHINE_MAX_PER_DAY }
export function binMaxPerDay(upgrades) { return upgrades?.secondBin ? 200 : BIN_MAX_PER_DAY }

// --- 🗑️ The quarter box, as a demand model ---------------------------------------------
// The bulk bin used to drain a card or two a day, which is not how a quarter box works. In a
// real shop it's the busiest fixture on the floor: kids come in with a fistful of change,
// dig for twenty minutes, and walk out with a STACK. So the model counts DIGGERS (people who
// came to work the box today) and gives each one a HANDFUL, instead of counting cards.
//
// The important consequence is the other half: a channel with real demand can be MISSED. A
// digger who walks up to an empty box is a turned-away customer — a rep ding and a line on
// the demand board, exactly like a walk-in you couldn't sell. Keeping the box full is now a
// job, and letting it run dry is a mistake with a cost.
export const BIN_HANDFUL = 6            // cards the average digger walks out with
export const BIN_DIGGER_BASE = 1.2      // diggers/day before fame — even a nobody's box gets worked
export const BIN_DIGGER_FAME = 80       // + one more digger per this much notoriety
// How long the kids keep checking back on a dead box before they give up on you. Up to this
// many dry days demand PILES UP (they keep coming, and keep leaving unhappy — that's the
// pressure); past it they stop bothering, and you have to earn the crowd back.
export const BIN_GIVEUP_DAYS = 5
// Rep cost per kid turned away from an empty box, capped per day. The crowd scales with your
// fame, so the sting does too — a famous shop with a dead quarter box disappoints a dozen kids
// a day and it shows. The cap (and the give-up curve above) keep it a slow bleed you can fix,
// never a spiral: a box left empty until the town forgets it costs ~20★ in total and then stops.
export const BIN_MISS_NOTORIETY = 0.2
export const BIN_MISS_DING_CAP = 2

// The deal the box is offering. NOT a straight value-for-money read: nobody digs a quarter
// box expecting to beat market on every card — a real one sells commons worth eight cents for
// a quarter and the shop can't keep it full, because the DIG is what people are buying. So
// "fair" is a box whose cards average BIN_FAIR_RATIO of the asking price; the classic 25¢ box
// of dime cards sits right at healthy, a dime box is mobbed, and a dollar box of chaff dies.
//   avg $0.15 @ $0.25 → 1.2 · @ $0.10 → 2.2 (capped) · @ $1.00 → 0.35 (floored)
// An EMPTY box can't be judged on its contents, so it's judged on reputation alone (mult 1) —
// which is the whole point: the crowd still shows up, and that's what makes an empty box hurt.
export const BIN_FAIR_RATIO = 0.5
export function binDealMult(avgVal, price) {
  if (!(price > 0)) return 0
  if (!(avgVal > 0)) return 1
  return Math.max(0.35, Math.min(2.2, avgVal / (price * BIN_FAIR_RATIO)))
}
// Pent-up demand from a dry spell, then the give-up slide once you've burned them. Kids keep
// checking a box that's been empty a couple of days — that's the pressure, and it's why a dry
// spell costs MORE the longer it runs. Past BIN_GIVEUP_DAYS they start writing you off, and
// once a box has sat empty BIN_FORGOTTEN_DAYS it's off the map: nobody comes, so a bin you've
// simply stopped running stops costing you rep instead of bleeding you forever.
//   dry 0 → 1.0 · 2 → 1.4 · 5 → 2.0 (the peak) · 8 → 1.25 · 11 → 0.5 · 12+ → 0 (while empty)
// Refill it and the crowd rebuilds from whatever's left of their patience — one quiet day,
// then back to normal, because the streak breaks the first day nobody leaves empty-handed.
export const BIN_FORGOTTEN_DAYS = 12
export function binHunger(dryDays, hasStock = true) {
  const dry = Math.max(0, dryDays || 0)
  if (dry <= BIN_GIVEUP_DAYS) return 1 + Math.min(1, dry * 0.2)
  if (!hasStock && dry >= BIN_FORGOTTEN_DAYS) return 0
  return Math.max(0.25, 2 - (dry - BIN_GIVEUP_DAYS) * 0.25)
}
// The day's demand on the box. Returns the expected number of DIGGERS and the average
// handful each takes, so the day-tick and the bin panel's "≈N cards a day" read the same
// numbers. `avgVal` is the average live value of what's in the box (0 when it's empty).
export function binDemand({ notoriety = 0, price = 0, avgVal = 0, upgrades = null, monthsElapsed = 0, dryDays = 0, hasStock = avgVal > 0 } = {}) {
  const dealMult = binDealMult(avgVal, price)
  const signage = upgrades?.signage ? 1.15 : 1
  const hunger = binHunger(dryDays, hasStock)
  const diggers = (BIN_DIGGER_BASE + Math.max(0, notoriety) / BIN_DIGGER_FAME)
    * dealMult * signage * seasonOf(monthsElapsed).kids * hunger
  // A good deal doesn't just bring more kids, it makes each one dig deeper — but gently, so
  // price affects turnout more than it does stack size.
  const handful = BIN_HANDFUL * (0.6 + dealMult * 0.4)
  return { diggers, handful, cardsPerDay: Math.min(binMaxPerDay(upgrades), diggers * handful) }
}

// The booth inbox holds unhandled encounters; anything past the cap is DISCARDED. So the cap
// has to grow with fame, or a famous vendor's extra orders would silently evaporate — the
// bigger your name, the more you can have waiting on you.
//   noto 0 → 8 · 100 → 11 · 300 → 16 · 500+ → 20
export function inboxCap(notoriety, rank = 0) {
  // +1 is the 🏷️ Weekend Flipper (rank 1) banked perk — a busier counter, forever.
  return Math.min(20, 8 + Math.round(Math.max(0, notoriety || 0) / 37) + (rank >= 1 ? 1 : 0))
}

// Going live pumps your whole storefront for a few days after: every listing draws
// far more eyes (stream viewers who came to shop).
export const STREAM_HYPE_DAYS = 4
// ❤️ Each subscriber pays a small daily drip (~$3/mo) while the channel is alive. A channel
// gone dark for over a week starts bleeding subs (see daytick).
export const SUB_DAILY = 0.10

// --- Upgrades: buy once, keep forever ---------------------------------------
// Costs are scaled to the real economy: packs ~$5-15, ETBs ~$150, show entry up
// to $2,500. So cheap accessories are tens-to-low-hundreds, real business
// investments are thousands, and a physical storefront is the big commitment.
export const UPGRADES = {
  // THE major commitment: a real lease + buildout. Unlocks walk-ins + Cash.
  storefront: { name: 'Brick-and-Mortar Store', cost: 8000, desc: 'Sign a lease ($120/day) and open a real shop — your biggest DEMAND engine. Heavy local foot traffic (more orders than online), a +12% in-person price premium, fee-free in-person sales (online listings pay a 5% fee + shipping), steady daily counter business (singles/supplies/bulk to locals) once your case is stocked, passive local fame, and Cash payments. Lets you list cards EVERYWHERE — one item up online AND in your store case, sold from whichever channel finds a buyer first. The big leap from flipper to store owner — keep the shelf stocked and it more than earns its lease.', icon: '🏬', tier: 'big' },

  // Payment rails — each its own setup. Capture buyers who won't use Venmo.
  payPaypal: { name: 'Accept PayPal',            cost: 120,  desc: 'Take PayPal — a huge share of online buyers prefer it.', icon: '🅿️', group: 'payment' },
  payCard:   { name: 'Accept Credit/Debit Cards', cost: 400,  desc: 'A card reader / merchant account so buyers can pay by card. Captures the most sales.', icon: '💳', group: 'payment' },
  payTap:    { name: 'Tap to Pay',                cost: 250,  desc: 'A contactless terminal on the counter — phone-tapping walk-ins stop fumbling for another way to pay. In-person only, and the cheapest card rail going (~2.6% + 10¢). Requires a Brick-and-Mortar Store.', icon: '📲', group: 'payment', needs: 'storefront' },
  shipStation: { name: 'Shipping Station', cost: 800, desc: 'A thermal label printer, bulk mailers, and a real packing bench: shipping & packing costs on every online sale are CUT IN HALF. Online still pays its way — but it stops bleeding.', icon: '📦' },

  // Keep earning while you're away at a show.
  smartphone: { name: 'Smartphone', cost: 1000, desc: 'Field ONLINE orders from anywhere — they keep coming in even while you\'re away at a show, instead of being missed.', icon: '📱' },
  streaming:  { name: 'Streaming Setup', cost: 900, desc: 'Camera, lights & capture card. Go LIVE and rip product on stream — viewers tune in, react, and tip, and a hot stream pumps your notoriety and listing traffic. Queue up MULTIPLE products per broadcast and unlock box breaks.', icon: '🔴' },
  ripService: { name: 'Live Rip Service', cost: 2200, desc: 'Take RIP ORDERS live on stream: viewers pay a premium to have you crack a product you already hold on camera and ship them everything that comes out. You keep the markup no matter what hits — a steady, low-variance income while you broadcast. Requires a Streaming Setup.', icon: '🎟️', needs: 'streaming' },
  staff:      { name: 'Shop Assistant', cost: 2500, desc: 'A permanent assistant who minds the store: a standing +15% order throughput (no daily payroll) AND covers your walk-ins while you\'re away at a show. A one-time-fee alternative to paid Employees (who boost more, for a wage). Requires a Brick-and-Mortar Store.', icon: '🧑‍💼', needs: 'storefront' },

  // Book a booth at shows to SELL your own cards.
  vendorSetup: { name: 'Vendor Setup', cost: 1200, desc: 'A folding table, display case, banner & dealer paperwork. Lets you book a BOOTH at shows to sell your own cards (pay a per-show vendor fee). Without it, you can only attend to shop.', icon: '🎪' },

  signage:  { name: 'Eye-Catching Signage', cost: 150,  desc: '+15% foot traffic (shows, and your store if open).', icon: '🪧' },
  cases:    { name: 'Glass Display Cases',  cost: 500,  desc: 'Offers on your cards come in ~12% higher.', icon: '🗄️' },
  packBin:  { name: 'Pack Bin',             cost: 750,  desc: 'A big wire display bin for loose singles packs — doubles how many of ONE pack you can keep out on the floor (12 → 24). Loose packs are your highest-turnover impulse buy; a deep bin means walk-ins never find it empty. Requires a Brick-and-Mortar Store.', icon: '🧺', needs: 'storefront' },
  packWall: { name: 'Wall of Packs',        cost: 3000, desc: 'A floor-to-ceiling pegboard pack wall behind the counter — the shop that\'s ALL packs. Deepens the loose-pack floor limit again (24 → 36). Requires a Pack Bin.', icon: '🧱', needs: 'packBin' },
  vendUnit: { name: 'High-Capacity Vend Unit', cost: 1000, desc: 'A commercial-grade vending mechanism for the Pack Machine: the daily vend rail rises 8 → 14 packs — and if a 🪓 Bin Keeper is on staff, they keep the machine topped up overnight from storeroom packs too. Requires a Brick-and-Mortar Store.', icon: '🎰', needs: 'storefront' },
  secondBin: { name: 'Second Quarter Box',  cost: 600,  desc: 'A second bin on the counter means twice as many kids can dig at once: the bulk bin\'s daily rail rises 90 → 200 cards. The quarter box is the busiest fixture in a card shop — this is how you stop it being the bottleneck. Requires a Brick-and-Mortar Store.', icon: '🗑️', needs: 'storefront' },
  snackCooler: { name: 'Snack & Drink Cooler', cost: 500, desc: 'A humming cooler by the door: a little steady counter money every open day, and browsers who linger with a drink in hand buy more often (+10% on walk-in browse sales). Requires a Brick-and-Mortar Store.', icon: '🥤', needs: 'storefront' },
  giftWrap: { name: 'Gift Wrap Counter',    cost: 700,  desc: 'Ribbon, boxes, and a wrapping station for the Nov–Dec gift rush: gift buyers pay a fatter wrap premium, and you can fetch a giftable sealed from the STOREROOM when the floor has nothing in budget — December misses stop walking to the mall. Requires a Brick-and-Mortar Store.', icon: '🎁', needs: 'storefront' },
  eventsCoordinator: { name: 'Events Coordinator', cost: 2200, desc: 'A part-timer who runs your calendar: pick one hosted event to recur automatically EVERY WEEK (flagged 📆 on the event planner — costs paid from the till each time), and the room recovers faster between nights (event cooldown 2 days → 1). Requires a Brick-and-Mortar Store.', icon: '🎪', needs: 'storefront' },
  ticker:   { name: 'Visitor Ticker',       cost: 200,  desc: 'Alerts you when someone is at your stand while you browse a show hall.', icon: '🔔' },
  loupe:    { name: "Jeweler's Loupe",      cost: 450,  desc: 'Slightly better grade odds when you submit cards. Also gives a PRECISE cut/centering read on any raw card — without it the eyeball read is fuzzy.', icon: '🔍' },
  gradescope: { name: 'Grading Scope & Pop Guide', cost: 1400, desc: 'A pro-grade microscope plus population data. PREDICTS the likely PSA grade RANGE — the most probable grade, a confidence band, and the gem-10 odds — for any raw card before you pay to submit it. Requires the Jeweler\'s Loupe.', icon: '🔭', needs: 'loupe' },
  graderAccount: { name: 'Grader Dealer Account', cost: 2400, desc: 'Your submissions ride the grader\'s dealer courier instead of the mail room: TURNAROUND CUT ~40% on every service tier (Economy 45 → 27 days, Standard 20 → 12, Express 5 → 3). Same fees, same odds — your capital just comes back faster. Requires the Grading Scope.', icon: '🚚', needs: 'gradescope' },
  submissionRunner: { name: 'Submission Runner', cost: 3000, desc: 'An intern who preps subs overnight: each day, up to 2 raw cards whose 🔭 Scope prediction is CLEARLY +EV get auto-submitted at the Economy tier (fee paid from the till). Never touches 🔒 kept, held, floor, binder, or listed cards; pause it any time in ⚙️ Settings. Requires the Grading Scope.', icon: '🧾', needs: 'gradescope' },
  appraisalDesk: { name: 'Appraisal Desk', cost: 1600, desc: 'A proper intake desk with good light and a comp station: up to 6 collection lots wait on an answer (was 4), and sellers sit for a THIRD round of haggling before the walk-away math bites. Requires the Jeweler\'s Loupe.', icon: '🪑', needs: 'loupe' },
  authkit:  { name: 'Authentication Kit',   cost: 600,  desc: 'A precision scale, UV blacklight & reference guides for spotting resealed wrappers and weighed/searched packs. Lets you AUTHENTICATE sealed deals from strangers before you buy — catching most fakes (crude ones almost always; sophisticated reseals can still slip through, especially vintage).', icon: '🔬' },
  network:  { name: 'Dealer Network',       cost: 1500, desc: 'Famous vendors reveal their best stock — and flag underpriced DEALS and OVER-priced asks so you never overpay.', icon: '🤝' },
  hobbyWire: { name: 'Hobby Wire',          cost: 800,  desc: 'A trade-news wire + your counter notebook, pinned to the Buy tab: what walk-ins keep asking for at your counter, and which sets are running hot or cold on the living market — so you source what will actually move.', icon: '📈' },
  almanac:  { name: "Breaker's Almanac",    cost: 1900, desc: 'The ripper\'s spreadsheet, pinned to the Buy tab: live rip EV per pack and per box for every shop set (Monte-Carlo, riding today\'s market), chase density, and trend — see which sets waste the least to open, and catch a hot market pushing a box toward break-even.', icon: '📐' },
  banner:   { name: 'Charity Banner',       cost: 300, desc: 'Generous acts (giving cards away, fair deals) grant +50% extra notoriety.', icon: '🎗️' },
  autoSell: { name: 'Auto-Sell Service',    cost: 1800, desc: 'Hands-off selling: willing buyers auto-purchase your listings at 80% of market value — no need to accept each offer. Flag any listing to opt out and hold for a manual offer.', icon: '🤖' },
  autoBinder: { name: 'Binder Curator', cost: 2000, desc: 'A meticulous curator files your masterset binder overnight: every empty slot a loose copy can fill gets your best copy moved in automatically — the binder\'s "add everything possible", every night. Graded slabs are left for you to place by hand. Binder cards are safe from bulk actions; take one back out any time.', icon: '📒' },
  autoHold: { name: 'Client Concierge', cost: 3500, desc: 'Your assistant keeps a client ledger: overnight they set a sealed piece aside behind the counter for a regular with nothing on hold — matched to their collecting focus when possible. Pickups pay cash at the walk-in + hold premium. Never touches 🔒 kept stock or appreciating vintage/aftermarket sealed. Requires a Shop Assistant.', icon: '🗝️', needs: 'staff' },
  wantBroker: { name: 'Want-List Broker', cost: 2800, desc: 'A broker works demand overnight: collector wants and forum WTB posts get filled automatically from your sellable cards — always the CHEAPEST matching copy, always at the want\'s premium over market. Never touches 🔒 kept, held, featured, or binder cards.', icon: '💼' },
  binKeeper: { name: 'Bin Keeper', cost: 1800, desc: 'A tireless closer who keeps your loose-pack bin full overnight: every bin you\'re running gets topped back up from storeroom packs — and when the backstock runs dry, they break product down for you (a case into boxes, then whichever box gives up the least paper value into packs). Never touches 🔒 kept, held, or vintage sealed. Requires a Pack Bin.', icon: '🪓', needs: 'packBin' },
  repricer: { name: 'Repricing Service', cost: 1200, desc: 'No more stale listings: anything that sits a week with lookers but no bites gets walked down 5%/day toward market until it moves. Priced-right stock instead of a graveyard.', icon: '🏷️' },
  offerDesk: { name: 'Offer Desk', cost: 1500, desc: 'Your desk accepts any standing offer that nets 90%+ of your ask — the "close enough, take it" call you\'d make yourself. Listings you flag 🤖-manual are left for you to judge. Requires the Auto-Sell Service.', icon: '📨', needs: 'autoSell' },
  newsletter: { name: 'Client Newsletter', cost: 900, desc: 'A monthly mailer keeps your regulars warm: trust decays half as fast, and a lapsed regular occasionally comes back through the door. Requires a Brick-and-Mortar Store.', icon: '💌', needs: 'storefront' },
  consignCase: { name: 'Locking Consignment Case', cost: 900, desc: 'A locking glass case just for locals\' cards: carry up to 5 consignments at once (was 2), and the secure setup justifies a few extra points of commission on every deal. Requires a Brick-and-Mortar Store.', icon: '🗄️', needs: 'storefront' },
  buyAd: { name: '"We Buy Collections" Ad', cost: 1200, desc: 'A radio spot and a big window banner: ~40% more collection sellers walk in wanting to sell you their cards. Stacks with your posted buylist rate — the volume play for the shop\'s best sourcing channel. Requires a Brick-and-Mortar Store.', icon: '📻', needs: 'storefront' },
  preferredAccount: { name: 'Preferred Account', cost: 2000, desc: 'The distributor finance desk upgrades your paper: credit-line interest drops 4% → 2.5%/mo and the limit rises from 50% to 65% of your net worth. Leverage for the buy-big playstyle.', icon: '🏦' },
  wrapPress: { name: 'Custom Wrap Press', cost: 800, desc: 'A foil sealer and custom-printed wrappers for your mystery packs: pro presentation sells more packs on every channel, and a thin pack stings buyers a little less — reputation losses are softened. The repack line goes retail-grade.', icon: '✨' },
  certOdds: { name: 'Certified Odds', cost: 1600, desc: 'A third-party audit stamps every 📋 PUBLISHED pack line with certified pull odds: shoppers trust a posted board far more, so published lines sell noticeably faster, and honest thin packs sting even less (buyers knew the real numbers). It does NOT cover a broken promise — a pack that opens under your posted floor burns hotter than ever. Publish a line from its editor to use it. Requires the Custom Wrap Press.', icon: '📋', needs: 'wrapPress' },
  specialOrders: { name: 'Special Orders Book', cost: 1800, icon: '📇', needs: 'storefront', desc: 'A ledger by the till and an account with every distributor who\'ll take a one-off. When a walk-in asks for sealed you don\'t carry, you get a THIRD answer besides "sorry" — take a 35% deposit and order it in. They pay the balance at pickup, at retail plus a 10% convenience premium, and a customer who\'s already paid a deposit doesn\'t price-shop you. It is a promise, though: miss the date and it\'s a refund, a rep hit, and a line on the demand board. Requires a Brick-and-Mortar Store.' },
  secondLocation: { name: 'Second Location', cost: 50000, tier: 'big', icon: '🏬', needs: 'storefront', desc: 'A second shop across the county, run by a manager you hire and stock you send over. It trades on its own each day — counter business, walk-ins, its own slice of the town\'s foot traffic — at roughly 40% of the main store\'s volume, entirely hands-off. It also has its own lease and its own payroll, and it does NOT get to raid the main store\'s shelves: it sells what you allocate to it and nothing else. Run it dry and it sits there costing you money; leave it unfunded too long and it closes. The endgame move from shopkeeper to owner. Requires a Brick-and-Mortar Store.' },
  storageUnit: { name: 'Storage Unit', cost: 1500, desc: 'A rented unit two streets over: +15 idle-sealed units stored free before the daily storage fee bites. The bridge between the apartment closet and the 🏛️ Vault.', icon: '🏗️' },
  // 📱 The content tree: building an audience without going live. Every one of these turns
  // something you were ALREADY doing into reach (see game/content.js for the math + rails).
  shortsChannel: { name: 'Shorts Channel', cost: 700, icon: '📱', needs: 'smartphone', desc: 'Vertical video, shot on the counter: the moments you already make become POSTS. A chase out of a kitchen-table rip, a gem 10 back from the grader, a collection dumped on your table, a master set page finally filled — each one circulates for a couple of days recruiting followers, and no broadcast day is spent. Most posts do their small honest numbers; every so often the algorithm catches one and it does absurd numbers instead. Requires a Smartphone.' },
  setChallenge: { name: 'Master Set Challenge', cost: 1500, icon: '🃏', needs: 'shortsChannel', desc: 'Announce a set you\'re chasing and film the hunt. While a challenge runs: show dealers pull that set\'s singles out for you (their bins skew toward it — same cards, same prices, you just FIND them), every card you land is an episode that recruits followers, and finishing it on camera is the payoff video — a big one-time follower haul, 🔥 hype and 🎫 clout on top of the completion bonus. Declare a set you\'re nearly done with and it pays a fraction; that\'s not a challenge. One at a time, and walking away from one costs you a little face. Requires a Shorts Channel.' },
  showVlog: { name: 'Show Vlog Kit', cost: 1200, icon: '🎥', needs: 'smartphone', desc: 'A gimbal, a shotgun mic, and the nerve to film in a crowded hall: every show trip becomes a "come to a card show with me" vlog. Followers scaled by the size of the hall and the best thing you came home with, a couple of days of extra listing traffic on the drive back, and people recognize you at the NEXT show — +12% booth traffic, stacking with your signage. Works whether you\'re vending or just shopping. Requires a Smartphone.' },
  contentCalendar: { name: 'Content Calendar', cost: 2000, icon: '🔁', needs: 'shortsChannel', desc: 'An editor and a schedule: moments stop firing the day they happen and bank instead, releasing ONE post a day. A single hot rip day feeds a dry week — and posting every day builds a cadence the algorithm rewards (up to +25% on every post\'s reach). Consistency beats bingeing, same as it does on stream. Requires a Shorts Channel.' },
  discord: { name: 'Community Discord', cost: 1600, icon: '💬', needs: 'shortsChannel', desc: 'A server for the people who watch you — and they buy cards. Collector wants post far more often and skew toward sets you ACTUALLY HOLD (members ask the dealer they know), the board carries one more live want at a time, and every so often a member stops being an audience member and becomes a regular customer. Where 🛡️ Mod Team protects the channel, this points it at the shop. Requires a Shorts Channel.' },
  collabs: { name: 'Creator Collabs', cost: 2500, icon: '🤝', needs: 'streaming', desc: 'You start showing up on OTHER people\'s channels: guest breaker spots, joint openings, podcast drop-ins. Their audience meets you and a chunk of it follows home — bigger and far more reliable than waiting on a random raid, and it costs no broadcast day of yours because it\'s their broadcast. Work with the same creator repeatedly and they give you the better slot. Requires a Streaming Setup.' },
  podcast: { name: 'Hobby Podcast', cost: 1800, icon: '🎙️', desc: 'A weekly episode with the same three people arguing about grading. It spikes nothing — it just means everyone in the hobby knows who you are, permanently: a steady ⭐ reputation drip week after week, plus followers. And you hear things first: a reprint wave reaches your mic about two days before it reaches the price boards, which is a window to sell into the old price while everyone else finds out.' },
  brandDeals: { name: 'Brand Deals Desk', cost: 4000, icon: '💰', needs: 'shortsChannel', desc: 'Accessory brands start sliding into your inbox. A signed deal pays a MONTHLY check scaled by your followers and subscribers (capped — it\'s a supplement, not a salary), in exchange for a real obligation: actually feature them, by ripping a few packs of the set they\'re pushing, inside the window. Deliver and the money keeps coming; ghost them and the deal lapses with a public shrug and a rep ding. Needs a real audience before anyone calls. Requires a Shorts Channel.' },

  clipEditor: { name: 'Clip Editor', cost: 1100, desc: 'An editor cuts EVERY broadcast into a highlight reel: streams without an organic viral moment still put out a clip that recruits followers for a couple of days after the wrap. God-pack clips are untouched — those cut themselves. Requires a Streaming Setup.', icon: '🎬', needs: 'streaming' },
  modTeam: { name: 'Mod Team', cost: 1500, desc: 'Trusted mods keep the channel alive between broadcasts: subscriber churn while you\'re dark is HALVED, and a well-run room gets raided by other streamers ~50% more often. Requires a Streaming Setup.', icon: '🛡️', needs: 'streaming' },
  standingOrder: { name: 'Standing Order', cost: 2500, desc: 'Put one product on subscription with a distributor (tap 📋 on any product line in the Buy tab): it ships automatically every week at your rapport price, while they have stock and you have cash.', icon: '📋' },
  purchasingAgent: { name: 'Purchasing Agent', cost: 3500, icon: '🧮', needs: 'standingOrder', desc: 'A buyer on retainer who works your REORDER POINTS: set a minimum for any product type — say, 2 Elite Trainer Boxes of everything — and each night they top EVERY shop set back up to it, cheapest unlocked distributor first at your rapport pricing (🎌 imports included — those ride the boat). Counts what you hold, what\'s at a show, and what\'s already shipping, always leaves ~2 days of bills in the till, and never touches your credit line. Set the minimums on the Buy tab. Requires a Standing Order.' },
  vintageScout: { name: 'Vintage Scout', cost: 4000, desc: 'A picker who knows every back room: distributors turn up sealed vintage finds ~50% more often, and high-rapport sellers reserve holds for you more often too. Requires the Dealer Network.', icon: '🕵️', needs: 'network' },
  security: { name: 'Security System', cost: 3000, desc: 'Cameras, sensors, and a loud alarm: nothing gets pocketed from your stock again — attempted thefts are caught at the door instead of costing you a card. Requires a Brick-and-Mortar Store.', icon: '🚨', needs: 'storefront' },
  tourVan: { name: 'Tour Van', cost: 12000, desc: 'A kitted-out van with racks, cases, and a cot: every show trip takes ONE DAY FEWER (minimum 1) — Worlds in 3 days instead of 4. Less time away, fewer missed orders, less overhead per trip.', icon: '🚐' },
  sponsorship: { name: 'Show Sponsorship', cost: 25000, tier: 'big', desc: 'Your name on the banners of the whole show circuit: vendor booth fees WAIVED at every show (premium spots included), pre-show leads seek you out far more often, and every show you attend pays +2 notoriety. Requires the Vendor Setup.', icon: '📣', needs: 'vendorSetup' },
  vault: { name: 'The Vault & Showroom', cost: 35000, tier: 'big', desc: 'A climate-controlled vault behind a lit showroom floor: storage fees WAIVED entirely, the display case doubles to 8 featured slots (deeper whale bait), and cards never get dinged in storage again. The endgame home for a serious hoard. Requires a Brick-and-Mortar Store.', icon: '🏛️', needs: 'storefront' },
  importLicense: { name: 'Import License', cost: 6000, tier: 'big', icon: '⛩️', desc: 'A customs broker, a freight forwarder, and a wholesale account in Osaka — opens 🎌 Japan Direct on the Buy tab: authentic JAPANESE sealed product, priced off the real JP singles market. JP boosters are 5 cards with a DENSER hit ladder than English (SARs, golds), and boxes run closer to break-even — the import play real rippers chase. Shipments cross the Pacific: orders land in your storeroom ~3 days after you pay. More JP sets join the shelf as their data completes.' },
}
