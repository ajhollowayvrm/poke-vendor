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
  applyMarketEvent, MARKET_EVENTS, VINTAGE_CRASH_CHANCE, VINTAGE_CRASH_EVENTS,
  setMarketMults, distributorById, restockRate,
  marketMult, setIdOfCard, sealedValue, DISTRIBUTORS, rapportLevel, distributorDiscount,
  makeVintageHold, setById, distributorPrice,
} from '../engine'
import { boothEncounter, makeShopRequest, makeWant, cardMatchesWant, generateCalendar, makeShowLead, vendorRapport, SHOW_TIERS, STORE_SALE_PREMIUM, makeConsignRequest, makeBuyinOffer } from '../shows'
import { packSaleChance } from '../mysterypacks'
import {
  CALENDAR_DAYS, INBOX_CAP, inboxCap, RENT_PER_DAY, rentPerDay, STORE_LEASE_PER_DAY, RENT_GRACE_DAYS,
  STORE_GRACE_DAYS, GOAL_PERIOD_DAYS, absoluteDay, makeWeeklyGoals, acceptedMethods,
  employeeById, dayOrderRate, drawCount, MAX_ORDERS_PER_DAY, COUNTER_MAX_PER_DAY,
  fameMult, fameBeyond, BARGAIN_ASK_MULT, storageFee, WORTH_HISTORY_LEN,
  ONLINE_FEE_PCT, shippingCost, omniShelfCards,
  HOLD_PICKUP_PREMIUM, HOLD_DAYS_STORE, CONCIERGE_HOLDS_PER_TICK,
  GIVEAWAY_TRAFFIC_MULT, CONSIGN_REQ_CAP, CONSIGN_REQ_CHANCE, CONSIGN_MIN_NOTO,
  BUYIN_CHANCE, BUYIN_CAP, BUYIN_MIN_NOTO, CREDIT_REDEEM_SHARE, CREDIT_BREAKAGE,
  STORE_EVENTS, EVENT_COOLDOWN_DAYS,
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
// Sets whose sealed product appreciates (vintage-style drift) — the Client Concierge
// never auto-holds these: setting one aside is selling down the player's hoard.
const SECONDARY_IDS = new Set(SECONDARY_SETS.map(s => s.id))

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
function applyVintageHolds(distributors, prev, days, absDay, log, holdBoost = 1) {
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
        if (Math.random() < HOLD_CHANCE_PER_DAY * holdBoost) created = makeVintageHold(distributorDiscount(dist, level))
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
function decayRegulars(regulars, days, factor = 1) {
  if (!regulars?.length) return regulars || []
  return regulars.map(r => ({ ...r, trust: Math.max(2, round2((r.trust || 0) - 0.5 * days * factor)) }))
}

// --- Forum (public wanted-ads board) ----------------------------------------
// Drift the forum board forward `days`: age out expired posts, top up toward the cap.
// Reuses makeWant() for the post shape (kind/cardId/rarity/premiumMult/daysLeft/who).
function tickForum(posts, days, noto) {
  let board = (posts || []).map(p => ({ ...p, daysLeft: p.daysLeft - days })).filter(p => p.daysLeft > 0)
  // Board size grows with your name: people post where the known dealer is reading. This was a
  // flat 6 posts / 70% refill at every fame level — the forum was the ONE demand channel that
  // never noticed you'd become famous. 6 at noto 0 → 9 at 100 → 12 at 300 → 16 (rail).
  const maxPosts = Math.min(16, Math.round(FORUM_MAX_POSTS * (0.6 + 0.4 * fameMult(noto))))
  const refill = Math.min(0.95, FORUM_REFILL_CHANCE * (0.85 + 0.15 * fameMult(noto)))
  for (let i = 0; i < days && board.length < maxPosts; i++) {
    if (Math.random() < refill) board = [{ ...makeWant(noto >= 120), forum: true }, ...board]
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
    // vintage sealed trends upward (finite, shrinking supply) — tapering bias, no revert.
    for (const s of VINTAGE_SETS) next[s.id] = driftMultVintage(next[s.id])
    // aftermarket (older SM/XY) sealed also appreciates as supply dries up — same upward drift.
    for (const s of SECONDARY_SETS) next[s.id] = driftMultVintage(next[s.id])
    // at most one hype/crash event per day, on a random shop set
    if (Math.random() < MARKET_EVENT_CHANCE) {
      const s = SHOP_SETS[Math.floor(Math.random() * SHOP_SETS.length)]
      const ev = MARKET_EVENTS[Math.floor(Math.random() * MARKET_EVENTS.length)]
      const r = applyMarketEvent(next[s.id], ev)
      next[s.id] = r.mult
      events.push({ setId: s.id, setName: s.name, kind: ev.kind, pct: r.pct, line: r.line.replace('{set}', s.name) })
    }
    // Rare vintage/secondary CRASH — the tail risk that makes holding vintage a real bet,
    // not a guaranteed climb. Checked per vintage/secondary set per day.
    for (const s of [...VINTAGE_SETS, ...SECONDARY_SETS]) {
      if (Math.random() < VINTAGE_CRASH_CHANCE) {
        const ev = VINTAGE_CRASH_EVENTS[Math.floor(Math.random() * VINTAGE_CRASH_EVENTS.length)]
        const r = applyMarketEvent(next[s.id], ev)
        next[s.id] = r.mult
        events.push({ setId: s.id, setName: s.name, kind: 'crash', pct: r.pct, line: r.line.replace('{set}', s.name) })
      }
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
  const repriced = []
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
    let walked = false // 🏷️ repricing service touched it this tick — fresh chance before it's called stale
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
          // They CAN afford the ask — and they pay YOUR ask, not their private maximum.
          // (Offers used to land at the buyer's max willingness, which made underpricing
          // free: a rock-bottom ask harvested 1.2-1.55× market offers. Now the ask is the
          // price; capturing a hot-set spike means actually repricing up while it's hot.)
          // With auto-sell: closes hands-off at exactly the ask.
          // Without: queues an offer at the ask plus a small impulse premium.
          if (autoSellOn) {
            if (Math.random() < LISTING_DAILY_SELL_CAP) {
              const market = cardValue(cur.card)
              const amount = round2(market * Math.min(effMax, cur.askMult))
              const fee = round2(amount * ONLINE_FEE_PCT)
              const net = round2(amount - fee - shippingCost(amount)) // online sale → ship it
              soldProceeds = round2(soldProceeds + net)
              sold.push({ name: cur.card.name, net, savvy: label, auto: true })
              didSell = true
              break
            }
            continue // auto-sell willing but didn't fire today
          }
          if (Math.random() < LISTING_DAILY_SELL_CAP) {
            const market = cardValue(cur.card)
            // impulse jitter: up to +6% over the ask, never past what this buyer would pay
            const payMult = Math.min(effMax, cur.askMult * (1 + Math.random() * 0.06))
            const amount = round2(market * payMult)
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
      // 🏷️ Repricing service: a listing aged past stale with looks but no offers gets
      // walked down 5%/day toward market (floor 100%) instead of sitting priced-too-high.
      if (upgrades.repricer && (cur.age || 0) >= LISTING_STALE_DAYS && cur.offers.length === 0 && cur.askMult > 1.0) {
        cur.askMult = Math.max(1.0, round2(cur.askMult - 0.05))
        cur.ask = round2(cardValue(cur.card) * cur.askMult)
        cur.net = round2(cur.ask - cur.ask * ONLINE_FEE_PCT - shippingCost(cur.ask))
        cur.stale = false
        walked = true
        if (!repriced.includes(cur.card.name)) repriced.push(cur.card.name)
      }
    }
    if (didSell) continue // sold → drops off the board
    // mark stale if it's drawn plenty of eyes over enough days with no traction
    if (!cur.stale && !walked && (cur.age || 0) >= LISTING_STALE_DAYS && cur.offers.length === 0 && cur.views >= 5) {
      cur.stale = true
      staleNow.push(cur.card.name)
    }
    remaining.push(cur)
  }
  return { listings: remaining, soldProceeds, sold, newOffers, premiumOffers, staleNow, repriced }
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
      if (get().upgrades.vault) {
        // 🏛️ climate-controlled, padded, sleeved — storage damage is a solved problem
        const line = `🏛️ ${c.name} slid off a shelf — the vault's padding saved it from a ding`
        get().log('life-good', line, 0); events.push({ icon: '🏛️', line, cashDelta: 0 })
      } else {
        const from = c.condition, to = COND_DOWN[from]
        set(st => ({ collection: st.collection.map(x => x.uid === c.uid ? { ...x, condition: to } : x) }))
        const line = `📦 ${c.name} got dinged in storage (${from}→${to})`
        get().log('life-bad', line, 0); events.push({ icon: '📦', line, cashDelta: 0 })
      }
    } else if (kind === 'theft') {
      const c = stealable[pickWeightedLowValue(stealable)]
      if (get().upgrades.security) {
        const line = `🚨 Someone tried to pocket ${c.name} — the security system caught them at the door`
        get().log('life-good', line, 0); events.push({ icon: '🚨', line, cashDelta: 0 })
      } else {
        const val = cardValue(c)
        set(st => ({ collection: st.collection.filter(x => x.uid !== c.uid) }))
        const line = `🕵️ ${c.name} went missing (was ~$${val.toFixed(2)}) — lock cards to protect them`
        get().log('life-bad', line, 0); events.push({ icon: '🕵️', line, cashDelta: 0 })
      }
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
  // --- Hosted store event: the night you planned happens as the first day turns ---
  // Resolved up front so its buzz window covers the days about to pass. `buzzDays0`
  // is the store's shared traffic-buzz counter (giveaways + events feed it).
  let buzzDays0 = s.giveawayDaysLeft || 0
  let eventCooldown = Math.max(0, (s.eventCooldownLeft || 0) - days)
  let eventExtraWalkins = 0
  {
    const plan = s.storeEventPlanned
    const ev = plan ? STORE_EVENTS[plan.type] : null
    if (plan && ev && hasStore) {
      if (ev.income) {
        const inc = round2(ev.income(noto))
        get().earn(inc)
        get().log('shop', `${ev.icon} ${ev.name} — the room was packed (+$${inc.toFixed(2)} at the door & counter)`, inc)
      } else {
        get().log('shop', `${ev.icon} ${ev.name} — a good room; word spreads.`, 0)
      }
      if (ev.noto) get().addNotoriety(ev.noto)
      if (plan.prizeCard) {
        // Raffle prize drawn — generosity with a box office (Charity Banner applies).
        const pv = cardValue(plan.prizeCard)
        const pop = Math.min(15, Math.round(2 + Math.sqrt(pv)))
        get().addNotoriety(pop, true)
        set(st => ({ generousActs: st.generousActs + 1 }))
        get().log('give', `🎟️ Raffle drawn — ${plan.prizeCard.name} ($${pv.toFixed(2)}) went home with a winner (+${pop}★)`, 0)
        get().bumpGoal('help', 1)
      }
      if (ev.trust) set(st => ({ regulars: (st.regulars || []).map(r => r.flags?.burned ? r : { ...r, trust: Math.min(100, (r.trust || 0) + ev.trust) }) }))
      if (ev.formsRegular) get().formRegular({ setId: SHOP_SETS[Math.floor(Math.random() * SHOP_SETS.length)]?.id, channel: 'walkin', generous: true })
      buzzDays0 = Math.max(buzzDays0, ev.buzzDays || 0)
      eventExtraWalkins = ev.extraWalkins || 0
      eventCooldown = Math.max(eventCooldown, Math.max(0, EVENT_COOLDOWN_DAYS - (days - 1)))
    } else if (plan?.prizeCard) {
      // Store gone before the night came — the raffle can't run; the prize comes home.
      set(st => ({ collection: [plan.prizeCard, ...st.collection] }))
    }
  }
  // Online buyers can only make offers on cards you've listed/tweeted.
  const listedCards = (s.listings || []).map(l => l.card)
  // A deeply-underpriced live listing draws online deal-hunters even before you're known.
  const hasBargain = (s.listings || []).some(l => !l.expired && l.askMult != null && l.askMult <= BARGAIN_ASK_MULT)
  // The store IS your inventory: walk-ins buy/offer on your whole collection (plus cards
  // listed EVERYWHERE), except items 🔒 kept (locked = not for sale) or HELD behind the
  // counter for a regular. Only meaningful with a storefront (every walk-in roll gates on it).
  const shelfCards = [...(s.collection || []).filter(c => !c.locked && !c._heldFor), ...omniShelfCards(s.listings)]
  const sellableSealed = (s.sealedInventory || []).filter(it => !it.locked && !it._heldFor)
  // No storefront, no inbox. Strangers only message you about cards you've actually
  // put up for sale: online needs a live listing, walk-ins need sellable stock out.
  // With nothing out on a channel there's nobody to hear from there — so we skip the
  // roll entirely rather than manufacture filler (price-checks, beggars) about a shop
  // that isn't open. (A deep bargain listing still counts as "open online".)
  const openOnline = listedCards.length > 0 || hasBargain
  const openWalkin = shelfCards.length > 0 || sellableSealed.length > 0
  for (let i = 0; i < days; i++) {
    const dayNo = s.currentDay + i + 1 // the day being entered (in-month, may exceed 30 mid-loop)
    // a pending job starts paying once its start day arrives — compared in ABSOLUTE days
    // (month-safe) so a job taken late in a month can't be stranded past the wrap.
    const enteringAbsDay = absoluteDay(s.currentDay, s.monthsElapsed) + i + 1
    if (pendingJob && enteringAbsDay >= pendingJob.startsOnDay) { activeJob = pendingJob.job; pendingJob = null }
    wagesEarned += activeJob?.wage || 0
    // Rent creeps up with the calendar: use the month the day being entered falls in, so a
    // multi-day jump that crosses a month boundary charges the higher rate for later days.
    rentDue += rentPerDay(s.monthsElapsed + Math.floor((s.currentDay + i) / CALENDAR_DAYS))
    if (hasStore) { leaseDue += STORE_LEASE_PER_DAY; payrollDue += empList.reduce((a, e) => a + e.wage, 0) }
    // ONLINE channel (employees raise throughput). Only if you have something listed.
    // A COUNT, not a coin flip: a famous vendor wakes up to several orders, not "maybe one".
    const onlineRate = (dayOrderRate('online', noto, hasBargain) + followerBump) * orderMult
    const nOnline = Math.min(MAX_ORDERS_PER_DAY, drawCount(onlineRate))
    for (let k = 0; k < nOnline && openOnline; k++) {
      if (onlineOK) { newOrders.push({ ...boothEncounter(noto, s.collection, 'online', accepted, listedCards, null, s.regulars), channel: 'online' }); onlineCount++ }
      else missedOnline++
    }
    // walk-in channel (only if you have a physical store AND cards out on the shelf). The
    // shelf is the pool: walk-ins only buy/offer on cards you've put out (passed as both the
    // collection arg and the shelf arg so the encounter's offer + browse pools resolve to the
    // display case). Store buzz (giveaways + events) pumps foot traffic for its window.
    const buzz = buzzDays0 > i ? GIVEAWAY_TRAFFIC_MULT : 1
    const signageMult = s.upgrades?.signage ? 1.15 : 1 // 🪧 +15% store foot traffic
    // FOOT TRAFFIC, as a count. A known shop gets a stream of people through the door.
    const walkinRate = dayOrderRate('walkin', noto) * orderMult * buzz * signageMult
    const nWalkin = (hasStore && openWalkin) ? Math.min(MAX_ORDERS_PER_DAY, drawCount(walkinRate)) : 0
    for (let k = 0; k < nWalkin; k++) {
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
    // Last night's hosted event: its crowd works your case as the day opens —
    // guaranteed extra walk-ups on the first day after the event.
    if (i === 0 && eventExtraWalkins > 0 && hasStore && openWalkin && walkinOK) {
      for (let e = 0; e < eventExtraWalkins; e++) {
        const enc = boothEncounter(noto, shelfCards, 'walkin', accepted, listedCards, shelfCards, s.regulars)
        for (const o of (enc.options || [])) {
          if (o.effect && ['sellOwned', 'counter', 'browseSale'].includes(o.effect.type)) o.effect.inStore = true
        }
        newOrders.push({ ...enc, channel: 'walkin' })
      }
    }
  }
  // BRICK & MORTAR "counter business": beyond the individual walk-up encounters above, a real
  // shop does steady everyday trade — singles, supplies, bulk to local kids/parents. That
  // baseline income scales with your local fame (foot traffic) and staffing, and rewards
  // keeping the case STOCKED (a neglected, empty shop barely ticks over). It's the recurring
  // revenue that makes the lease worth carrying once you've built a name. Also, running a
  // storefront steadily grows your name in town (passive notoriety). Capped so it never
  // becomes a runaway printer — the big money is still in the cards you move.
  // A LOCKED shop does zero counter trade: while you're away at a show with no staff
  // (walkinOK false), there's nobody behind the counter — no revenue, no name-building.
  // (It used to bank up to $250/day from a locked door for a whole Worlds trip.)
  let counterRevenue = 0
  if (hasStore && walkinOK) {
    const stocked = shelfCards.length > 0 || sellableSealed.length > 0
    const signage = s.upgrades?.signage ? 1.15 : 1 // 🪧 +15% foot traffic
    // Counter trade used to be min(250, 15 + noto) — it hit the $250 wall around noto 235, so a
    // world-famous shop took exactly as much over the counter as a locally-known one.
    //
    // The base is ALREADY linear in fame (15 + noto), so multiplying it by the full fame curve
    // on top made the whole thing superlinear and turned the till into a money printer (~$2.5k
    // /day at noto 800 — measured). We take the SQUARE ROOT of the fame boost instead: the wall
    // is gone and fame still compounds, but passive income can't outrun the actual card
    // business. This is the single most dangerous dial here — it's money for doing nothing.
    //   noto 100 → $115/day (unchanged) · 200 → $256 · 300 → $421 · 500 → $804 · 800 → $1.2k (rail)
    const fameBoost = Math.sqrt(Math.max(1, fameMult(noto) / fameMult(100)))
    const perDay = Math.min(COUNTER_MAX_PER_DAY,
      (15 + noto) * fameBoost * (stocked ? 1 : 0.35) * (1 + empThroughput * 0.6) * signage)
    counterRevenue = round2(perDay * days)
    get().addNotoriety(round2(0.3 * days)) // a running local shop builds your name
  }
  // STORE CREDIT redemption: locals holding credit spend it at the counter — those
  // sales come out of the day's takings instead of arriving as cash. A slice of
  // outstanding credit is simply never redeemed (breakage) — which is exactly why
  // paying sellers in credit beats paying cash.
  let storeCreditNext = round2(s.storeCredit || 0)
  if (hasStore && storeCreditNext > 0 && counterRevenue > 0) {
    const redeemed = round2(Math.min(storeCreditNext, counterRevenue * CREDIT_REDEEM_SHARE))
    if (redeemed > 0) {
      counterRevenue = round2(counterRevenue - redeemed)
      storeCreditNext = round2(storeCreditNext - redeemed)
      get().log('shop', `💳 Locals spent $${redeemed.toFixed(2)} of store credit at the counter`, 0)
    }
  }
  if (storeCreditNext > 0) storeCreditNext = round2(storeCreditNext * Math.pow(1 - CREDIT_BREAKAGE, days))
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
  const consignReturns = []
  for (const c of s.consignments) {
    const left = c.daysLeft - days
    if (left <= 0) {
      // Consignment is no longer a GUARANTEED sale: ~15% of the time the service can't
      // move it and the card comes home unsold. That risk is what stops consignment
      // (high net, fast) from strictly dominating a plain auto-sell listing.
      if (Math.random() < 0.15) {
        consignReturns.push(c.card)
        get().log('consign', `Consignment didn’t sell: ${c.card.name} came back unsold.`, 0)
      } else {
        soldProceeds = round2(soldProceeds + c.net); noteSale(c.card.name, c.net); get().log('sell', `Consignment sold: ${c.card.name}`, c.net)
      }
    }
    else remainingConsign.push({ ...c, daysLeft: left })
  }
  if (consignReturns.length) set(st => ({ collection: [...consignReturns, ...st.collection] }))
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
  if (lt.repriced.length) get().log('listing', `🏷️ Repricing service walked ${lt.repriced.length} stale listing${lt.repriced.length > 1 ? 's' : ''} down toward market.`, 0)

  // --- Mystery pack sales over the days passed -----------------------------------
  // Your repack line sells on its enabled channels day by day: online orders ship out
  // (needs the channel minded while away), store copies move across the counter (buzz
  // helps). Each sale runs through sellBuiltPack — it banks the cash and settles the
  // buyer-opened-it reputation swing — so here we just roll the demand.
  if ((get().builtPacks || []).length) {
    for (let i = 0; i < days; i++) {
      if (!(get().builtPacks || []).length) break
      const rep = get().packRep ?? 50
      for (const tier of (get().packTiers || [])) {
        if (tier.channels?.online && onlineOK) {
          const q = get().packsForChannel('online').filter(p => p.tierId === tier.id)
          if (q.length && Math.random() < packSaleChance(tier.price, noto, rep, 'online')) {
            const r = get().sellBuiltPack(q[0].uid, { channel: 'online' })
            if (r) noteSale(`${tier.name} (repack)`, r.net)
          }
        }
        if (tier.channels?.store && hasStore && walkinOK) {
          const q = get().packsForChannel('store').filter(p => p.tierId === tier.id)
          if (q.length && Math.random() < packSaleChance(tier.price, noto, rep, 'store', buzzDays0 > i)) {
            const r = get().sellBuiltPack(q[0].uid, { channel: 'walkin' })
            if (r) noteSale(`${tier.name} (repack)`, r.net)
          }
        }
      }
    }
  }

  // --- In-store services over the days passed ----------------------------------
  // 1) HOLDS: a regular you set an item aside for comes in to pick it up (trust-scaled
  //    daily odds, paid cash at the walk-in premium + a hold bonus). If the hold window
  //    lapses first, the item goes back out on the floor. Needs the store minded
  //    (walkinOK) — nobody hands over a hold to a locked door. Holds live as _heldFor
  //    flags on the ONE store inventory (collection + sealedInventory).
  let collectionNext = get().collection || []   // fresh read — earlier steps may have touched these
  let sealedInvNext = get().sealedInventory || []
  if (hasStore) {
    const tickHolds = (arr, isSealed) => arr.map(it => {
      if (!it._heldFor) return it
      const reg = (s.regulars || []).find(r => r.id === it._heldFor.regularId && !r.flags?.burned)
      let left = it._heldFor.daysLeft
      for (let dd = 0; dd < days && left > 0; dd++) {
        if (walkinOK && reg && Math.random() < Math.min(0.6, 0.3 + (reg.trust || 0) / 250)) {
          const label = isSealed ? it.product.type : it.name
          const price = round2((isSealed ? sealedValue(it) : cardValue(it)) * (1 + STORE_SALE_PREMIUM + HOLD_PICKUP_PREMIUM))
          soldProceeds = round2(soldProceeds + price)
          noteSale(label, price)
          get().log('sell', `${reg.emoji} ${reg.name} came in for the ${label} you were holding — paid $${price.toFixed(2)} cash, delighted`, price)
          get().bumpTrust(reg.id, 4, price)
          get().bumpGoal('sell', 1); get().bumpGoal('profit', price)
          return null // sold — off the shelf
        }
        left--
      }
      if (left <= 0) {
        const { _heldFor, ...clean } = it
        get().log('shop', `Hold lapsed — ${it._heldFor.name} never came for the ${isSealed ? it.product.type : it.name}; it's back on the floor.`, 0)
        return clean
      }
      return { ...it, _heldFor: { ...it._heldFor, daysLeft: left } }
    }).filter(Boolean)
    collectionNext = tickHolds(collectionNext, false)
    sealedInvNext = tickHolds(sealedInvNext, true)
    // 1b) CONCIERGE: with the Client Concierge, sealed gets set aside for regulars
    //     overnight — the same 🗝️ hold you'd make by hand, minus the clicking. Highest-
    //     trust regulars without a hold get one first, matched to their collecting focus
    //     when the floor has it, else the best piece out there. Keepers (🔒) and
    //     appreciating vintage/aftermarket sealed stay put. Stamped AFTER tickHolds so a
    //     fresh hold gets its full window starting tomorrow.
    if (s.upgrades.autoHold) {
      const alreadyHeldFor = new Set([...collectionNext, ...sealedInvNext].filter(x => x._heldFor).map(x => x._heldFor.regularId))
      const queue = (s.regulars || [])
        .filter(r => !r.flags?.burned && !alreadyHeldFor.has(r.id))
        .sort((a, b) => (b.trust || 0) - (a.trust || 0))
        .slice(0, CONCIERGE_HOLDS_PER_TICK)
      let floor = sealedInvNext.filter(it => !it._heldFor && !it.locked && !it.vintage && !SECONDARY_IDS.has(it.setId))
      for (const reg of queue) {
        if (!floor.length) break
        const pick = (reg.focus?.setId && floor.find(it => it.setId === reg.focus.setId))
          || floor.reduce((best, it) => sealedValue(it) > sealedValue(best) ? it : best, floor[0])
        const held = { regularId: reg.id, name: reg.name, emoji: reg.emoji, daysLeft: HOLD_DAYS_STORE }
        sealedInvNext = sealedInvNext.map(x => x.uid === pick.uid ? { ...x, _heldFor: held } : x)
        floor = floor.filter(x => x.uid !== pick.uid)
        get().log('shop', `🗝️ Your concierge set the ${pick.product.type} aside for ${reg.emoji} ${reg.name} — holding it ~${HOLD_DAYS_STORE} days`, 0)
      }
    }
  }
  // 2) CONSIGNMENT CASE: locals' cards you carry sell across the counter as days pass —
  //    you bank the commission (their money isn't yours). Unsold past the window goes
  //    home with its owner. And new locals may come in asking you to carry something.
  let storeConsignsNext = s.storeConsignments || []
  if (hasStore && storeConsignsNext.length) {
    const kept = []
    for (const c of storeConsignsNext) {
      let left = c.daysLeft, sold = false
      for (let dd = 0; dd < days && !sold && left > 0; dd++) {
        const buzzMult = buzzDays0 > dd ? 1.25 : 1
        // Consigned cards move faster through a famous case. Used to cap at 30%/day (noto 100);
        // now a big name keeps shifting locals' stock quicker, up to a 70% rail.
        const consignSellChance = Math.min(0.70,
          (Math.min(0.30, 0.10 + noto / 500) + fameBeyond(noto, 100) * 0.05) * buzzMult)
        if (walkinOK && Math.random() < consignSellChance) sold = true
        else left--
      }
      if (sold) {
        const cut = round2(c.ask * c.commissionPct)
        soldProceeds = round2(soldProceeds + cut)
        noteSale(`${c.card.name} (consigned)`, cut)
        get().log('shop', `Sold ${c.who}'s consigned ${c.card.name} for $${c.ask.toFixed(2)} — your ${Math.round(c.commissionPct * 100)}% cut: $${cut.toFixed(2)}`, cut)
        get().addNotoriety(1) // moving locals' cards builds your name as THE shop to sell through
      } else if (left <= 0) {
        get().log('shop', `${c.who} picked their unsold ${c.card.name} back up — consignment window closed.`, 0)
      } else kept.push({ ...c, daysLeft: left })
    }
    storeConsignsNext = kept
  }
  let consignReqsNext = (s.storeConsignRequests || [])
    .map(r => ({ ...r, pendingDays: r.pendingDays - days }))
    .filter(r => r.pendingDays > 0)
  // Opportunity flow scales with your name: the better known you are, the more locals think of
  // YOU first when they want something sold or bought. These arrival rates were flat — fame
  // only gated them on/off — so a household name got no more offers than a nobody who'd just
  // cleared the gate. Railed below 1/day so it stays a trickle of chances, not a firehose.
  const oppMult = fameMult(noto) / fameMult(CONSIGN_MIN_NOTO)
  if (hasStore && noto >= CONSIGN_MIN_NOTO) {
    for (let i = 0; i < days && consignReqsNext.length < CONSIGN_REQ_CAP; i++) {
      if (Math.random() < Math.min(0.9, CONSIGN_REQ_CHANCE * oppMult)) {
        const req = makeConsignRequest(noto)
        consignReqsNext = [req, ...consignReqsNext]
        get().log('shop', `🧾 ${req.who} came by with a ${req.card.name} — they want YOU to sell it (${Math.round(req.commissionPct * 100)}% commission). Answer on the Sell tab.`, 0)
      }
    }
  }
  // 3) COLLECTION BUY-INS: locals walk in wanting to SELL you a lot of cards.
  //    Offers wait a couple of days for an answer, then they try the shop across town.
  let buyinsNext = (s.buyinOffers || [])
    .map(o => ({ ...o, pendingDays: o.pendingDays - days }))
    .filter(o => o.pendingDays > 0)
  if (hasStore && noto >= BUYIN_MIN_NOTO) {
    for (let i = 0; i < days && buyinsNext.length < BUYIN_CAP; i++) {
      if (Math.random() < Math.min(0.9, BUYIN_CHANCE * oppMult)) {
        const offer = makeBuyinOffer(noto)
        buyinsNext = [offer, ...buyinsNext]
        get().log('shop', `🛍️ ${offer.who.charAt(0).toUpperCase() + offer.who.slice(1)} came in with ${offer.count} cards to SELL — asking $${offer.askCash.toFixed(2)}. Appraise it on the Sell tab.`, 0)
      }
    }
  }

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
  const distributorsNext = applyVintageHolds(restockDistributors(s.distributors, days), s.distributors, days, newAbsDay, get().log,
    s.upgrades.vintageScout ? 1.6 : 1) // 🕵️ the scout keeps sellers thinking of you
  // --- Pre-show leads: people DM you BEFORE a show, giving that trip a reason -----
  // Expire leads whose show has passed unattended (attending claims them at entry),
  // then maybe generate fresh ones for unlocked shows 1–4 days out: a recurring
  // vendor you have rapport with sets aside vintage at a held price, or a collector
  // arranges to meet you there to buy a specific card at an appointment premium.
  const LEAD_WINDOW = 4, LEAD_CAP = 3
  let leadsNext = (s.showLeads || []).filter(l => (l.absDay ?? 0) >= newAbsDay)
  const newLeads = []
  {
    const calendar = generateCalendar(noto, seed)
    const rapportVendors = (s.showVendors || []).filter(v => vendorRapport(s.vendorSpend?.[v.id] || 0).level >= 1)
    for (const showX of calendar) {
      if (leadsNext.length >= LEAD_CAP) break
      if (noto < SHOW_TIERS[showX.tierKey]?.minNotoriety) continue // can't attend → no DM
      if (showX.day <= d || showX.day - d > LEAD_WINDOW) continue
      if (leadsNext.some(l => l.showId === showX.id)) continue
      const absShowDay = absoluteDay(showX.day, months)
      // 📣 A sponsor's name on the banner makes people plan around seeing you there.
      const sponsor = !!s.upgrades.sponsorship
      const wantVendorLead = rapportVendors.length > 0 && Math.random() < (sponsor ? 0.55 : 0.30)
      const wantBuyerLead = !wantVendorLead && noto >= 20 && Math.random() < (sponsor ? 0.65 : 0.35)
      let lead = null
      if (wantVendorLead) {
        const vendor = rapportVendors[Math.floor(Math.random() * rapportVendors.length)]
        lead = makeShowLead(showX, 'vendor', { vendor, absDay: absShowDay })
      } else if (wantBuyerLead) {
        lead = makeShowLead(showX, 'buyer', { bigSpender: noto >= 120, absDay: absShowDay })
      }
      if (lead) { leadsNext = [...leadsNext, lead]; newLeads.push(lead) }
    }
  }
  for (const l of newLeads) get().log('lead', `📬 ${l.text}`, 0)
  set(st => ({
    currentDay: d, showSeed: seed, monthsElapsed: months,
    marketMults: market.marketMults, marketHistory: market.marketHistory,
    onlineOrdersEver: (st.onlineOrdersEver || 0) + onlineCount,
    // Cap grows with fame — otherwise a famous vendor's extra orders would be generated and
    // then silently thrown away by a fixed 8-slot cap, and the whole traffic buff would be
    // invisible. (INBOX_CAP is still the floor, via inboxCap().)
    boothInbox: [...newOrders.reverse(), ...st.boothInbox].slice(0, inboxCap(st.notoriety)),
    consignments: remainingConsign,
    supplyChannel: remainingSupply,
    distributors: distributorsNext, // wholesalers refill their shelves + high-rapport holds
    listings: remainingListings,
    wantList: wants,
    showLeads: leadsNext,
    // Holds picked up / lapsed on the one store inventory. Only written with a store —
    // nothing else in this window mutates these buckets, so the snapshot-derived arrays
    // are safe to write back; without a store they're left untouched.
    ...(hasStore ? { collection: collectionNext, sealedInventory: sealedInvNext } : {}),
    storeConsignments: storeConsignsNext,   // consigned sales banked, expiries returned
    storeConsignRequests: consignReqsNext,  // fresh asks in, stale asks gone
    buyinOffers: buyinsNext,                // sellers waiting on an answer (fresh in, stale gone)
    storeCredit: storeCreditNext,           // credit spent at the counter + breakage
    storeEventPlanned: null,                // tonight happened (or couldn't) — either way it's spent
    eventCooldownLeft: eventCooldown,
    giveawayDaysLeft: Math.max(0, buzzDays0 - days), // buzz (giveaway/event) ages out
    forumPosts,
    dailyGoals: periodGoals,                       // weekly set; refreshed every 7 days
    goalsDay: goalsExpired ? newAbsDay : (s.goalsDay || newAbsDay),
    job: activeJob,        // a pending job may have started during these days
    pendingJob,
    streamHypeDaysLeft: Math.max(0, (st.streamHypeDaysLeft || 0) - days), // stream afterglow ages out
    streamFatigue: Math.max(0, (st.streamFatigue || 0) - days),           // audience freshness recovers with rest
    regulars: decayRegulars(st.regulars, days, s.upgrades.newsletter ? 0.5 : 1), // relationships cool if you neglect them (💌 newsletter halves it)
    quickSellsToday: 0,                                                    // fresh day → the dump penalty resets
    giveawaysToday: 0,                                                     // fresh day → giveaway rep is full value again
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
  // The Binder Curator files overnight — the binder's "add everything possible" sweep, run
  // for you after the day's cards (pulls, buys) have all landed. Graded slabs are skipped:
  // a slab fresh back from grading is always the "best copy", and auto-filing it made
  // returned slabs vanish from the collection the same night the player revealed them.
  const binderFiled = s.upgrades.autoBinder ? get().addAllToBinder(null, { skipGraded: true }) : 0
  // 💼 Want-List Broker: fills collector wants + forum WTB posts overnight from the
  // sellable pool — always the CHEAPEST matching copy, so the good copies stay for the
  // binder, the case, and grading. Runs AFTER the curator: binder slots outrank cash.
  // Keepers (🔒), held items, and featured pieces are never handed over.
  let wantsBrokered = 0, brokerProceeds = 0
  if (s.upgrades.wantBroker) {
    const pickFor = w => get().collection
      .filter(c => cardMatchesWant(c, w) && !c.locked && !c._heldFor && !c._featured)
      .sort((a, b) => cardValue(a) - cardValue(b))[0]
    for (const w of [...get().wantList]) {
      const c = pickFor(w); if (!c) continue
      const r = get().fulfillWant(w.id, c.uid)
      if (r) { wantsBrokered++; brokerProceeds = round2(brokerProceeds + r.payout) }
    }
    for (const p of [...(get().forumPosts || [])]) {
      const c = pickFor(p); if (!c) continue
      const r = get().fulfillForumPost(p.id, c.uid)
      if (r) { wantsBrokered++; brokerProceeds = round2(brokerProceeds + r.payout) }
    }
  }
  // 📨 Offer Desk: accept any standing offer netting ≥90% of what the ask would — the
  // "close enough, take it" call. Listings flagged 🤖-manual are left for you to judge.
  let offersAccepted = 0
  if (s.upgrades.offerDesk) {
    for (const l of [...get().listings]) {
      if (l.autoSell === false || l.expired) continue
      const target = round2((l.net ?? l.ask ?? cardValue(l.card)) * 0.9)
      const best = (l.offers || []).filter(o => o.net >= target).sort((a, b) => b.net - a.net)[0]
      if (!best) continue
      const idx = get().listings.findIndex(x => x.card.uid === l.card.uid)
      if (idx >= 0) { get().acceptOffer(idx, best.id); offersAccepted++ }
    }
  }
  // 📋 Standing order: once a week the subscribed product ships automatically at your
  // rapport price — as long as the distributor has it and the till covers it. A missed
  // week (out of stock / short on cash) just retries daily until it lands.
  if (s.upgrades.standingOrder && get().standingOrder) {
    const so = get().standingOrder
    if (newAbsDay - (so.lastDay ?? -999) >= 7) {
      const dist = distributorById(so.distId)
      const pokeSet = setById(so.setId)
      const product = pokeSet ? (pokeSet.products || []).find(p => p.type === so.type) : null
      if (dist && pokeSet && product) {
        const level = rapportLevel((get().distributors[so.distId]?.spend) || 0).level
        const price = distributorPrice(dist, product.price, level)
        const r = get().buyFromDistributorBulk(so.distId, pokeSet, product, price, so.qty)
        if (r) {
          set({ standingOrder: { ...so, lastDay: newAbsDay } })
          get().log('buy', `📋 Standing order delivered — ${r.bought}× ${product.type} (${pokeSet.name})`, 0)
        }
      }
    }
  }
  // 💌 Newsletter: now and then it warms a lapsed regular back through the door.
  if (s.upgrades.newsletter && Math.random() < 0.12 * days) {
    const cold = (get().regulars || []).filter(r => !r.flags?.burned && (r.trust || 0) < 50)
      .sort((a, b) => (a.trust || 0) - (b.trust || 0))[0]
    if (cold) {
      get().bumpTrust(cold.id, 6, 0)
      get().log('regular', `💌 Your newsletter brought ${cold.emoji} ${cold.name} back around (+trust)`, 0)
    }
  }
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
    resolvedGrades: resolvedGrades.length, resolvedGradeCards: resolvedGrades, binderFiled,
    wantsBrokered, brokerProceeds, offersAccepted, days,
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
    binderFiled: add(a.binderFiled, b.binderFiled),
    wantsBrokered: add(a.wantsBrokered, b.wantsBrokered),
    brokerProceeds: round2(add(a.brokerProceeds, b.brokerProceeds)),
    offersAccepted: add(a.offersAccepted, b.offersAccepted),
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
      const prize = st.storeEventPlanned?.prizeCard
      // No store = no counter or display case: strip every hold + featured flag off the
      // one inventory (plus anything still on a legacy pre-v42 shelf comes home).
      return { upgrades: up, employees: [], storeArrears: 0,
        collection: [...(prize ? [prize] : []), ...(st.shopDisplay || []).map(({ _heldFor, ...c }) => c),
          ...st.collection.map(({ _heldFor, _featured, ...c }) => c)], shopDisplay: [],
        sealedInventory: [...(st.shopSealed || []).map(({ _heldFor, ...it }) => it),
          ...(st.sealedInventory || []).map(({ _heldFor, ...it }) => it)], shopSealed: [],
        listings: (st.listings || []).map(l => l.everywhere ? { ...l, everywhere: false } : l),
        // No shop = no case: consigned cards go home, asks + seller offers lapse, any
        // planned event is off (prize back), unspent store credit dies with the store
        // (locals eat it — hence the rep hit logged below), buzz dies.
        storeConsignments: [], storeConsignRequests: [], buyinOffers: [],
        storeEventPlanned: null, eventCooldownLeft: 0, storeCredit: 0, giveawayDaysLeft: 0 }
    })
    if ((get().storeCredit || 0) === 0 && (s.storeCredit || 0) > 0) {
      get().addNotoriety(-2)
      get().log('store-lost', `The $${(s.storeCredit || 0).toFixed(2)} of store credit you'd issued became worthless — locals are burned. (−2 notoriety)`, 0)
    }
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
