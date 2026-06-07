import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { cardValue, GRADING, rollGrade, round2, rawValue, gradingFee, graderTier, rarityRank, bulkDiscount,
  BUYER_SAVVY, rollBuyerSavvy, buyerMaxMult, dailyViewers, isBulkCard,
  businessVolume, distributorTier, wholesalePrice, SETS, ownedIdSet, setCompletion, completionReward,
  setMarketMults, driftMult, applyMarketEvent, MARKET_EVENTS, MARKET_BOUNDS, SHOP_SETS } from './engine'
import { boothEncounter, makeWant, cardMatchesWant, encounterStillValid } from './shows'
import { fatigueMult } from './stream'

const STARTING_CASH = 2500

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
// Goals run on a WEEKLY cadence: a fresh set is rolled and then sticks for 7 days
// before the next refresh. Targets/rewards are scaled up for the week-long window.
export const GOAL_PERIOD_DAYS = 7
// Absolute day counter that doesn't wrap at the month boundary (currentDay resets to 1
// each new calendar month). Goal cadence keys off this so a week spans months cleanly.
function absoluteDay(currentDay, monthsElapsed) { return (monthsElapsed || 0) * CALENDAR_DAYS + currentDay }
function makeWeeklyGoals(noto) {
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
// --- Forum (public wanted-ads board) ----------------------------------------
// Anyone can post "WTB <card>" on the community forum, and anyone can fill it — it's
// the early-game demand engine before you have a name (when no unsolicited orders come).
// You browse the board, go rip/buy the card, then fulfill the post for an above-market
// premium (it reuses the want shape, so cardMatchesWant/premiumMult apply). Posts expire.
const FORUM_MAX_POSTS = 6          // how many open WTB posts the board holds at once
const FORUM_REFILL_CHANCE = 0.7    // per game-day chance a fresh post appears (if under cap)
// Drift the forum board forward `days`: age out expired posts, top up toward the cap.
// Reuses makeWant() for the post shape (kind/cardId/rarity/premiumMult/daysLeft/who).
function tickForum(posts, days, noto) {
  let board = (posts || []).map(p => ({ ...p, daysLeft: p.daysLeft - days })).filter(p => p.daysLeft > 0)
  for (let i = 0; i < days && board.length < FORUM_MAX_POSTS; i++) {
    if (Math.random() < FORUM_REFILL_CHANCE) board = [{ ...makeWant(noto >= 120), forum: true }, ...board]
  }
  return board
}

// After this many days drawing browsers with zero buyers/offers, a listing goes
// STALE (almost certainly priced too high) — flagged in the UI so you reprice/pull.
const LISTING_STALE_DAYS = 7
// Even when a browsing buyer COULD afford your ask, a sale isn't guaranteed that day —
// they mull it, compare, come back. A listing has at most this chance to actually close
// per game-day, so listing is the patient path (quick-sell is the instant-but-worst one).
const LISTING_DAILY_SELL_CAP = 0.5

// Going live pumps your whole storefront for a few days after: every listing draws
// far more eyes (stream viewers who came to shop).
export const STREAM_HYPE_DAYS = 4
const STREAM_BOOST = 3.0         // listing viewer multiplier while a stream's afterglow is live
let _offerSeq = 0 // monotonic id for offers (Date.now/random are banned in this module's hot paths)

// --- Living market ----------------------------------------------------------
// Per-day chance a hype/crash event fires on SOME set (jolts one set's mult for
// flavor). Kept low so events feel like news, not weather. How many recent mult
// samples we keep per set for the Prices-tab sparkline.
const MARKET_EVENT_CHANCE = 0.10
const MARKET_HISTORY_LEN = 14
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
            cur.offers.push({ id: ++_offerSeq, amount, net: round2(amount - fee), savvy, savvyLabel: label, icon })
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
          cur.offers.push({ id: ++_offerSeq, amount, net: round2(amount - fee), savvy, savvyLabel: label, icon })
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
      if (onlineOK) { newOrders.push({ ...boothEncounter(noto, s.collection, 'online', accepted, listedCards), channel: 'online' }); onlineCount++ }
      else missedOnline++
    }
    // walk-in channel (only if you have a physical store AND cards out on the shelf). The
    // shelf is the pool: walk-ins only buy/offer on cards you've put out (passed as both the
    // collection arg and the shelf arg so the encounter's offer + browse pools resolve to the display case).
    if (hasStore && openWalkin && Math.random() < Math.min(0.97, dayOrderChance('walkin', noto) * orderMult)) {
      if (walkinOK) newOrders.push({ ...boothEncounter(noto, shelfCards, 'walkin', accepted, listedCards, shelfCards), channel: 'walkin' })
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
    listings: remainingListings,
    wantList: wants,
    forumPosts,
    dailyGoals: periodGoals,                       // weekly set; refreshed every 7 days
    goalsDay: goalsExpired ? newAbsDay : (s.goalsDay || newAbsDay),
    job: activeJob,        // a pending job may have started during these days
    pendingJob,
    streamHypeDaysLeft: Math.max(0, (st.streamHypeDaysLeft || 0) - days), // stream afterglow ages out
    streamFatigue: Math.max(0, (st.streamFatigue || 0) - days),           // audience freshness recovers with rest
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
    || (s.shopDisplay || []).find(c => c.uid === uid)
    || null
}
function removeOwnedAnywhere(set, uid) {
  set(st => ({
    collection: st.collection.filter(c => c.uid !== uid),
    listings: (st.listings || []).filter(l => l.card.uid !== uid),
    showInventory: (st.showInventory || []).filter(c => c.uid !== uid),
    shopDisplay: (st.shopDisplay || []).filter(c => c.uid !== uid),
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

  // Remote-management: keep the home shop earning while you're away at a show.
  // A modern smartphone fields online orders AND has contactless (tap) payments built in.
  smartphone: { name: 'Smartphone', cost: 1000, desc: 'Field ONLINE orders from anywhere — they keep coming in even while you\'re away at a show. Has contactless tap-to-pay built in.', icon: '📱' },
  streaming:  { name: 'Streaming Setup', cost: 900, desc: 'Camera, lights & capture card. Go LIVE and rip product on stream — viewers tune in, react, and tip, and a hot stream pumps your notoriety and listing traffic. Unlocks box breaks.', icon: '🔴' },
  staff:      { name: 'Shop Assistant', cost: 2500, desc: 'Hire staff to mind the store. WALK-IN customers are handled while you\'re at a show. Requires a Brick-and-Mortar Store.', icon: '🧑‍💼', needs: 'storefront' },

  // Vendor setup: a table, banner, display kit + dealer paperwork. A one-time buy that
  // lets you VEND at shows — book a booth and sell your own cards on the floor. Without
  // it you can only attend a show as a shopper (walk the floor and buy).
  vendorSetup: { name: 'Vendor Setup', cost: 1200, desc: 'A folding table, display case, banner & dealer paperwork. Lets you book a BOOTH at shows to sell your own cards (pay a per-show vendor fee). Without it, you can only attend to shop.', icon: '🎪' },

  signage:  { name: 'Eye-Catching Signage', cost: 150,  desc: '+15% foot traffic (shows, and your store if open).', icon: '🪧' },
  cases:    { name: 'Glass Display Cases',  cost: 500,  desc: 'Offers on your cards come in ~12% higher.', icon: '🗄️' },
  ticker:   { name: 'Visitor Ticker',       cost: 200,  desc: 'Alerts you when someone is at your stand while you browse a show hall.', icon: '🔔' },
  loupe:    { name: "Jeweler's Loupe",      cost: 450,  desc: 'Slightly better grade odds when you submit cards. Also gives a PRECISE cut/centering read on any raw card — without it the eyeball read is fuzzy.', icon: '🔍' },
  network:  { name: 'Dealer Network',       cost: 1500, desc: 'Famous vendors reveal their best stock — and flag underpriced DEALS and OVER-priced asks so you never overpay.', icon: '🤝' },
  banner:   { name: 'Charity Banner',       cost: 300, desc: 'Generous acts (giving cards away, fair deals) grant +50% extra notoriety.', icon: '🎗️' },
  autoSell: { name: 'Auto-Sell Service',    cost: 1800, desc: 'Hands-off selling: willing buyers auto-purchase your listings at 80% of market value — no need to accept each offer. Flag any listing to opt out and hold for a manual offer.', icon: '🤖' },
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
  wantList: [],            // active collector wants who sought YOU out (notoriety-gated)
  forumPosts: [],          // public WTB board — anyone-can-fill wants; your early-game demand engine
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
  // autoAdvance ("Auto-rip"): auto-start ripping on buy / "Rip another" (incl. the first
  // pack and single packs); in one-by-one mode, also rolls through a box's remaining packs.
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
      const demigodPacks = (s.stats.demigodPacks || 0) + (cards._demigod || cards.some(c => c._fromDemigod) ? 1 : 0)
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
          demigodPacks,
        },
      }
    })
    get().log('rip', `Opened ${setName}`, 0)
    get().bumpGoal('rip', packs)
    get().checkCompletions() // a new card may have just finished a set
  },

  // --- Master-set completion ---------------------------------------------------
  // Pay the FIRST-TIME completion bonus for any set you now own one-of-every-card in
  // and haven't been rewarded for yet. Idempotent and cheap; safe to call after any
  // card enters the collection. The reward records the set id permanently in
  // completedSets so it never pays twice (and selling later doesn't claw it back).
  checkCompletions() {
    const s = get()
    const ownedIds = ownedIdSet(s.collection)
    const newly = []
    for (const set_ of SETS) {
      if (s.completedSets.includes(set_.id)) continue
      if (setCompletion(set_, ownedIds).complete) newly.push(set_)
    }
    if (!newly.length) return
    set(st => ({ completedSets: [...st.completedSets, ...newly.map(x => x.id)] }))
    for (const set_ of newly) {
      const r = completionReward(set_)
      get().earn(r.cash)
      get().addNotoriety(r.noto)
      get().log('complete', `🏆 Completed the ${set_.name} set! Bonus +$${r.cash.toFixed(2)} & +${r.noto}★`, r.cash)
    }
  },

  // Quick sell (TCGplayer-style): instant cash, but well below market — you pay a steep
  // premium for the convenience. Liquidating your collection to make rent is a real loss,
  // not a soft cushion. Listing on your own site (below) can match or beat market.
  quickSellRate: 0.50,
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
  // to buy (see tickListings). `views`/`offers` accrue as days pass.
  listOnSite(uid, askMult) {
    const card = get().collection.find(c => c.uid === uid)
    if (!card) return false
    const q = get().listingQuote(card, askMult)
    const listing = { card, ask: q.ask, net: q.net, askMult, views: 0, offers: [], age: 0, autoSell: true }
    set(s => ({
      collection: s.collection.filter(c => c.uid !== uid),
      listings: [...(s.listings || []), listing],
    }))
    get().log('listing', `Listed ${card.name} at $${q.ask.toFixed(2)} (${Math.round(askMult*100)}% of market)`, 0)
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

  // Toggle auto-sell on a per-listing basis (only meaningful when autoSell upgrade is owned).
  setListingAutoSell(idx, val) {
    set(s => ({ listings: s.listings.map((x, i) => i === idx ? { ...x, autoSell: !!val } : x) }))
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
  // to a shop at a flat buylist rate — fast cash, but a punishing cut under market.
  buylistRate: 0.45,
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

  // Consign a card: a service lists it; it sells in 2–6 game-days slightly above market
  // (1.05–1.20×), minus a 12% consignment fee — so you net ~0.92–1.06× market (roughly AT
  // market). Removes from collection now, pays later.
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

  // --- Distributor program -----------------------------------------------------
  // Your standing on the wholesale ladder, derived from lifetime business volume
  // (everything earned + spent). Drives wholesale discounts, case lots, and supply.
  distributorStatus() {
    const vol = businessVolume(get().stats)
    return { volume: vol, tier: distributorTier(vol) }
  },
  // Wholesale a sealed product into the channel: pay your wholesale cost now, and it
  // sells through to other shops over a few days for a markup (passive distributor
  // income). `retail` is the shop price; you buy in at wholesale and resell at a
  // channel margin above that. Requires the supply perk (Distributor+).
  supplyVendors(pokeSet, product) {
    const { tier } = get().distributorStatus()
    if (!tier.supply) return false
    const cost = wholesalePrice(product.price, tier.discount) // you buy in at wholesale
    if (!get().spend(cost)) return false
    get().recordSetSpend(pokeSet.id, cost)
    // resell into the channel at a margin over RETAIL (other shops pay near retail),
    // minus a small channel fee. Net is comfortably above your wholesale cost.
    const sellThrough = round2(product.price * (1.04 + Math.random() * 0.06)) // ~104–110% of retail
    const net = round2(sellThrough * 0.95)                                    // 5% channel fee
    const daysLeft = 2 + Math.floor(Math.random() * 4)                        // 2–5 days
    const label = `${product.type} · ${pokeSet.name}`
    set(s => ({ supplyChannel: [...(s.supplyChannel || []), { label, net, daysLeft }] }))
    get().log('supply', `Wholesaled ${label} into the channel — nets $${net.toFixed(2)} in ~${daysLeft}d (cost $${cost.toFixed(2)})`, -cost)
    return { cost, net, daysLeft }
  },

  // --- Livestream --------------------------------------------------------------
  // Collect the up-front cash from a box break's sold spots (called when the stream
  // starts a break). Buyers pre-pay regardless of what gets pulled. Returns the gross.
  collectBreakSpots(gross) {
    if (!gross || gross <= 0) return 0
    get().earn(round2(gross))
    set(s => ({ streamStats: { ...s.streamStats, breaks: (s.streamStats?.breaks || 0) + 1 } }))
    get().log('stream', `Sold break spots for $${round2(gross).toFixed(2)} up front`, round2(gross))
    return round2(gross)
  },
  // Current audience freshness multiplier (1 = fresh, lower = streamed recently).
  // The UI uses it to preview expected viewers before going live.
  streamFreshness() { return fatigueMult(get().streamFatigue || 0) },

  // A viewer buys a still-open break spot mid-stream (hype sells the last spots).
  // Collect the spot price now; the UI marks that spot filled so its future pulls ship.
  sellLiveSpot(price) {
    if (!price || price <= 0) return
    get().earn(round2(price))
    get().log('stream', `A viewer grabbed an open break spot — +$${round2(price).toFixed(2)}`, round2(price))
  },

  // End-of-break settlement: cards that landed on FILLED spots ship to those buyers,
  // so they leave your collection. Cards on UNFILLED spots are yours to keep (you
  // "bought into" your own break for those teams). `shipUids` = the filled-spot cards.
  shipBreakCards(shipUids) {
    const ids = new Set(shipUids || [])
    if (!ids.size) return 0
    set(s => ({ collection: s.collection.filter(c => !ids.has(c.uid)) }))
    get().log('stream', `Shipped ${ids.size} card${ids.size>1?'s':''} to break spot-holders`, 0)
    return ids.size
  },

  // End a stream: bank tips (card income) + notoriety (can be slightly NEGATIVE on a
  // flop), open the listing-traffic "afterglow", tire the audience (+1 fatigue), and
  // burn a game-day — prepping & broadcasting takes the day, so the world advances
  // (orders/rent/etc.) just like any other day. A stream is now a real time cost,
  // not a free action, and over-streaming thins your crowd until you rest.
  endStream({ tips = 0, noto = 0, peakViewers = 0 } = {}) {
    if (tips > 0) get().earn(round2(tips))
    if (noto) get().addNotoriety(noto) // may be negative after a flop
    set(s => ({
      streamHypeDaysLeft: noto > 0 ? STREAM_HYPE_DAYS : 0, // a flop earns no afterglow
      streamFatigue: (s.streamFatigue || 0) + 1,
      streamStats: {
        streams: (s.streamStats?.streams || 0) + 1,
        tips: round2((s.streamStats?.tips || 0) + tips),
        peakViewers: Math.max(s.streamStats?.peakViewers || 0, Math.round(peakViewers)),
        breaks: s.streamStats?.breaks || 0,
      },
    }))
    const afterglow = noto > 0 ? ` Your shop is buzzing for ${STREAM_HYPE_DAYS} days.` : ''
    get().log('stream', `Wrapped a livestream — ${Math.round(peakViewers)} peak viewers, $${round2(tips).toFixed(2)} in tips (${noto >= 0 ? '+' : ''}${noto}★).${afterglow}`, round2(tips))
    // streaming consumes the day — advance the world one game-day (home, not away).
    advanceDaysWith(set, get, 1, false)
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
  // sell/expire outcome). Returns the count.
  listManyOnSite(uids, askMult) {
    const ids = new Set(uids)
    const cards = get().collection.filter(c => ids.has(c.uid))
    if (!cards.length) return 0
    const newListings = cards.map(card => {
      const q = get().listingQuote(card, askMult)
      return { card, ask: q.ask, net: q.net, askMult, views: 0, offers: [], age: 0 }
    })
    set(s => ({
      collection: s.collection.filter(c => !ids.has(c.uid)),
      listings: [...(s.listings || []), ...newListings],
    }))
    get().log('listing', `Listed ${cards.length} cards at ${Math.round(askMult*100)}% of market`, 0)
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

  // --- Forum (public WTB board) ------------------------------------------------
  // Which of your owned cards satisfy a forum post? (same matcher as wants)
  cardsForForumPost(post) { return get().collection.filter(c => cardMatchesWant(c, post)) },
  // Fill a forum WTB post with one of your cards → above-market payout + a little notoriety
  // (filling public orders builds your name — it's how you EARN your way past the inbound
  // gate). Counts toward the same 'want' weekly goal/stat as a direct collector want.
  fulfillForumPost(postId, uid) {
    const post = (get().forumPosts || []).find(p => p.id === postId)
    const card = get().collection.find(c => c.uid === uid)
    if (!post || !card || !cardMatchesWant(card, post)) return false
    const payout = round2(cardValue(card) * post.premiumMult)
    set(s => ({
      collection: s.collection.filter(c => c.uid !== uid),
      forumPosts: (s.forumPosts || []).filter(p => p.id !== postId),
      stats: { ...s.stats, wantsFilled: (s.stats.wantsFilled || 0) + 1 },
    }))
    get().earn(payout)
    get().addNotoriety(post.notoriety)
    get().log('forum', `Filled a forum WTB (${post.who}) with ${card.name} — +${Math.round((post.premiumMult-1)*100)}% over market`, payout)
    get().bumpGoal('want', 1)
    return { payout }
  },

  // A live price refresh is a fresh market snapshot — the new truth. The engine already
  // zeroed its module-level multipliers; clear the persisted drift + history so it doesn't
  // get re-pushed on the next load. Drift resumes from 1.0 on the next day-advance.
  onPricesRefreshed() {
    setMarketMults({})
    set({ marketMults: {}, marketHistory: {} })
  },

  // Ensure a set of weekly goals exists (called on mount). Seeds a fresh set only if
  // there are none yet or the 7-day window since they were generated has elapsed — an
  // in-progress week carries over untouched. goalsDay holds the absolute (month-safe) day.
  ensureDailyGoals() {
    const s = get()
    const today = absoluteDay(s.currentDay, s.monthsElapsed)
    if (!s.dailyGoals.length || today - (s.goalsDay || 0) >= GOAL_PERIOD_DAYS) {
      set({ dailyGoals: makeWeeklyGoals(s.notoriety), goalsDay: today })
    }
  },
  // Days until the current weekly goal set refreshes (0 = refreshes on the next day-tick).
  goalsResetInDays() {
    const s = get()
    if (!s.dailyGoals.length) return 0
    const today = absoluteDay(s.currentDay, s.monthsElapsed)
    return Math.max(0, GOAL_PERIOD_DAYS - (today - (s.goalsDay || today)))
  },
  // Advance any weekly goal matching `key` by `amount`; auto-complete + pay.
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
    get().checkCompletions() // a returned slab may complete a set
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
    if (!opts.toShowInventory) get().checkCompletions() // bought card may finish a set
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

  // --- Store display case (brick & mortar) -------------------------------------
  // The shelf in your physical shop: walk-in customers only ever buy/offer on cards
  // you've PUT OUT here (you choose what's on display), not your private collection.
  // Needs a storefront. Cards stay out until they sell or you pull them back.
  stockShop(uids) {
    if (!get().upgrades.storefront) return 0
    const ids = new Set(uids)
    const putting = get().collection.filter(c => ids.has(c.uid))
    if (!putting.length) return 0
    set(s => ({
      collection: s.collection.filter(c => !ids.has(c.uid)),
      shopDisplay: [...putting, ...(s.shopDisplay || [])],
    }))
    get().log('shop', `Put ${putting.length} card${putting.length > 1 ? 's' : ''} out on the shop shelf`, 0)
    return putting.length
  },
  // Pull one card off the shelf, back into your collection.
  pullFromShop(uid) {
    const card = (get().shopDisplay || []).find(c => c.uid === uid)
    if (!card) return
    set(s => ({
      collection: [card, ...s.collection],
      shopDisplay: (s.shopDisplay || []).filter(c => c.uid !== uid),
    }))
    get().log('shop', `Took ${card.name} off the shelf`, 0)
  },
  // Clear the whole shelf back into your collection.
  pullAllFromShop() {
    const shelf = get().shopDisplay || []
    if (!shelf.length) return 0
    set(s => ({ collection: [...shelf, ...s.collection], shopDisplay: [] }))
    get().log('shop', `Cleared the shelf — ${shelf.length} card${shelf.length > 1 ? 's' : ''} back in your collection`, 0)
    return shelf.length
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
        // Which of your cards can this browser actually buy?
        //   show   → only what you brought to your table (show inventory)
        //   listings → only cards you've LISTED for sale online (an online shopper can't
        //              buy out of your private collection — only what's up for sale)
        //   collection → a walk-in to your physical store browses your whole case
        // (Back-compat: an old in-flight encounter may still carry `fromShow`.)
        const pool = effect.pool || (effect.fromShow ? 'show' : 'collection')
        const owned = pool === 'show' ? (get().showInventory || [])
          : pool === 'listings' ? (get().listings || []).map(l => l.card)
          : pool === 'shop' ? (get().shopDisplay || [])
          : get().collection
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
      case 'trade': {
        // Card-for-card swap (± cash). You give up `uid`, receive `theirs`; cashAdj
        // > 0 pays you, < 0 you pay them. Bail gracefully if you no longer own yours,
        // or can't cover a cash-you-owe trade.
        const card = findOwnedAnywhere(get(), effect.uid)
        if (!card) { msg = 'That card is already gone — trade off.'; break }
        const adj = effect.cashAdj || 0
        if (adj < 0 && get().cash < -adj) { msg = `You can't cover the $${(-adj).toFixed(2)} on your side. Trade off.`; break }
        removeOwnedAnywhere(set, effect.uid)
        const got = { ...effect.theirs, _ask: undefined, _mispriced: undefined, _highlight: undefined }
        set(st => ({ collection: [got, ...st.collection] }))
        if (adj > 0) s.earn(adj)
        else if (adj < 0) s.spend(-adj)
        s.addNotoriety(effect.notoriety || 0)
        s.log('trade', `Traded ${card.name} for ${effect.theirs.name}${adj > 0 ? ` (+$${adj.toFixed(2)})` : adj < 0 ? ` (−$${(-adj).toFixed(2)})` : ''}`, adj)
        get().checkCompletions() // the card you traded for may finish a set
        break
      }
      case 'none':
      default:
        s.addNotoriety(effect.notoriety || 0)
    }
    // A sale may have removed a card that a pending inbox order was about — drop
    // any now-stale orders so you never see an offer for a card you no longer own.
    set(st => {
      const pruned = st.boothInbox.filter(enc => encounterStillValid(enc, st.collection, st.listings, st.shopDisplay))
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
      stats: { packsOpened: 0, cardsPulled: 0, hits: 0, spent: 0, earned: 0, bestPull: null }, bySet: {}, completedSets: [], marketMults: {}, marketHistory: {},
      notoriety: 0, upgrades: {}, showSeed: 7, currentDay: 1, monthsElapsed: 0, boothInbox: [], onlineOrdersEver: 0, showsAttended: 0, streamHypeDaysLeft: 0, streamFatigue: 0, streamStats: { streams: 0, tips: 0, peakViewers: 0, breaks: 0 }, generousActs: 0, gradesSubmitted: 0,
      consignments: [], listings: [], showInventory: [], shopDisplay: [], supplyChannel: [], wantList: [], forumPosts: [], dailyGoals: [], goalsDay: 0, lastTick: Date.now(),
      job: STARTER_JOB, pendingJob: null, rentArrears: 0, gameOver: false,
      cumWages: 0, _cardAccrual: 0, cardIncomeLog: [], employees: [], storeArrears: 0,
      settings: { openSealedOneByOne: false, ripSpeed: 1, autoAdvance: false, dayMinutes: DEFAULT_DAY_MINUTES } })
    setMarketMults({}) // clear the engine's live market drift too
  },
}), {
  name: 'poke-vendor-save',
  version: 23,
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
    state.shopDisplay = keepFlat(state.shopDisplay)
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
    return state
  },
  // The pricing engine holds the live market multipliers in module state, which is empty
  // on every page load. Re-push the rehydrated map so saved drift survives a refresh.
  onRehydrateStorage() {
    return (state) => { if (state) setMarketMults(state.marketMults || {}) }
  },
}))

