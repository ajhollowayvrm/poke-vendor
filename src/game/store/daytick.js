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
  SHOP_SETS, VINTAGE_SETS, SECONDARY_SETS, JP_SHOP_SETS, JP_CARD_SETS, driftMult, driftMultVintage,
  applyMarketEvent, MARKET_EVENTS, VINTAGE_CRASH_CHANCE, VINTAGE_CRASH_EVENTS,
  setMarketMults, distributorById, restockRate, distributorUnlocked,
  marketMult, setIdOfCard, sealedValue, sealedCard, DISTRIBUTORS, rapportLevel, distributorDiscount,
  makeVintageHold, setById, distributorPrice, breakOptions, setProducts,
  gradePrediction, psaValueAt, gradingFee, distributorCatalog, stockState,
  showcaseSetIds, showcaseMult, pickMasterLot, LOT_PREMIUM_LO, LOT_PREMIUM_HI,
  ownedIdSet, setCompletion,
} from '../engine'
import { boothEncounter, makeShopRequest, makeGiftBuyer, makeQuoteRequest, makeWant, cardMatchesWant, cardMatchesFocus, generateCalendar, makeShowLead, vendorRapport, SHOW_TIERS, STORE_SALE_PREMIUM, SEALED_SHOP_MARKUP, makeConsignRequest, makeBuyinOffer } from '../shows'
import { packSaleChance, packValue } from '../mysterypacks'
import { settleAuction, watcherDraw } from '../auctions'
import {
  CALENDAR_DAYS, INBOX_CAP, inboxCap, RENT_PER_DAY, rentPerDay, STORE_LEASE_PER_DAY, RENT_GRACE_DAYS,
  SPECIAL_ORDER_GRACE, RIVAL_NAMES, RIVAL_HEAT_START, RIVAL_HEAT_DRIFT, RIVAL_PROMO_GATE,
  RIVAL_PROMO_CHANCE, RIVAL_PROMO_DAYS, RIVAL_PROMOS, rivalDrag,
  BRANCH_LEASE_PER_DAY, BRANCH_SALE_SHARE, BRANCH_GRACE_DAYS, BRANCH_PREMIUM, EMPLOYEES, floorCount,
  STORE_GRACE_DAYS, GOAL_PERIOD_DAYS, absoluteDay, makeWeeklyGoals, acceptedMethods,
  employeeById, dayOrderRate, drawCount, MAX_ORDERS_PER_DAY, COUNTER_MAX_PER_DAY, machineMaxPerDay, binMaxPerDay,
  binDemand, BIN_GIVEUP_DAYS, BIN_MISS_NOTORIETY, BIN_MISS_DING_CAP,
  fameMult, fameBeyond, BARGAIN_ASK_MULT, storageFee, WORTH_HISTORY_LEN,
  ONLINE_FEE_PCT, shippingCost, omniShelfCards,
  HOLD_PICKUP_PREMIUM, HOLD_DAYS_STORE, CONCIERGE_HOLDS_PER_TICK,
  GIVEAWAY_TRAFFIC_MULT, consignReqCap, CONSIGN_REQ_CHANCE, CONSIGN_MIN_NOTO,
  BUYIN_CHANCE, buyinCap, BUYIN_MIN_NOTO, BUYIN_ESTATE_CHANCE, CREDIT_REDEEM_SHARE, CREDIT_BREAKAGE,
  STORE_QUOTE_SHARE, STORE_QUOTE_MIN_NOTO, storeQuoteBand,
  creditMonthlyRate, CREDIT_MIN_PCT, CREDIT_MIN_FLOOR, CREDIT_MISS_NOTORIETY,
  STORE_EVENTS, EVENT_COOLDOWN_DAYS, onFloor, walkinDayMult, buyinDayMult, seasonOf,
  supplyById, pickSupplyId, BUYLIST_POLICIES, SUB_DAILY,
  floorItemCap, floorSkuCounts, floorSkuKey, floorFreeSlots,
  decayHype, ledgerRoll, HYPE_CURE_RATE, HYPE_CURE_DAILY_CAP, hypeDemandMult, hypePriceMult,
  // 📱 content system (game/content.js)
  makePost, pushPost, postPatch, cadenceMult, rollViral, POST_KINDS,
  huntFollowers, HUNT_EPISODE_EVERY, challengeScale,
  DISCORD_WANT_BONUS, DISCORD_WANT_CAP_BONUS, discordRegularChance,
  COLLAB_CREATORS, COLLAB_CHANCE, COLLAB_MIN_FOLLOWERS, collabGain,
  PODCAST_PERIOD, PODCAST_REP, podcastFollowers, PODCAST_WAVE_LEAD_DAYS,
  SPONSOR_BRANDS, SPONSOR_MIN_FOLLOWERS, SPONSOR_PERIOD, SPONSOR_WINDOW_DAYS,
  SPONSOR_FEATURE_PACKS, SPONSOR_LAPSE_DING, sponsorMonthly,
} from './constants'
import { realizableAssets, netWorthFull, isDistributor } from './helpers'
import { DISTRIBUTOR_NOTO } from '../engine'
// 🧾 tax + 🏦 loan settlement and 🔨 the buy-side auction board. The per-day work for each
// lives beside its own actions rather than in this file, so a system reads in one place.
import { settleQuarter, settleLoan, settleTaxArrears } from './books'
import { settleAuctionLots } from './auctionhouse'
import { tickMarket } from './market'
import { shelfCarries } from '../shelf'

// A set trading at or above this multiple of its base price is "hot" — willing buyers
// on a hot card pay a premium above market, so LISTING a card whose set is spiking can
// net well over 100% of market. This is the patient/attentive path's real upside (quick-
// selling can never beat market; auto-sell caps at 80%). Reading the market pays off.
const HOT_SET_MULT = 1.2
const HOT_PREMIUM = 0.15

// Distributor wholesale income (once you're big enough to BE a distributor — see isDistributor):
// a passive daily margin of the sealed stock you keep on hand, capped, then scaled by reputation.
const WHOLESALE_DAILY_RATE = 0.012  // 1.2%/day of your sealed inventory value moves as wholesale
const WHOLESALE_DAILY_CAP = 6000    // per-day ceiling (before the reputation multiplier)
import { nextOfferId, nextInboxId } from './ids'

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
// --- 📰 Reprint waves: the modern-Pokémon restock cycle -------------------------------
// Hot sets sell out industry-wide, then come back in ANNOUNCED waves: a preorder window
// (allocation scaled by distributor rapport; locals pay deposits at your counter), then
// DROP DAY — prepaid stock lands, deposit-holders pick up at retail+premium, and a launch
// rush works the shop for a couple of days. The announcement itself SOFTENS the set's
// market mult (reprint incoming) — held sealed dips while cheap supply opens up.
const WAVE_ANNOUNCE_CHANCE = 0.125 // per eligible day (~one wave every 2-3 weeks with cooldown)
const WAVE_COOLDOWN_DAYS = 10      // quiet days after a drop before the next can be announced
const WAVE_NOTO_GATE = 20          // you hear allocation news once you're a little plugged in
const WAVE_CUST_CAP = 8            // most locals who'll preorder through one shop
const WAVE_DEPOSIT_FRAC = 0.3      // deposit = this share of the product's base retail
const WAVE_RUSH_DAYS = 2           // launch-week buzz + request bias after the drop
const WAVE_PICKUP_PREMIUM = 0.05   // preorder pickups pay retail markup + this
const WAVE_REPRINT_EVENT = { kind: 'crash', pct: [-0.15, -0.08],
  lines: ['Reprint wave announced — {set} supply is coming back, and singles & sealed ease off'] }
// Sets whose sealed product appreciates (vintage-style drift) — the Client Concierge
// never auto-holds these: setting one aside is selling down the player's hoard.
const SECONDARY_IDS = new Set(SECONDARY_SETS.map(s => s.id))

