// The time-advance engine.
//
// This is the heart of "pass a game-day": everything that happens as the calendar moves
// forward. `advanceDaysWith(set, get, days, away)` is the single entry point — nextDay,
// attendShowDays (economy slice), and endStream (livestream slice) all funnel through it.
// It's kept OUT of any slice because two slices need it; centralizing it here keeps one
// authoritative simulation instead of duplicated tick logic.
//
// The private tick/settle helpers below are the per-system steps advanceDaysWith runs each
// call: home orders, consignment/supply/listing resolution, want-list & forum refill,
// market drift, weekly-goal roll, and rent/store overhead settlement.
//
// NOTE ON RANDOMNESS: this module DOES use Math.random() for the day-by-day simulation
// (order rolls, buyer savvy, market events). That's fine here — it's browser runtime, not a
// resumable workflow. Only stable IDS avoid Math.random (see ids.js).

import {
  round2, cardValue, dailyViewers, rollBuyerSavvy, buyerMaxMult, BUYER_SAVVY,
  SHOP_SETS, VINTAGE_SETS, SECONDARY_SETS, driftMult, driftMultVintage,
  applyMarketEvent, MARKET_EVENTS, setMarketMults, distributorById, restockRate,
} from '../engine'
import { boothEncounter, makeWant } from '../shows'
import {
  CALENDAR_DAYS, INBOX_CAP, RENT_PER_DAY, STORE_LEASE_PER_DAY, RENT_GRACE_DAYS,
  STORE_GRACE_DAYS, GOAL_PERIOD_DAYS, absoluteDay, makeWeeklyGoals, acceptedMethods,
  employeeById, dayOrderChance, BARGAIN_ASK_MULT,
} from './constants'
import { realizableAssets } from './helpers'
import { nextOfferId } from './ids'

// --- daytick-only tuning constants ------------------------------------------
// After this many days drawing browsers with zero buyers/offers, a listing goes
// STALE (almost certainly priced too high) — flagged in the UI so you reprice/pull.
const LISTING_STALE_DAYS = 7
// Even when a browsing buyer COULD afford your ask, a sale isn't guaranteed that day —
// they mull it, compare, come back. A listing has at most this chance to actually close
// per game-day, so listing is the patient path (quick-sell is the instant-but-worst one).
const LISTING_DAILY_SELL_CAP = 0.5
const STREAM_BOOST = 3.0         // listing viewer multiplier while a stream's afterglow is live
const FORUM_MAX_POSTS = 6        // how many open WTB posts the board holds at once
const FORUM_REFILL_CHANCE = 0.7  // per game-day chance a fresh post appears (if under cap)
// Per-day chance a hype/crash event fires on SOME set (jolts one set's mult for flavor).
// Kept low so events feel like news, not weather. How many recent mult samples we keep
// per set for the Prices-tab sparkline.
const MARKET_EVENT_CHANCE = 0.10
const MARKET_HISTORY_LEN = 14

// Restock every distributor's depleted stock over `days` passed. Each stock entry is
// { q, cap }; it climbs back toward cap at the distributor's restock rate. Entries that
// reach the cap are dropped (an absent key means "fully stocked" — keeps the map lean).
function restockDistributors(distributors, days) {
  const out = {}
  for (const [id, d] of Object.entries(distributors || {})) {
    const dist = distributorById(id)
    const stock = {}
    if (dist) {
      for (const [key, e] of Object.entries(d.stock || {})) {
        const rate = restockRate(dist, e.cap)
        const q = Math.min(e.cap, e.q + rate * days)
        if (q < e.cap - 1e-6) stock[key] = { q, cap: e.cap } // still short → keep
      }
    }
    out[id] = { ...d, stock }
  }
  return out
}

// Relationships cool when neglected: every regular loses a little trust per game-day,
// floored so dormancy alone never burns them (only gouging does). Dealing them adds it back.
function decayRegulars(regulars, days) {
  if (!regulars?.length) return regulars || []
  return regulars.map(r => ({ ...r, trust: Math.max(2, round2((r.trust || 0) - 0.5 * days)) }))
}

