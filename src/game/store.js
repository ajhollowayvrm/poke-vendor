import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { cardValue, GRADING, rollGrade, round2, rawValue, gradingFee, graderTier, rarityRank, bulkDiscount,
  BUYER_SAVVY, rollBuyerSavvy, buyerMaxMult, dailyViewers, isBulkCard } from './engine'
import { boothEncounter, makeWant, cardMatchesWant, encounterStillValid } from './shows'

const STARTING_CASH = 5000

// --- Survival economy ------------------------------------------------------
// Each game-day you earn your job's wage and pay rent. The job is the safety net
// (and the friction): it pays steady but it's not the dream — cards are the path up.
// Run out of money with nothing left to sell and you lose.
export const RENT_PER_DAY = 40
// Low-level jobs, ascending wage. Better jobs gate behind notoriety (you're more
// hireable as your name gets around). Wage is per game-day. `start` = days until a
// newly-taken job begins paying (re-apply friction); the starter job starts instantly.
export const JOBS = [
  { id: 'none',     title: 'Unemployed',          wage: 0,   minNoto: 0,   start: 0 },
  { id: 'retail',   title: 'Card shop clerk',     wage: 70,  minNoto: 0,   start: 0 },
  { id: 'barista',  title: 'Barista',             wage: 95,  minNoto: 10,  start: 1 },
  { id: 'warehouse',title: 'Warehouse picker',    wage: 130, minNoto: 25,  start: 1 },
  { id: 'manager',  title: 'Retail manager',      wage: 180, minNoto: 60,  start: 2 },
  { id: 'broker',   title: 'Card-shop buyer',     wage: 260, minNoto: 120, start: 2 },
]
export const STARTER_JOB = JOBS.find(j => j.id === 'retail')
export function jobById(id) { return JOBS.find(j => j.id === id) || null }
// Days you can stay behind on rent before it's game over (the grace/comeback window).
export const RENT_GRACE_DAYS = 3
// Rolling window (game-days) used to estimate your card income/day for the full-time
// sustainability readout. Long enough to smooth out spiky sale days.
export const INCOME_WINDOW_DAYS = 7

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

// The game runs in REAL TIME: 1 game-day = `dayMinutes` real minutes (default 15).
// Everything daily — orders, listings/consignments, wages, rent, AND grading — rides this
// one clock, so a day always means the same thing. `dayLengthMs()` reads the live setting.
export const DEFAULT_DAY_MINUTES = 15
export function dayLengthMs(state) {
  const m = state?.settings?.dayMinutes ?? DEFAULT_DAY_MINUTES
  return Math.max(0.05, m) * 60 * 1000 // floor at ~3s for playtesting
}
// Back-compat export name kept for any stray import; equals the default day length.
export const DAY_MS_SIM = DEFAULT_DAY_MINUTES * 60 * 1000

// Card ids are "<setId>-<number>" (e.g. "me4-2"); the set id is everything before
// the last hyphen so multi-hyphen set ids like "sv8pt5" survive.
function setIdOf(card) {
  const id = card?.id
  if (!id) return null
  const i = id.lastIndexOf('-')
  return i > 0 ? id.slice(0, i) : id
}
// Merge a delta into a per-set ledger entry. Returns a new bySet object.
function bumpSet(bySet, setId, delta) {
  if (!setId) return bySet
  const cur = bySet[setId] || { spent: 0, pulledValue: 0, packsOpened: 0, cardsPulled: 0, hits: 0 }
  return { ...bySet, [setId]: {
    spent: round2(cur.spent + (delta.spent || 0)),
    pulledValue: round2(cur.pulledValue + (delta.pulledValue || 0)),
    packsOpened: cur.packsOpened + (delta.packsOpened || 0),
    cardsPulled: cur.cardsPulled + (delta.cardsPulled || 0),
    hits: cur.hits + (delta.hits || 0),
  } }
}

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
  tap:    { name: 'Tap To Pay',        short: 'Tap',     icon: '📲', viaUpgrade: 'payTap',     feePct: 0.026, feeFlat: 0.10 },
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
function methodLabel(key) {
  const m = PAYMENT_METHODS[key]
  return m ? `${m.icon} ${m.short}` : 'cash'
}
function feeNote(fee) { return fee > 0 ? ` − $${fee.toFixed(2)} fee` : '' }
function appendFeeMsg(msg, fee, payMethod, net = null) {
  if (fee <= 0) return msg
  const m = PAYMENT_METHODS[payMethod]
  let out = `${msg} (${m?.short || 'processing'} took $${fee.toFixed(2)} in fees.)`.trim()
  // When a fee rail eats the whole sale, nudge toward a fee-free method next time.
  if (net != null && net <= 0.005) out += ' 💡 That tiny sale netted ~$0 — fee-free rails (Venmo/Cash) keep the cents on sub-$1 cards.'
  return out
}
// True when this gross on this rail would net ~nothing after fees.
export function netsZero(gross, payMethod) {
  return processingFee(gross, payMethod).net <= 0.005 && gross > 0
}

const CALENDAR_DAYS = 30
export const INBOX_CAP = 8

// --- Daily goals -----------------------------------------------------------
// Pool of small objectives; 2–3 roll each game-day. Reward scales a touch with
// notoriety. Progress is bumped by gameplay actions and auto-pays on completion.
const GOAL_POOL = [
  { key: 'sell',   label: n => `Sell ${n} card${n>1?'s':''}`,        targets: [2,3,4],  cash: 25, noto: 1 },
  { key: 'grade',  label: n => `Submit ${n} card${n>1?'s':''} to grade`, targets: [1,2], cash: 30, noto: 1 },
  { key: 'rip',    label: n => `Rip ${n} pack${n>1?'s':''}`,         targets: [3,5,8],  cash: 20, noto: 1 },
  { key: 'buy',    label: n => `Buy ${n} card${n>1?'s':''} from a vendor`, targets: [1,2], cash: 25, noto: 1 },
  { key: 'help',   label: () => `Make someone's day (give a card free)`, targets: [1], cash: 0, noto: 4 },
  { key: 'want',   label: n => `Fill ${n} collector want${n>1?'s':''}`, targets: [1], cash: 40, noto: 2 },
  { key: 'attend', label: () => `Attend a card show`,                targets: [1], cash: 30, noto: 1 },
  { key: 'profit', label: n => `Earn $${n} in sales`,               targets: [100,250], cash: 30, noto: 1 },
]
function makeDailyGoals(noto) {
  const shuffled = [...GOAL_POOL].sort(() => Math.random() - 0.5)
  const count = 2 + (Math.random() < 0.5 ? 1 : 0) // 2–3 goals
  const mult = 1 + noto / 150 // rewards scale gently with fame
  return shuffled.slice(0, count).map(g => {
    const target = g.targets[Math.floor(Math.random() * g.targets.length)]
    return {
      key: g.key, target, progress: 0, done: false,
      label: g.label(target),
      cash: Math.round(g.cash * mult), noto: g.noto,
    }
  })
}
// Per-day probability that a home order arrives on each channel.
// Flat & sparse early (a fresh vendor barely gets orders), ramping with
// notoriety toward a cap. e.g. online: ~0.08/day at noto 0 → ~0.85 at noto 200.
export function dayOrderChance(channel, notoriety) {
  const floor = channel === 'online' ? 0.08 : 0.04 // chance at notoriety 0
  const cap   = channel === 'online' ? 0.85 : 0.65
  const ramp  = Math.min(1, notoriety / 200)        // 0→1 across the fame curve
  return floor + (cap - floor) * ramp
}
// After this many days drawing browsers with zero buyers/offers, a listing goes
// STALE (almost certainly priced too high) — flagged in the UI so you reprice/pull.
const LISTING_STALE_DAYS = 7
// Tweeting a listing: a hype window of extra eyes (Twitter mutuals) for a few days.
export const TWEET_HYPE_DAYS = 3
const TWEET_BOOST = 2.2          // viewer multiplier while the hype window is live
const TWEET_NOTORIETY = 2        // one-time rep bump for posting
let _offerSeq = 0 // monotonic id for offers (Date.now/random are banned in this module's hot paths)

