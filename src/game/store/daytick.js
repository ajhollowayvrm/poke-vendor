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
  marketMult, setIdOfCard, sealedValue, DISTRIBUTORS, rapportLevel, distributorDiscount,
  makeVintageHold, setById,
} from '../engine'
import { boothEncounter, makeShopRequest, makeWant } from '../shows'
import {
  CALENDAR_DAYS, INBOX_CAP, RENT_PER_DAY, rentPerDay, STORE_LEASE_PER_DAY, RENT_GRACE_DAYS,
  STORE_GRACE_DAYS, GOAL_PERIOD_DAYS, absoluteDay, makeWeeklyGoals, acceptedMethods,
  employeeById, dayOrderChance, BARGAIN_ASK_MULT, storageFee, WORTH_HISTORY_LEN,
  ONLINE_FEE_PCT, shippingCost, omniShelfCards,
} from './constants'
import { realizableAssets, netWorthFull } from './helpers'

// A set trading at or above this multiple of its base price is "hot" — willing buyers
// on a hot card pay a premium above market, so LISTING a card whose set is spiking can
// net well over 100% of market. This is the patient/attentive path's real upside (quick-
// selling can never beat market; auto-sell caps at 80%). Reading the market pays off.
const HOT_SET_MULT = 1.2
const HOT_PREMIUM = 0.15
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