// --- Forum (public wanted-ads board) ----------------------------------------
// Drift the forum board forward `days`: age out expired posts, top up toward the cap.
// Reuses makeWant() for the post shape (kind/cardId/rarity/premiumMult/daysLeft/who).
function tickForum(posts, days, noto) {
  let board = (posts || []).map(p => ({ ...p, daysLeft: p.daysLeft - days })).filter(p => p.daysLeft > 0)
  for (let i = 0; i < days && board.length < FORUM_MAX_POSTS; i++) {
    if (Math.random() < FORUM_REFILL_CHANCE) board = [{ ...makeWant(noto >= 120), forum: true }, ...board]
  }
  return board
}

// --- Living market ----------------------------------------------------------
// Drift every shop set's multiplier forward `days` game-days and, on a roll, fire a
// single hype/crash event on a random set. Returns the new state slice:
// { marketMults, marketHistory, events:[{setId,setName,kind,line,pct}] } — events are
// surfaced to the player via the log by the caller. Pushes the fresh mults into the
// pricing engine so every value in the game (singles, sealed, listings, offers) moves.
function driftMarket(mults, history, days, log) {
  const next = { ...(mults || {}) }
  const hist = { ...(history || {}) }
  const events = []
  for (let d = 0; d < days; d++) {
    for (const s of SHOP_SETS) next[s.id] = driftMult(next[s.id])
    // vintage sealed trends upward (finite, shrinking supply) — its own drift, no revert.
    for (const s of VINTAGE_SETS) next[s.id] = driftMultVintage(next[s.id])
    // aftermarket (older SM/XY) sealed also appreciates as supply dries up — same upward drift.
    for (const s of SECONDARY_SETS) next[s.id] = driftMultVintage(next[s.id])
    // at most one event per day, on a random shop set
    if (Math.random() < MARKET_EVENT_CHANCE) {
      const s = SHOP_SETS[Math.floor(Math.random() * SHOP_SETS.length)]
      const ev = MARKET_EVENTS[Math.floor(Math.random() * MARKET_EVENTS.length)]
      const r = applyMarketEvent(next[s.id], ev)
      next[s.id] = r.mult
      events.push({ setId: s.id, setName: s.name, kind: ev.kind, pct: r.pct, line: r.line.replace('{set}', s.name) })
    }
  }
  // record one history sample per set per call (the post-drift value), capped.
  for (const s of SHOP_SETS) {
    hist[s.id] = [...(hist[s.id] || []), next[s.id]].slice(-MARKET_HISTORY_LEN)
  }
  for (const s of VINTAGE_SETS) {
    hist[s.id] = [...(hist[s.id] || []), next[s.id]].slice(-MARKET_HISTORY_LEN)
  }
  for (const s of SECONDARY_SETS) {
    hist[s.id] = [...(hist[s.id] || []), next[s.id]].slice(-MARKET_HISTORY_LEN)
  }
  setMarketMults(next) // pricing engine reads this synchronously
  return { marketMults: next, marketHistory: hist, events }
}