// Did a wave-restock "drop" land in the window (prevDay, absDay]? Drops fall on days that are
// Restock every distributor's depleted stock over `days` passed. Each stock entry is
// { q, cap }; it climbs back toward cap at the distributor's restock rate. Entries that
// reach the cap are dropped (an absent key means "fully stocked" — keeps the map lean).
// (The wave-restock exception died with the Pokémon Center MSRP shelf, 2026-08-10 —
// every remaining seller trickles daily.)
function restockDistributors(distributors, days, absDay) {
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

// Regulars, once a day: cool the relationship, punish a lane you never carry, and let a
// trusting-but-underserved regular CALL to ask you to stock what they collect.
//   • Base cool — every regular loses a little trust per day (floored at 2 so dormancy alone
//     never burns them; dealing them adds it back). 💌 newsletter halves it via `factor`.
//   • Neglected lane — if you're currently carrying NOTHING in their focus (servedIds says
//     so), they cool FASTER, and the penalty escalates the longer their lane sits empty
//     (unmetDays). Carry a match and unmetDays resets.
//   • Call-in — a regular with a real relationship (trust ≥ 30) whose lane has been empty a
//     few days may phone and ask you to get some in. One open ask at a time, one new call
//     per tick. Filling the lane later clears the ask and warms them (handled on `served`).
// Pure: returns the next roster + event lists so the caller logs/recaps AFTER the state write.
function tickRegulars(regulars, days, factor, servedIds, absDay) {
  if (!regulars?.length) return { regulars: regulars || [], requested: [], fulfilled: [] }
  const requested = [], fulfilled = []
  const next = regulars.map(r => {
    if (r.flags?.burned) return r
    const base = 0.5 * factor * days
    if (servedIds.has(r.id)) {
      // You carry their lane. Base cool only, unmet counter reset — and if they'd called
      // asking for it, you came through: clear the ask and warm them up.
      const out = { ...r, unmetDays: 0, trust: Math.max(2, round2((r.trust || 0) - base)) }
      if (r.request) { fulfilled.push(r); out.request = null; out.trust = Math.min(100, round2(out.trust + 5)) }
      return out
    }
    const unmet = Math.min(30, (r.unmetDays || 0) + days)
    const drop = base + (0.35 + 0.03 * unmet) * days // escalating neglect penalty
    const out = { ...r, unmetDays: unmet, trust: Math.max(2, round2((r.trust || 0) - drop)) }
    if (!r.request && requested.length < 1 && (r.trust || 0) >= 30 && unmet >= 3 && Math.random() < 0.1 * days) {
      out.request = { line: r.focus?.label || 'good deals', day: absDay }
      requested.push(out)
    }
    return out
  })
  return { regulars: next, requested, fulfilled }
}

// Which regulars' lanes you currently carry: online buyers shop your LISTINGS, in-store
// regulars shop your STORE STOCK (unlocked, unheld). No store → a walk-in regular has no
// shelf to check, so treat them as served (don't punish what they can't reach).
function servedRegularIds(regulars, listings, storeStock, hasStore) {
  const ids = new Set()
  const listed = (listings || []).map(l => l.card)
  for (const r of (regulars || [])) {
    if (r.flags?.burned) continue
    if (r.channel === 'walkin' && !hasStore) { ids.add(r.id); continue }
    const pool = r.channel === 'walkin' ? storeStock : listed
    if (pool.some(c => cardMatchesFocus(c, r.focus))) ids.add(r.id)
  }
  return ids
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
    // 🎌 Every JP set with real prices drifts, not just the rippable shelf — browse-only sets
    // (151's Master Ball parallels, Shiny Treasure ex) now circulate as SINGLES through vendor
    // bins, wants and offers, so their market has to move like everything else. A set whose
    // mult never drifts is a set whose cards are quietly frozen out of the living market.
    for (const s of JP_CARD_SETS) next[s.id] = driftMult(next[s.id])
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
  for (const s of [...SHOP_SETS, ...JP_CARD_SETS]) {
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
function tickListings(listings, days, noto, streamBoostDays = 0, upgrades = {}, shopHype = 0, masteredSet = null) {
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
      // 🔥 Shop hype pumps listing TRAFFIC (stacks with afterglow, both capped) and lets a
      // hot moment's buyers stretch a hair further (≤+5% — the exploit-dangerous dial).
      // 🎓 A mastered set's singles move quicker out of YOUR case — you're the known source.
      const masteredBoost = masteredSet?.has(setIdOfCard(cur.card)) ? 1.15 : 1
      const boost = (streamed ? STREAM_BOOST : 1) * hypeDemandMult(shopHype) * masteredBoost
      const viewers = dailyViewers(cur.card, cur.askMult, noto, Math.random, boost)
      cur.views += viewers
      for (let v = 0; v < viewers; v++) {
        const savvy = rollBuyerSavvy()
        const max = buyerMaxMult(savvy, noto, cur.card) * hypePriceMult(shopHype)
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
              const net = round2(amount - fee - shippingCost(amount, upgrades)) // online sale → ship it (📦 station halves it)
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
            cur.offers.push({ id: nextOfferId(), amount, net: round2(amount - fee - shippingCost(amount, upgrades)), savvy, savvyLabel: label, icon, hot: hot && premium })
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
          cur.offers.push({ id: nextOfferId(), amount, net: round2(amount - fee - shippingCost(amount, upgrades)), savvy, savvyLabel: label, icon })
          newOffers++
        }
      }
      cur.age = (cur.age || 0) + 1
      // 🏷️ Repricing service: a listing aged past stale with looks but no offers gets
      // walked down 5%/day toward market (floor 100%) instead of sitting priced-too-high.
      if (upgrades.repricer && (cur.age || 0) >= LISTING_STALE_DAYS && cur.offers.length === 0 && cur.askMult > 1.0) {
        cur.askMult = Math.max(1.0, round2(cur.askMult - 0.05))
        cur.ask = round2(cardValue(cur.card) * cur.askMult)
        cur.net = round2(cur.ask - cur.ask * ONLINE_FEE_PCT - shippingCost(cur.ask, upgrades))
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
  // 🔥/📒 Close out the day(s) being left behind: the whole tick reads this stale hype
  // snapshot (same discipline as `noto` above), yesterday's ⭐-attribution map rolls into
  // the 7-day ring, and a capped slice of the hype that burned off overnight "cures" into
  // permanent reputation — a hot streak leaves a small lasting mark, never a farmable one.
  const hype0 = s.hype || 0
  // 🖼️ The showcase snapshot: completed sets still fully owned draw the shop real traffic
  // all tick (stale for the whole tick, same discipline as noto/hype0). `masteredIds` is the
  // PERMANENT list (ever completed) — the knowledge perks survive selling the page.
  const showcaseIds = showcaseSetIds(s)
  const showcaseN = showcaseIds.length
  const masteredIds = s.completedSets || []
  {
    const hypeNext = round2(decayHype(hype0, days))
    set(st => ({
      hype: hypeNext,
      repLedger: ledgerRoll(st.repLedger, st.currentDay),
    }))
    const cure = Math.min(HYPE_CURE_DAILY_CAP * days, round2((hype0 - hypeNext) * HYPE_CURE_RATE))
    if (cure > 0.05) get().addNotoriety(cure, false, 'hype')
  }
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
  // 🧢 Supplies sell through the tick two ways: an event-night burst (league/tournament
  // crowds sleeve decks, below) and the daily counter attach (with the counter block).
  // Mutations land on this local copy; one write at the end carries it all.
  const suppliesNext = { ...(s.supplies || {}) }
  let suppliesRevenue = 0, suppliesSold = 0
  const sellSupplies = (units) => {
    let n = 0
    for (let k = 0; k < units; k++) {
      const id = pickSupplyId(suppliesNext)
      if (!id) break
      suppliesNext[id] -= 1
      suppliesRevenue = round2(suppliesRevenue + supplyById(id).retail)
      suppliesSold++; n++
    }
    return n
  }
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
      if (ev.noto) get().addNotoriety(ev.noto, false, 'events')
      if (ev.hype) get().addHype(ev.hype) // 🔥 a packed room is a story people carry out the door
      set(st => ({ stats: { ...st.stats, eventsHosted: (st.stats?.eventsHosted || 0) + 1 } })) // 🏅 rank-deed counter
      if (plan.prizeCard) {
        // Raffle prize drawn — generosity with a box office (Charity Banner applies).
        const pv = cardValue(plan.prizeCard)
        const pop = Math.min(15, Math.round(2 + Math.sqrt(pv)))
        get().addNotoriety(pop, true, 'events')
        get().addHype(6)
        set(st => ({ generousActs: st.generousActs + 1 }))
        get().log('give', `🎟️ Raffle drawn — ${plan.prizeCard.name} ($${pv.toFixed(2)}) went home with a winner (+${pop}★)`, 0)
        get().bumpGoal('help', 1)
      }
      // 🧢 A player crowd clears the accessory rack — sleeves and boxes for tonight's decks.
      if (ev.suppliesBurst) {
        const cleared = sellSupplies(8 + Math.floor(Math.random() * 8))
        if (cleared > 0) get().log('shop', `🧢 The ${ev.name} crowd cleared ${cleared} accessor${cleared === 1 ? 'y' : 'ies'} off the rack`, 0)
      }
      if (ev.trust) set(st => ({ regulars: (st.regulars || []).map(r => r.flags?.burned ? r : { ...r, trust: Math.min(100, (r.trust || 0) + ev.trust) }) }))
      if (ev.formsRegular) get().formRegular({ setId: SHOP_SETS[Math.floor(Math.random() * SHOP_SETS.length)]?.id, channel: 'walkin', generous: true })
      buzzDays0 = Math.max(buzzDays0, ev.buzzDays || 0)
      eventExtraWalkins = ev.extraWalkins || 0
      // 🎪 An Events Coordinator turns the room over faster — one night's breather, not two.
      const cooldownDays = s.upgrades.eventsCoordinator ? 1 : EVENT_COOLDOWN_DAYS
      eventCooldown = Math.max(eventCooldown, Math.max(0, cooldownDays - (days - 1)))
    } else if (plan?.prizeCard) {
      // Store gone before the night came — the raffle can't run; the prize comes home.
      set(st => ({ collection: [plan.prizeCard, ...st.collection] }))
    }
  }
  // Online buyers can only make offers on cards you've listed/tweeted.
  const listedCards = (s.listings || []).map(l => l.card)
  // A deeply-underpriced live listing draws online deal-hunters even before you're known.
  const hasBargain = (s.listings || []).some(l => !l.expired && l.askMult != null && l.askMult <= BARGAIN_ASK_MULT)
  // Walk-ins & the counter buy ONLY from the SALES FLOOR (loc==='floor') — backstock in the
  // storeroom sells nothing until you move it out front. Kept (🔒 locked) and held items are
  // off the floor by definition. Cards listed EVERYWHERE (omni) are deliberately out too, so
  // they ride along regardless of loc. Only meaningful with a storefront (every roll gates on it).
  // Featured VINTAGE sealed is a display-case showpiece: wrap it card-shaped so the whale/offer
  // engine can price & target it exactly like a featured single. (Everyday sealed still sells via
  // browseSale, which rebuilds its own pool — only the FEATURED piece rides the premium channel.)
  const featuredSealedCards = (s.sealedInventory || [])
    .filter(it => it._featured && it.loc === 'floor' && !it.locked && !it._heldFor)
    .map(it => ({ ...sealedCard(it), _featured: true }))
  const shelfCards = [...(s.collection || []).filter(c => c.loc === 'floor' && !c.locked && !c._heldFor), ...omniShelfCards(s.listings), ...featuredSealedCards]
  const sellableSealed = (s.sealedInventory || []).filter(it => it.loc === 'floor' && !it.locked && !it._heldFor)
  // No storefront, no inbox. Strangers only message you about cards you've actually
  // put up for sale: online needs a live listing, walk-ins need sellable stock out.
  // With nothing out on a channel there's nobody to hear from there — so we skip the
  // roll entirely rather than manufacture filler (price-checks, beggars) about a shop
  // that isn't open. (A deep bargain listing still counts as "open online".)
  const openOnline = listedCards.length > 0 || hasBargain
  // Two different questions, and they used to be one.
  //
  // `openWalkin` is "is there anything on the shelf to look at" — it gates BROWSING, offers and
  // trades, which are meaningless against an empty case.
  //
  // It must NOT gate the demand layer. A customer walking in to ASK for something does not need
  // you to already own something else, and both makeShopRequest and makeGiftBuyer are written for
  // exactly that: makeShopRequest carries a `loc: 'none'` branch for product you do not have, and
  // makeGiftBuyer has a "nothing giftable on the floor in their budget" branch. Both emit
  // requestMiss, which is what feeds the demand board — the board whose whole job is telling you
  // what the town keeps asking for so you know what to stock.
  //
  // Gating those on already having stock killed the loop at the one moment it matters: an empty
  // shop, deciding what to buy. Nobody came in, so nothing was recorded, so the board stayed blank
  // and the shelves stayed empty. Both empty-shelf branches were unreachable code.
  const shelfHasStock = shelfCards.length > 0 || sellableSealed.length > 0
  const openWalkin = shelfHasStock
  // Launch week: right after a reprint wave drops, a big share of walk-in requests hunt
  // exactly that set's product (makeShopRequest biasSetId) — stock it or watch them miss.
  const waveRushSetId = (s.reprintWave && s.reprintWave.doneDay != null
    && absoluteDay(s.currentDay, s.monthsElapsed) < s.reprintWave.dropDay + WAVE_RUSH_DAYS)
    ? s.reprintWave.setId : null
  // Footfall weight of the days passed: Σ of each day's weekday multiplier (≈ `days` on
  // average, more if the window covers a weekend). The counter and pack machine scale by
  // this instead of a flat day count, so a Saturday genuinely rings up more than a Tuesday.
  let footWeight = 0
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
    // 🔥 Hype multiplies DEMAND while the shop runs hot (≤×1.35, stale snapshot for the
    // whole tick) — traffic and interest, never the counter's passive trade budget.
    const onlineRate = (dayOrderRate('online', noto, hasBargain) + followerBump) * orderMult * hypeDemandMult(hype0)
    const nOnline = Math.min(MAX_ORDERS_PER_DAY, drawCount(onlineRate))
    for (let k = 0; k < nOnline && openOnline; k++) {
      if (onlineOK) { newOrders.push({ ...boothEncounter(noto, s.collection, 'online', accepted, listedCards, null, s.regulars, null, { showcase: showcaseN }), channel: 'online' }); onlineCount++ }
      else missedOnline++
    }
    // walk-in channel (only if you have a physical store AND cards out on the shelf). The
    // shelf is the pool: walk-ins only buy/offer on cards you've put out (passed as both the
    // collection arg and the shelf arg so the encounter's offer + browse pools resolve to the
    // display case). Store buzz (giveaways + events) pumps foot traffic for its window.
    const buzz = buzzDays0 > i ? GIVEAWAY_TRAFFIC_MULT : 1
    const signageMult = s.upgrades?.signage ? 1.15 : 1 // 🪧 +15% store foot traffic
    // Weekday × season shape the day: dead Tuesdays, packed Saturdays — and a December
    // Saturday is the biggest day of the year. Month computed per-day the way rent is,
    // so a window crossing the month boundary shifts season mid-jump.
    const season = seasonOf(s.monthsElapsed + Math.floor((s.currentDay + i) / CALENDAR_DAYS))
    const dayMult = walkinDayMult(enteringAbsDay) * season.walkin
    footWeight += dayMult
    // FOOT TRAFFIC, as a count. A known shop gets a stream of people through the door.
    // 🏪 A live promotion across town is a real hole in your own footfall — that's what
    // makes the rival worth competing with rather than reading about.
    const rivalMult = rivalDrag(s.rival)
    const walkinRate = dayOrderRate('walkin', noto) * orderMult * buzz * signageMult * dayMult * rivalMult * hypeDemandMult(hype0) * showcaseMult(showcaseN)
    // The door is open whenever you hold the lease. What each visitor turns out to want is what
    // depends on the shelf, and that is decided per visitor below.
    const nWalkin = hasStore ? Math.min(MAX_ORDERS_PER_DAY, drawCount(walkinRate)) : 0
    for (let k = 0; k < nWalkin; k++) {
      if (walkinOK) {
        // Season first: in Nov–Dec a slice of walk-ins are GIFT BUYERS with a budget, not a
        // want. Then ~35% come in ASKING for a specific item (the store's demand layer); the
        // rest are the usual offer/browse/trade mix.
        // 🗣️ "What'll you give me for these?" — someone puts one to three cards on the glass and
        // asks YOU to price them. Independent of what is in your case: they are here to SELL, and
        // a thin shelf is the reason to say yes. Rolled FIRST so a bare shop still gets offered
        // stock instead of only being asked for it.
        const quote = (hasStore && noto >= STORE_QUOTE_MIN_NOTO && Math.random() < STORE_QUOTE_SHARE)
          ? makeQuoteRequest(noto, null, { band: storeQuoteBand(noto), venue: 'store' })
          : null
        const enc = quote
          ? quote
          : (season.gift > 0 && Math.random() < season.gift)
          ? makeGiftBuyer(s, accepted, noto)
          : Math.random() < 0.35
          // 🎓 Mastered-set perk: the shop known for a set gets asked for it — absent a
          // reprint rush, ~30% of requests lean toward a set you've completed.
          ? makeShopRequest(s, accepted, { biasSetId: waveRushSetId || (masteredIds.length && Math.random() < 0.3 ? masteredIds[Math.floor(Math.random() * masteredIds.length)] : null) })
          // A browser needs something to browse. With a bare case this visitor simply is not an
          // event — which is why an empty shop still hears the asks but sees no browsing, and
          // fills back up as you put stock out.
          : shelfHasStock
          ? boothEncounter(noto, shelfCards, 'walkin', accepted, listedCards, shelfCards, s.regulars, null, { showcase: showcaseN })
          : null
        if (!enc) continue
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
        const enc = boothEncounter(noto, shelfCards, 'walkin', accepted, listedCards, shelfCards, s.regulars, null, { showcase: showcaseN })
        for (const o of (enc.options || [])) {
          if (o.effect && ['sellOwned', 'counter', 'browseSale'].includes(o.effect.type)) o.effect.inStore = true
        }
        newOrders.push({ ...enc, channel: 'walkin' })
      }
    }
  }
  // BRICK & MORTAR "counter business": beyond the individual walk-up encounters above, a real
  // shop does steady everyday trade — singles, supplies, bulk to local kids/parents. This now
  // sells REAL stock off your SALES FLOOR instead of printing abstract cash: each day locals
  // ring up everyday floor items (cheapest first, up to a fame-scaled trade budget), and that
  // stock LEAVES your inventory. So the counter only earns while the floor is kept stocked with
  // everyday product — an empty or grail-only floor barely ticks over. Running the shop still
  // grows your name in town (passive notoriety). A LOCKED shop does zero counter trade: away at
  // a show with no staff (walkinOK false) there's nobody behind the counter.
  let counterRevenue = 0, coolerRevenue = 0
  const counterSoldC = new Set(), counterSoldS = new Set()
  if (hasStore && walkinOK) {
    // 🥤 Snack Cooler: drinks and snacks ring up a little steady money every open day,
    // riding the same footfall shape as the counter (a December Saturday sells more soda too).
    if (s.upgrades.snackCooler) coolerRevenue = round2(Math.min(25, 8 + noto * 0.03) * footWeight)
    const signage = s.upgrades?.signage ? 1.15 : 1 // 🪧 +15% foot traffic
    // The day's counter TRADE BUDGET — dollars of everyday goods locals will buy — on the same
    // fame/staffing curve as before (sqrt fame boost keeps it from outrunning the card business;
    // COUNTER_MAX_PER_DAY is the hard rail). It's now a CEILING on real sales, not free money.
    //   noto 100 → ~$115/day · 200 → $256 · 300 → $421 · 500 → $804 · 800 → $1.2k (rail)
    const fameBoost = Math.sqrt(Math.max(1, fameMult(noto) / fameMult(100)))
    // Scaled by footWeight, not flat days — a weekend window does real Saturday numbers.
    const budget = Math.min(COUNTER_MAX_PER_DAY,
      (15 + noto) * fameBoost * (1 + empThroughput * 0.6) * signage) * footWeight
    // Everyday stock the counter can move: NON-featured items out on the SHOP FLOOR only —
    // the storeroom is backstock and sells nothing until you move it out front (the floor
    // contract in constants.js; restockFloor() is the one-tap refill). The featured display
    // case is reserved for the whale/browse encounters, which pay a premium, so the counter
    // never undercuts them; Personal (locked) is never touched. Cheapest FIRST — the
    // counter chews through commons and leaves pricier pieces to linger for the premium
    // encounters. Income is capped at the day's budget either way.
    // 🧢 Supplies attach to the day's footfall first — a few accessory units move per day,
    // more as the shop gets busier (fame via the walk-in rate, staff, weekends via footWeight).
    // Rung up at retail, additive to the counter's card trade (its own recap line).
    const supplyRate = (1 + dayOrderRate('walkin', noto) * 2) * (1 + empThroughput * 0.3) * signage
    sellSupplies(drawCount(supplyRate * footWeight))
    const cur = get()
    const everyday = [
      ...(cur.collection || []).filter(c => onFloor(c) && !c._featured)
        .map(c => ({ kind: 'c', uid: c.uid, v: cardValue(c) })),
      ...(cur.sealedInventory || []).filter(it => onFloor(it) && !it._featured)
        .map(it => ({ kind: 's', uid: it.uid, v: sealedValue(it) })),
    ].sort((a, b) => a.v - b.v)
    // Two tallies: `moved` is the market value of goods carried out (gates against the day's
    // trade BUDGET — how much stuff locals buy); `revenue` is that same stock rung up at the
    // shop's RETAIL markup (sealed carries the fatter margin, singles the plain premium). So the
    // counter now turns a real margin on everyday trade instead of selling at cost.
    let moved = 0, revenue = 0
    for (const x of everyday) {
      if (moved >= budget) break
      moved += x.v
      const markup = x.kind === 's' ? SEALED_SHOP_MARKUP : STORE_SALE_PREMIUM
      revenue += x.v * (1 + markup)
      ;(x.kind === 'c' ? counterSoldC : counterSoldS).add(x.uid)
    }
    counterRevenue = round2(revenue)
    if (counterSoldC.size || counterSoldS.size) {
      set(st => ({
        collection: counterSoldC.size ? st.collection.filter(c => !counterSoldC.has(c.uid)) : st.collection,
        sealedInventory: counterSoldS.size ? (st.sealedInventory || []).filter(it => !counterSoldS.has(it.uid)) : st.sealedInventory,
      }))
    } else if (budget > 0) {
      // Locals came to spend and the floor had nothing everyday out — surface the miss so an
      // unstocked floor never reads as "the counter just stopped working".
      get().log('shop', `🏬 The counter had nothing everyday to sell — stock the floor from the storeroom.`, 0)
    }
    get().addNotoriety(round2(0.3 * days), false, 'shop') // a running local shop builds your name
  }
  // 🎰 PACK MACHINE: locals feed the machine a flat price for a RANDOM sealed pack. A price
  // below the average stocked pack's value pulls a crowd; a steep markup slows sales. Each vend
  // pulls one random pack out and banks the flat price (in-store cash). Hard-railed per day.
  let machineRevenue = 0, machineSold = 0
  {
    const pm = get().packMachine || { price: 0, stock: [] }
    const mstock = pm.stock || []
    if (hasStore && walkinOK && pm.price > 0 && mstock.length) {
      const avgVal = mstock.reduce((a, it) => a + sealedValue(it), 0) / mstock.length
      const dealMult = Math.max(0.35, Math.min(2.2, avgVal / pm.price)) // good deal → more buyers
      const signage = s.upgrades?.signage ? 1.15 : 1
      // Kid channel: summer/back-to-school swells the machine crowd (seasonOf .kids).
      const rate = (0.4 + noto / 350) * dealMult * signage * seasonOf(s.monthsElapsed).kids * hypeDemandMult(hype0)
      const want = Math.min(machineMaxPerDay(s.upgrades) * days, mstock.length, drawCount(rate * footWeight))
      if (want > 0) {
        const stock = [...mstock]
        for (let k = 0; k < want && stock.length; k++) stock.splice(Math.floor(Math.random() * stock.length), 1)
        machineSold = mstock.length - stock.length
        machineRevenue = round2(machineSold * pm.price)
        set(st => ({ packMachine: { ...st.packMachine, stock,
          sold: (st.packMachine.sold || 0) + machineSold,
          revenue: round2((st.packMachine.revenue || 0) + machineRevenue) } }))
        get().addNotoriety(round2(0.1 * days), false, 'shop')
        get().log('shop', `🎰 Pack Machine — vended ${machineSold} pack${machineSold === 1 ? '' : 's'} at $${pm.price.toFixed(2)} each (+$${machineRevenue.toFixed(2)})`, machineRevenue)
      }
    }
  }
  // 🗑️ BULK BIN: the busiest fixture on the floor. This counts DIGGERS — kids who came in to
  // work the quarter box today — and gives each one a HANDFUL, because nobody digs for twenty
  // minutes and buys one card. Turnout rides fame, the deal you're offering, kid season and
  // foot traffic; the daily rail is a sanity check, not the limit. A dug-out card worth
  // several times the price is somebody's best day of the week — the charm is the point.
  //
  // And the flip side, which is the reason the box is worth stocking at all: a digger who
  // finds an EMPTY box is a customer you turned away. That costs you rep, lands on the demand
  // board, and — while they still bother checking back — leaves pent-up demand for the day you
  // finally refill it. Ignore the box long enough (BIN_GIVEUP_DAYS) and the kids stop coming.
  let binRevenue = 0, binSold = 0, binTurnedAway = 0, binAutoFilled = 0
  {
    // ⚙️ "Keep the box full": the morning top-up, before the doors open. Storeroom bulk only
    // (never your display floor), same keep-singles / locked / held protections as the manual
    // toss. Opt-in — with it off, stocking the box stays a thing you decide to do.
    if (hasStore && get().settings?.autoFillBin && (get().bulkBin?.price || 0) > 0) {
      binAutoFilled = get().stockBinBulk({ storeroomOnly: true, quiet: true }).tossed
      if (binAutoFilled > 0) get().log('shop', `🗑️ Topped the quarter box up with ${binAutoFilled} bulk card${binAutoFilled === 1 ? '' : 's'} from the storeroom`, 0)
    }
    const bin = get().bulkBin || { price: 0, stock: [] }
    const bstock = bin.stock || []
    const dryDays = bin.dryDays || 0
    // A $0 price means the box isn't out on the counter — no sales, and nobody's expecting
    // it, so no disappointed kids either. That's the player's clean off-switch.
    const binOut = bin.price > 0
    // Kids only come looking for a quarter box they know you run — a shop that's never put
    // one out isn't missing anything by not having one.
    const binKnown = (bin.sold || 0) > 0
    if (hasStore && walkinOK && binOut && (bstock.length || binKnown)) {
      const avgVal = bstock.length ? bstock.reduce((a, c) => a + cardValue(c), 0) / bstock.length : 0
      const { diggers: diggerRate, handful } = binDemand({
        notoriety: noto, price: bin.price, avgVal, upgrades: s.upgrades,
        monthsElapsed: s.monthsElapsed, dryDays, hasStock: bstock.length > 0,
      })
      const diggers = drawCount(diggerRate * footWeight)
      const rail = binMaxPerDay(s.upgrades) * days
      const stock = [...bstock]
      let treasure = null, shorted = 0
      for (let d0 = 0; d0 < diggers; d0++) {
        // Nothing left to dig through — they came for the box and the box was bare.
        if (!stock.length) { binTurnedAway++; continue }
        const railLeft = rail - (bstock.length - stock.length)
        if (railLeft <= 0) break // the day's rail is spent; the rest come back tomorrow
        const want = Math.max(1, Math.round(handful * (0.55 + Math.random() * 0.9)))
        const take = Math.min(want, stock.length, railLeft)
        // Picked-over box: they'd have bought more if there'd been more to find. (Only when
        // the STOCK ran short — the daily rail is a pacing device, not a thin bin.)
        if (stock.length < want) shorted++
        for (let k = 0; k < take; k++) {
          const [sold] = stock.splice(Math.floor(Math.random() * stock.length), 1)
          const v = cardValue(sold)
          if (v >= Math.max(3, bin.price * 8) && (!treasure || v > treasure.v)) treasure = { name: sold.name, v }
        }
      }
      binSold = bstock.length - stock.length
      binRevenue = round2(binSold * bin.price)
      if (diggers > 0) {
        set(st => ({ bulkBin: { ...st.bulkBin, stock,
          sold: (st.bulkBin.sold || 0) + binSold,
          revenue: round2((st.bulkBin.revenue || 0) + binRevenue),
          missed: (st.bulkBin.missed || 0) + binTurnedAway,
          // The dry streak only breaks on a day nobody left empty-handed.
          dryDays: binTurnedAway > 0 ? dryDays + days : 0 } }))
      }
      if (binSold > 0) {
        const comeback = dryDays > 0 && binTurnedAway === 0
        get().log('shop', `🗑️ Bulk bin — ${comeback ? `word got out the box is full again and kids cleaned out` : `kids dug out`} ${binSold} card${binSold === 1 ? '' : 's'} at $${bin.price.toFixed(2)} each${shorted > 0 ? ` (${shorted} of them wanted more than was left)` : ''} (+$${binRevenue.toFixed(2)})`, binRevenue)
      }
      if (treasure) {
        get().addNotoriety(1, false, 'shop')
        get().log('shop', `🤩 A kid dug a ${treasure.name} (~$${treasure.v.toFixed(2)}) out of the quarter bin — best day of their week (+1★)`, 0)
      }
      if (binTurnedAway > 0) {
        const newDry = dryDays + days
        const kids = `${binTurnedAway} kid${binTurnedAway === 1 ? '' : 's'}`
        // Turning diggers away costs you — capped per day, and it fades on its own as they
        // give up on the box, so a dead bin bleeds your name slowly rather than fatally.
        const ding = round2(Math.min(BIN_MISS_DING_CAP, binTurnedAway * BIN_MISS_NOTORIETY))
        get().addNotoriety(-ding)
        get().log('shop', binSold > 0
          ? `😞 The quarter box got picked clean before closing — ${kids} showed up to a bare bin. (−${ding}★)`
          : `😠 ${kids} came in to dig and the quarter box was EMPTY${newDry > days ? ` — ${newDry} days running` : ''}. Word gets around. (−${ding}★)`, 0)
        // The town is asking for something you're not stocking — same board as a missed
        // walk-in request, so "keep the bin full" shows up where you plan your sourcing. ONE
        // entry per day, not one per kid: a dry fortnight shouldn't crowd every real want off
        // a 40-slot board (the board tallies repeats, so a running streak still reads loud).
        const missDay = absoluteDay(s.currentDay, s.monthsElapsed)
        set(st => ({ demandLog: [
          ...Array.from({ length: days }, () => ({ what: 'bulk for the quarter box', kind: 'bulk', setId: null, day: missDay })),
          ...(st.demandLog || []),
        ].slice(0, 40) }))
        // One-time notice the day they write you off — and the crowd starts shrinking.
        if (dryDays <= BIN_GIVEUP_DAYS && newDry > BIN_GIVEUP_DAYS) {
          get().log('shop', `🚸 The kids have stopped checking your quarter box. Fill it and you'll have to win them back.`, 0)
        }
      }
    }
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
  let soldProceeds = round2(counterRevenue + machineRevenue + suppliesRevenue + binRevenue + coolerRevenue)
  if (counterRevenue > 0) {
    const nCounter = counterSoldC.size + counterSoldS.size
    get().log('shop', `🏬 Counter sales — ${nCounter} everyday item${nCounter === 1 ? '' : 's'} off the floor to locals (singles & bulk) (+$${counterRevenue.toFixed(2)})`, counterRevenue)
  }
  if (coolerRevenue > 0) {
    get().log('shop', `🥤 The snack cooler hummed along (+$${coolerRevenue.toFixed(2)})`, coolerRevenue)
  }
  if (suppliesRevenue > 0) {
    get().log('shop', `🧢 Supplies & accessories — ${suppliesSold} unit${suppliesSold === 1 ? '' : 's'} across the counter (+$${suppliesRevenue.toFixed(2)})`, suppliesRevenue)
  }
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
  // DISTRIBUTOR wholesale income: once you're a Household Name AND a millionaire, the trade
  // orders wholesale FROM you. A passive daily margin scaled by (a) your reputation past the
  // threshold and (b) the sealed stock you keep on hand to fill orders from — no stock, no
  // orders. It doesn't consume inventory (it's your distribution arm's margin, not your shelf).
  let wholesaleIncome = 0
  if (isDistributor(s)) {
    const sealedVal = (s.sealedInventory || []).reduce((a, it) => a + sealedValue(it), 0)
    const repMult = Math.min(3, 1 + Math.max(0, (s.notoriety || 0) - DISTRIBUTOR_NOTO) / DISTRIBUTOR_NOTO)
    const perDay = Math.min(sealedVal * WHOLESALE_DAILY_RATE, WHOLESALE_DAILY_CAP) * repMult
    wholesaleIncome = round2(perDay * days)
    if (wholesaleIncome > 0) {
      soldProceeds = round2(soldProceeds + wholesaleIncome)
      get().log('supply', `📦 Wholesale orders filled for other shops — your distribution margin (+$${wholesaleIncome.toFixed(2)})`, wholesaleIncome)
    }
  }
  // resolve your own-site listings: real CUSTOMERS browse them over the days passed
  // and buy (at ask) or leave an offer based on their savvy vs your price. A listing
  // priced too high just keeps drawing lookers and never sells (eventually flagged stale).
  const streamBoostDays = Math.min(days, s.streamHypeDaysLeft || 0)
  const lt = tickListings(s.listings, days, noto, streamBoostDays, s.upgrades, hype0, masteredIds.length ? new Set(masteredIds) : null)
  const remainingListings = lt.listings
  soldProceeds = round2(soldProceeds + lt.soldProceeds)
  for (const sale of lt.sold) {
    noteSale(sale.name, sale.net)
    if (sale.auto) get().log('sell', `Auto-sold ${sale.name} — $${sale.net.toFixed(2)}`, sale.net)
    else get().log('sell', `Sold ${sale.name} to a ${sale.savvy} — $${sale.net.toFixed(2)}`, sale.net)
  }
  if (lt.newOffers) get().log('listing', `${lt.newOffers} new offer${lt.newOffers > 1 ? 's' : ''} on your listings — review them on Store › 🌐 On the market.`, 0)
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
      const streak = get().packStreak || 0
      const certified = !!s.upgrades.certOdds
      // A published line with a real chase still sealed inside advertises itself hardest.
      const hasChaseIn = (q, tier) => !!tier.published && q.some(p => tier.price && packValue(p) >= tier.price * 2)
      for (const tier of (get().packTiers || [])) {
        const packOpts = { published: !!tier.published, certified, streak }
        if (tier.channels?.online && onlineOK) {
          const q = get().packsForChannel('online').filter(p => p.tierId === tier.id)
          if (q.length && Math.random() < Math.min(0.75, packSaleChance(tier.price, noto, rep, 'online', false, !!s.upgrades.wrapPress, { ...packOpts, hasChase: hasChaseIn(q, tier) }) * hypeDemandMult(hype0))) {
            const r = get().sellBuiltPack(q[0].uid, { channel: 'online' })
            if (r) noteSale(`${tier.name} (repack)`, r.net)
          }
        }
        if (tier.channels?.store && hasStore && walkinOK) {
          const q = get().packsForChannel('store').filter(p => p.tierId === tier.id)
          if (q.length && Math.random() < Math.min(0.75, packSaleChance(tier.price, noto, rep, 'store', buzzDays0 > i, !!s.upgrades.wrapPress, { ...packOpts, hasChase: hasChaseIn(q, tier) }) * hypeDemandMult(hype0))) {
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
          const price = round2((isSealed ? sealedValue(it) : cardValue(it)) * (1 + (isSealed ? SEALED_SHOP_MARKUP : STORE_SALE_PREMIUM) + HOLD_PICKUP_PREMIUM))
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
          (Math.min(0.30, 0.10 + noto / 500) + fameBeyond(noto, 100) * 0.05) * buzzMult * hypeDemandMult(hype0))
        if (walkinOK && Math.random() < consignSellChance) sold = true
        else left--
      }
      if (sold) {
        const cut = round2(c.ask * c.commissionPct)
        soldProceeds = round2(soldProceeds + cut)
        noteSale(`${c.card.name} (consigned)`, cut)
        get().log('shop', `Sold ${c.who}'s consigned ${c.card.name} for $${c.ask.toFixed(2)} — your ${Math.round(c.commissionPct * 100)}% cut: $${cut.toFixed(2)}`, cut)
        get().addNotoriety(1, false, 'sales') // moving locals' cards builds your name as THE shop to sell through
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
  // Sellers and consigners are the same weekend crowd: attic-cleaning happens on a
  // Saturday, so lots walk in heavier on weekends (buyinDayMult, per day of the window).
  const startAbs = absoluteDay(s.currentDay, s.monthsElapsed)
  if (hasStore && noto >= CONSIGN_MIN_NOTO) {
    for (let i = 0; i < days && consignReqsNext.length < consignReqCap(s.upgrades); i++) {
      if (Math.random() < Math.min(0.9, CONSIGN_REQ_CHANCE * oppMult * buyinDayMult(startAbs + i + 1))) {
        const req = makeConsignRequest(noto, { casePlus: !!s.upgrades.consignCase })
        consignReqsNext = [req, ...consignReqsNext]
        get().log('shop', `🧾 ${req.who} came by with a ${req.card.name} — they want YOU to sell it (${Math.round(req.commissionPct * 100)}% commission). Answer on Store › 🛒 Floor.`, 0)
      }
    }
  }
  // 3) COLLECTION BUY-INS: locals walk in wanting to SELL you a lot of cards.
  //    Offers wait a couple of days for an answer, then they try the shop across town.
  let buyinsNext = (s.buyinOffers || [])
    .map(o => ({ ...o, pendingDays: o.pendingDays - days }))
    .filter(o => o.pendingDays > 0)
  if (hasStore && noto >= BUYIN_MIN_NOTO) {
    // The sign on the counter: your posted buylist rate scales how many sellers walk in
    // (BUYLIST_POLICIES.chanceMult) and shifts their asks (applied inside makeBuyinOffer).
    const polMult = (BUYLIST_POLICIES[s.buylistPolicy] || BUYLIST_POLICIES.fair).chanceMult
    const adMult = s.upgrades.buyAd ? 1.4 : 1 // 📻 the radio spot pulls sellers through the door
    for (let i = 0; i < days && buyinsNext.length < buyinCap(s.upgrades, s.rank || 0); i++) {
      if (Math.random() < Math.min(0.9, BUYIN_CHANCE * oppMult * polMult * adMult * buyinDayMult(startAbs + i + 1))) {
        // Some sellers are leaving the hobby: a whole-collection lot with SEALED product in it.
        const estate = Math.random() < BUYIN_ESTATE_CHANCE
        const offer = makeBuyinOffer(noto, { estate, policy: s.buylistPolicy })
        buyinsNext = [offer, ...buyinsNext]
        const who = offer.who.charAt(0).toUpperCase() + offer.who.slice(1)
        const sealedNote = offer.sealedCount ? ` + ${offer.sealedCount} sealed` : ''
        const askNote = offer.free ? 'giving it away FREE' : `asking $${offer.askCash.toFixed(2)}`
        get().log('shop', `🛍️ ${who} came in with ${offer.count} cards${sealedNote} to SELL — ${askNote}. Appraise it on Store › 🛒 Floor.`, 0)
      }
    }
  }

  // age out want-lists, then maybe post new collector wants (scaled by notoriety)
  let wants = s.wantList.map(w => ({ ...w, daysLeft: w.daysLeft - days })).filter(w => w.daysLeft > 0)
  const wantsAfterAging = wants.length
  // 💬 The Discord: a room full of people who watch you and buy cards. More asks, one more
  // live at a time, and most of them name a set you're actually SITTING ON — members ask the
  // dealer they know. The skew changes WHICH set gets asked for, never what the want pays.
  const hasDiscord = !!s.upgrades.discord
  const holdSetIds = hasDiscord
    ? [...new Set((s.collection || []).map(c => setIdOfCard(c)).filter(Boolean))]
    : null
  const maxWants = 2 + Math.floor(noto / 80) + (hasDiscord ? DISCORD_WANT_CAP_BONUS : 0)
  const wantChancePerDay = 0.25 + noto / 300 + (hasDiscord ? DISCORD_WANT_BONUS : 0)
  for (let i = 0; i < days && wants.length < maxWants; i++) {
    if (Math.random() < wantChancePerDay) wants = [makeWant(noto >= 120, holdSetIds), ...wants]
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
  // 🎫 Clean sweep: every weekly goal done before the reset earns a favor (settled below,
  // in the same pass that swaps the goal set out).
  const goalsSwept = goalsExpired && s.dailyGoals.length > 0 && s.dailyGoals.every(g => g.done)
  const periodGoals = goalsExpired ? makeWeeklyGoals(noto, s.rank || 0) : s.dailyGoals
  // Restock the distributors, then let high-rapport ones reserve vintage for you.
  const distributorsNext = applyVintageHolds(restockDistributors(s.distributors, days, newAbsDay), s.distributors, days, newAbsDay, get().log,
    s.upgrades.vintageScout ? 1.6 : 1) // 🕵️ the scout keeps sellers thinking of you
  // --- 📣 Announced-stream no-show: the promised night came and went without going live.
  // (endStream settles the promise when you DO stream; this catches sleeping through it.)
  let promoNext = s.streamPromo || null
  let promoFizzled = false
  if (promoNext && newAbsDay > promoNext.day) { promoFizzled = !promoNext.delivered; promoNext = null }
  // --- ❤️ Subscribers: the channel pays its daily drip; a channel gone dark for over a
  // week starts bleeding members (they subbed for streams, not silence).
  let subsNext = s.subs || 0
  let subIncome = 0
  let subsDark = false
  if (subsNext > 0) {
    subsDark = s.lastStreamDay != null && newAbsDay - s.lastStreamDay > 7
    // 🛡️ A Mod Team keeps the community warm between broadcasts — dark-channel churn halves.
    if (subsDark) subsNext = Math.floor(subsNext * Math.pow(s.upgrades.modTeam ? 0.985 : 0.97, days))
    subIncome = round2(subsNext * SUB_DAILY * days)
    if (subIncome > 0) get().earn(subIncome)
  }
  // --- 🎬 A clip making the rounds keeps recruiting followers for a few days post-stream.
  let clipNext = s.streamClip || null
  let clipGain = 0
  if (clipNext) {
    clipGain = Math.round((clipNext.perDay || 0) * Math.min(days, clipNext.daysLeft || 0))
    clipNext = (clipNext.daysLeft || 0) - days > 0 ? { ...clipNext, daysLeft: clipNext.daysLeft - days } : null
  }
  // --- 📱 SHORT-FORM: the feed drains, the calendar releases, the hunt pays --------------
  // The audience half that doesn't cost a broadcast day. Everything here is bounded by the
  // rails in game/content.js: small per-post drips, a capped feed, and no new demand or price
  // multiplier anywhere — content builds FOLLOWERS, and followers are already capped at a
  // +15% order bump (see followerBump above).
  let postsNext = s.posts || []
  let queueNext = s.postQueue || []
  let postStreakNext = s.postStreak || 0
  let lastPostDayNext = s.lastPostDay ?? null
  let postGain = 0
  let viralPost = null
  {
    // 🔁 The Content Calendar's cadence bonus rides on the streak you came INTO the day with,
    // so today's release can't pay itself a bonus for existing.
    const cadence = cadenceMult(postStreakNext)
    const aged = []
    for (const p of postsNext) {
      const live = Math.min(days, p.daysLeft || 0)
      postGain += (p.perDay || 0) * live * cadence
      const left = (p.daysLeft || 0) - days
      if (left > 0) aged.push({ ...p, daysLeft: left })
    }
    postGain = Math.round(postGain)
    postsNext = aged
    // 🔁 Release from the bank: one banked moment goes out per day passed. They start earning
    // on the NEXT tick — a post published tonight hasn't been up for today.
    if (s.upgrades.contentCalendar) {
      const releases = Math.min(days, queueNext.length)
      for (let i = 0; i < releases; i++) {
        const m = queueNext[0]
        queueNext = queueNext.slice(1)
        const post = makePost(m.kind, m.label, m.value, rollViral())
        postsNext = pushPost(postsNext, post)
        if (post.viral) viralPost = post
      }
      // Cadence: post every day of the window and the streak extends; run the bank dry at any
      // point and it resets to whatever you managed. That's "consistency beats bingeing".
      if (releases >= days) postStreakNext = Math.min(30, postStreakNext + days)
      else postStreakNext = releases                    // a dry day snapped it
      if (releases > 0) lastPostDayNext = newAbsDay
    }
  }

  // --- 🃏 The master set challenge: the hunt is the series -------------------------------
  // Progress is measured ONCE a day here rather than hooked into every path a card can arrive
  // by (booth buy, rip, trade, buy-in, want, lot). One pass, one funnel, and it can't miss.
  let challengeNext = s.challenge || null
  let huntGain = 0, huntEpisodes = 0, huntLanded = 0
  if (challengeNext) {
    const cset = setById(challengeNext.setId)
    if (!cset) challengeNext = null
    else {
      const owned = ownedIdSet([...(s.collection || []), ...(s.binder || [])])
      const comp = setCompletion(cset, owned)
      const before = challengeNext.placed ?? challengeNext.startPlaced ?? 0
      huntLanded = Math.max(0, comp.owned - before)
      if (huntLanded > 0) {
        // Per-card audience for the grind, valued on the set's average card (the individual
        // chase that landed already posted itself through the rip/haul feeders). Capped per
        // day so dumping a 200-card lot in can't mint an audience outright.
        const avg = cset.cards.length
          ? cset.cards.reduce((a, c) => a + (c.price ?? 0), 0) / cset.cards.length : 0
        const scale = challengeScale(challengeNext.startPlaced ?? 0, challengeNext.total || comp.total)
        huntGain = Math.min(40 * days, huntFollowers(avg, scale) * huntLanded)
        // Every few cards is an episode. Posting on every single card would be noise (and the
        // feed cap would eat them), so the series updates in chunks.
        const landedTotal = (challengeNext.landed || 0) + huntLanded
        huntEpisodes = Math.floor(landedTotal / HUNT_EPISODE_EVERY) - Math.floor((challengeNext.landed || 0) / HUNT_EPISODE_EVERY)
        for (let i = 0; i < Math.min(2, huntEpisodes); i++) {
          const fold = postPatch({ ...s, posts: postsNext, postQueue: queueNext },
            'hunt', `${comp.owned}/${comp.total} on the ${cset.name} master set`, avg * HUNT_EPISODE_EVERY)
          if (fold?.posts) postsNext = fold.posts
          if (fold?.postQueue) queueNext = fold.postQueue
        }
        challengeNext = { ...challengeNext, placed: comp.owned, landed: landedTotal,
          episodes: (challengeNext.episodes || 0) + huntEpisodes }
      } else if (comp.owned !== before) {
        // You broke the set up (sold into it). Re-baseline so re-buying pays once, not twice.
        challengeNext = { ...challengeNext, placed: comp.owned }
      }
    }
  }

  // --- 🤝 Creator collabs: their broadcast, your audience --------------------------------
  let collabNext = s.collab || { lastDay: 0, rapport: {} }
  let collabEvent = null
  if (s.upgrades.collabs && (s.followers || 0) >= COLLAB_MIN_FOLLOWERS) {
    let hit = false
    for (let i = 0; i < days && !hit; i++) hit = Math.random() < COLLAB_CHANCE
    if (hit) {
      const who = COLLAB_CREATORS[Math.floor(Math.random() * COLLAB_CREATORS.length)]
      const rapport = collabNext.rapport?.[who] || 0
      const gain = collabGain(noto, s.followers || 0, rapport)
      collabEvent = { who, ...gain }
      collabNext = { lastDay: newAbsDay, rapport: { ...(collabNext.rapport || {}), [who]: rapport + 1 } }
    }
  }

  // --- 🎙️ The podcast: slow, permanent, and it hears things -----------------------------
  // The only content system that pays ⭐ instead of 🔥 — a weekly episode isn't heat, it's
  // everyone in the hobby knowing who you are.
  let podcastDayNext = s.podcastDay || 0
  let podcastEpisode = null
  if (s.upgrades.podcast && newAbsDay - podcastDayNext >= PODCAST_PERIOD) {
    podcastEpisode = { followers: podcastFollowers(noto) }
    podcastDayNext = newAbsDay
  }

  // --- 💰 Brand deals: the audience becomes an income line -------------------------------
  // The only cash faucet in the content batch, and it's fenced three ways: a hard monthly cap
  // (sponsorMonthly), a real obligation you have to spend money to honour (rip their packs),
  // and a follower floor nobody clears by accident.
  let sponsorNext = s.sponsor || null
  let sponsorLapsedNext = s.sponsorLapsedDay || 0
  let sponsorPaid = 0, sponsorEvent = null
  if (s.upgrades.brandDeals) {
    if (!sponsorNext && (s.followers || 0) >= SPONSOR_MIN_FOLLOWERS && newAbsDay - sponsorLapsedNext >= 10
      && Math.random() < Math.min(0.5, 0.12 * days)) {
      const brand = SPONSOR_BRANDS[Math.floor(Math.random() * SPONSOR_BRANDS.length)]
      const pushSet = SHOP_SETS[Math.floor(Math.random() * SHOP_SETS.length)]
      if (pushSet) {
        sponsorNext = {
          brand: brand.name, icon: brand.icon, setId: pushSet.id, setName: pushSet.name,
          monthly: sponsorMonthly(s.followers || 0, s.subs || 0),
          signedDay: newAbsDay, dueDay: newAbsDay + SPONSOR_WINDOW_DAYS,
          packsAt: s.bySet?.[pushSet.id]?.packsOpened || 0, lastPaidDay: newAbsDay, featured: false,
        }
        sponsorEvent = 'signed'
      }
    } else if (sponsorNext) {
      const openedSince = (s.bySet?.[sponsorNext.setId]?.packsOpened || 0) - (sponsorNext.packsAt || 0)
      if (!sponsorNext.featured && openedSince >= SPONSOR_FEATURE_PACKS) {
        sponsorNext = { ...sponsorNext, featured: true }
        sponsorEvent = 'featured'
      } else if (!sponsorNext.featured && newAbsDay > sponsorNext.dueDay) {
        sponsorEvent = 'lapsed'
        sponsorLapsedNext = newAbsDay
      } else if (sponsorNext.featured && newAbsDay - sponsorNext.lastPaidDay >= SPONSOR_PERIOD) {
        // The check clears, and the next month's obligation opens on the same beat.
        sponsorPaid = sponsorNext.monthly
        sponsorNext = {
          ...sponsorNext, lastPaidDay: newAbsDay, featured: false,
          monthly: sponsorMonthly(s.followers || 0, s.subs || 0), // re-priced to today's reach
          packsAt: s.bySet?.[sponsorNext.setId]?.packsOpened || 0,
          dueDay: newAbsDay + SPONSOR_WINDOW_DAYS,
        }
        sponsorEvent = 'paid'
      }
    }
    if (sponsorEvent === 'lapsed') sponsorNext = null
  }

  // --- 📰 Reprint-wave lifecycle: announce → window (deposits) → drop (stock + rush) ----
  let waveNext = s.reprintWave || null
  let rushBuzz = false
  {
    const active = waveNext && waveNext.doneDay == null
    // 🎙️ Podcast intel: the announcement reached your mic before it reached the price boards,
    // so the reprint's market softening was HELD BACK when the wave was announced. It lands
    // now — and the days in between were your window to sell into the old price.
    if (waveNext && waveNext.softenDay != null && newAbsDay >= waveNext.softenDay) {
      const wset = setById(waveNext.setId)
      if (wset) {
        const rr = applyMarketEvent(market.marketMults[wset.id] ?? 1, WAVE_REPRINT_EVENT)
        market.marketMults[wset.id] = rr.mult
        setMarketMults(market.marketMults)
        market.events.push({ setId: wset.id, setName: wset.name, kind: 'crash', pct: rr.pct, line: rr.line.replace('{set}', wset.name) })
      }
      waveNext = { ...waveNext, softenDay: null }
    }
    if (active) {
      // Preorder window: locals put deposits down at your counter (storefront, minded).
      const openDays = Math.max(0, Math.min(days, waveNext.dropDay - (newAbsDay - days)))
      if (hasStore && walkinOK && openDays > 0 && (waveNext.custPreorders || 0) < WAVE_CUST_CAP) {
        const rate = Math.min(1.5, 0.25 + noto / 300)
        const n = Math.min(WAVE_CUST_CAP - (waveNext.custPreorders || 0), drawCount(rate * openDays))
        if (n > 0) {
          const dep = round2(waveNext.depositEach * n)
          get().earn(dep)
          waveNext = { ...waveNext, custPreorders: (waveNext.custPreorders || 0) + n, custDeposit: round2((waveNext.custDeposit || 0) + dep) }
          get().log('shop', `📰 ${n} local${n > 1 ? 's' : ''} put a deposit down for the ${waveNext.label} wave (+$${dep.toFixed(2)}) — don't short them on drop day.`, dep)
        }
      }
      if (newAbsDay >= waveNext.dropDay) {
        // DROP DAY. Prepaid allocation lands in the storeroom; deposit-holders pick up at
        // retail + premium (their rows ship straight out); anyone you can't fill gets a
        // refund, a grudge, and a line on the demand board. Then the launch rush begins.
        const set_ = setById(waveNext.setId)
        const product = set_ && (set_.products || []).find(p => p.type === waveNext.productType)
        if (set_ && product && (waveNext.preordered || waveNext.custPreorders)) {
          const rows = []
          for (let k = 0; k < (waveNext.preordered || 0); k++) rows.push({ ...get().mintSealedRow(set_, product, waveNext.unit), loc: 'storeroom' })
          const pickups = Math.min(waveNext.custPreorders || 0, rows.length)
          let pickupNet = 0
          for (let k = 0; k < pickups; k++) {
            const row = rows.shift() // ships to the preorder customer
            const price = round2(sealedValue(row) * (1 + SEALED_SHOP_MARKUP + WAVE_PICKUP_PREMIUM))
            pickupNet = round2(pickupNet + Math.max(0, round2(price - waveNext.depositEach)))
          }
          if (rows.length) set(st => ({ sealedInventory: [...rows, ...(st.sealedInventory || [])] }))
          if (pickups > 0) {
            get().earn(pickupNet)
            get().addNotoriety(pickups, false, 'sales')
            get().log('sell', `📦 Drop day — ${pickups} preorder pickup${pickups > 1 ? 's' : ''} of the ${waveNext.label} paid their balance (+$${pickupNet.toFixed(2)}, +${pickups}★)`, pickupNet)
            get().bumpGoal('sell', pickups); get().bumpGoal('profit', pickupNet)
          }
          const shorted = (waveNext.custPreorders || 0) - pickups
          if (shorted > 0) {
            const refund = round2(shorted * waveNext.depositEach)
            const pay = Math.min(refund, Math.max(0, round2(get().cash)))
            if (pay > 0) get().spend(pay)
            get().addNotoriety(-shorted)
            get().log('shop', `😤 Drop day — you couldn't fill ${shorted} preorder${shorted > 1 ? 's' : ''} of the ${waveNext.label}; deposits refunded (−$${refund.toFixed(2)}, −${shorted}★)`, -pay)
            set(st => ({ demandLog: [
              ...Array.from({ length: Math.min(shorted, 3) }, () => ({ what: waveNext.label, kind: 'sealed', setId: waveNext.setId, day: newAbsDay })),
              ...(st.demandLog || []),
            ].slice(0, 40) }))
          }
          if (rows.length) get().log('shop', `📰 The ${waveNext.label} wave landed — ${rows.length} in your storeroom, and launch-week hunters are coming through the door.`, 0)
        } else if (set_) {
          get().log('shop', `📰 The ${waveNext.label} wave dropped — you sat it out, but launch hunters will still come asking.`, 0)
        }
        rushBuzz = hasStore
        if (hasStore) get().addHype(10) // 🔥 drop day — launch-week energy hits the whole shop
        waveNext = { ...waveNext, doneDay: newAbsDay }
      }
    } else if (noto >= WAVE_NOTO_GATE && (!waveNext || newAbsDay >= (waveNext.doneDay || 0) + WAVE_COOLDOWN_DAYS)) {
      // Roll an announcement across the days passed. Hot sets (high mult) get reprinted.
      let announced = false
      for (let i = 0; i < days && !announced; i++) announced = Math.random() < WAVE_ANNOUNCE_CHANCE
      if (announced && SHOP_SETS.length) {
        const weights = SHOP_SETS.map(x => Math.max(0.2, (market.marketMults[x.id] ?? 1) - 0.7))
        let tot = 0; for (const w of weights) tot += w
        let r = Math.random() * tot, waveSet = SHOP_SETS[0]
        for (let i = 0; i < SHOP_SETS.length; i++) { r -= weights[i]; if (r <= 0) { waveSet = SHOP_SETS[i]; break } }
        const prods = waveSet.products || []
        const product = prods.find(p => /booster box/i.test(p.type)) || prods.find(p => /elite trainer/i.test(p.type)) || prods[0]
        if (product && product.price > 0) {
          // Your allocation ships via your best-rapport unlocked distributor.
          let best = null
          for (const dv of DISTRIBUTORS) {
            if (dv.japanese) continue // 🎌 the import channel doesn't ship English reprint waves
            if (!distributorUnlocked(dv, noto, s.upgrades, s.rank || 0)) continue
            const level = rapportLevel((s.distributors?.[dv.id]?.spend) || 0).level
            if (!best || level > best.level) best = { dist: dv, level }
          }
          if (best) {
            const unit = round2(distributorPrice(best.dist, product.price, best.level, { product, set: waveSet }) * 0.97)
            const dropDay = newAbsDay + 5 + Math.floor(Math.random() * 4)
            // Reprint news softens the set's market — the other edge of cheap supply. 🎙️ With a
            // podcast you heard it first: the softening is deferred by PODCAST_WAVE_LEAD_DAYS
            // (settled at the top of this block), and those days are your window to sell the
            // set at the old price. Without one, it lands the moment the news does.
            const heardEarly = !!s.upgrades.podcast
            if (!heardEarly) {
              const rr = applyMarketEvent(market.marketMults[waveSet.id] ?? 1, WAVE_REPRINT_EVENT)
              market.marketMults[waveSet.id] = rr.mult
              setMarketMults(market.marketMults)
              market.events.push({ setId: waveSet.id, setName: waveSet.name, kind: 'crash', pct: rr.pct, line: rr.line.replace('{set}', waveSet.name) })
            }
            waveNext = {
              softenDay: heardEarly ? newAbsDay + PODCAST_WAVE_LEAD_DAYS : null,
              setId: waveSet.id, productType: product.type, label: `${product.type} of ${waveSet.name}`,
              announceDay: newAbsDay, dropDay, allocCap: 4 + 3 * best.level, unit,
              distId: best.dist.id, distName: best.dist.name,
              preordered: 0, prepaid: 0, custPreorders: 0, custDeposit: 0,
              depositEach: round2(product.price * WAVE_DEPOSIT_FRAC), doneDay: null,
            }
            get().log('shop', `📰 Reprint wave announced — ${waveNext.label} restocks in ${dropDay - newAbsDay} days. Your allocation: up to ${waveNext.allocCap} at $${unit.toFixed(2)} via ${best.dist.name}. Preorder on the Buy tab.`, 0)
            if (heardEarly) get().log('shop', `🎙️ You had it on the podcast first — the boards haven't moved on ${waveSet.name} yet. About ${PODCAST_WAVE_LEAD_DAYS} days before the reprint news softens the price. Sell now if you're holding.`, 0)
          }
        }
      }
    }
  }
  // --- 🔨 Auctions closing --------------------------------------------------------
  // Live auctions gather watchers as the days pass; the ones whose clock ran out get
  // settled by whoever turned up to bid (see game/auctions.js — the bidder count IS the
  // price). A no-reserve auction always sells; a reserve that isn't met hands the card
  // back, having spent the days for nothing. Both outcomes are the deal you took.
  const auctionsLive = []
  const auctionResults = []
  for (const a of (s.auctions || [])) {
    if ((a.endsOn ?? 0) > newAbsDay) {
      // Still running — the room fills a little each day (pure readout, but it's the
      // readout that tells you whether the hammer is going to hurt).
      auctionsLive.push({ ...a, watchers: (a.watchers || 0) + Math.round(watcherDraw(a.card, noto) * days * 0.35) })
      continue
    }
    auctionResults.push({ a, r: settleAuction(a, noto, streamBoostDays, Math.random, hype0) })
  }
  for (const { a, r } of auctionResults) {
    if (!r.met) {
      // Reserve not met (or nobody bid at all) — the card comes home unsold.
      set(st => ({ collection: [a.card, ...st.collection] }))
      get().log('auction', r.bidders === 0
        ? `🔨 ${a.card.name}'s auction closed with no bids — it's back in your collection. A bigger name draws a bigger room.`
        : `🔨 ${a.card.name} closed at $${r.hammer.toFixed(2)} — under your $${r.reserveAt.toFixed(2)} reserve, so it didn't sell. Card's back with you.`, 0)
      continue
    }
    const fee = round2(r.hammer * ONLINE_FEE_PCT)
    const net = round2(r.hammer - fee - shippingCost(r.hammer, s.upgrades))
    soldProceeds = round2(soldProceeds + net)
    noteSale(a.card.name, net)
    const vs = r.mult >= 1 ? `${Math.round((r.mult - 1) * 100)}% OVER market` : `${Math.round((1 - r.mult) * 100)}% under market`
    get().log('sell', `🔨 ${a.card.name} hammered at $${r.hammer.toFixed(2)} (${r.bidders} bidder${r.bidders === 1 ? '' : 's'}, ${vs}) — net $${net.toFixed(2)}`, net)
    get().bumpGoal('sell', 1); get().bumpGoal('profit', net)
    // A packed room is a reputation event in its own right — people saw that sale.
    if (r.bidders >= 5) get().addNotoriety(1, false, 'sales')
  }

  // --- 🔨 The auction house: lots you were BIDDING on ------------------------------
  // The other side of the hammer. Every lot whose clock ran out settles against the room it
  // drew, you pay one increment over the runner-up if you won, and the board refills. A lot
  // you never bid on simply closes. See game/lots.js for why a quiet lot is usually quiet for
  // a reason, and store/auctionhouse.js for the settlement itself.
  const lotResult = settleAuctionLots(set, get, newAbsDay)

  // --- 📱 The local marketplace churns ---------------------------------------------
  // Somebody else buys the good listings overnight and new ones go up. This is the whole
  // rhythm of the channel: a bargain you scrolled past yesterday is gone today, and the
  // fantasy prices are still there, exactly where you left them.
  const marketTick = tickMarket(set, get, newAbsDay, days)

  // --- 🏪 The shop across town ------------------------------------------------------
  // They open the day you do. Heat is a tug-of-war settled every day: they gain ground for
  // free if you coast, and lose it to the things a shop does to be liked — hosting nights,
  // giving cards away, paying fairly for collections, keeping a floor worth walking into,
  // being someone people have heard of. Hot enough and they start running promotions you
  // can feel in your own footfall.
  let rivalNext = s.rival
  if (hasStore) {
    if (!rivalNext) {
      const name = RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)]
      rivalNext = { name, heat: RIVAL_HEAT_START, promo: null, lots: 0 }
      get().log('shop', `🏪 ${name} across town has noticed you opened. You're in a market now, not a monopoly.`, 0)
    }
    // What you did lately, netted out. Each of these is a lever the player already has.
    let push = RIVAL_HEAT_DRIFT * days                     // their baseline hustle
    if (buzzDays0 > 0) push -= 1.4 * days                  // your buzz (giveaway / hosted event)
    if ((s.buylistPolicy || 'fair') === 'generous') push -= 0.9 * days
    if ((s.buylistPolicy || 'fair') === 'tight') push += 0.5 * days
    push -= Math.min(2.2, noto / 90) * days                // a name of your own holds the line
    if (floorCount(s) >= 12) push -= 0.7 * days            // a floor worth walking into
    else if (floorCount(s) <= 2) push += 1.1 * days        // a bare shop sends people to them
    push += Math.min(1.6, ((s.demandLog || []).length) * 0.12) * days // stuff the town asked you for and didn't get
    const heat = Math.max(0, Math.min(100, round2((rivalNext.heat ?? RIVAL_HEAT_START) + push)))
    // Their promo runs down; a new one can start once they're winning.
    let promo = rivalNext.promo ? { ...rivalNext.promo, daysLeft: (rivalNext.promo.daysLeft || 0) - days } : null
    if (promo && promo.daysLeft <= 0) {
      get().log('shop', `🏪 ${rivalNext.name}'s ${promo.label} has wrapped up. Your footfall should recover.`, 0)
      promo = null
    }
    if (!promo && heat >= RIVAL_PROMO_GATE) {
      let fired = false
      for (let i = 0; i < days && !fired; i++) fired = Math.random() < RIVAL_PROMO_CHANCE
      if (fired) {
        const pick = RIVAL_PROMOS[Math.floor(Math.random() * RIVAL_PROMOS.length)]
        const [lo, hi] = RIVAL_PROMO_DAYS
        promo = { ...pick, daysLeft: lo + Math.floor(Math.random() * (hi - lo + 1)) }
        get().log('shop', `🏪 ${rivalNext.name} is running ${promo.label} — expect ${Math.round(promo.drag * 100)}% fewer walk-ins for ${promo.daysLeft} day${promo.daysLeft > 1 ? '' : ''}s. Give the town a reason to come to you instead.`, 0)
      }
    }
    // Crossing the line in either direction is worth saying out loud.
    if (heat >= RIVAL_PROMO_GATE && (rivalNext.heat ?? 0) < RIVAL_PROMO_GATE) {
      get().log('shop', `🏪 ${rivalNext.name} is pulling ahead of you in town. They'll start running promotions.`, 0)
    } else if (heat < 40 && (rivalNext.heat ?? 0) >= 40) {
      get().log('shop', `🏪 Word is ${rivalNext.name} is quiet lately — the town's coming to you.`, 0)
    }
    rivalNext = { ...rivalNext, heat, promo }
  }

  // --- 🏬 Second location: the branch trades on its own ------------------------------
  // A scaled-down mirror of the main store's day, out of the stock you sent it — and its
  // own lease and payroll either way. It sells its highest-value stock first (a manager
  // moves what moves), and it cannot touch anything you didn't allocate to it.
  let branchNext = s.secondLoc
  let branchRevenue = 0
  let branchOverheadDue = 0
  if (branchNext?.open) {
    const mgr = employeeById(branchNext.managerId) || EMPLOYEES[2]
    const overhead = round2((BRANCH_LEASE_PER_DAY + (mgr?.wage || 0)) * days)
    // Volume mirrors the main store's footfall drivers, at BRANCH_SALE_SHARE of the pace.
    const pace = BRANCH_SALE_SHARE * (1 + noto / 220) * walkinDayMult(newAbsDay) * rivalDrag(rivalNext)
    const slots = drawCount(pace * days * 1.6)
    const cards = [...(branchNext.cards || [])].sort((a, b) => cardValue(b) - cardValue(a))
    const sealed = [...(branchNext.sealed || [])].sort((a, b) => sealedValue(b) - sealedValue(a))
    let sold = 0
    for (let i = 0; i < slots; i++) {
      const wantSealed = sealed.length && (!cards.length || Math.random() < 0.45)
      const item = wantSealed ? sealed.shift() : cards.shift()
      if (!item) break
      const gross = round2((wantSealed ? sealedValue(item) : cardValue(item)) * (1 + BRANCH_PREMIUM))
      branchRevenue = round2(branchRevenue + gross)
      sold++
    }
    if (branchRevenue > 0) {
      // Banked with everything else the day sold (soldProceeds is paid out once, below) —
      // earning it here as well would pay you twice for the same stock.
      soldProceeds = round2(soldProceeds + branchRevenue)
      get().log('sell', `🏬 The second location moved ${sold} item${sold === 1 ? '' : 's'} — +$${branchRevenue.toFixed(2)}`, branchRevenue)
      get().bumpGoal('sell', sold); get().bumpGoal('profit', branchRevenue)
    }
    if (!cards.length && !sealed.length && branchRevenue === 0) {
      get().log('store', `🏬 The second location sat empty all day and still cost you its lease. Send it stock or recall the keys.`, 0)
    }
    // Its overhead settles alongside the main store's, AFTER the day's takings land — a
    // branch that earned its keep today should be able to pay for itself out of that.
    branchOverheadDue = overhead
    branchNext = { ...branchNext, cards, sealed,
      revenue: round2((branchNext.revenue || 0) + branchRevenue), sold: (branchNext.sold || 0) + sold }
  }

  // --- 📇 Special orders: the promises in the book ---------------------------------
  // Three things can happen to a promise. You SOURCE it (a distributor has it and the till
  // covers the wholesale — it lands in your storeroom earmarked, and the customer's balance
  // is the fat part of the sale). They COLLECT it on the due date. Or the date passes with
  // nothing to hand over, and you refund the deposit, take the rep hit, and it goes on the
  // demand board — the shop that can't get things in is the shop people stop asking.
  let specialOrdersNext = (s.specialOrders || [])
  if (specialOrdersNext.length) {
    const kept = []
    for (const so of specialOrdersNext) {
      let order = so
      // SOURCE: buy it in, once, from the cheapest unlocked distributor that stocks it.
      if (!order.sourced) {
        const set_ = setById(order.setId)
        const product = set_ && (set_.products || []).find(p => p.type === order.productType)
        let bought = null
        if (set_ && product) {
          // Ring around the distributors who actually CARRY this line, cheapest first.
          //
          // Two fixes in this list. It now obeys the same shelf the buy screen does
          // (game/shelf.js), so the book cannot conjure a line no distributor stocks — and a
          // Pokémon Center exclusive correctly sources from the marketplace, at marketplace
          // money, because that is the only channel that has one. And it is now genuinely
          // CHEAPEST-first, which is what the upgrade has always claimed; it used to take the
          // first unlocked distributor in array order.
          // Same week index the Buy tab shops with (the Purchasing Agent below derives its
          // own copy the same way) — a shelf is a function of the week, so the book has to ask
          // about the week it is actually ringing around in.
          const soWeek = Math.floor(newAbsDay / 7)
          const candidates = DISTRIBUTORS
            .filter(dv => distributorUnlocked(dv, noto, s.upgrades, s.rank || 0))
            .filter(dv => shelfCarries(dv, product, set_, soWeek))
            .map(dv => ({ dv, level: rapportLevel((get().distributors?.[dv.id]?.spend) || 0).level }))
            .map(x => ({ ...x, unit: round2(distributorPrice(x.dv, product.price, x.level, { product, set: set_ })) }))
            .sort((a, b) => a.unit - b.unit)
          for (const { dv, unit } of candidates) {
            // Never spend the shop into arrears chasing one special order.
            if (get().cash < unit + STORE_LEASE_PER_DAY) continue
            if (!get().spend(unit)) continue
            const row = { ...get().mintSealedRow(set_, product, unit), loc: 'storeroom', _specialOrder: order.id }
            // Into the SNAPSHOT the end-of-tick write publishes — a bare set() here would be
            // overwritten by that write (it restores sealedInvNext as computed earlier).
            sealedInvNext = [row, ...sealedInvNext]
            bought = { uid: row.uid, unit, dist: dv.name }
            break
          }
        }
        if (bought) {
          order = { ...order, sourced: true, uid: bought.uid, cost: bought.unit }
          get().log('buy', `📇 Special order sourced — ${order.what} in from ${bought.dist} ($${bought.unit.toFixed(2)}). Held for pickup.`, -bought.unit)
        }
      }
      // COLLECT: on (or after) the due day, if the earmarked item is still in stock.
      if (order.sourced && newAbsDay >= order.dueDay) {
        const held = sealedInvNext.find(it => it.uid === order.uid)
        if (held) {
          const balance = Math.max(0, round2(order.price - order.deposit))
          sealedInvNext = sealedInvNext.filter(it => it.uid !== order.uid)
          get().addNotoriety(2, false, 'sales')
          soldProceeds = round2(soldProceeds + balance)   // banked with the rest of the day's sales
          noteSale(order.what, balance)
          get().log('sell', `📇 Special order collected — ${order.what}, balance $${balance.toFixed(2)} paid (+2★). That's what the book is for.`, balance)
          get().bumpGoal('sell', 1); get().bumpGoal('profit', balance)
          continue // fulfilled — off the book
        }
        // Sourced but the item is gone (sold out from under the promise). Falls through to
        // the miss below — which is right: the customer doesn't care why.
        order = { ...order, sourced: false, uid: null }
      }
      // MISS: past the promise plus a grace period with nothing to hand over.
      if (newAbsDay > order.dueDay + SPECIAL_ORDER_GRACE) {
        const refund = Math.min(order.deposit, Math.max(0, round2(get().cash)))
        if (refund > 0) get().spend(refund)
        get().addNotoriety(-3)
        get().log('shop', `📇 You couldn't get the ${order.what} in — deposit refunded (−$${refund.toFixed(2)}, −3★). They'll ask somewhere else next time.`, -refund)
        set(st => ({ demandLog: [{ what: order.what, kind: 'sealed', setId: order.setId, day: newAbsDay }, ...(st.demandLog || [])].slice(0, 40) }))
        continue
      }
      kept.push(order)
    }
    specialOrdersNext = kept
  }

  // --- Pre-show leads: people DM you BEFORE a show, giving that trip a reason -----
  // Expire leads whose show has passed unattended (attending claims them at entry),
  // then maybe generate fresh ones for unlocked shows 1–4 days out: a recurring
  // vendor you have rapport with sets aside vintage at a held price, or a collector
  // arranges to meet you there to buy a specific card at an appointment premium.
  const LEAD_WINDOW = 4, LEAD_CAP = 4
  // 💳 Will-call first: a pre-show PURCHASE (paid over DM — see prepayFromVendor) whose
  // show day has passed ships home to the storeroom, attended or not. Money already spent
  // can never be stranded. Everything else just expires when its show passes unattended.
  {
    const shipped = (s.showLeads || []).filter(l => l.kind === 'purchase' && l.paid && (l.absDay ?? 0) < newAbsDay)
    const mailRows = []
    for (const l of shipped) {
      const set_ = setById(l.setId)
      if (!set_ || !l.product) continue
      const row = get().mintSealedRow(set_, l.product, l.price || 0, 'vendor')
      if (row) mailRows.push({ ...row, loc: 'storeroom' }) // mintSealedRow stamps vintage off the set itself
      get().log('lead', `📦 ${l.vendorName} mailed home the ${l.productType} of ${l.setName} you paid for — it's in the storeroom.`, 0)
    }
    if (mailRows.length) {
      sealedInvNext = [...mailRows, ...sealedInvNext]
      set(st => ({ sealedInventory: [...mailRows, ...(st.sealedInventory || [])] }))
    }
  }
  let leadsNext = (s.showLeads || []).filter(l => (l.absDay ?? 0) >= newAbsDay)
  const newLeads = []
  {
    const calendar = generateCalendar(noto, seed, s.rank || 0)
    const rapportVendors = (s.showVendors || []).filter(v => vendorRapport(s.vendorSpend?.[v.id] || 0).level >= 1)
    for (const showX of calendar) {
      if (leadsNext.length >= LEAD_CAP) break
      if ((s.rank || 0) < (SHOW_TIERS[showX.tierKey]?.minRank ?? 0)) continue // can't attend → no DM
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
  // Regulars pass: cool relationships, escalate a neglected lane, and roll a call-in. Computed
  // here (before the write) off the POST-tick stock so "do you carry their lane" is current.
  const regStoreStock = hasStore ? collectionNext.filter(c => !c.locked && !c._heldFor) : []
  // Read the LIVE roster — hold pickups/concierge earlier this tick may have bumped trust via
  // get(); basing the pass on the stale top-of-tick snapshot would clobber those.
  const regsLive = get().regulars
  const servedIds = servedRegularIds(regsLive, remainingListings, regStoreStock, hasStore)
  const regTick = tickRegulars(regsLive, days, s.upgrades.newsletter ? 0.5 : 1, servedIds, newAbsDay)
  set(st => ({
    currentDay: d, showSeed: seed, monthsElapsed: months,
    marketMults: market.marketMults, marketHistory: market.marketHistory,
    onlineOrdersEver: (st.onlineOrdersEver || 0) + onlineCount,
    // Cap grows with fame — otherwise a famous vendor's extra orders would be generated and
    // then silently thrown away by a fixed 8-slot cap, and the whole traffic buff would be
    // invisible. (INBOX_CAP is still the floor, via inboxCap().)
    // Every new order gets a stable id so clear/authenticate address it by identity, not by a
    // fragile array index (a resolve/prune reshuffles the array — see nextInboxId's note).
    boothInbox: [...newOrders.reverse().map(o => ({ ...o, id: o.id ?? nextInboxId() })), ...st.boothInbox].slice(0, inboxCap(st.notoriety, st.rank || 0)),
    consignments: remainingConsign,
    supplyChannel: remainingSupply,
    distributors: distributorsNext, // wholesalers refill their shelves + high-rapport holds
    listings: remainingListings,
    auctions: auctionsLive,                 // 🔨 still running; the closed ones paid out (or came home) above
    specialOrders: specialOrdersNext,       // 📇 promises still open (sourced or not); filled/failed ones are off the book
    rival: rivalNext,                       // 🏪 the shop across town: heat re-settled, promo run down/started
    ...(branchNext !== s.secondLoc ? { secondLoc: branchNext } : {}), // 🏬 branch traded (or closed) this window
    wantList: wants,
    showLeads: leadsNext,
    // Holds picked up / lapsed on the one store inventory. Only written with a store —
    // nothing else in this window mutates these buckets, so the snapshot-derived arrays
    // are safe to write back; without a store they're left untouched.
    ...(hasStore ? { collection: collectionNext, sealedInventory: sealedInvNext } : {}),
    storeConsignments: storeConsignsNext,   // consigned sales banked, expiries returned
    storeConsignRequests: consignReqsNext,  // fresh asks in, stale asks gone
    buyinOffers: buyinsNext,                // sellers waiting on an answer (fresh in, stale gone)
    demandLog: (st.demandLog || []).filter(e => newAbsDay - (e.day || 0) <= 14), // the board tracks a fortnight
    supplies: suppliesNext,                 // 🧢 accessory units sold off the rack this window
    suppliesStats: { sold: (st.suppliesStats?.sold || 0) + suppliesSold,
      revenue: round2((st.suppliesStats?.revenue || 0) + suppliesRevenue) },

    storeCredit: storeCreditNext,           // credit spent at the counter + breakage
    storeEventPlanned: null,                // tonight happened (or couldn't) — either way it's spent
    eventCooldownLeft: eventCooldown,
    // Buzz (giveaway/event) ages out — unless a reprint wave just dropped, which opens
    // its own launch-week window.
    giveawayDaysLeft: Math.max(Math.max(0, buzzDays0 - days), rushBuzz ? WAVE_RUSH_DAYS : 0),
    reprintWave: waveNext,                  // 📰 announced / deposits taken / dropped+cooling
    forumPosts,
    dailyGoals: periodGoals,                       // weekly set; refreshed every 7 days
    goalsDay: goalsExpired ? newAbsDay : (s.goalsDay || newAbsDay),
    job: activeJob,        // a pending job may have started during these days
    pendingJob,
    streamHypeDaysLeft: Math.max(0, (st.streamHypeDaysLeft || 0) - days), // stream afterglow ages out
    streamPromo: promoNext,                 // 📣 an announced stream survives the day unless its night passed
    subs: subsNext + (collabEvent?.subs || 0), // ❤️ paying members (bled down if the channel's gone dark)
    streamClip: clipNext,                   // 🎬 the circulating clip ages out
    // Every audience source lands in ONE place: the clip, the short-form feed, the hunt, the
    // guest spot, the podcast. Followers are capped in their effect (followerBump), not here.
    followers: Math.max(0, (st.followers || 0) + clipGain + postGain + huntGain
      + (collabEvent?.followers || 0) + (podcastEpisode?.followers || 0)),
    posts: postsNext,                       // 📱 the feed: circulating shorts, aged down
    postQueue: queueNext,                   // 🔁 the calendar's bank of unreleased moments
    postStreak: postStreakNext,
    lastPostDay: lastPostDayNext,
    challenge: challengeNext,               // 🃏 the announced chase (re-baselined each day)
    collab: collabNext,                     // 🤝 guest-spot history + per-creator rapport
    podcastDay: podcastDayNext,             // 🎙️ when the last episode went out
    sponsor: sponsorNext,                   // 💰 the live brand deal (or null if none/lapsed)
    sponsorLapsedDay: sponsorLapsedNext,
    streamFatigue: Math.max(0, (st.streamFatigue || 0) - days),           // audience freshness recovers with rest
    regulars: regTick.regulars, // cooled + neglect-penalized + call-ins rolled (see tickRegulars)
    quickSellsToday: 0,                                                    // fresh day → the dump penalty resets
    giveawaysToday: 0,                                                     // fresh day → giveaway rep is full value again
    // The day you first crossed into being a distributor (Household Name + millionaire). Stamped
    // once and kept — gates the passive wholesale income and the one-time unlock notice below.
    distributorSince: (isDistributor(s) && !s.distributorSince) ? newAbsDay : (s.distributorSince ?? null),
  }))
  if (promoFizzled) {
    get().addNotoriety(-2, false, 'stream')
    get().log('stream', `📣 You never went live for the stream you announced — the room you hyped up moved on. (-2★)`, 0)
  }
  if (goalsSwept) {
    set(st => ({ clout: (st.clout || 0) + 1 }))
    get().log('goal', '🎯 Clean sweep — every weekly goal done before the reset. People notice. (+1 🎫 clout)', 0)
  }
  // --- 🖼️ The showcase lives: completed pages on display pull people in ------------------
  if (showcaseN > 0 && hasStore) {
    // Pilgrims: some days a couple of locals come in just to page through the famous binder.
    // A small hype pop, not money — the money is the extra walk-ins the showcase already drew.
    if (Math.random() < Math.min(0.18, (0.06 + 0.03 * showcaseN) * days)) {
      const showSet = setById(showcaseIds[Math.floor(Math.random() * showcaseIds.length)])
      get().addHype(4)
      get().log('shop', `🖼️ A couple of locals came in just to page through the completed ${showSet?.name || 'master set'} binder — word travels. (+🔥)`, 0)
    }
  }
  // A pending master-lot offer ages out if ignored — collectors don't wait forever.
  if (s.binderOffer && newAbsDay >= s.binderOffer.expiresDay) {
    get().log('shop', `🖼️ ${s.binderOffer.who} stopped waiting on the ${s.binderOffer.setName} master set — the $${s.binderOffer.price.toFixed(2)} offer is off the table.`, 0)
    set({ binderOffer: null })
  } else if (!s.binderOffer && showcaseN > 0 && newAbsDay - (s.binderOfferLastDay || 0) >= 10
    && Math.random() < Math.min(0.15, 0.03 * showcaseN * days)) {
    // 🖼️ A collector wants the INTACT page — the "complete master set sells for more than its
    // parts" premium (LOT_PREMIUM band, sim-pinned). Selling keeps the badge/deeds/knowledge
    // perks (completedSets never reverts); only the showcase draw leaves with the cards.
    const offerSet = setById(showcaseIds[Math.floor(Math.random() * showcaseIds.length)])
    const lot = offerSet ? pickMasterLot(get(), offerSet) : null
    if (lot) {
      const mult = LOT_PREMIUM_LO + Math.random() * (LOT_PREMIUM_HI - LOT_PREMIUM_LO)
      const who = ['a museum-piece collector', 'an investor who wants it framed', 'a completionist flush from a bonus', 'a collector who chased this set for years'][Math.floor(Math.random() * 4)]
      const offer = { setId: offerSet.id, setName: offerSet.name, who,
        price: round2(lot.value * mult), mult: Math.round(mult * 100) / 100,
        count: lot.copies.length, expiresDay: newAbsDay + 6 }
      set({ binderOffer: offer, binderOfferLastDay: newAbsDay })
      get().log('shop', `🖼️ Word of your completed ${offerSet.name} master set reached ${who} — offering $${offer.price.toFixed(2)} (${Math.round(offer.mult * 100)}% of book) for the intact page. ~6 days to decide (Cards → Binder).`, 0)
    }
  }
  if (subIncome > 0) get().log('stream', `❤️ ${subsNext} subscriber${subsNext === 1 ? '' : 's'} — +$${subIncome.toFixed(2)} sub income${subsDark ? ' (channel dark over a week — subs are drifting off)' : ''}`, subIncome)
  if (clipGain > 0) get().log('stream', `🎬 Your ${s.streamClip.label} clip is making the rounds — +${clipGain} followers`, 0)
  // --- 📱 What the content systems did overnight ----------------------------------------
  if (postGain > 0) {
    const n = (s.posts || []).length
    get().log('stream', `📱 ${n} post${n === 1 ? '' : 's'} circulating — +${postGain} followers${postStreakNext >= 3 ? ` (🔁 ${postStreakNext}-day posting streak, ×${cadenceMult(postStreakNext).toFixed(2)} reach)` : ''}`, 0)
  }
  if (viralPost) get().log('stream', `🚀 "${viralPost.label}" POPPED — the algorithm picked it up and it's everywhere (≈${viralPost.perDay}/day followers for ${viralPost.daysLeft} days)`, 0)
  if (huntGain > 0) {
    get().log('stream', `🃏 ${huntLanded} more card${huntLanded === 1 ? '' : 's'} toward the ${challengeNext?.setName} master set on camera — +${huntGain} followers${huntEpisodes > 0 ? `, and the series got a new episode` : ''}`, 0)
  }
  if (collabEvent) {
    get().addHype(collabEvent.hype)
    get().log('stream', `🤝 You guested on ${collabEvent.who}'s stream — their room met you: +${collabEvent.followers} followers${collabEvent.subs ? `, +${collabEvent.subs} ❤️ subs` : ''}, +🔥`, 0)
  }
  if (podcastEpisode) {
    get().addNotoriety(PODCAST_REP, false, 'content')
    get().log('stream', `🎙️ Another episode is up — the hobby knows your name a little better. +${PODCAST_REP}★, +${podcastEpisode.followers} followers`, 0)
  }
  if (sponsorEvent === 'signed' && sponsorNext) {
    get().log('stream', `💰 ${sponsorNext.icon} ${sponsorNext.brand} wants to sponsor the channel — $${sponsorNext.monthly.toFixed(2)}/month. Their ask: feature ${sponsorNext.setName} by ripping ${SPONSOR_FEATURE_PACKS} packs of it on camera within ${SPONSOR_WINDOW_DAYS} days.`, 0)
  } else if (sponsorEvent === 'featured' && sponsorNext) {
    get().addHype(4)
    get().log('stream', `💰 ${sponsorNext.icon} ${sponsorNext.brand} got their feature — ${sponsorNext.setName} ripped on camera. The check clears on the monthly beat.`, 0)
  } else if (sponsorEvent === 'paid' && sponsorNext) {
    get().earn(sponsorPaid)
    get().log('stream', `💰 ${sponsorNext.icon} ${sponsorNext.brand} paid the monthly — +$${sponsorPaid.toFixed(2)}. Next feature window is open: ${SPONSOR_FEATURE_PACKS} packs of ${sponsorNext.setName} within ${SPONSOR_WINDOW_DAYS} days.`, sponsorPaid)
  } else if (sponsorEvent === 'lapsed') {
    get().addNotoriety(-SPONSOR_LAPSE_DING, false, 'dings')
    get().log('stream', `💰 You never gave ${s.sponsor?.brand || 'your sponsor'} their feature — the deal lapsed, and people noticed you took the deal and ghosted. (−${SPONSOR_LAPSE_DING}★)`, 0)
  }
  // 💬 A member of the community stops being an audience member and becomes a customer.
  if (s.upgrades.discord && holdSetIds?.length && Math.random() < discordRegularChance(s.followers || 0, days)) {
    get().formRegular({ setId: holdSetIds[Math.floor(Math.random() * holdSetIds.length)], channel: 'online', generous: false })
  }
  // One-time fanfare the first day you become a distributor yourself.
  if (isDistributor(s) && !s.distributorSince) {
    get().log('milestone', `🏆 You're a distributor now — a Household Name AND a millionaire. Other shops will start ordering wholesale from you.`, 0)
  }
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
  // 🏬 The branch pays its own way or it doesn't — settled after the day's takings so a
  // branch that traded well can cover itself, and closed by its manager if it can't.
  if (branchOverheadDue > 0) settleBranch(set, get, branchOverheadDue, days)
  // Distributor credit: at each month rollover crossed in this window, accrue interest on the
  // carried balance and auto-pay the monthly minimum from cash (short pay → freeze + rep ding).
  const monthsRolled = months - s.monthsElapsed
  if (monthsRolled > 0 && (s.credit?.balance || 0) > 0) settleCredit(set, get, monthsRolled)
  // 🏦 The bank note. The instalment comes out every day whether or not the shop had a good
  // one — that is what makes borrowing a commitment rather than free capital. Settled AFTER
  // the day's takings are in, so a shop that traded well pays without noticing.
  const loanResult = settleLoan(set, get, days)
  // 🧾 The books. Interest first on anything already outstanding, then close the quarter if
  // this window crossed its end. Ordering matters: closing first would immediately charge a
  // day of arrears on a bill the player has not yet had a chance to see, let alone pay.
  settleTaxArrears(set, get, days)
  const quarter = settleQuarter(set, get, newAbsDay)
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
  // (addAllToBinder returns { moved, reserved } — reserved is slots left open because the only
  // copy you own is held back by your binder reserve: too sharp a cut, or too valuable, to bury
  // in a slot. The recap surfaces it so an empty slot never looks like a bug.)
  const binderSweep = s.upgrades.autoBinder ? get().addAllToBinder(null, { skipGraded: true, skipLocked: true }) : { moved: 0, reserved: 0 }
  const binderFiled = binderSweep.moved
  const binderReserved = binderSweep.reserved
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
  // 🧾 Submission Runner: overnight, up to 2 raw cards/day whose 🔭 Scope prediction is
  // CLEARLY +EV go to Economy grading (fee from the till). Uses the SAME gradePrediction
  // the player sees — no secret odds knowledge — and demands the predicted return clear the
  // fee plus a fat margin over just holding the raw card, so it never grinds marginal subs.
  // Never touches 🔒 kept, held, floor, binder (own bucket), or listed (own bucket) cards.
  // Pausable in ⚙️ Settings (settings.submissionRunner).
  if (s.upgrades.submissionRunner && (get().settings?.submissionRunner ?? true)) {
    const luck = s.upgrades.loupe ? 0.08 : 0
    const maxSubs = Math.min(6, 2 * days)
    let runnerSent = 0
    const cands = (get().collection || [])
      .filter(c => !c.grade && !c.locked && !c._heldFor && !c._featured && c.loc !== 'floor' && cardValue(c) >= 10)
      .sort((a, b) => cardValue(b) - cardValue(a))
      .slice(0, 15) // evaluate the most valuable raws only — prediction is Monte-Carlo
    for (const c of cands) {
      if (runnerSent >= maxSubs) break
      const fee = gradingFee('economy', get().gradesSubmitted)
      if (get().cash < fee) break
      const raw = cardValue(c)
      const p = gradePrediction(c, luck, 240)
      const tailG = Math.max(1, Math.min(8, p.likely))
      const ev = p.gemChance * psaValueAt(c, 10)
        + (p.highChance - p.gemChance) * psaValueAt(c, 9)
        + (1 - p.highChance) * psaValueAt(c, tailG)
      if (ev - fee > raw * 1.35) { get().submitGrade(c.uid, 'economy'); runnerSent++ }
    }
    if (runnerSent > 0) get().log('grade-submit', `🧾 Submission Runner prepped ${runnerSent} clearly-+EV card${runnerSent > 1 ? 's' : ''} for Economy grading overnight`, 0)
  }
  // 🚢 In-transit orders (any distributor with leadDays — Japan Direct across the Pacific,
  // Amazon out of a warehouse) LAND today if their arrival day has come: the rows move from
  // `imports` into the storeroom, ready to rip, shelve or list like any sealed. Anything
  // still in transit stays put.
  {
    const landed = [], atSea = []
    for (const sh of (s.imports || [])) ((sh.arrivesDay ?? 0) <= newAbsDay ? landed : atSea).push(sh)
    if (landed.length) {
      set(st => ({
        imports: atSea,
        sealedInventory: [...landed.flatMap(sh => sh.rows || []), ...(st.sealedInventory || [])],
      }))
      for (const sh of landed) {
        const nm = setById(sh.setId)?.name || 'that set'
        const tag = distributorById(sh.distId)?.japanese ? '🎌 Import shipment landed' : '📦 Delivery arrived'
        get().log('buy', `${tag} — ${sh.qty}× ${sh.type} (${nm}) is in your storeroom`, 0)
      }
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
      // setProducts, not pokeSet.products — synthesized lineups (🎌 JP sets) have no stored list.
      const product = pokeSet ? setProducts(pokeSet).find(p => p.type === so.type) : null
      if (dist && pokeSet && product) {
        const level = rapportLevel((get().distributors[so.distId]?.spend) || 0).level
        const price = distributorPrice(dist, product.price, level, { product, set: pokeSet })
        const r = get().buyFromDistributorBulk(so.distId, pokeSet, product, price, so.qty)
        if (r) {
          set({ standingOrder: { ...so, lastDay: newAbsDay } })
          get().log('buy', `📋 Standing order delivered — ${r.bought}× ${product.type} (${pokeSet.name})`, 0)
        }
      }
    }
  }
  // 🧮 Purchasing Agent: min/max reordering. For every product TYPE with a reorder point,
  // every buyable set (the shop list, plus the 🎌 import shelf once licensed — its catalog
  // comes from the same distributor loop) gets topped back up to the minimum overnight.
  // "Have" counts stock anywhere it's still yours: sealed on hand (floor/storeroom/personal),
  // out at a show, and on the water — so an import order in transit never double-buys.
  // Buys cheapest-first at rapport pricing through the REAL buy path (stock clamps, rapport,
  // LGS credit, 🚢 lead times all apply), CASH only (never the credit line), and always
  // leaves a float in the till: $500 plus ~2 days of rent/lease/payroll.
  if (s.upgrades.purchasingAgent && Object.values(get().reorderPoints || {}).some(v => v > 0)) {
    const points = get().reorderPoints
    const week = Math.floor(newAbsDay / 7) // same week index the Buy tab shops with
    const have = new Map()
    const addHave = (setId, type, n = 1) => { if (!setId || !type) return; const k = `${setId}|${type}`; have.set(k, (have.get(k) || 0) + n) }
    for (const it of (get().sealedInventory || [])) addHave(it.setId, it.product?.type)
    for (const it of (get().showSealed || [])) addHave(it.setId, it.product?.type)
    for (const sh of (get().imports || [])) addHave(sh.setId, sh.type, (sh.rows || []).length)
    // Who sells which set right now (rotating LGS shelf, PC exclusives, the JP catalog)?
    const sellers = new Map() // setId -> [{ dv, level, set }]
    for (const dv of DISTRIBUTORS) {
      if (!distributorUnlocked(dv, noto, s.upgrades)) continue
      const level = rapportLevel((get().distributors[dv.id]?.spend) || 0).level
      for (const st of distributorCatalog(dv, SHOP_SETS, week)) {
        if (!sellers.has(st.id)) sellers.set(st.id, [])
        sellers.get(st.id).push({ dv, level, set: st })
      }
    }
    const reserve = 500 + 2 * (rentPerDay(s.monthsElapsed)
      + (hasStore ? STORE_LEASE_PER_DAY + empList.reduce((a, e) => a + e.wage, 0) : 0))
    let agentBought = 0, agentSpent = 0, tillDry = false
    for (const [setId, offers] of sellers) {
      if (tillDry) break
      const st = offers[0].set
      for (const p of setProducts(st)) {
        const min = points[p.type] || 0
        let need = min - (have.get(`${setId}|${p.type}`) || 0)
        if (need <= 0) continue
        // cheapest in-stock seller first; fall through to the next if a buy comes up short
        // 🛒 A seller only counts if this product is actually ON THAT SHELF. Without this the
        // agent could order a mini tin from a wholesaler that does not carry tins, or a
        // Pokémon Center exclusive from the corner shop — the buy screen filters by retailer
        // (game/shelf.js) and the overnight buyer has to obey the same shelf.
        const opts = offers
          .filter(x => shelfCarries(x.dv, p, st, week))
          .map(x => ({ ...x, price: distributorPrice(x.dv, p.price, x.level, { product: p, set: st }),
            avail: !stockState(x.dv, (get().distributors[x.dv.id]?.stock) || {}, st, p, x.level).out }))
          .filter(x => x.avail && x.price > 0)
          .sort((a, b) => a.price - b.price)
        for (const o of opts) {
          if (need <= 0) break
          const spendable = get().cash - reserve
          if (spendable < o.price) { tillDry = true; break }
          const q = Math.min(need, Math.floor(spendable / o.price))
          const r = get().buyFromDistributorBulk(o.dv.id, st, p, o.price, q)
          if (r) { need -= r.bought; agentBought += r.bought; agentSpent = round2(agentSpent + r.spent) }
        }
        if (tillDry) break
      }
    }
    if (agentBought > 0) get().log('buy', `🧮 Purchasing Agent topped stock up to your reorder points — ${agentBought} unit${agentBought > 1 ? 's' : ''}, $${agentSpent.toFixed(2)}${tillDry ? ' (stopped at the till float — more to buy tomorrow)' : ''}`, 0)
    else if (tillDry) get().log('buy', `🧮 Purchasing Agent held off — restocking to your reorder points would dip below the till float.`, 0)
  }
  // 🎰 High-Capacity Vend Unit + 🪓 Bin Keeper: the keeper also feeds the machine overnight —
  // storeroom loose packs (never vintage, never 🔒 kept or held) top the hopper back up to a
  // couple of days' vending. Runs BEFORE the keeper's floor-bin refill so the machine (a
  // deliberately priced service) gets first draw on backstock; whatever's left fills the bin.
  // No breaking product for the machine; it eats loose backstock only.
  if (s.upgrades.binKeeper && s.upgrades.vendUnit && s.upgrades.storefront) {
    const pm = get().packMachine || { price: 0, stock: [] }
    const target = machineMaxPerDay(s.upgrades) * 2
    if (pm.price > 0 && (pm.stock || []).length < target) {
      const uids = (get().sealedInventory || [])
        .filter(it => (it.product?.packs || 1) === 1 && !it.vintage && !it.locked && !it._heldFor && it.loc !== 'floor')
        .slice(0, target - (pm.stock || []).length)
        .map(it => it.uid)
      if (uids.length) get().stockMachine(uids) // logs its own 🎰 line
    }
  }
  // 🎪 Events Coordinator: the standing weekly night books itself. Runs AFTER the mid-tick
  // state write (eventCooldownLeft is current), so planStoreEvent's own checks — storefront,
  // cooldown, notoriety, cash — are the single source of truth. A blocked week (broke,
  // cooling down) just retries next tick; lastDay only advances on a successful booking.
  if (s.upgrades.eventsCoordinator && get().weeklyEvent && get().upgrades.storefront && !get().storeEventPlanned) {
    const we = get().weeklyEvent
    if (newAbsDay - (we.lastDay ?? -999) >= 7) {
      const r = get().planStoreEvent(we.type)
      if (r?.ok) {
        set({ weeklyEvent: { ...we, lastDay: newAbsDay } })
        get().log('shop', `📆 Events Coordinator booked tonight's ${STORE_EVENTS[we.type]?.name || 'event'} — it runs when the day turns.`, 0)
      }
    }
  }
  // 🪓 Bin Keeper: keeps the loose-pack bin full overnight. Every loose-pack SKU you're
  // running (loose rows in stock now, or packs that were OUT ON THE FLOOR when the tick
  // began — so a sellout night still gets refilled) is topped back up to its bin depth
  // from storeroom packs first; if the backstock runs dry, ONE product gets broken down
  // per SKU per night — a case into boxes (value-neutral), then whichever box gives up
  // the least paper value into packs (breakOptions' delta, so cheap-to-crack sets go
  // first and a premium box survives). Leftover packs rack in the back (PACKS_PER_RACK)
  // as the next nights' backstock. 🔒 kept / held / vintage are never touched — and only
  // the set's canonical single (what a break produces) is ever broken FOR; sleeved packs
  // and blisters just get topped up if you stock them.
  let keeperStocked = 0, keeperBroke = 0
  if (s.upgrades.binKeeper && s.upgrades.storefront) {
    const isLoose = it => (it.product?.packs || 1) === 1 && !it.vintage
    const usable = it => !it.locked && !it._heldFor
    const skuOf = it => `${it.setId}|${it.product?.type || ''}`
    const skus = new Set([
      ...(get().sealedInventory || []).filter(it => isLoose(it) && usable(it)).map(skuOf),
      // `s` is the top-of-tick snapshot — floor bins as they stood before the day's sales.
      ...(s.sealedInventory || []).filter(it => it.loc === 'floor' && isLoose(it) && !it.locked).map(skuOf),
    ])
    const toFloor = (uids) => set(st => ({ sealedInventory: (st.sealedInventory || [])
      .map(it => uids.has(it.uid) ? { ...it, loc: 'floor' } : it) }))
    for (const sku of skus) {
      const [setId, type] = sku.split('|')
      const st0 = get()
      const cap = floorItemCap(st0, 'sealed', { product: { packs: 1 } })
      const have = (floorSkuCounts(st0).get(`s:${setId}:${type}`) || 0)
      let need = Math.min(Math.max(0, cap - have), floorFreeSlots(st0))
      if (need <= 0) continue
      // 1) Top up from existing loose backstock of this exact SKU.
      const back = st0.sealedInventory.filter(it =>
        it.setId === setId && it.product?.type === type && isLoose(it) && usable(it) && it.loc !== 'floor')
      const move = back.slice(0, need)
      if (move.length) { toFloor(new Set(move.map(it => it.uid))); keeperStocked += move.length; need -= move.length }
      if (need <= 0) continue
      // 2) Backstock's dry — break something down, but only for the canonical single.
      const single = (setById(setId)?.products || []).find(p => (p.packs || 1) === 1)
      if (!single || single.type !== type) continue
      const sources = () => get().sealedInventory.filter(it =>
        it.setId === setId && (it.product?.packs || 1) > 1 && usable(it) && !it.vintage && it.loc !== 'floor')
      // A case cracks to boxes first (value-neutral) so we never dump 216 packs at once.
      const cs = sources().find(it => it.product?._case)
      if (cs && !sources().some(it => !it.product?._case)) {
        const boxOpt = breakOptions(cs).find(o => (o.product.packs || 1) > 1)
        if (boxOpt) get().breakSealed(cs.uid, boxOpt.product.type)
      }
      const boxes = sources().filter(it => !it.product?._case)
        .map(it => ({ it, opt: breakOptions(it).find(o => o.product.type === single.type) }))
        .filter(x => x.opt)
        .sort((a, b) => b.opt.delta - a.opt.delta) // least paper-value loss first
      const pick = boxes[0]
      if (!pick) continue
      const beforeUids = new Set(get().sealedInventory.map(it => it.uid))
      const r = get().breakSealed(pick.it.uid, single.type)
      if (r?.count) {
        keeperBroke++
        const fresh = get().sealedInventory.filter(it => !beforeUids.has(it.uid)).slice(0, need)
        toFloor(new Set(fresh.map(it => it.uid))); keeperStocked += fresh.length
        get().log('shop', `🪓 Bin Keeper broke a ${setById(setId)?.name || ''} ${pick.it.product.type} — bin +${fresh.length}, ${r.count - fresh.length} racked in back`, 0)
      }
    }
    if (keeperStocked > 0 && !keeperBroke) get().log('shop', `🪓 Bin Keeper topped the pack bin${skus.size > 1 ? 's' : ''} up — +${keeperStocked} from backstock`, 0)
  }
  // Regular call-ins + "you came through" — logged here (after the write) from the pass above.
  for (const r of regTick.requested) get().log('regular', `📞 ${r.emoji} ${r.name} called — any chance you can stock ${r.request.line}? They'll swing by for it.`, 0)
  for (const r of regTick.fulfilled) get().log('regular', `🤝 You came through for ${r.emoji} ${r.name} — you're carrying ${r.focus?.label || 'their lane'} now (+trust).`, 0)
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
    resolvedGrades: resolvedGrades.length, resolvedGradeCards: resolvedGrades, binderFiled, binderReserved,
    wantsBrokered, brokerProceeds, offersAccepted, keeperStocked, keeperBroke, days,
    saleProceeds: round2(soldProceeds), counterIncome: round2(counterRevenue),
    suppliesIncome: round2(suppliesRevenue), suppliesSold,
    machineIncome: round2(machineRevenue), machineSold,
    binIncome: round2(binRevenue), binSold, binTurnedAway,
    wholesaleIncome: round2(wholesaleIncome),
    // Richer recap data: named sales, biggest single sale, market movers, new collectors.
    soldNames: soldNames.slice(0, 6), bigSale, newWants,
    regularCalls: regTick.requested.length, regularsWon: regTick.fulfilled.length,
    marketMovers: market.events.map(e => ({ setName: e.setName, kind: e.kind, pct: e.pct })),
    lifeEvents,
    // 🔨 Lots that closed while the days passed, 🧾 a quarter that ended, 🏦 the note's
    // instalments. All three are things that happen TO you on a clock, so the recap is the
    // only place a player reliably sees them.
    lotsWon: lotResult?.won || 0,
    lotsLost: lotResult?.lost || 0,
    lotsSpent: round2(lotResult?.spent || 0),
    lotsBurned: lotResult?.burned || 0,
    marketTaken: marketTick?.taken || 0,
    quarterClosed: quarter || null,
    loanPaid: round2(loanResult?.paid || 0),
    loanMissed: loanResult?.missed || 0,
    loanCleared: !!loanResult?.cleared,
    loanDefaulted: !!loanResult?.defaulted,
    netWorth,
    cashDelta: round2(get().cash - s.cash),
    notoDelta: round2(get().notoriety - noto),
    hype: get().hype,
    hypeDelta: round2((get().hype || 0) - hype0),
    // Top rep sources of the tick, for the recap's "⭐ +3.2 (sales +2.0 · stream +1.2)" line.
    // The tick's own gains sit in repLedger.today (yesterday's map rolled out at the top).
    notoBySrc: Object.entries(get().repLedger?.today || {}).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 3) }
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
    binderReserved: add(a.binderReserved, b.binderReserved),
    machineIncome: round2(add(a.machineIncome, b.machineIncome)),
    machineSold: add(a.machineSold, b.machineSold),
    binIncome: round2(add(a.binIncome, b.binIncome)),
    binSold: add(a.binSold, b.binSold),
    binTurnedAway: add(a.binTurnedAway, b.binTurnedAway),
    wholesaleIncome: round2(add(a.wholesaleIncome, b.wholesaleIncome)),
    wantsBrokered: add(a.wantsBrokered, b.wantsBrokered),
    brokerProceeds: round2(add(a.brokerProceeds, b.brokerProceeds)),
    offersAccepted: add(a.offersAccepted, b.offersAccepted),
    keeperStocked: add(a.keeperStocked, b.keeperStocked),
    keeperBroke: add(a.keeperBroke, b.keeperBroke),
    saleProceeds: round2(add(a.saleProceeds, b.saleProceeds)),
    counterIncome: round2(add(a.counterIncome, b.counterIncome)),
    suppliesIncome: round2(add(a.suppliesIncome, b.suppliesIncome)),
    suppliesSold: add(a.suppliesSold, b.suppliesSold),
    soldNames: [...(a.soldNames || []), ...(b.soldNames || [])].slice(0, 6),
    bigSale,
    newWants: add(a.newWants, b.newWants),
    regularCalls: add(a.regularCalls, b.regularCalls),
    regularsWon: add(a.regularsWon, b.regularsWon),
    marketMovers: [...(a.marketMovers || []), ...(b.marketMovers || [])],
    lifeEvents: [...(a.lifeEvents || []), ...(b.lifeEvents || [])],
    lotsWon: add(a.lotsWon, b.lotsWon),
    lotsLost: add(a.lotsLost, b.lotsLost),
    lotsSpent: round2(add(a.lotsSpent, b.lotsSpent)),
    lotsBurned: add(a.lotsBurned, b.lotsBurned),
    marketTaken: add(a.marketTaken, b.marketTaken),
    quarterClosed: b.quarterClosed || a.quarterClosed || null, // at most one quarter ends in a trip
    loanPaid: round2(add(a.loanPaid, b.loanPaid)),
    loanMissed: add(a.loanMissed, b.loanMissed),
    loanCleared: !!(a.loanCleared || b.loanCleared),
    loanDefaulted: !!(a.loanDefaulted || b.loanDefaulted),
    netWorth: b.netWorth != null ? b.netWorth : a.netWorth, // latest (end-of-trip) worth
    cashDelta: round2(add(a.cashDelta, b.cashDelta)),
    notoDelta: round2(add(a.notoDelta, b.notoDelta)),
    hype: b.hype != null ? b.hype : a.hype, // latest (end-of-trip) heat
    hypeDelta: round2(add(a.hypeDelta, b.hypeDelta)),
    notoBySrc: (b.notoBySrc?.length ? b.notoBySrc : a.notoBySrc) || [], // latest leg's breakdown
    days: add(a.days, b.days),
  }
}

// Monthly distributor-credit billing. Runs once per month rollover crossed in a day-advance:
// interest accrues on the carried balance, then the monthly minimum is auto-paid from cash
// (like rent). Cover it and a frozen line thaws; fall short and the line freezes (cash-only)
// with a small notoriety ding until you catch up. Interest still accrues while frozen.
function settleCredit(set, get, monthsRolled) {
  for (let i = 0; i < monthsRolled; i++) {
    let bal = get().credit?.balance || 0
    if (bal <= 0) { if (get().credit?.frozen) set(st => ({ credit: { ...st.credit, frozen: false } })); continue }
    const interest = round2(bal * creditMonthlyRate(get().upgrades)) // 🏦 Preferred Account carries cheaper
    bal = round2(bal + interest)
    const minDue = round2(Math.min(bal, Math.max(CREDIT_MIN_FLOOR, bal * CREDIT_MIN_PCT)))
    const pay = round2(Math.min(minDue, Math.max(0, get().cash)))
    if (pay > 0) get().spend(pay)
    const newBal = Math.max(0, round2(bal - pay))
    const missed = pay + 1e-9 < minDue
    set(() => ({ credit: { balance: newBal, frozen: missed } }))
    if (interest > 0) get().log('credit', `💳 Credit interest +$${interest.toFixed(2)} on your distributor balance (now $${bal.toFixed(2)})`, 0)
    if (pay > 0) get().log('credit', `💳 Credit minimum paid −$${pay.toFixed(2)} · balance $${newBal.toFixed(2)}`, -pay)
    if (missed) {
      get().addNotoriety(-CREDIT_MISS_NOTORIETY)
      get().log('credit', `⚠️ Missed the credit minimum ($${minDue.toFixed(2)}) — your line is frozen (cash only) until you pay it down. (−${CREDIT_MISS_NOTORIETY}★)`, 0)
    }
  }
}

// Settle daily store overhead (lease + payroll). If cash covers it, pay and clear arrears.
// If not, fall behind; past STORE_GRACE_DAYS you LOSE THE STORE (close it + let go of
// staff) — you're back to flipping from home, not game over. Rent/game-over is separate.
// 🏬 The second location's daily bill. Same shape as the main store's: pay it and the
// clock resets; miss it and the arrears build until the manager locks the doors and sends
// the stock home. The upgrade stays owned, so reopening is a decision, not a purchase.
function settleBranch(set, get, due, days) {
  const s = get()
  const b = s.secondLoc
  if (!b?.open) return
  if (s.cash >= due) {
    get().spend(due)
    get().log('store', `🏬 Branch overhead paid — lease + manager (-$${due.toFixed(2)})`, -due)
    if (b.arrears) set(st => ({ secondLoc: { ...st.secondLoc, arrears: 0 } }))
    return
  }
  if (s.cash > 0) get().spend(round2(s.cash))
  const arrears = (b.arrears || 0) + days
  if (arrears > BRANCH_GRACE_DAYS) {
    set(st => ({
      collection: [...(st.secondLoc?.cards || []), ...st.collection],
      sealedInventory: [...(st.secondLoc?.sealed || []), ...(st.sealedInventory || [])],
      secondLoc: null,
    }))
    get().log('store-lost', `🏬 You couldn't cover the second location's overhead — it's closed and the stock has come home. Reopen it from the Store tab when you can carry it.`, 0)
    return
  }
  set(st => ({ secondLoc: { ...st.secondLoc, arrears } }))
  get().log('store-late', `🏬 Behind on the branch's overhead (${arrears}/${BRANCH_GRACE_DAYS} days) — stock it, or recall the keys before it closes.`, 0)
}

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
  // 🧾 Your rent is where you LIVE. It is not a business cost and it does not come off the
  // taxable line — the storage the shop pays for does, and that rides its own spend() call.
  if (s.cash >= rentDue) {
    get().spend(rentDue, { personal: true })
    get().log('rent', `Rent $${baseRent.toFixed(2)}${storageNote} paid (-$${rentDue.toFixed(2)})`, -rentDue)
    if (s.rentArrears) set({ rentArrears: 0 })
    return
  }
  // can't fully cover rent → pay what we can, fall behind.
  if (s.cash > 0) { get().spend(round2(s.cash), { personal: true }) }
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