// High-rapport vendors set aside vintage FOR YOU (the "we'll hold it" perk). For each
// distributor you're Preferred+ with, a small daily chance to reserve a sealed vintage pack —
// but only if you don't already have one held with them. It persists until you buy it or the
// hold window lapses (they put it back). Priced at market with your standing rapport discount.
// Mutates nothing; returns an updated distributors map and logs new holds via `log`.
const HOLD_RAPPORT_LEVEL = 2      // Preferred+ (a real relationship)
const HOLD_CHANCE_PER_DAY = 0.05  // ~30% chance over a week without a hold
const HOLD_DAYS = 12              // how long they'll hold it before it goes back on the shelf
function applyVintageHolds(distributors, prev, days, absDay, log) {
  if (!VINTAGE_SETS.length) return distributors
  const out = { ...distributors }
  for (const dist of DISTRIBUTORS) {
    const rec = out[dist.id] || prev[dist.id] || { spend: 0, stock: {} }
    let hold = rec.hold || null
    if (hold && hold.heldUntilDay != null && absDay >= hold.heldUntilDay) {
      log('supply', `🗝️ ${dist.name} put the sealed ${hold.setName || 'vintage pack'} they were holding back on the shelf — you didn't grab it in time.`, 0)
      hold = null
    }
    const level = rapportLevel(rec.spend).level
    if (!hold && level >= HOLD_RAPPORT_LEVEL) {
      let created = null
      for (let i = 0; i < days && !created; i++) {
        if (Math.random() < HOLD_CHANCE_PER_DAY) created = makeVintageHold(distributorDiscount(dist, level))
      }
      if (created) {
        hold = { ...created, heldUntilDay: absDay + HOLD_DAYS }
        log('supply', `🗝️ ${dist.name} messaged you — they set aside a sealed ${created.setName} just for you ($${created.price.toFixed(2)}, held ~${HOLD_DAYS}d). A rapport perk.`, 0)
      }
    }
    if (hold !== (rec.hold || null)) out[dist.id] = { ...rec, hold }
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
  let premiumOffers = 0 // offers landed on a hot-set card above market (the reading-the-market payoff)
  const remaining = []
  for (const l of (listings || [])) {
    // expired/awaiting-action listings just sit until you act on them
    if (l.expired) { remaining.push(l); continue }
    let cur = { ...l, offers: [...(l.offers || [])] }
    // Is this card's SET hot right now? A hot set lets willing buyers stretch above market.
    const hot = marketMult(setIdOfCard(cur.card)) >= HOT_SET_MULT
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
        // On a hot set a willing buyer will stretch a premium above what they'd normally
        // pay — so a manually-worked listing captures the spike (auto-sell never does).
        const effMax = hot ? max + HOT_PREMIUM : max
        const label = BUYER_SAVVY[savvy].label
        const icon = BUYER_SAVVY[savvy].icon
        if (cur.askMult <= effMax) {
          // They CAN afford the ask. With auto-sell: fires at 80% of market (same
          // LISTING_DAILY_SELL_CAP gate so it still takes a day or two) — hands-off
          // convenience, but it leaves the hot-set premium on the table.
          // Without auto-sell: queue an offer at the buyer's willing price.
          if (autoSellOn) {
            if (Math.random() < LISTING_DAILY_SELL_CAP) {
              const market = cardValue(cur.card)
              const amount = round2(market * 0.80)
              const fee = round2(amount * ONLINE_FEE_PCT)
              const net = round2(amount - fee - shippingCost(amount)) // online sale → ship it
              soldProceeds = round2(soldProceeds + net)
              sold.push({ name: cur.card.name, net, savvy: label, auto: true })
              didSell = true
              break
            }
            continue // auto-sell willing but didn't fire today
          }
          // No auto-sell: queue an offer at the buyer's willing price (≥ ask, and above
          // market when the set is hot).
          if (Math.random() < LISTING_DAILY_SELL_CAP) {
            const market = cardValue(cur.card)
            const amount = round2(market * effMax)
            const fee = round2(amount * ONLINE_FEE_PCT)
            const premium = amount > market * 1.02
            cur.offers.push({ id: nextOfferId(), amount, net: round2(amount - fee - shippingCost(amount)), savvy, savvyLabel: label, icon, hot: hot && premium })
            newOffers++
            if (hot && premium) premiumOffers++
          }
          continue // willing buyer — offer queued (or cap/prob skipped); next viewer
        }
        // just over their max → occasional lowball offer at what they'd pay.
        // Sharks lowball most; casuals rarely bother.
        const overBy = cur.askMult - max
        if (overBy < 0.35 && Math.random() < (savvy === 'shark' ? 0.5 : savvy === 'sharp' ? 0.3 : 0.12)) {
          const market = cardValue(cur.card)
          const amount = round2(market * max)
          const fee = round2(amount * ONLINE_FEE_PCT)
          cur.offers.push({ id: nextOfferId(), amount, net: round2(amount - fee - shippingCost(amount)), savvy, savvyLabel: label, icon })
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
  return { listings: remaining, soldProceeds, sold, newOffers, premiumOffers, staleNow }
}

// --- Life events: "something can happen while time passes" -------------------
// Each game-day advanced has a small chance SOMETHING happens — a surprise expense, a
// card dinged or gone missing, a buyer walking, or (rarely) a windfall. This makes
// fast-forwarding a gamble instead of a free skip; multi-day jumps compound the risk.
// LOCKED cards are protected (agency: lock your keepers), and losses are bounded so it's
// "meaningful," not rage-quit territory. Mutates state via get()/set(); returns the lines.
const LIFE_EVENT_CHANCE = 0.11 // per game-day
const COND_DOWN = { NM: 'LP', LP: 'MP', MP: 'DMG' } // one condition tier worse (DMG can't drop)
const EXPENSE_LINES = ['🔧 Surprise repair bill', '🧾 A utility bill came due', '🅿️ Parking ticket',
  '📦 Restocked shipping supplies + sleeves', '💻 Software/subscription charge', '🚗 Gas + tolls to a pickup']
const WINDFALL_LINES = ['💵 Found cash in an old binder', '🙌 A walk-in rounded up and overpaid',
  '🎁 A regular slipped you a little extra', '🪙 A return/refund came back your way']

// Weighted pick that favours LOW-value cards (cheap cards go first; grails only rarely),
// so the risk stings fairly without routinely nuking your best pull. Returns an index.
function pickWeightedLowValue(cards) {
  const w = cards.map(c => 1 / (Math.sqrt(Math.max(0, cardValue(c))) + 1))
  let tot = 0; for (const x of w) tot += x
  let r = Math.random() * tot
  for (let i = 0; i < cards.length; i++) { r -= w[i]; if (r <= 0) return i }
  return cards.length - 1
}

function applyLifeEvents(get, set, days) {
  const events = []
  for (let i = 0; i < days; i++) {
    if (Math.random() >= LIFE_EVENT_CHANCE) continue
    const s = get()
    const dingable = (s.collection || []).filter(c => !c.grade && !c.locked && COND_DOWN[c.condition])
    const stealable = (s.collection || []).filter(c => !c.locked)
    const withOffers = (s.listings || []).filter(l => (l.offers?.length || 0) > 0)
    const cands = [{ w: 34, k: 'expense' }, { w: 15, k: 'windfall' }]
    if (dingable.length) cands.push({ w: 24, k: 'ding' })
    if (stealable.length) cands.push({ w: 7, k: 'theft' })
    if (withOffers.length) cands.push({ w: 12, k: 'offer_pull' })
    let tot = 0; for (const c of cands) tot += c.w
    let r = Math.random() * tot, kind = cands[0].k
    for (const c of cands) { r -= c.w; if (r <= 0) { kind = c.k; break } }

    if (kind === 'expense') {
      const amt = Math.min(round2(15 + Math.random() * 55), Math.max(0, round2(s.cash)))
      if (amt > 0) get().spend(amt)
      const line = `${EXPENSE_LINES[Math.floor(Math.random() * EXPENSE_LINES.length)]} (-$${amt.toFixed(2)})`
      get().log('life-bad', line, -amt); events.push({ icon: '💸', line, cashDelta: -amt })
    } else if (kind === 'windfall') {
      const amt = round2(20 + Math.random() * 50)
      get().earn(amt)
      const line = `${WINDFALL_LINES[Math.floor(Math.random() * WINDFALL_LINES.length)]} (+$${amt.toFixed(2)})`
      get().log('life-good', line, amt); events.push({ icon: '🍀', line, cashDelta: amt })
    } else if (kind === 'ding') {
      const c = dingable[pickWeightedLowValue(dingable)]
      const from = c.condition, to = COND_DOWN[from]
      set(st => ({ collection: st.collection.map(x => x.uid === c.uid ? { ...x, condition: to } : x) }))
      const line = `📦 ${c.name} got dinged in storage (${from}→${to})`
      get().log('life-bad', line, 0); events.push({ icon: '📦', line, cashDelta: 0 })
    } else if (kind === 'theft') {
      const c = stealable[pickWeightedLowValue(stealable)]
      const val = cardValue(c)
      set(st => ({ collection: st.collection.filter(x => x.uid !== c.uid) }))
      const line = `🕵️ ${c.name} went missing (was ~$${val.toFixed(2)}) — lock cards to protect them`
      get().log('life-bad', line, 0); events.push({ icon: '🕵️', line, cashDelta: 0 })
    } else if (kind === 'offer_pull') {
      const l = withOffers[Math.floor(Math.random() * withOffers.length)]
      const off = l.offers[0]
      set(st => ({ listings: st.listings.map(x => x.card.uid === l.card.uid ? { ...x, offers: (x.offers || []).filter(o => o.id !== off.id) } : x) }))
      const line = `🚪 A buyer withdrew their $${(off.amount || 0).toFixed(2)} offer on ${l.card.name}`
      get().log('life-bad', line, 0); events.push({ icon: '🚪', line, cashDelta: 0 })
    }
  }
  return events
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
  // Shop Assistant is a permanent, payroll-free +0.15 throughput (a person minding the store) —
  // a distinct one-time-fee alternative to the paid Employees, which give bigger boosts for a
  // daily wage. So staff isn't just "away coverage" that any hire duplicates.
  const staffThroughput = s.upgrades.staff ? 0.15 : 0
  const empThroughput = Math.min(1.5, empList.reduce((a, e) => a + e.throughput, 0) + staffThroughput)
  const orderMult = 1 + empThroughput
  // Channel FOLLOWERS are a returning audience that also SHOPS — a built-up following adds a
  // standing bump to your online order chance even on days you don't stream. Gives streaming
  // a payoff that reaches the rest of the game, not just bigger future streams.
  const followerBump = Math.min(0.15, (s.followers || 0) / 2000)
  let payrollDue = 0, leaseDue = 0
  // Online buyers can only make offers on cards you've listed/tweeted.
  const listedCards = (s.listings || []).map(l => l.card)
  // A deeply-underpriced live listing draws online deal-hunters even before you're known.
  const hasBargain = (s.listings || []).some(l => !l.expired && l.askMult != null && l.askMult <= BARGAIN_ASK_MULT)
  // Walk-in customers only buy/offer on what you've put out on the shop shelf —
  // which includes cards listed EVERYWHERE (online + store case): the same physical
  // card is browsable in person, and whichever channel sells it first takes it.
  const shelfCards = [...(s.shopDisplay || []), ...omniShelfCards(s.listings)]
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
    // Rent creeps up with the calendar: use the month the day being entered falls in, so a
    // multi-day jump that crosses a month boundary charges the higher rate for later days.
    rentDue += rentPerDay(s.monthsElapsed + Math.floor((s.currentDay + i) / CALENDAR_DAYS))
    if (hasStore) { leaseDue += STORE_LEASE_PER_DAY; payrollDue += empList.reduce((a, e) => a + e.wage, 0) }
    // online channel (employees raise the hit chance). Only if you have something listed.
    if (openOnline && Math.random() < Math.min(0.97, (dayOrderChance('online', noto, hasBargain) + followerBump) * orderMult)) {
      if (onlineOK) { newOrders.push({ ...boothEncounter(noto, s.collection, 'online', accepted, listedCards, null, s.regulars), channel: 'online' }); onlineCount++ }
      else missedOnline++
    }
    // walk-in channel (only if you have a physical store AND cards out on the shelf). The
    // shelf is the pool: walk-ins only buy/offer on cards you've put out (passed as both the
    // collection arg and the shelf arg so the encounter's offer + browse pools resolve to the display case).
    if (hasStore && openWalkin && Math.random() < Math.min(0.97, dayOrderChance('walkin', noto) * orderMult)) {
      if (walkinOK) {
        // ~35% of walk-ins come in ASKING for a specific item (sealed or single) rather than
        // browsing — the store's demand layer. The rest are the usual offer/browse/trade mix.
        const enc = Math.random() < 0.35
          ? makeShopRequest(s, accepted)
          : boothEncounter(noto, shelfCards, 'walkin', accepted, listedCards, shelfCards, s.regulars)
        // Flag the sale-type effects so the in-store premium (STORE_SALE_PREMIUM) applies — a
        // card sells for more across your counter than in a web listing. (fulfillRequest already
        // bakes the premium into its price, so it's intentionally NOT flagged here.)
        for (const o of (enc.options || [])) {
          if (o.effect && ['sellOwned', 'counter', 'browseSale'].includes(o.effect.type)) o.effect.inStore = true
        }
        newOrders.push({ ...enc, channel: 'walkin' })
      } else missedWalkin++
    }
  }
  // BRICK & MORTAR "counter business": beyond the individual walk-up encounters above, a real
  // shop does steady everyday trade — singles, supplies, bulk to local kids/parents. That
  // baseline income scales with your local fame (foot traffic) and staffing, and rewards
  // keeping the case STOCKED (a neglected, empty shop barely ticks over). It's the recurring
  // revenue that makes the lease worth carrying once you've built a name. Also, running a
  // storefront steadily grows your name in town (passive notoriety). Capped so it never
  // becomes a runaway printer — the big money is still in the cards you move.
  let counterRevenue = 0
  if (hasStore) {
    const stocked = shelfCards.length > 0 || (s.shopSealed || []).length > 0
    const perDay = Math.min(250, (15 + noto) * (stocked ? 1 : 0.35) * (1 + empThroughput * 0.6))
    counterRevenue = round2(perDay * days)
    get().addNotoriety(round2(0.3 * days)) // a running local shop builds your name
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
  // resolve consignments whose timer elapsed over the days passed. Seed proceeds with the
  // storefront's counter business (logged separately below so the recap can show it).
  let soldProceeds = counterRevenue
  if (counterRevenue > 0) get().log('shop', `🏬 Storefront counter sales — singles, supplies & bulk to locals (+$${counterRevenue.toFixed(2)})`, counterRevenue)
  // Names + biggest single sale over the window, for the daily recap's "what sold" list.
  const soldNames = []
  let bigSale = null
  const noteSale = (name, net) => {
    soldNames.push({ name, net })
    if (!bigSale || net > bigSale.net) bigSale = { name, net }
  }
  const remainingConsign = []
  for (const c of s.consignments) {
    const left = c.daysLeft - days
    if (left <= 0) { soldProceeds = round2(soldProceeds + c.net); noteSale(c.card.name, c.net); get().log('sell', `Consignment sold: ${c.card.name}`, c.net) }
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
    noteSale(sale.name, sale.net)
    if (sale.auto) get().log('sell', `Auto-sold ${sale.name} — $${sale.net.toFixed(2)}`, sale.net)
    else get().log('sell', `Sold ${sale.name} to a ${sale.savvy} — $${sale.net.toFixed(2)}`, sale.net)
  }
  if (lt.newOffers) get().log('listing', `${lt.newOffers} new offer${lt.newOffers > 1 ? 's' : ''} on your listings — review them on the Sell tab.`, 0)
  // A spiking set drew premium offers ABOVE market — the reward for listing into a hot market.
  if (lt.premiumOffers) get().log('listing', `📈 ${lt.premiumOffers} buyer${lt.premiumOffers > 1 ? 's' : ''} offered OVER market on a hot set — list into the spike while it lasts.`, 0)
  for (const name of lt.staleNow) get().log('listing', `${name} keeps getting looks but no buyers — likely priced too high. Reprice or pull it.`, 0)
  // age out want-lists, then maybe post new collector wants (scaled by notoriety)
  let wants = s.wantList.map(w => ({ ...w, daysLeft: w.daysLeft - days })).filter(w => w.daysLeft > 0)
  const wantsAfterAging = wants.length
  const maxWants = 2 + Math.floor(noto / 80) // more fame → more collectors seek you out
  const wantChancePerDay = 0.25 + noto / 300
  for (let i = 0; i < days && wants.length < maxWants; i++) {
    if (Math.random() < wantChancePerDay) wants = [makeWant(noto >= 120), ...wants]
  }
  const newWants = Math.max(0, wants.length - wantsAfterAging) // fresh collectors who sought you out
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
  // Restock the distributors, then let high-rapport ones reserve vintage for you.
  const distributorsNext = applyVintageHolds(restockDistributors(s.distributors, days), s.distributors, days, newAbsDay, get().log)
  set(st => ({
    currentDay: d, showSeed: seed, monthsElapsed: months,
    marketMults: market.marketMults, marketHistory: market.marketHistory,
    onlineOrdersEver: (st.onlineOrdersEver || 0) + onlineCount,
    boothInbox: [...newOrders.reverse(), ...st.boothInbox].slice(0, INBOX_CAP),
    consignments: remainingConsign,
    supplyChannel: remainingSupply,
    distributors: distributorsNext, // wholesalers refill their shelves + high-rapport holds
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
    quickSellsToday: 0,                                                    // fresh day → the dump penalty resets
  }))
  // pay sales + wages in, then settle rent.
  if (soldProceeds > 0) get().earn(soldProceeds)
  // credit listing sales toward the daily sell/profit goals
  for (const sale of lt.sold) { get().bumpGoal('sell', 1); get().bumpGoal('profit', sale.net) }
  if (wagesEarned > 0) { get().earn(wagesEarned, { wage: true }); get().log('wage', `Wages: ${activeJob?.title || 'job'} (+$${wagesEarned.toFixed(2)})`, wagesEarned) }
  // Inventory carrying cost: money tied up in unsold sealed/listings/consignments/shelf
  // beyond the free allowance bleeds a small daily storage fee. Folded into the same rent
  // settlement/arrears path so it adds pressure without a separate game-over edge case.
  const storageDue = round2(storageFee(s) * days)
  const overheadDue = round2(rentDue + storageDue)
  if (overheadDue > 0) settleRent(set, get, overheadDue, days, storageDue)
  // Brick & mortar: settle the daily lease + payroll. Failing this over the grace window
  // closes the store (you keep the cards/cash — you just lose the lease + staff).
  if (hasStore && (leaseDue + payrollDue) > 0) settleStore(set, get, leaseDue, payrollDue, days)
  set(st => ({ cumWages: round2((st.cumWages || 0) + wagesEarned) })) // wages tracked separately from card income
  // Life events: something may have happened while these days passed (expense, ding, theft,
  // a buyer walking, a windfall). Applied after settlement so the recap's cashDelta captures it.
  const lifeEvents = applyLifeEvents(get, set, days)
  if (missedOnline) get().log('missed', `Missed ${missedOnline} online order${missedOnline>1?'s':''} while away (get a 📱 Smartphone).`, 0)
  if (missedWalkin) get().log('missed', `Missed ${missedWalkin} walk-in${missedWalkin>1?'s':''} while away (hire a 🧑‍💼 Shop Assistant).`, 0)
  for (const ev of market.events) get().log(ev.kind === 'hype' ? 'market-hype' : 'market-crash', `${ev.kind === 'hype' ? '📈' : '📉'} ${ev.line}`, 0)
  // Resolve any grades whose day count was reached during these days (currentDay is now updated).
  const resolvedGrades = get().resolveGrades()
  // Daily catch-all for milestones — sweeps up any slow-moving thresholds (net worth,
  // notoriety, cumulative counters) that the instant per-action checks don't cover.
  get().checkMilestones()
  // Sample net worth (cash + everything you own, incl. in-flight buckets) into the trend
  // ring — one point per day-advance — for the Stats sparkline and the daily recap.
  const g = get()
  const netWorth = netWorthFull(g)
  set(st => ({ worthHistory: [...(st.worthHistory || []), { d: newAbsDay, worth: netWorth, cash: round2(g.cash) }].slice(-WORTH_HISTORY_LEN) }))

  // The day-summary payload. cashDelta/notoDelta are measured against the snapshot taken at
  // the very top of this call (s.cash / noto) AFTER every settlement above — including the
  // completion bonuses a returned slab may have just paid — so the modal reflects the whole
  // tick. saleProceeds is the passive income banked (consignments + supply + listing sales).
  return { added: newOrders.length, missedOnline, missedWalkin, wages: round2(wagesEarned), rent: round2(rentDue),
    lease: round2(leaseDue), payroll: round2(payrollDue), storage: round2(storageDue),
    listingsSold: lt.sold.length, listingOffers: lt.newOffers, premiumOffers: lt.premiumOffers || 0,
    resolvedGrades: resolvedGrades.length, resolvedGradeCards: resolvedGrades, days,
    saleProceeds: round2(soldProceeds), counterIncome: round2(counterRevenue),
    // Richer recap data: named sales, biggest single sale, market movers, new collectors.
    soldNames: soldNames.slice(0, 6), bigSale, newWants,
    marketMovers: market.events.map(e => ({ setName: e.setName, kind: e.kind, pct: e.pct })),
    lifeEvents,
    netWorth,
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
  // Take the biggest single sale across both legs of the trip.
  const bigSale = [a.bigSale, b.bigSale].filter(Boolean).sort((x, y) => y.net - x.net)[0] || null
  return {
    added: add(a.added, b.added),
    missedOnline: add(a.missedOnline, b.missedOnline),
    missedWalkin: add(a.missedWalkin, b.missedWalkin),
    wages: round2(add(a.wages, b.wages)),
    rent: round2(add(a.rent, b.rent)),
    lease: round2(add(a.lease, b.lease)),
    payroll: round2(add(a.payroll, b.payroll)),
    storage: round2(add(a.storage, b.storage)),
    listingsSold: add(a.listingsSold, b.listingsSold),
    listingOffers: add(a.listingOffers, b.listingOffers),
    premiumOffers: add(a.premiumOffers, b.premiumOffers),
    resolvedGrades: add(a.resolvedGrades, b.resolvedGrades),
    resolvedGradeCards: [...(a.resolvedGradeCards || []), ...(b.resolvedGradeCards || [])],
    saleProceeds: round2(add(a.saleProceeds, b.saleProceeds)),
    counterIncome: round2(add(a.counterIncome, b.counterIncome)),
    soldNames: [...(a.soldNames || []), ...(b.soldNames || [])].slice(0, 6),
    bigSale,
    newWants: add(a.newWants, b.newWants),
    marketMovers: [...(a.marketMovers || []), ...(b.marketMovers || [])],
    lifeEvents: [...(a.lifeEvents || []), ...(b.lifeEvents || [])],
    netWorth: b.netWorth != null ? b.netWorth : a.netWorth, // latest (end-of-trip) worth
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
    // bring everything off the shelf back home (no shop = no display case) — cards to the
    // collection, sealed to held inventory, and everywhere-listings back to online-only.
    set(st => {
      const up = { ...st.upgrades }; delete up.storefront; delete up.staff
      return { upgrades: up, employees: [], storeArrears: 0,
        collection: [...(st.shopDisplay || []), ...st.collection], shopDisplay: [],
        sealedInventory: [...(st.shopSealed || []), ...(st.sealedInventory || [])], shopSealed: [],
        listings: (st.listings || []).map(l => l.everywhere ? { ...l, everywhere: false } : l) }
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
function settleRent(set, get, rentDue, days, storageDue = 0) {
  const s = get()
  // rentDue is the combined overhead (base rent + inventory storage); break it out for the log.
  const baseRent = round2(rentDue - storageDue)
  const storageNote = storageDue > 0 ? ` + storage $${storageDue.toFixed(2)}` : ''
  if (s.cash >= rentDue) {
    get().spend(rentDue)
    get().log('rent', `Rent $${baseRent.toFixed(2)}${storageNote} paid (-$${rentDue.toFixed(2)})`, -rentDue)
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