// Simulate `days` of customers browsing your own-site listings. Each day every live
// listing draws some shoppers; each shopper rolls a savvy level and a max willingness
// to pay. If your ask is within their max → they BUY at ask. If it's just over their
// max → a chance they leave a lower OFFER you can accept/decline. Otherwise they pass.
// Returns { listings, soldProceeds, sold:[{name,net,savvy}], newOffers, staleNow:[names] }.
function tickListings(listings, days, noto) {
  let soldProceeds = 0
  const sold = []
  const staleNow = []
  let newOffers = 0
  const remaining = []
  for (const l of (listings || [])) {
    // expired/awaiting-action listings just sit until you act on them
    if (l.expired) { remaining.push(l); continue }
    let cur = { ...l, offers: [...(l.offers || [])] }
    let didSell = false
    for (let day = 0; day < days && !didSell; day++) {
      // Tweet hype: extra eyes (Twitter mutuals) while the hype window is open.
      const hyped = (cur.hypeDaysLeft || 0) > 0
      const viewers = dailyViewers(cur.card, cur.askMult, noto, Math.random, hyped ? TWEET_BOOST : 1)
      cur.views += viewers
      for (let v = 0; v < viewers; v++) {
        // While hyped, a chunk of the extra traffic is Twitter mutuals (flavor on the sale).
        const mutual = hyped && Math.random() < 0.4
        const savvy = rollBuyerSavvy()
        const max = buyerMaxMult(savvy, noto, cur.card)
        const label = mutual ? 'Twitter mutual' : BUYER_SAVVY[savvy].label
        if (cur.askMult <= max) {
          // willing to pay the ask → sale at your price (net of fee)
          soldProceeds = round2(soldProceeds + cur.net)
          sold.push({ name: cur.card.name, net: cur.net, savvy: label })
          didSell = true
          break
        }
        // just over their max → occasional lowball offer at what they'd pay.
        // Sharks lowball most; casuals rarely bother. Cap standing offers at 3.
        const overBy = cur.askMult - max
        if (overBy < 0.35 && (cur.offers.length < 3) && Math.random() < (savvy === 'shark' ? 0.5 : savvy === 'sharp' ? 0.3 : 0.12)) {
          const market = cardValue(cur.card)
          const amount = round2(market * max)
          const fee = round2(amount * 0.05)
          cur.offers.push({ id: ++_offerSeq, amount, net: round2(amount - fee), savvy, savvyLabel: label, icon: mutual ? '🐦' : BUYER_SAVVY[savvy].icon })
          newOffers++
        }
      }
      cur.age = (cur.age || 0) + 1
      if (cur.hypeDaysLeft > 0) cur.hypeDaysLeft -= 1
    }
    if (didSell) continue // sold → drops off the board
    // mark stale if it's drawn plenty of eyes over enough days with no traction
    if (!cur.stale && (cur.age || 0) >= LISTING_STALE_DAYS && cur.offers.length === 0 && cur.views >= 5) {
      cur.stale = true
      staleNow.push(cur.card.name)
    }
    remaining.push(cur)
  }
  return { listings: remaining, soldProceeds, sold, newOffers, staleNow }
}

// Advance the calendar by `days`, generating home orders for each day passed.
// `away` = these days are spent at a show: online orders only come in if you own
// a Smartphone, walk-ins only if you have Shop Assistant; otherwise they're missed.
function advanceDaysWith(set, get, days, away) {
  const s = get()
  const noto = s.notoriety
  const hasStore = !!s.upgrades.storefront
  const onlineOK = away ? !!s.upgrades.smartphone : true
  // Walk-ins are covered while away if you have the Shop Assistant upgrade OR any employee.
  const walkinOK = away ? (!!s.upgrades.staff || (s.employees || []).length > 0) : true
  const accepted = acceptedMethods(s.upgrades) // buyers prefer methods you can take
  let missedOnline = 0, missedWalkin = 0
  let onlineCount = 0
  const newOrders = []
  // Survival accrual across the days passed (settled against cash after sales below).
  let wagesEarned = 0, rentDue = 0
  let pendingJob = s.pendingJob
  let activeJob = s.job
  // Employees boost order throughput (and their payroll is settled below). Capped so a
  // packed payroll can't push order chance past ~1.
  const empList = (s.employees || []).map(employeeById).filter(Boolean)
  const empThroughput = Math.min(1.5, empList.reduce((a, e) => a + e.throughput, 0))
  const orderMult = 1 + empThroughput
  let payrollDue = 0, leaseDue = 0
  // Online buyers can only make offers on cards you've put up for sale (listed/tweeted).
  const listedCards = (s.listings || []).map(l => l.card)
  for (let i = 0; i < days; i++) {
    const dayNo = s.currentDay + i + 1 // the day being entered
    // a pending job starts paying once its start day arrives
    if (pendingJob && dayNo >= pendingJob.startsOnDay) { activeJob = pendingJob.job; pendingJob = null }
    wagesEarned += activeJob?.wage || 0
    rentDue += RENT_PER_DAY
    if (hasStore) { leaseDue += STORE_LEASE_PER_DAY; payrollDue += empList.reduce((a, e) => a + e.wage, 0) }
    // online channel (employees raise the hit chance)
    if (Math.random() < Math.min(0.97, dayOrderChance('online', noto) * orderMult)) {
      if (onlineOK) { newOrders.push({ ...boothEncounter(noto, s.collection, 'online', accepted, listedCards), channel: 'online' }); onlineCount++ }
      else missedOnline++
    }
    // walk-in channel (only if you have a physical store)
    if (hasStore && Math.random() < Math.min(0.97, dayOrderChance('walkin', noto) * orderMult)) {
      if (walkinOK) newOrders.push({ ...boothEncounter(noto, s.collection, 'walkin', accepted, listedCards), channel: 'walkin' })
      else missedWalkin++
    }
  }
  // NEW-PLAYER GUARANTEE: a fresh vendor at notoriety 0 can otherwise go 10–15 days
  // with no online orders (1-in-12/day) and feel like nothing's happening. If you've
  // never received an online order and these are home days, guarantee your first one
  // by the end of the first few days so the loop actually starts.
  if (onlineOK && onlineCount === 0 && (s.onlineOrdersEver || 0) === 0 && s.currentDay + days <= 5) {
    newOrders.push({ ...boothEncounter(noto, s.collection, 'online', accepted, listedCards), channel: 'online', _firstOrder: true })
    onlineCount++
  }
  // advance the day counter, rolling months as needed
  let d = s.currentDay + days, seed = s.showSeed, months = s.monthsElapsed
  while (d > CALENDAR_DAYS) {
    d -= CALENDAR_DAYS
    seed = (seed * 1103515245 + 12345) >>> 0 || 7
    months += 1
    get().log('month', `A new month of shows begins.`, 0)
  }
  // resolve consignments whose timer elapsed over the days passed
  let soldProceeds = 0
  const remainingConsign = []
  for (const c of s.consignments) {
    const left = c.daysLeft - days
    if (left <= 0) { soldProceeds = round2(soldProceeds + c.net); get().log('sell', `Consignment sold: ${c.card.name}`, c.net) }
    else remainingConsign.push({ ...c, daysLeft: left })
  }
  // resolve your own-site listings: real CUSTOMERS browse them over the days passed
  // and buy (at ask) or leave an offer based on their savvy vs your price. A listing
  // priced too high just keeps drawing lookers and never sells (eventually flagged stale).
  const lt = tickListings(s.listings, days, noto)
  const remainingListings = lt.listings
  soldProceeds = round2(soldProceeds + lt.soldProceeds)
  for (const sale of lt.sold) get().log('sell', `Sold ${sale.name} to a ${sale.savvy} — $${sale.net.toFixed(2)}`, sale.net)
  if (lt.newOffers) get().log('listing', `${lt.newOffers} new offer${lt.newOffers > 1 ? 's' : ''} on your listings — review them on the Sell tab.`, 0)
  for (const name of lt.staleNow) get().log('listing', `${name} keeps getting looks but no buyers — likely priced too high. Reprice or pull it.`, 0)
  // age out want-lists, then maybe post new collector wants (scaled by notoriety)
  let wants = s.wantList.map(w => ({ ...w, daysLeft: w.daysLeft - days })).filter(w => w.daysLeft > 0)
  const maxWants = 2 + Math.floor(noto / 80) // more fame → more collectors seek you out
  const wantChancePerDay = 0.25 + noto / 300
  for (let i = 0; i < days && wants.length < maxWants; i++) {
    if (Math.random() < wantChancePerDay) wants = [makeWant(noto >= 120), ...wants]
  }
  set(st => ({
    currentDay: d, showSeed: seed, monthsElapsed: months,
    onlineOrdersEver: (st.onlineOrdersEver || 0) + onlineCount,
    boothInbox: [...newOrders.reverse(), ...st.boothInbox].slice(0, INBOX_CAP),
    consignments: remainingConsign,
    listings: remainingListings,
    wantList: wants,
    dailyGoals: makeDailyGoals(noto), // fresh goals each new day
    goalsDay: d,
    job: activeJob,        // a pending job may have started during these days
    pendingJob,
  }))
  // pay sales + wages in, then settle rent.
  if (soldProceeds > 0) get().earn(soldProceeds)
  // credit listing sales toward the daily sell/profit goals
  for (const sale of lt.sold) { get().bumpGoal('sell', 1); get().bumpGoal('profit', sale.net) }
  if (wagesEarned > 0) { get().earn(wagesEarned, { wage: true }); get().log('wage', `Wages: ${activeJob?.title || 'job'} (+$${wagesEarned.toFixed(2)})`, wagesEarned) }
  if (rentDue > 0) settleRent(set, get, rentDue, days)
  // Brick & mortar: settle the daily lease + payroll. Failing this over the grace window
  // closes the store (you keep the cards/cash — you just lose the lease + staff).
  if (hasStore && (leaseDue + payrollDue) > 0) settleStore(set, get, leaseDue, payrollDue, days)
  set(st => ({ cumWages: round2((st.cumWages || 0) + wagesEarned) })) // wages tracked separately from card income
  if (missedOnline) get().log('missed', `Missed ${missedOnline} online order${missedOnline>1?'s':''} while away (get a 📱 Smartphone).`, 0)
  if (missedWalkin) get().log('missed', `Missed ${missedWalkin} walk-in${missedWalkin>1?'s':''} while away (hire a 🧑‍💼 Shop Assistant).`, 0)
  return { added: newOrders.length, missedOnline, missedWalkin, wages: round2(wagesEarned), rent: round2(rentDue),
    lease: round2(leaseDue), payroll: round2(payrollDue), listingsSold: lt.sold.length, listingOffers: lt.newOffers }
}