// Simulate `days` of customers browsing your own-site listings. Each day every live
// listing draws some shoppers; each shopper rolls a savvy level and a max willingness
// to pay. If the auto-sell upgrade is owned and the listing allows it, an affordable
// buyer auto-sells at 80% of market (gated by LISTING_DAILY_SELL_CAP). Otherwise an
// affordable buyer queues an offer for the player to accept. A buyer just over their
// max may leave a lowball offer. Otherwise they pass.
// Returns { listings, soldProceeds, sold:[{name,net,savvy,auto?}], newOffers, staleNow:[names] }.
// `streamBoostDays` = how many of the first `days` fall inside a live stream-hype
// window (a recent stream pumps EVERY listing's traffic).
function tickListings(listings, days, noto, streamBoostDays = 0, upgrades = {}) {
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
    // auto-sell is on when the upgrade is owned AND this listing hasn't opted out
    const autoSellOn = !!upgrades.autoSell && (cur.autoSell !== false)
    for (let day = 0; day < days && !didSell; day++) {
      // Stream afterglow: a recent live stream pumps ALL listings for its window.
      const streamed = day < streamBoostDays
      const boost = streamed ? STREAM_BOOST : 1
      const viewers = dailyViewers(cur.card, cur.askMult, noto, Math.random, boost)
      cur.views += viewers
      for (let v = 0; v < viewers; v++) {
        const savvy = rollBuyerSavvy()
        const max = buyerMaxMult(savvy, noto, cur.card)
        const label = BUYER_SAVVY[savvy].label
        const icon = BUYER_SAVVY[savvy].icon
        if (cur.askMult <= max) {
          // They CAN afford the ask. With auto-sell: fires at 80% of market (same
          // LISTING_DAILY_SELL_CAP gate so it still takes a day or two).
          // Without auto-sell: queue an offer at the buyer's willing price.
          if (autoSellOn) {
            if (Math.random() < LISTING_DAILY_SELL_CAP) {
              const market = cardValue(cur.card)
              const amount = round2(market * 0.80)
              const fee = round2(amount * 0.05)
              const net = round2(amount - fee)
              soldProceeds = round2(soldProceeds + net)
              sold.push({ name: cur.card.name, net, savvy: label, auto: true })
              didSell = true
              break
            }
            continue // auto-sell willing but didn't fire today
          }
          // No auto-sell: queue an offer at the buyer's willing price (≥ ask).
          if (Math.random() < LISTING_DAILY_SELL_CAP) {
            const market = cardValue(cur.card)
            const amount = round2(market * max)
            const fee = round2(amount * 0.05)
            cur.offers.push({ id: nextOfferId(), amount, net: round2(amount - fee), savvy, savvyLabel: label, icon })
            newOffers++
          }
          continue // willing buyer — offer queued (or cap/prob skipped); next viewer
        }
        // just over their max → occasional lowball offer at what they'd pay.
        // Sharks lowball most; casuals rarely bother.
        const overBy = cur.askMult - max
        if (overBy < 0.35 && Math.random() < (savvy === 'shark' ? 0.5 : savvy === 'sharp' ? 0.3 : 0.12)) {
          const market = cardValue(cur.card)
          const amount = round2(market * max)
          const fee = round2(amount * 0.05)
          cur.offers.push({ id: nextOfferId(), amount, net: round2(amount - fee), savvy, savvyLabel: label, icon })
          newOffers++
        }
      }
      cur.age = (cur.age || 0) + 1
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
export function advanceDaysWith(set, get, days, away) {
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
  // Online buyers can only make offers on cards you've listed/tweeted.
  const listedCards = (s.listings || []).map(l => l.card)
  // A deeply-underpriced live listing draws online deal-hunters even before you're known.
  const hasBargain = (s.listings || []).some(l => !l.expired && l.askMult != null && l.askMult <= BARGAIN_ASK_MULT)
  // Walk-in customers only buy/offer on what you've put out on the shop shelf.
  const shelfCards = s.shopDisplay || []
  // No storefront, no inbox. Strangers only message you about cards you've actually
  // put up for sale: online needs a live listing, walk-ins need cards on the shelf.
  // With nothing out on a channel there's nobody to hear from there — so we skip the
  // roll entirely rather than manufacture filler (price-checks, beggars) about a shop
  // that isn't open. (A deep bargain listing still counts as "open online".)
  const openOnline = listedCards.length > 0 || hasBargain
  const openWalkin = shelfCards.length > 0
  for (let i = 0; i < days; i++) {
    const dayNo = s.currentDay + i + 1 // the day being entered
    // a pending job starts paying once its start day arrives
    if (pendingJob && dayNo >= pendingJob.startsOnDay) { activeJob = pendingJob.job; pendingJob = null }
    wagesEarned += activeJob?.wage || 0
    rentDue += RENT_PER_DAY
    if (hasStore) { leaseDue += STORE_LEASE_PER_DAY; payrollDue += empList.reduce((a, e) => a + e.wage, 0) }
    // online channel (employees raise the hit chance). Only if you have something listed.
    if (openOnline && Math.random() < Math.min(0.97, dayOrderChance('online', noto, hasBargain) * orderMult)) {
      if (onlineOK) { newOrders.push({ ...boothEncounter(noto, s.collection, 'online', accepted, listedCards, null, s.regulars), channel: 'online' }); onlineCount++ }
      else missedOnline++
    }
    // walk-in channel (only if you have a physical store AND cards out on the shelf). The
    // shelf is the pool: walk-ins only buy/offer on cards you've put out (passed as both the
    // collection arg and the shelf arg so the encounter's offer + browse pools resolve to the display case).
    if (hasStore && openWalkin && Math.random() < Math.min(0.97, dayOrderChance('walkin', noto) * orderMult)) {
      if (walkinOK) newOrders.push({ ...boothEncounter(noto, shelfCards, 'walkin', accepted, listedCards, shelfCards, s.regulars), channel: 'walkin' })
      else missedWalkin++
    }
  }
  // No new-player guarantee: an unknown vendor (below INBOUND_NOTORIETY_GATE) gets NO
  // unsolicited inbox mail. Early demand comes from the public Forum (WTB board), or you
  // can summon online deal-hunters by listing something below BARGAIN_ASK_MULT of market.
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
  // resolve the distributor SUPPLY CHANNEL: product wholesaled to other vendors pays
  // out (net of your wholesale cost) as the days pass.
  const remainingSupply = []
  for (const w of (s.supplyChannel || [])) {
    const left = w.daysLeft - days
    if (left <= 0) { soldProceeds = round2(soldProceeds + w.net); get().log('supply', `Channel order filled: ${w.label} (+$${w.net.toFixed(2)})`, w.net) }
    else remainingSupply.push({ ...w, daysLeft: left })
  }
  // resolve your own-site listings: real CUSTOMERS browse them over the days passed
  // and buy (at ask) or leave an offer based on their savvy vs your price. A listing
  // priced too high just keeps drawing lookers and never sells (eventually flagged stale).
  const streamBoostDays = Math.min(days, s.streamHypeDaysLeft || 0)
  const lt = tickListings(s.listings, days, noto, streamBoostDays, s.upgrades)
  const remainingListings = lt.listings
  soldProceeds = round2(soldProceeds + lt.soldProceeds)
  for (const sale of lt.sold) {
    if (sale.auto) get().log('sell', `Auto-sold ${sale.name} — $${sale.net.toFixed(2)}`, sale.net)
    else get().log('sell', `Sold ${sale.name} to a ${sale.savvy} — $${sale.net.toFixed(2)}`, sale.net)
  }
  if (lt.newOffers) get().log('listing', `${lt.newOffers} new offer${lt.newOffers > 1 ? 's' : ''} on your listings — review them on the Sell tab.`, 0)
  for (const name of lt.staleNow) get().log('listing', `${name} keeps getting looks but no buyers — likely priced too high. Reprice or pull it.`, 0)
  // age out want-lists, then maybe post new collector wants (scaled by notoriety)
  let wants = s.wantList.map(w => ({ ...w, daysLeft: w.daysLeft - days })).filter(w => w.daysLeft > 0)
  const maxWants = 2 + Math.floor(noto / 80) // more fame → more collectors seek you out
  const wantChancePerDay = 0.25 + noto / 300
  for (let i = 0; i < days && wants.length < maxWants; i++) {
    if (Math.random() < wantChancePerDay) wants = [makeWant(noto >= 120), ...wants]
  }
  // Forum: the public WTB board refills over the days passed (your early-game demand).
  const forumPosts = tickForum(s.forumPosts, days, noto)
  // Living market: drift every set's price multiplier across the days passed; a hype
  // or crash event may fire on a set (logged below so the player feels the market move).
  const market = driftMarket(s.marketMults, s.marketHistory, days, get().log)
  // Weekly goals: only roll a fresh set once 7+ days have passed since the current set
  // was generated (or if there are none yet). Otherwise the existing week's goals carry
  // over with their progress intact. goalsDay stores the ABSOLUTE day (month-safe).
  const newAbsDay = absoluteDay(d, months)
  const goalsExpired = !s.dailyGoals.length || newAbsDay - (s.goalsDay || 0) >= GOAL_PERIOD_DAYS
  const periodGoals = goalsExpired ? makeWeeklyGoals(noto) : s.dailyGoals
  set(st => ({
    currentDay: d, showSeed: seed, monthsElapsed: months,
    marketMults: market.marketMults, marketHistory: market.marketHistory,
    onlineOrdersEver: (st.onlineOrdersEver || 0) + onlineCount,
    boothInbox: [...newOrders.reverse(), ...st.boothInbox].slice(0, INBOX_CAP),
    consignments: remainingConsign,
    supplyChannel: remainingSupply,
    distributors: restockDistributors(s.distributors, days), // wholesalers refill their shelves
    listings: remainingListings,
    wantList: wants,
    forumPosts,
    dailyGoals: periodGoals,                       // weekly set; refreshed every 7 days
    goalsDay: goalsExpired ? newAbsDay : (s.goalsDay || newAbsDay),
    job: activeJob,        // a pending job may have started during these days
    pendingJob,
    streamHypeDaysLeft: Math.max(0, (st.streamHypeDaysLeft || 0) - days), // stream afterglow ages out
    streamFatigue: Math.max(0, (st.streamFatigue || 0) - days),           // audience freshness recovers with rest
    regulars: decayRegulars(st.regulars, days),                           // relationships cool if you neglect them
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
  for (const ev of market.events) get().log(ev.kind === 'hype' ? 'market-hype' : 'market-crash', `${ev.kind === 'hype' ? '📈' : '📉'} ${ev.line}`, 0)
  // Resolve any grades whose day count was reached during these days (currentDay is now updated).
  const resolvedGrades = get().resolveGrades()
  // Daily catch-all for milestones — sweeps up any slow-moving thresholds (net worth,
  // notoriety, cumulative counters) that the instant per-action checks don't cover.
  get().checkMilestones()
  // The day-summary payload. cashDelta/notoDelta are measured against the snapshot taken at
  // the very top of this call (s.cash / noto) AFTER every settlement above — including the
  // completion bonuses a returned slab may have just paid — so the modal reflects the whole
  // tick. saleProceeds is the passive income banked (consignments + supply + listing sales).
  return { added: newOrders.length, missedOnline, missedWalkin, wages: round2(wagesEarned), rent: round2(rentDue),
    lease: round2(leaseDue), payroll: round2(payrollDue), listingsSold: lt.sold.length, listingOffers: lt.newOffers,
    resolvedGrades: resolvedGrades.length, days,
    saleProceeds: round2(soldProceeds),
    cashDelta: round2(get().cash - s.cash),
    notoDelta: round2(get().notoriety - noto) }
}

// Combine two day-summaries into one (used when a show trip is a home "wait" stretch plus
// the "away" show days — the player wants ONE recap of the whole trip, not two). Sums the
// counters/money and concatenates nothing else; a null side passes the other through.
export function mergeSummaries(a, b) {
  if (!a) return b
  if (!b) return a
  const add = (x, y) => (x || 0) + (y || 0)
  return {
    added: add(a.added, b.added),
    missedOnline: add(a.missedOnline, b.missedOnline),
    missedWalkin: add(a.missedWalkin, b.missedWalkin),
    wages: round2(add(a.wages, b.wages)),
    rent: round2(add(a.rent, b.rent)),
    lease: round2(add(a.lease, b.lease)),
    payroll: round2(add(a.payroll, b.payroll)),
    listingsSold: add(a.listingsSold, b.listingsSold),
    listingOffers: add(a.listingOffers, b.listingOffers),
    resolvedGrades: add(a.resolvedGrades, b.resolvedGrades),
    saleProceeds: round2(add(a.saleProceeds, b.saleProceeds)),
    cashDelta: round2(add(a.cashDelta, b.cashDelta)),
    notoDelta: round2(add(a.notoDelta, b.notoDelta)),
    days: add(a.days, b.days),
  }
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
    // lose the store: drop the storefront + staff upgrades, let go of all employees, and
    // bring any cards off the shelf back into your collection (no shop = no display case).
    set(st => {
      const up = { ...st.upgrades }; delete up.storefront; delete up.staff
      return { upgrades: up, employees: [], storeArrears: 0,
        collection: [...(st.shopDisplay || []), ...st.collection], shopDisplay: [] }
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
