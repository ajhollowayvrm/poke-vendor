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
//   • Demand gates:     INBOUND_NOTORIETY_GATE, REGULAR_FORM_GATE, BARGAIN_ASK_MULT, dayOrderChance
//   • Livestream:       STREAM_HYPE_DAYS
//   • Upgrades table:   UPGRADES

import { round2 } from '../engine'

export const STARTING_CASH = 2500

// --- Survival economy ------------------------------------------------------
// Each game-day you earn your job's wage and pay rent. The job is a SAFETY NET, not a
// living: it's tuned to barely clear rent, so working it keeps the lights on but builds
// almost no wealth — the only real way up is cards. Going full-time means giving up that
// thin cushion, so it's a real decision. Run out of money with nothing left to sell → lose.
export const RENT_PER_DAY = 40
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
// Rolling window (game-days) used to estimate your card income/day for the full-time
// sustainability readout. Long enough to smooth out spiky sale days.
export const INCOME_WINDOW_DAYS = 7

// --- Inventory carrying cost (money tied up in unsold stock BITES) -----------
// Sitting on a pile of sealed product and unsold listings isn't free — you're
// renting space and capital is frozen. You get a free allowance; every item beyond
// it drains a small daily storage fee. This turns "buy the whole case and hoard it"
// into a real decision: hold too much unsold and the daily bleed eats your runway.
// Counted units = sealed inventory + live listings + consignments + shop-shelf cards.
export const STORAGE_FREE_UNITS = 15   // this many held items cost nothing to store
export const STORAGE_PER_UNIT = 2      // $/day for each held item beyond the allowance
// How many held units are you carrying right now (drives the storage fee + the readout).
export function heldUnits(s) {
  return (s.sealedInventory?.length || 0) + (s.listings?.length || 0)
    + (s.consignments?.length || 0) + (s.shopDisplay?.length || 0)
}
// Daily storage fee for the current inventory load (0 while under the free allowance).
export function storageFee(s) {
  const over = Math.max(0, heldUnits(s) - STORAGE_FREE_UNITS)
  return round2(over * STORAGE_PER_UNIT)
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

export function makeWeeklyGoals(noto) {
  const shuffled = [...GOAL_POOL].sort(() => Math.random() - 0.5)
  const count = 3 + (Math.random() < 0.5 ? 1 : 0) // 3–4 goals for the week
  const mult = 1 + noto / 150 // rewards scale gently with fame
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
// Per-day probability that an unsolicited home order arrives on each channel. Zero until
// you've made a name (INBOUND_NOTORIETY_GATE), then ramps from a sparse floor toward a cap.
// e.g. online: 0 below the gate → ~0.10/day just past it → ~0.85 at noto 200.
// EXCEPTION: if you've listed something really cheap (hasBargain), online bargain-hunters
// trickle in regardless of fame — a deliberate fire-sale is the other way to start the loop.
export function dayOrderChance(channel, notoriety, hasBargain = false) {
  if (notoriety < INBOUND_NOTORIETY_GATE) {
    // unknown vendor → no inbound from reputation; the only draw is a steep deal.
    return channel === 'online' && hasBargain ? 0.18 : 0
  }
  const floor = channel === 'online' ? 0.10 : 0.06 // chance just past the gate
  const cap   = channel === 'online' ? 0.85 : 0.65
  const ramp  = Math.min(1, (notoriety - INBOUND_NOTORIETY_GATE) / 200) // 0→1 across the fame curve
  const base  = floor + (cap - floor) * ramp
  // A bargain listing adds extra pull on top of your reputation, too.
  return channel === 'online' && hasBargain ? Math.min(0.9, base + 0.12) : base
}

// Going live pumps your whole storefront for a few days after: every listing draws
// far more eyes (stream viewers who came to shop).
export const STREAM_HYPE_DAYS = 4

// --- Upgrades: buy once, keep forever ---------------------------------------
// Costs are scaled to the real economy: packs ~$5-15, ETBs ~$150, show entry up
// to $2,500. So cheap accessories are tens-to-low-hundreds, real business
// investments are thousands, and a physical storefront is the big commitment.
export const UPGRADES = {
  // THE major commitment: a real lease + buildout. Unlocks walk-ins + Cash.
  storefront: { name: 'Brick-and-Mortar Store', cost: 8000, desc: 'Sign a lease and open a real shop. Local customers walk in for in-person sales, and you can accept Cash. The big leap from flipper to store owner.', icon: '🏬', tier: 'big' },

  // Payment rails — each its own setup. Capture buyers who won't use Venmo.
  payPaypal: { name: 'Accept PayPal',            cost: 120,  desc: 'Take PayPal — a huge share of online buyers prefer it.', icon: '🅿️', group: 'payment' },
  payCard:   { name: 'Accept Credit/Debit Cards', cost: 400,  desc: 'A card reader / merchant account so buyers can pay by card. Captures the most sales.', icon: '💳', group: 'payment' },

  // Keep earning while you're away at a show.
  smartphone: { name: 'Smartphone', cost: 1000, desc: 'Field ONLINE orders from anywhere — they keep coming in even while you\'re away at a show. Has contactless tap-to-pay built in.', icon: '📱' },
  streaming:  { name: 'Streaming Setup', cost: 900, desc: 'Camera, lights & capture card. Go LIVE and rip product on stream — viewers tune in, react, and tip, and a hot stream pumps your notoriety and listing traffic. Unlocks box breaks.', icon: '🔴' },
  staff:      { name: 'Shop Assistant', cost: 2500, desc: 'Hire staff to mind the store. WALK-IN customers are handled while you\'re at a show. Requires a Brick-and-Mortar Store.', icon: '🧑‍💼', needs: 'storefront' },

  // Book a booth at shows to SELL your own cards.
  vendorSetup: { name: 'Vendor Setup', cost: 1200, desc: 'A folding table, display case, banner & dealer paperwork. Lets you book a BOOTH at shows to sell your own cards (pay a per-show vendor fee). Without it, you can only attend to shop.', icon: '🎪' },

  signage:  { name: 'Eye-Catching Signage', cost: 150,  desc: '+15% foot traffic (shows, and your store if open).', icon: '🪧' },
  cases:    { name: 'Glass Display Cases',  cost: 500,  desc: 'Offers on your cards come in ~12% higher.', icon: '🗄️' },
  ticker:   { name: 'Visitor Ticker',       cost: 200,  desc: 'Alerts you when someone is at your stand while you browse a show hall.', icon: '🔔' },
  loupe:    { name: "Jeweler's Loupe",      cost: 450,  desc: 'Slightly better grade odds when you submit cards. Also gives a PRECISE cut/centering read on any raw card — without it the eyeball read is fuzzy.', icon: '🔍' },
  authkit:  { name: 'Authentication Kit',   cost: 600,  desc: 'A precision scale, UV blacklight & reference guides for spotting resealed wrappers and weighed/searched packs. Lets you AUTHENTICATE sealed deals from strangers before you buy — catching most fakes (crude ones almost always; sophisticated reseals can still slip through, especially vintage).', icon: '🔬' },
  network:  { name: 'Dealer Network',       cost: 1500, desc: 'Famous vendors reveal their best stock — and flag underpriced DEALS and OVER-priced asks so you never overpay.', icon: '🤝' },
  banner:   { name: 'Charity Banner',       cost: 300, desc: 'Generous acts (giving cards away, fair deals) grant +50% extra notoriety.', icon: '🎗️' },
  autoSell: { name: 'Auto-Sell Service',    cost: 1800, desc: 'Hands-off selling: willing buyers auto-purchase your listings at 80% of market value — no need to accept each offer. Flag any listing to opt out and hold for a manual offer.', icon: '🤖' },
}