// Settle daily store overhead (lease + payroll). If cash covers it, pay and clear arrears.
// If not, fall behind; past STORE_GRACE_DAYS you LOSE THE STORE (close it + let go of
// staff) — you're back to flipping from home, not game over. Rent/game-over is separate.
function settleStore(set, get, leaseDue, payrollDue, days) {
  const due = round2(leaseDue + payrollDue)
  const s = get()
  if (s.cash >= due) {
    get().spend(due)
    get().log('store', `Store overhead paid — lease $${leaseDue.toFixed(2)}${payrollDue ? ` + payroll $${payrollDue.toFixed(2)}` : ''} (-$${due.toFixed(2)})`, -due)
    if (s.storeArrears) set({ storeArrears: 0 })
    return
  }
  if (s.cash > 0) get().spend(round2(s.cash))
  const arrears = (s.storeArrears || 0) + days
  if (arrears > STORE_GRACE_DAYS) {
    // lose the store: drop the storefront + staff upgrades, let go of all employees.
    set(st => {
      const up = { ...st.upgrades }; delete up.storefront; delete up.staff
      return { upgrades: up, employees: [], storeArrears: 0 }
    })
    get().log('store-lost', `Couldn't cover the store overhead — you lost the shop. Back to flipping from home.`, 0)
  } else {
    set({ storeArrears: arrears })
    get().log('store-late', `Behind on store overhead (${arrears}/${STORE_GRACE_DAYS} days) — sell cards or trim staff!`, 0)
  }
}

// Charge rent for the days passed. If cash covers it, pay and clear arrears. If not,
// you fall behind: rentArrears counts consecutive shortfall days. Past RENT_GRACE_DAYS
// with no realizable assets left to sell, it's game over. Having sellable cards keeps you
// alive (the comeback path: liquidate or take a job).
function settleRent(set, get, rentDue, days) {
  const s = get()
  if (s.cash >= rentDue) {
    get().spend(rentDue)
    get().log('rent', `Rent paid (-$${rentDue.toFixed(2)})`, -rentDue)
    if (s.rentArrears) set({ rentArrears: 0 })
    return
  }
  // can't fully cover rent → pay what we can, fall behind.
  if (s.cash > 0) { get().spend(round2(s.cash)) }
  const arrears = (s.rentArrears || 0) + days
  const assets = realizableAssets(get())
  if (arrears > RENT_GRACE_DAYS && assets < rentDue) {
    set({ rentArrears: arrears, gameOver: true })
    get().log('gameover', `You couldn't make rent and had nothing left to sell. Game over.`, 0)
  } else {
    set({ rentArrears: arrears })
    get().log('rent-late', `Behind on rent (${arrears}/${RENT_GRACE_DAYS} days) — sell cards or take a job!`, 0)
  }
}

// Rough liquidation value: cash + market value of the raw/graded collection. Used to
// decide whether a behind-on-rent player still has a comeback (assets to sell) or is done.
function realizableAssets(s) {
  const coll = (s.collection || []).reduce((sum, c) => sum + cardValue(c), 0)
  return round2((s.cash || 0) + coll)
}

// A card you own may be in your collection, out on the market (listed/tweeted), OR
// in your show inventory (cards you brought to the show you're attending). These let
// an encounter sale resolve against whichever bucket holds the card, so an offer
// accepted on a listed card removes the listing, and a sale at the show removes the
// card from the booth's stock.
function findOwnedAnywhere(s, uid) {
  return s.collection.find(c => c.uid === uid)
    || (s.listings || []).find(l => l.card.uid === uid)?.card
    || (s.showInventory || []).find(c => c.uid === uid)
    || null
}
function removeOwnedAnywhere(set, uid) {
  set(st => ({
    collection: st.collection.filter(c => c.uid !== uid),
    listings: (st.listings || []).filter(l => l.card.uid !== uid),
    showInventory: (st.showInventory || []).filter(c => c.uid !== uid),
  }))
}

// --- Upgrades: buy once, keep forever ---------------------------------------
// Costs are scaled to the real economy: packs ~$5-15, ETBs ~$150, show entry up
// to $2,500. So cheap accessories are tens-to-low-hundreds, real business
// investments are thousands, and a physical storefront is the big commitment.
export const UPGRADES = {
  // THE major commitment: a real lease + buildout. Unlocks walk-ins + Cash.
  storefront: { name: 'Brick-and-Mortar Store', cost: 8000, desc: 'Sign a lease and open a real shop. Local customers walk in for in-person sales, and you can accept Cash. The big leap from flipper to store owner.', icon: '🏬', tier: 'big' },

  // Payment rails — each its own setup. Capture buyers who won\'t use Venmo.
  payPaypal: { name: 'Accept PayPal',            cost: 120,  desc: 'Take PayPal — a huge share of online buyers prefer it.', icon: '🅿️', group: 'payment' },
  payCard:   { name: 'Accept Credit/Debit Cards', cost: 400,  desc: 'A card reader / merchant account so buyers can pay by card. Captures the most sales.', icon: '💳', group: 'payment' },
  payTap:    { name: 'Tap To Pay',               cost: 250,  desc: 'Contactless tap-to-pay — fast checkout that closes impulse in-person sales.', icon: '📲', group: 'payment' },

  // Remote-management: keep the home shop earning while you're away at a show.
  smartphone: { name: 'Smartphone', cost: 600, desc: 'Field ONLINE orders from anywhere — they keep coming in even while you\'re away at a show.', icon: '📱' },
  staff:      { name: 'Shop Assistant', cost: 2500, desc: 'Hire staff to mind the store. WALK-IN customers are handled while you\'re at a show. Requires a Brick-and-Mortar Store.', icon: '🧑‍💼', needs: 'storefront' },

  signage:  { name: 'Eye-Catching Signage', cost: 150,  desc: '+15% foot traffic (shows, and your store if open).', icon: '🪧' },
  cases:    { name: 'Glass Display Cases',  cost: 500,  desc: 'Offers on your cards come in ~12% higher.', icon: '🗄️' },
  ticker:   { name: 'Visitor Ticker',       cost: 200,  desc: 'Alerts you when someone is at your stand while you browse a show hall.', icon: '🔔' },
  loupe:    { name: "Jeweler's Loupe",      cost: 450,  desc: 'Slightly better grade odds when you submit cards.', icon: '🔍' },
  network:  { name: 'Dealer Network',       cost: 1500, desc: 'Famous vendors reveal their best stock — and flag underpriced DEALS and OVER-priced asks so you never overpay.', icon: '🤝' },
  banner:   { name: 'Charity Banner',       cost: 300, desc: 'Generous acts (giving cards away, fair deals) grant +50% extra notoriety.', icon: '🎗️' },
}

export const useGame = create(persist((set, get) => ({
  cash: STARTING_CASH,
  collection: [],          // owned cards (instances)
  pendingGrades: [],       // {card, readyAt, tier}
  history: [],             // {t, type, detail, amount}
  stats: { packsOpened: 0, cardsPulled: 0, hits: 0, spent: 0, earned: 0, bestPull: null },
  // Per-set ledger: { [setId]: { spent, pulledValue, packsOpened, cardsPulled, hits } }.
  // `spent` = cash put into that set's sealed product; `pulledValue` = market value of
  // everything ripped from it. Drives the per-set analytics on the Stats page.
  bySet: {},

  notoriety: 0,            // 0..100+, drives traffic, deals, show tiers
  upgrades: {},            // { signage:true, ... }
  showSeed: 7,             // seed for the current month's calendar
  currentDay: 1,           // calendar day; attending a show advances this
  monthsElapsed: 0,        // how many calendars have rolled (for display)
  boothInbox: [],          // pending encounters waiting at your home shop
  onlineOrdersEver: 0,     // lifetime online orders received → drives the new-player guarantee
  showsAttended: 0,
  generousActs: 0,
  gradesSubmitted: 0,      // total cards ever sent to the grader → loyalty tier
  consignments: [],        // {card, net, daysLeft} — pays out (net) when daysLeft hits 0 on day-advance
  listings: [],            // {card, ask, net, askMult, views, offers:[], age, stale?, expired?} — browsed by customers
  showInventory: [],       // cards you brought to the CURRENT show to sell — floor buyers only see these; unsold ones come home when you leave
  wantList: [],            // active collector wants (see want-list section)
  dailyGoals: [],          // {key,label,target,progress,reward,done} for currentDay
  goalsDay: 0,             // which day dailyGoals were generated for
  // Real-time clock: epoch ms of the last processed day boundary. The world advances 1 day
  // per `settings.dayMinutes` of real time, online and offline (catch-up on load).
  lastTick: Date.now(),
  // Survival economy: a day job pays a daily wage, rent drains it. job=null means full-time
  // vendor (no wage). pendingJob holds a freshly-taken job until it starts (re-apply friction).
  // rentArrears = consecutive days behind on rent; past RENT_GRACE_DAYS with nothing to sell
  // → gameOver.
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
  // autoAdvance: in one-by-one mode, auto-rip the next pack a few seconds after each finishes.
  // dayMinutes: real minutes per game-day (the master clock rate).
  settings: { openSealedOneByOne: false, ripSpeed: 1, autoAdvance: false, dayMinutes: DEFAULT_DAY_MINUTES },

  setSetting(key, value) { set(s => ({ settings: { ...s.settings, [key]: value } })) },

  // --- notoriety / upgrades ---
  // `generous` = this gain came from a kind/generous act (giving a card, a fair
  // deal). The Charity Banner only boosts THOSE, matching its copy — not every
  // notoriety tick from ordinary sales.
  addNotoriety(n, generous = false) {
    if (!n) return
    let amt = n
    if (n > 0 && generous && get().upgrades.banner) amt = Math.round(n * 1.5)
    set(s => ({ notoriety: Math.max(0, round2(s.notoriety + amt)) }))
  },
  buyUpgrade(key) {
    const u = UPGRADES[key]
    if (!u || get().upgrades[key]) return false
    if (u.needs && !get().upgrades[u.needs]) return false // prerequisite not met
    if (!get().spend(u.cost)) return false
    set(s => ({ upgrades: { ...s.upgrades, [key]: true } }))
    get().log('upgrade', `Bought ${u.name}`, -u.cost)
    return true
  },
  trafficMult() {
    const s = get()
    let m = 1 + s.notoriety / 100
    if (s.upgrades.signage) m *= 1.15
    return m
  },

  log(type, detail, amount = 0) {
    set(s => ({ history: [{ t: Date.now(), type, detail, amount }, ...s.history].slice(0, 200) }))
  },

  spend(amount) {
    if (get().cash < amount) return false
    set(s => ({ cash: round2(s.cash - amount), stats: { ...s.stats, spent: round2(s.stats.spent + amount) } }))
    return true
  },
  // earn money. By default it counts as CARD income (sales, payouts, wants) for the
  // full-time sustainability readout; pass {wage:true} for paycheck income so it's excluded.
  earn(amount, opts) {
    set(s => ({
      cash: round2(s.cash + amount),
      stats: { ...s.stats, earned: round2(s.stats.earned + amount) },
      _cardAccrual: round2((s._cardAccrual || 0) + (opts?.wage ? 0 : amount)),
    }))
  },
  // Attribute a sealed-product purchase to its set for the per-set ledger.
  recordSetSpend(setId, amount) {
    if (!setId || !amount) return
    set(s => ({ bySet: bumpSet(s.bySet, setId, { spent: amount }) }))
  },

  addPulls(cards, setName, packs = 1) {
    set(s => {
      const hits = cards.filter(c => c._isHit).length
      const best = cards.reduce((b, c) => (cardValue(c) > (b?cardValue(b):0) ? c : b), s.stats.bestPull)
      // track best foil pulled (by value) for the stats page
      const foils = cards.filter(c => c.foil)
      const bestFoil = foils.reduce((b, c) => (cardValue(c) > (b?cardValue(b):0) ? c : b), s.stats.bestFoil)
      const godPacks = (s.stats.godPacks || 0) + (cards._god || cards.some(c => c._fromGod) ? 1 : 0)
      // Fold pulled cards into the per-set ledger (grouped by set, in case a single
      // rip spans sets). Packs are attributed to the first card's set.
      let bySet = s.bySet
      const firstSet = setIdOf(cards[0])
      for (const c of cards) {
        bySet = bumpSet(bySet, setIdOf(c), {
          pulledValue: cardValue(c), cardsPulled: 1, hits: c._isHit ? 1 : 0,
        })
      }
      if (firstSet) bySet = bumpSet(bySet, firstSet, { packsOpened: packs })
      return {
        collection: [...cards, ...s.collection],
        bySet,
        stats: {
          ...s.stats,
          packsOpened: s.stats.packsOpened + packs,
          cardsPulled: s.stats.cardsPulled + cards.length,
          hits: s.stats.hits + hits,
          bestPull: best,
          bestFoil: bestFoil ?? s.stats.bestFoil,
          godPacks,
        },
      }
    })
    get().log('rip', `Opened ${setName}`, 0)
    get().bumpGoal('rip', packs)
  },

  // Quick sell (TCGplayer-style): instant cash, but ALWAYS below market — you pay
  // for the convenience. Listing on your own site (below) can match or beat market.
  quickSellRate: 0.80,
  quickSell(uid) {
    const card = get().collection.find(c => c.uid === uid)
    if (!card) return
    const v = round2(cardValue(card) * get().quickSellRate)
    set(s => ({ collection: s.collection.filter(c => c.uid !== uid) }))
    get().earn(v)
    get().log('sell', `Quick-sold ${card.grade ? 'PSA '+card.grade.overall+' ' : ''}${card.name} @ ${Math.round(get().quickSellRate*100)}%`, v)
    get().bumpGoal('sell', 1); get().bumpGoal('profit', v)
  },

  // Quote a self-listing at `askMult`× market. Sales are now driven by real
  // browsing customers (see tickListings), so the quote ESTIMATES the experience:
  // expected shoppers/day and the share of the buyer pool whose savvy tolerates
  // this ask (≈ likelihood the next willing buyer bites). Returns
  // { market, ask, fee, net, viewsPerDay, buyShare }.
  listingQuote(card, askMult) {
    const market = cardValue(card)
    const noto = get().notoriety
    const ask = round2(market * askMult)
    const fee = round2(ask * 0.05)          // ~5% marketplace fee
    const net = round2(ask - fee)
    const viewsPerDay = +(dailyViewers(card, askMult, noto, () => 0.5)).toFixed(0)
    // share of the browsing pool whose max-willingness covers this ask (use the
    // savvy weights, with each type's notoriety/desirability-lifted ceiling).
    let buyShare = 0
    for (const [key, b] of Object.entries(BUYER_SAVVY)) {
      const max = buyerMaxMult(key, noto, card, () => 0.5)
      if (askMult <= max) buyShare += b.weight
    }
    return { market, ask, fee, net, viewsPerDay, buyShare: +buyShare.toFixed(2) }
  },

  // List a card on your own site at `askMult`× market. Removes it from the
  // collection and puts it on the market, where browsing customers decide whether
  // to buy (see tickListings). `views`/`offers` accrue as days pass. `tweet` posts
  // it for a hype window of extra Twitter-mutual eyes (+notoriety).
  listOnSite(uid, askMult, tweet = false) {
    const card = get().collection.find(c => c.uid === uid)
    if (!card) return false
    const q = get().listingQuote(card, askMult)
    const listing = { card, ask: q.ask, net: q.net, askMult, views: 0, offers: [], age: 0,
      tweeted: !!tweet, hypeDaysLeft: tweet ? TWEET_HYPE_DAYS : 0 }
    set(s => ({
      collection: s.collection.filter(c => c.uid !== uid),
      listings: [...(s.listings || []), listing],
    }))
    get().log('listing', `Listed ${card.name} at $${q.ask.toFixed(2)} (${Math.round(askMult*100)}% of market)${tweet ? ' · 🐦 tweeted' : ''}`, 0)
    if (tweet) { get().addNotoriety(TWEET_NOTORIETY); get().log('tweet', `Tweeted your ${card.name} listing — Twitter mutuals are watching (+${TWEET_NOTORIETY}★)`, 0) }
    return q
  },

  // Relist a listing (e.g. one that went stale) — back on the market fresh, same ask.
  relistListing(idx) {
    const l = get().listings[idx]
    if (!l) return
    const q = get().listingQuote(l.card, l.askMult)
    set(s => ({ listings: s.listings.map((x, i) => i === idx
      ? { ...x, expired: false, stale: false, views: 0, offers: [], age: 0, ask: q.ask, net: q.net } : x) }))
    get().log('listing', `Relisted ${l.card.name} at $${q.ask.toFixed(2)}`, 0)
  },

  // Reprice a live listing to a new ask multiple (resets browsing interest).
  repriceListing(idx, askMult) {
    const l = get().listings[idx]
    if (!l) return
    const q = get().listingQuote(l.card, askMult)
    set(s => ({ listings: s.listings.map((x, i) => i === idx
      ? { ...x, askMult, ask: q.ask, net: q.net, expired: false, stale: false, views: 0, offers: [], age: 0 } : x) }))
    get().log('listing', `Repriced ${l.card.name} to $${q.ask.toFixed(2)} (${Math.round(askMult*100)}% of market)`, 0)
  },

  // Accept a standing offer on a listing → sells now (net of the marketplace fee).
  acceptOffer(idx, offerId) {
    const l = get().listings[idx]
    const offer = l?.offers?.find(o => o.id === offerId)
    if (!l || !offer) return
    set(s => ({ listings: s.listings.filter((_, i) => i !== idx) }))
    get().earn(offer.net)
    get().bumpGoal('sell', 1); get().bumpGoal('profit', offer.net)
    get().log('sell', `Accepted a ${offer.savvyLabel}'s offer on ${l.card.name} — $${offer.net.toFixed(2)}`, offer.net)
  },

  // Decline a standing offer (drops it; the listing stays up).
  declineOffer(idx, offerId) {
    set(s => ({ listings: s.listings.map((x, i) => i === idx
      ? { ...x, offers: (x.offers || []).filter(o => o.id !== offerId) } : x) }))
  },

  // Pull a listing back into your collection (to reprice differently, or stop selling).
  pullListing(idx) {
    const l = get().listings[idx]
    if (!l) return
    set(s => ({
      collection: [l.card, ...s.collection],
      listings: s.listings.filter((_, i) => i !== idx),
    }))
    get().log('listing', `Pulled ${l.card.name} off the market`, 0)
  },

  sellAllUngraded() {
    const { collection, quickSellRate } = get()
    // Bulk = raw, unfoiled, below the hit threshold (by live rarity, not the stale
    // _isHit flag) — so a MEGA_ATTACK / SIR / foil acquired without that flag is safe.
    const toSell = collection.filter(isBulkCard)
    const total = round2(toSell.reduce((a, c) => a + cardValue(c) * quickSellRate, 0))
    set(s => ({ collection: s.collection.filter(c => !isBulkCard(c)) }))
    get().earn(total)
    get().log('sell', `Quick-sold ${toSell.length} raw commons/uncommons @ ${Math.round(quickSellRate*100)}%`, total)
  },

  // Buylist: instantly dump ALL raw bulk (commons/uncommons/rares, no hits/graded)
  // to a shop at a flat buylist rate — fast cash, well under market.
  buylistRate: 0.55,
  sellToBuylist() {
    const { collection, buylistRate } = get()
    const toSell = collection.filter(isBulkCard)
    if (!toSell.length) return 0
    const total = round2(toSell.reduce((a, c) => a + cardValue(c) * buylistRate, 0))
    set(s => ({ collection: s.collection.filter(c => !isBulkCard(c)) }))
    get().earn(total)
    get().log('sell', `Buylisted ${toSell.length} bulk cards @ ${Math.round(buylistRate*100)}%`, total)
    return total
  },

  // Consign a card: a service lists it; it sells in 2–6 game-days for a bit ABOVE
  // market, minus a 12% consignment fee. Removes from collection now, pays later.
  consignCard(uid) {
    const card = get().collection.find(c => c.uid === uid)
    if (!card) return false
    const sellsFor = round2(cardValue(card) * (1.05 + Math.random() * 0.15)) // 1.05–1.20× market
    const net = round2(sellsFor * 0.88) // 12% consignment fee
    const daysLeft = 2 + Math.floor(Math.random() * 5) // 2–6 days
    set(s => ({
      collection: s.collection.filter(c => c.uid !== uid),
      consignments: [...s.consignments, { card, net, daysLeft }],
    }))
    get().log('consign', `Consigned ${card.name} — nets ${'$'+net.toFixed(2)} in ~${daysLeft}d`, 0)
    return { net, daysLeft }
  },

  // --- Bulk actions on a selected set of cards (Collection multi-select) -------
  // Quick-sell every selected card at the quick-sell rate, in one go.
  quickSellMany(uids) {
    const ids = new Set(uids)
    const toSell = get().collection.filter(c => ids.has(c.uid))
    if (!toSell.length) return 0
    const rate = get().quickSellRate
    const total = round2(toSell.reduce((a, c) => a + cardValue(c) * rate, 0))
    set(s => ({ collection: s.collection.filter(c => !ids.has(c.uid)) }))
    get().earn(total)
    get().log('sell', `Quick-sold ${toSell.length} cards @ ${Math.round(rate*100)}%`, total)
    get().bumpGoal('sell', toSell.length); get().bumpGoal('profit', total)
    return total
  },
  // List every selected card on your site at the same askMult (each rolls its own
  // sell/expire outcome). `tweet` posts the batch for a hype window. Returns the count.
  listManyOnSite(uids, askMult, tweet = false) {
    const ids = new Set(uids)
    const cards = get().collection.filter(c => ids.has(c.uid))
    if (!cards.length) return 0
    const newListings = cards.map(card => {
      const q = get().listingQuote(card, askMult)
      return { card, ask: q.ask, net: q.net, askMult, views: 0, offers: [], age: 0,
        tweeted: !!tweet, hypeDaysLeft: tweet ? TWEET_HYPE_DAYS : 0 }
    })
    set(s => ({
      collection: s.collection.filter(c => !ids.has(c.uid)),
      listings: [...(s.listings || []), ...newListings],
    }))
    get().log('listing', `Listed ${cards.length} cards at ${Math.round(askMult*100)}% of market${tweet ? ' · 🐦 tweeted' : ''}`, 0)
    if (tweet) { get().addNotoriety(TWEET_NOTORIETY); get().log('tweet', `Tweeted your listings — Twitter mutuals are watching (+${TWEET_NOTORIETY}★)`, 0) }
    return cards.length
  },
  // Consign every selected card (each sells in 2–6 days for a bit above market −12%).
  consignMany(uids) {
    const ids = new Set(uids)
    const cards = get().collection.filter(c => ids.has(c.uid))
    if (!cards.length) return 0
    const newConsigns = cards.map(card => {
      const sellsFor = round2(cardValue(card) * (1.05 + Math.random() * 0.15))
      return { card, net: round2(sellsFor * 0.88), daysLeft: 2 + Math.floor(Math.random() * 5) }
    })
    set(s => ({
      collection: s.collection.filter(c => !ids.has(c.uid)),
      consignments: [...s.consignments, ...newConsigns],
    }))
    get().log('consign', `Consigned ${cards.length} cards`, 0)
    return cards.length
  },

  // Which of your cards satisfy this want?
  cardsForWant(want) { return get().collection.filter(c => cardMatchesWant(c, want)) },
  // Fulfill a want with a specific owned card → premium payout + notoriety + stat.
  fulfillWant(wantId, uid) {
    const want = get().wantList.find(w => w.id === wantId)
    const card = get().collection.find(c => c.uid === uid)
    if (!want || !card || !cardMatchesWant(card, want)) return false
    const payout = round2(cardValue(card) * want.premiumMult)
    set(s => ({
      collection: s.collection.filter(c => c.uid !== uid),
      wantList: s.wantList.filter(w => w.id !== wantId),
      stats: { ...s.stats, wantsFilled: (s.stats.wantsFilled || 0) + 1 },
    }))
    get().earn(payout)
    get().addNotoriety(want.notoriety)
    get().log('want', `Filled ${want.who}'s want with ${card.name} (+${Math.round(want.premiumMult*100)}% premium)`, payout)
    get().bumpGoal('want', 1)
    return { payout }
  },

  // Ensure a fresh set of goals exists (called on mount if none yet).
  ensureDailyGoals() {
    if (!get().dailyGoals.length || get().goalsDay !== get().currentDay) {
      set(s => ({ dailyGoals: makeDailyGoals(s.notoriety), goalsDay: s.currentDay }))
    }
  },
  // Advance any daily goal matching `key` by `amount`; auto-complete + pay.
  bumpGoal(key, amount = 1) {
    const goals = get().dailyGoals
    if (!goals.length) return
    let paidCash = 0, paidNoto = 0, completed = null
    const next = goals.map(g => {
      if (g.key !== key || g.done) return g
      const progress = g.progress + amount
      if (progress >= g.target) {
        paidCash += g.cash; paidNoto += g.noto; completed = g
        return { ...g, progress: g.target, done: true }
      }
      return { ...g, progress }
    })
    set({ dailyGoals: next })
    if (completed) {
      if (paidCash) get().earn(paidCash)
      if (paidNoto) get().addNotoriety(paidNoto)
      set(s => ({ stats: { ...s.stats, goalsCompleted: (s.stats.goalsCompleted || 0) + 1 } }))
      get().log('goal', `Daily goal complete: ${completed.label}${paidCash?` (+$${paidCash})`:''}${paidNoto?` (+${paidNoto}★)`:''}`, paidCash || 0)
    }
  },

  submitGrade(uid, tierKey) {
    const tier = GRADING[tierKey]
    if (!tier) return
    const card = get().collection.find(c => c.uid === uid)
    if (!card || card.grade) return
    const before = graderTier(get().gradesSubmitted)
    const fee = gradingFee(tierKey, get().gradesSubmitted)
    if (!get().spend(fee)) return
    set(s => ({
      collection: s.collection.filter(c => c.uid !== uid),
      gradesSubmitted: s.gradesSubmitted + 1,
    }))
    const dayMs = dayLengthMs(get())
    const submittedAt = Date.now()
    const readyAt = submittedAt + tier.days * dayMs
    // remember the fee actually paid so the resolved grade records it, not list price.
    // store submittedAt + the day-length used so the Bench progress/days-left stay correct
    // even if the player later changes the day-length setting (readyAt is absolute).
    set(s => ({ pendingGrades: [...s.pendingGrades, { card, tierKey, readyAt, submittedAt, dayMsAtSubmit: dayMs, paidFee: fee }] }))
    const disc = before.discount > 0 ? ` (${Math.round(before.discount*100)}% loyalty off)` : ''
    get().log('grade-submit', `Submitted ${card.name} (${tier.name}, $${fee.toFixed(2)}${disc})`, -fee)
    // crossed into a new loyalty tier?
    const after = graderTier(get().gradesSubmitted)
    if (after.key !== before.key) get().log('grade-tier', `Grader loyalty: reached ${after.name} (${Math.round(after.discount*100)}% off future fees)`, 0)
    get().bumpGoal('grade', 1)
  },

  // Submit several raw cards at once for a bulk per-card discount (stacks with
  // loyalty). Charges the total up front; each card resolves on its own timer.
  submitGradesBulk(uids, tierKey) {
    const tier = GRADING[tierKey]
    if (!tier || !uids?.length) return
    const cards = get().collection.filter(c => uids.includes(c.uid) && !c.grade)
    if (!cards.length) return
    const before = graderTier(get().gradesSubmitted)
    const feePer = gradingFee(tierKey, get().gradesSubmitted, cards.length)
    const total = round2(feePer * cards.length)
    if (!get().spend(total)) return
    const uidSet = new Set(cards.map(c => c.uid))
    const dayMs = dayLengthMs(get())
    const submittedAt = Date.now()
    const readyAt = submittedAt + tier.days * dayMs
    set(s => ({
      collection: s.collection.filter(c => !uidSet.has(c.uid)),
      gradesSubmitted: s.gradesSubmitted + cards.length,
      pendingGrades: [...s.pendingGrades, ...cards.map(card => ({ card, tierKey, readyAt, submittedAt, dayMsAtSubmit: dayMs, paidFee: feePer }))],
    }))
    const bulk = bulkDiscount(cards.length)
    const notes = [before.discount > 0 ? `${Math.round(before.discount*100)}% loyalty` : null,
      bulk > 0 ? `${Math.round(bulk*100)}% bulk` : null].filter(Boolean).join(' + ')
    get().log('grade-submit', `Bulk-submitted ${cards.length} cards (${tier.name}, $${feePer.toFixed(2)}/ea${notes ? `, ${notes} off` : ''})`, -total)
    const after = graderTier(get().gradesSubmitted)
    if (after.key !== before.key) get().log('grade-tier', `Grader loyalty: reached ${after.name} (${Math.round(after.discount*100)}% off future fees)`, 0)
    get().bumpGoal('grade', cards.length)
  },

  // Called on a tick to resolve grades whose timers elapsed.
  resolveGrades() {
    const now = Date.now()
    const ready = get().pendingGrades.filter(p => now >= p.readyAt)
    if (!ready.length) return []
    const luck = get().upgrades.loupe ? 0.08 : 0
    const resolved = ready.map(p => {
      const grade = rollGrade(p.card, p.tierKey, luck, p.paidFee ?? null)
      // Append to a per-card grading history so the modal can show "this card was
      // graded PSA X (Standard, $Y) on day Z". (One entry today, but the array is
      // future-proof for a crack-a-slab regrade mechanic.)
      const entry = { overall: grade.overall, tier: p.tierKey, fee: grade.fee, gradedAt: grade.gradedAt }
      const gradeHistory = [...(p.card.gradeHistory || []), entry]
      return { ...p.card, grade, gradeHistory }
    })
    set(s => ({
      pendingGrades: s.pendingGrades.filter(p => now < p.readyAt),
      collection: [...resolved, ...s.collection],
    }))
    for (const g of resolved) get().log('grade-done', `${g.name} graded PSA ${g.grade.overall}`, 0)
    return resolved
  },

  // --- Buy a card from a vendor booth ---
  // At a show you can flip a fresh buy straight onto your table: pass
  // { toShowInventory:true } to list it for sale at the show instead of taking it
  // home to your collection. (Off the floor it always goes to the collection.)
  buyFromVendor(card, price, opts = {}) {
    if (!get().spend(price)) return false
    const bought = { ...card, _ask: undefined, _mispriced: undefined, _highlight: undefined }
    if (opts.toShowInventory) {
      set(s => ({ showInventory: [bought, ...(s.showInventory || [])] }))
      get().log('buy', `Bought ${card.name} from a vendor — listed at your booth`, -price)
    } else {
      set(s => ({ collection: [bought, ...s.collection] }))
      get().log('buy', `Bought ${card.name} from a vendor`, -price)
    }
    if (card._mispriced) get().addNotoriety(1) // you spotted a deal
    get().bumpGoal('buy', 1)
    return true
  },

  // --- Show inventory: cards you bring to a show to sell at your booth ----------
  // Move the selected collection cards onto your show table. Floor buyers (offers,
  // browse-sales, walk-ups) only ever target these — your at-home collection isn't
  // for sale at the show. Anything unsold comes home when you leave (endShow()).
  bringToShow(uids) {
    const ids = new Set(uids)
    const bringing = get().collection.filter(c => ids.has(c.uid))
    if (!bringing.length) { set({ showInventory: [] }); return 0 }
    set(s => ({
      collection: s.collection.filter(c => !ids.has(c.uid)),
      showInventory: bringing,
    }))
    get().log('show', `Brought ${bringing.length} card${bringing.length > 1 ? 's' : ''} to sell at the show`, 0)
    return bringing.length
  },
  // Leaving the show: any unsold show-inventory cards return to your collection.
  endShow() {
    const inv = get().showInventory || []
    if (inv.length) {
      set(s => ({ collection: [...inv, ...s.collection], showInventory: [] }))
      get().log('show', `Brought ${inv.length} unsold card${inv.length > 1 ? 's' : ''} back home from the show`, 0)
    } else if ((get().showInventory || []).length === 0) {
      // nothing to do, but ensure the bucket is empty
      set({ showInventory: [] })
    }
  },

  // Can we take this buyer's preferred payment method? Returns null if fine,
  // or a "lost sale" message if not (the caller should abort the sale).
  paymentBlocked(payMethod) {
    if (!payMethod) return null
    if (acceptedMethods(get().upgrades).has(payMethod)) return null
    const m = PAYMENT_METHODS[payMethod]
    return `They could only pay by ${m?.name || payMethod}, which you can't accept yet. Sale lost.`
  },

  // --- Resolve an encounter option's effect. Returns a result message. ---
  resolveEncounter(effect) {
    const s = get()
    let msg = effect.msg || ''
    switch (effect.type) {
      case 'giveFromStockOrMint': {
        // give a card away free — a generous act (Charity Banner boosts it)
        s.addNotoriety(effect.notoriety, true)
        s.log('give', `Gave away a ${effect.card.name} for free`, 0)
        set(st => ({ generousActs: st.generousActs + 1 }))
        get().bumpGoal('help', 1)
        break
      }
      case 'sellMint': {
        const blocked = s.paymentBlocked(effect.payMethod)
        if (blocked) { s.addNotoriety(-1); s.log('lost-sale', blocked, 0); return blocked }
        const { net, fee } = processingFee(effect.price, effect.payMethod)
        s.earn(net)
        // selling at cost to a burned buyer is a generous/fair act
        s.addNotoriety(effect.notoriety, true)
        s.log('sell', `Sold a ${effect.card.name} at cost (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
        msg = appendFeeMsg(msg, fee, effect.payMethod, net)
        get().bumpGoal('sell', 1); get().bumpGoal('profit', net)
        break
      }
      case 'sellOwned': {
        const blocked = s.paymentBlocked(effect.payMethod)
        if (blocked) { s.addNotoriety(-1); s.log('lost-sale', blocked, 0); return blocked }
        // The card may live in your collection OR be out on the market (listed/tweeted) —
        // an online offer is on a listed card. Pull it from whichever bucket holds it.
        const card = findOwnedAnywhere(get(), effect.uid)
        if (card) {
          let price = effect.price
          if (get().upgrades.cases) price = round2(price * 1.12)
          const { net, fee } = processingFee(price, effect.payMethod)
          removeOwnedAnywhere(set, effect.uid)
          s.earn(net)
          s.addNotoriety(effect.notoriety)
          s.log('sell', `Sold ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
          msg = msg + (get().upgrades.cases ? ' (display case bumped the price.)' : '')
          msg = appendFeeMsg(msg, fee, effect.payMethod, net)
          get().bumpGoal('sell', 1); get().bumpGoal('profit', net)
        }
        break
      }
      case 'counter': {
        const blocked = s.paymentBlocked(effect.payMethod)
        if (blocked) { s.addNotoriety(-1); s.log('lost-sale', blocked, 0); return blocked }
        if (Math.random() < (effect.chance ?? 0.5)) {
          const card = findOwnedAnywhere(get(), effect.uid)
          if (card) {
            // A counter is a normal sale of a card from your case — the display-case
            // bump applies here too (was previously missed).
            let price = effect.price
            if (get().upgrades.cases) price = round2(price * 1.12)
            const { net, fee } = processingFee(price, effect.payMethod)
            removeOwnedAnywhere(set, effect.uid)
            s.earn(net); s.addNotoriety(effect.notoriety)
            s.log('sell', `Countered and sold ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
            msg = appendFeeMsg(msg, fee, effect.payMethod, net)
          }
        } else { msg = 'They balk at your counter and walk away.' }
        break
      }
      case 'browseSale': {
        s.addNotoriety(effect.notoriety)
        // At a SHOW, a browser can only buy what you brought to your table (show
        // inventory). At home/online they browse your whole collection.
        const fromShow = !!effect.fromShow
        const owned = fromShow ? (get().showInventory || []) : get().collection
        if (Math.random() < (effect.chance ?? 0.3) && owned.length) {
          const blocked = s.paymentBlocked(effect.payMethod)
          if (blocked) { s.log('lost-sale', blocked, 0); msg = msg + ' …but ' + blocked.toLowerCase(); break }
          // they buy a random card from the relevant pool at market
          const card = owned[Math.floor(Math.random() * owned.length)]
          let price = rawValue(card)
          if (get().upgrades.cases) price = round2(price * 1.12)
          const { net, fee } = processingFee(price, effect.payMethod)
          removeOwnedAnywhere(set, card.uid)
          s.earn(net)
          s.log('sell', `A browser bought your ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
          msg = `They bought your ${card.name} for $${net.toFixed(2)}${fee > 0 ? ` (after $${fee.toFixed(2)} ${methodLabel(effect.payMethod)} fee)` : ''}!`
          s.bumpGoal('sell', 1); s.bumpGoal('profit', net)
        }
        break
      }
      case 'none':
      default:
        s.addNotoriety(effect.notoriety || 0)
    }
    // A sale may have removed a card that a pending inbox order was about — drop
    // any now-stale orders so you never see an offer for a card you no longer own.
    set(st => {
      const pruned = st.boothInbox.filter(enc => encounterStillValid(enc, st.collection, st.listings))
      return pruned.length === st.boothInbox.length ? {} : { boothInbox: pruned }
    })
    return msg
  },

  clearInboxItem(idx) {
    set(s => ({ boothInbox: s.boothInbox.filter((_, i) => i !== idx) }))
  },
  // --- Jobs (the survival layer) ---
  // Net worth = cash + collection liquidation value (for job gating + UI runway).
  netWorth() { return realizableAssets(get()) },
  // Take a job (by id). Gated by notoriety. Quitting first is implicit (replaces current).
  // A newly-taken job starts after `start` days (re-apply friction); start:0 is instant.
  takeJob(id) {
    const job = jobById(id)
    if (!job || job.id === 'none') return false
    if (get().notoriety + 1e-9 < job.minNoto) return false
    if (job.start <= 0) {
      set({ job, pendingJob: null })
      get().log('job', `Started a job: ${job.title} ($${job.wage}/day)`, 0)
    } else {
      const startsOnDay = get().currentDay + job.start
      set({ pendingJob: { job, startsOnDay } })
      get().log('job', `Hired as ${job.title} — starts in ${job.start} day${job.start>1?'s':''} ($${job.wage}/day)`, 0)
    }
    return true
  },
  // Quit instantly — go full-time vendor (no wage, rent still bites).
  quitJob() {
    if (!get().job) return
    const had = get().job
    set({ job: null, pendingJob: null })
    get().log('job', `Quit ${had.title} — going full-time as a vendor. No more paycheck.`, 0)
  },

  // --- Full-time sustainability readout (Phase 3) ---
  // Average CARD income per game-day over the recent window (sales/payouts, not wages).
  // Drives the "can I survive unemployed?" guidance. 0 until enough days have elapsed.
  cardIncomePerDay() {
    const log = get().cardIncomeLog || []
    if (!log.length) return 0
    return round2(log.reduce((a, v) => a + v, 0) / log.length)
  },
  // Total daily burn you must cover: rent + (store lease + payroll, if you have a store).
  dailyBurn() {
    const s = get()
    let burn = RENT_PER_DAY
    if (s.upgrades.storefront) {
      burn += STORE_LEASE_PER_DAY
      burn += (s.employees || []).map(employeeById).filter(Boolean).reduce((a, e) => a + e.wage, 0)
    }
    return round2(burn)
  },

  // --- Brick & mortar employees (Phase 4) ---
  hireEmployee(id) {
    const e = employeeById(id)
    if (!e || !get().upgrades.storefront) return false
    set(st => ({ employees: [...st.employees, id] }))
    get().log('hire', `Hired a ${e.title} ($${e.wage}/day payroll)`, 0)
    return true
  },
  fireEmployee(id) {
    const e = employeeById(id)
    set(st => {
      const i = st.employees.indexOf(id)
      if (i === -1) return {}
      const next = st.employees.slice(); next.splice(i, 1)
      return { employees: next }
    })
    if (e) get().log('fire', `Let go of a ${e.title}.`, 0)
  },

  // Pass a single day at home — generate that day's home orders into the inbox.
  nextDay() { return advanceDaysWith(set, get, 1, false) },

  // REAL-TIME CLOCK. Advance the world by however many whole game-days of real time have
  // elapsed since `lastTick`. Called on mount (offline catch-up), every ~1s while open, and
  // when the tab becomes visible again. Returns a summary for the "while you were away" UI,
  // or null if no full day has passed. Days advance at home (`away:false`).
  tickRealTime() {
    const s = get()
    if (s.gameOver) return null // world stops once you've lost
    const dayMs = dayLengthMs(s)
    const elapsed = Date.now() - (s.lastTick ?? Date.now())
    let due = Math.floor(elapsed / dayMs)
    if (due < 1) return null
    // Cap a huge backlog (e.g. save left for weeks) so we don't loop thousands of times.
    const MAX_CATCHUP = CALENDAR_DAYS * 3 // 90 days
    const capped = due > MAX_CATCHUP
    if (capped) due = MAX_CATCHUP
    const cashBefore = s.cash
    const result = advanceDaysWith(set, get, due, false) || {}
    // Flush CARD income accrued since the last tick (interactive sales + passive payouts,
    // tracked by earn() — wages excluded) and attribute it evenly across the days passed
    // into the rolling window that powers the full-time sustainability readout.
    const cardIncome = round2(get()._cardAccrual || 0)
    const perDay = round2(cardIncome / due)
    const ring = [...(get().cardIncomeLog || [])]
    for (let i = 0; i < due; i++) ring.push(perDay)
    // consume exactly the days processed; keep the sub-day remainder; reset the accrual.
    set(st => ({ lastTick: (st.lastTick ?? Date.now()) + due * dayMs, cardIncomeLog: ring.slice(-INCOME_WINDOW_DAYS), _cardAccrual: 0 }))
    const cashAfter = get().cash
    return { ...result, days: due, capped, cashDelta: round2(cashAfter - cashBefore), cardIncome }
  },
  // Attend a show: the show's days pass while you're AWAY. Home orders during
  // those days only land if you have the Smartphone (online) / Staff (walk-in)
  // upgrades; otherwise they're missed. Any other shows in the window are skipped.
  attendShowDays(showDay, days) {
    set(s => ({ showsAttended: s.showsAttended + 1 }))
    get().bumpGoal('attend', 1) // credit today's "attend a show" goal before the day rolls
    // days waiting until the show opens (home, not away) + the show's run (away)
    const wait = Math.max(0, showDay - get().currentDay)
    if (wait > 0) advanceDaysWith(set, get, wait, false)
    return advanceDaysWith(set, get, days, true)
  },

  reset() {
    set({ cash: STARTING_CASH, collection: [], pendingGrades: [], history: [],
      stats: { packsOpened: 0, cardsPulled: 0, hits: 0, spent: 0, earned: 0, bestPull: null }, bySet: {},
      notoriety: 0, upgrades: {}, showSeed: 7, currentDay: 1, monthsElapsed: 0, boothInbox: [], onlineOrdersEver: 0, showsAttended: 0, generousActs: 0, gradesSubmitted: 0,
      consignments: [], listings: [], showInventory: [], wantList: [], dailyGoals: [], goalsDay: 0, lastTick: Date.now(),
      job: STARTER_JOB, pendingJob: null, rentArrears: 0, gameOver: false,
      cumWages: 0, _cardAccrual: 0, cardIncomeLog: [], employees: [], storeArrears: 0,
      settings: { openSealedOneByOne: false, ripSpeed: 1, autoAdvance: false, dayMinutes: DEFAULT_DAY_MINUTES } })
  },
}), {
  name: 'poke-vendor-save',
  version: 14,
  // Runs on EVERY load (after migrate). Dedupe any card uid that somehow appears in
  // more than one bucket (collection / pendingGrades / listings / consignments) — a
  // card can only be in one place at a time. First-seen wins, in that priority order.
  merge(persisted, current) {
    const state = { ...current, ...(persisted || {}) }
    const seen = new Set()
    const keepFlat = (arr) => (arr || []).filter(c => c?.uid && !seen.has(c.uid) && seen.add(c.uid))
    const keepWrapped = (arr) => (arr || []).filter(e => e?.card?.uid && !seen.has(e.card.uid) && seen.add(e.card.uid))
    // priority: collection first, then in-flight buckets
    state.collection = keepFlat(state.collection)
    state.pendingGrades = keepWrapped(state.pendingGrades)
    state.listings = keepWrapped(state.listings)
    state.consignments = keepWrapped(state.consignments)
    state.showInventory = keepFlat(state.showInventory)
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
      // Real-time clock. Start the clock NOW for existing saves so they don't
      // fast-forward a giant fake backlog of days on first load after upgrading.
      state.lastTick = Date.now()
      state.settings = { ...(state.settings || {}) }
      state.settings.dayMinutes = state.settings.dayMinutes ?? DEFAULT_DAY_MINUTES
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
    return state
  },
}))

