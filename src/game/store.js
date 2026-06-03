import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { cardValue, GRADING, rollGrade, round2, rawValue, gradingFee, graderTier, rarityRank, bulkDiscount } from './engine'
import { boothEncounter, makeWant, cardMatchesWant, encounterStillValid } from './shows'

const STARTING_CASH = 2000

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
// Advance the calendar by `days`, generating home orders for each day passed.
// `away` = these days are spent at a show: online orders only come in if you own
// a Smartphone, walk-ins only if you have Shop Assistant; otherwise they're missed.
function advanceDaysWith(set, get, days, away) {
  const s = get()
  const noto = s.notoriety
  const hasStore = !!s.upgrades.storefront
  const onlineOK = away ? !!s.upgrades.smartphone : true
  const walkinOK = away ? !!s.upgrades.staff : true
  const accepted = acceptedMethods(s.upgrades) // buyers prefer methods you can take
  let missedOnline = 0, missedWalkin = 0
  let onlineCount = 0
  const newOrders = []
  for (let i = 0; i < days; i++) {
    // online channel
    if (Math.random() < dayOrderChance('online', noto)) {
      if (onlineOK) { newOrders.push({ ...boothEncounter(noto, s.collection, 'online', accepted), channel: 'online' }); onlineCount++ }
      else missedOnline++
    }
    // walk-in channel (only if you have a physical store)
    if (hasStore && Math.random() < dayOrderChance('walkin', noto)) {
      if (walkinOK) newOrders.push({ ...boothEncounter(noto, s.collection, 'walkin', accepted), channel: 'walkin' })
      else missedWalkin++
    }
  }
  // NEW-PLAYER GUARANTEE: a fresh vendor at notoriety 0 can otherwise go 10–15 days
  // with no online orders (1-in-12/day) and feel like nothing's happening. If you've
  // never received an online order and these are home days, guarantee your first one
  // by the end of the first few days so the loop actually starts.
  if (onlineOK && onlineCount === 0 && (s.onlineOrdersEver || 0) === 0 && s.currentDay + days <= 5) {
    newOrders.push({ ...boothEncounter(noto, s.collection, 'online', accepted), channel: 'online', _firstOrder: true })
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
  // resolve your own-site listings: when the timer elapses, a listing either
  // SELLS (pays net) or EXPIRES unsold (you can relist or pull it). The outcome
  // was decided at list time (l.willSell) so the preview odds are honest.
  const remainingListings = []
  for (const l of (s.listings || [])) {
    if (l.expired) { remainingListings.push(l); continue } // already expired, awaiting your action
    const left = l.daysLeft - days
    if (left > 0) { remainingListings.push({ ...l, daysLeft: left }); continue }
    if (l.willSell) { soldProceeds = round2(soldProceeds + l.net); get().log('sell', `Listing sold: ${l.card.name} for $${l.net.toFixed(2)}`, l.net) }
    else { remainingListings.push({ ...l, daysLeft: 0, expired: true }); get().log('listing', `Listing expired unsold: ${l.card.name} (priced too high) — relist or pull it.`, 0) }
  }
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
  }))
  if (soldProceeds > 0) get().earn(soldProceeds)
  if (missedOnline) get().log('missed', `Missed ${missedOnline} online order${missedOnline>1?'s':''} while away (get a 📱 Smartphone).`, 0)
  if (missedWalkin) get().log('missed', `Missed ${missedWalkin} walk-in${missedWalkin>1?'s':''} while away (hire a 🧑‍💼 Shop Assistant).`, 0)
  return { added: newOrders.length, missedOnline, missedWalkin }
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
  listings: [],            // {card, ask, net, askMult, daysLeft, willSell, expired?} — your own-site listings
  wantList: [],            // active collector wants (see want-list section)
  dailyGoals: [],          // {key,label,target,progress,reward,done} for currentDay
  goalsDay: 0,             // which day dailyGoals were generated for
  // Rip/UI prefs. ripSpeed: reveal-speed multiplier (1 = normal, >1 faster, <1 slower).
  // autoAdvance: in one-by-one mode, auto-rip the next pack a few seconds after each finishes.
  settings: { openSealedOneByOne: false, ripSpeed: 1, autoAdvance: false },

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
  earn(amount) {
    set(s => ({ cash: round2(s.cash + amount), stats: { ...s.stats, earned: round2(s.stats.earned + amount) } }))
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

  // Quote a self-listing at `askMult`× market: expected days-to-sell and the
  // chance it actually sells (vs sitting). Higher asks pay more but sell slower
  // and less reliably; notoriety speeds sales and makes high asks viable.
  // Returns { ask, fee, net, days, sellChance }.
  listingQuote(card, askMult) {
    const market = cardValue(card)
    const noto = get().notoriety
    const ask = round2(market * askMult)
    const fee = round2(ask * 0.05)          // ~5% marketplace fee
    const net = round2(ask - fee)
    // base wait shrinks with notoriety (~9d at 0 rep → ~2d once well-known)
    const base = 9 - Math.min(7, noto / 25)
    // asking above market adds days; at/under market is quick
    const premiumDays = Math.max(0, (askMult - 1)) * 22
    const days = Math.max(1, Math.round(base + premiumDays))
    // sell odds: ~at/under market almost always sells; far above market often sits.
    // notoriety widens how high you can push before it stops selling.
    const ceiling = 1.15 + noto / 200       // ask multiple you can hit reliably
    const over = Math.max(0, askMult - ceiling)
    const sellChance = Math.max(0.15, Math.min(0.98, 1 - over * 1.1))
    return { market, ask, fee, net, days, sellChance }
  },

  // List a card on your own site at `askMult`× market. Decides sell/expire now
  // (honest odds), removes from collection, pays net on day-advance if it sells.
  listOnSite(uid, askMult) {
    const card = get().collection.find(c => c.uid === uid)
    if (!card) return false
    const q = get().listingQuote(card, askMult)
    const willSell = Math.random() < q.sellChance
    const listing = { card, ask: q.ask, net: q.net, askMult, daysLeft: q.days, willSell }
    set(s => ({
      collection: s.collection.filter(c => c.uid !== uid),
      listings: [...(s.listings || []), listing],
    }))
    get().log('listing', `Listed ${card.name} at $${q.ask.toFixed(2)} (${Math.round(askMult*100)}% of market) — ~${q.days}d`, 0)
    return q
  },

  // Relist an expired listing — rolls a fresh outcome at the same ask.
  relistListing(idx) {
    const l = get().listings[idx]
    if (!l || !l.expired) return
    const q = get().listingQuote(l.card, l.askMult)
    const willSell = Math.random() < q.sellChance
    set(s => ({ listings: s.listings.map((x, i) => i === idx
      ? { ...x, expired: false, daysLeft: q.days, willSell, ask: q.ask, net: q.net } : x) }))
    get().log('listing', `Relisted ${l.card.name} — ~${q.days}d`, 0)
  },

  // Pull a listing back into your collection (e.g. an expired one, or to reprice).
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
    const toSell = collection.filter(c => !c.grade && !c._isHit)
    const total = round2(toSell.reduce((a, c) => a + cardValue(c) * quickSellRate, 0))
    set(s => ({ collection: s.collection.filter(c => c.grade || c._isHit) }))
    get().earn(total)
    get().log('sell', `Quick-sold ${toSell.length} raw commons/uncommons @ ${Math.round(quickSellRate*100)}%`, total)
  },

  // Buylist: instantly dump ALL raw bulk (commons/uncommons/rares, no hits/graded)
  // to a shop at a flat buylist rate — fast cash, well under market.
  buylistRate: 0.55,
  sellToBuylist() {
    const { collection, buylistRate } = get()
    const isBulk = c => !c.grade && !c._isHit && !c.foil && rarityRank(c.rarity) < rarityRank('Double Rare')
    const toSell = collection.filter(isBulk)
    if (!toSell.length) return 0
    const total = round2(toSell.reduce((a, c) => a + cardValue(c) * buylistRate, 0))
    set(s => ({ collection: s.collection.filter(c => !isBulk(c)) }))
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
  // sell/expire outcome). Returns how many were listed.
  listManyOnSite(uids, askMult) {
    const ids = new Set(uids)
    const cards = get().collection.filter(c => ids.has(c.uid))
    if (!cards.length) return 0
    const newListings = cards.map(card => {
      const q = get().listingQuote(card, askMult)
      return { card, ask: q.ask, net: q.net, askMult, daysLeft: q.days, willSell: Math.random() < q.sellChance }
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
    const readyAt = Date.now() + tier.days * DAY_MS_SIM
    // remember the fee actually paid so the resolved grade records it, not list price
    set(s => ({ pendingGrades: [...s.pendingGrades, { card, tierKey, readyAt, paidFee: fee }] }))
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
    const readyAt = Date.now() + tier.days * DAY_MS_SIM
    set(s => ({
      collection: s.collection.filter(c => !uidSet.has(c.uid)),
      gradesSubmitted: s.gradesSubmitted + cards.length,
      pendingGrades: [...s.pendingGrades, ...cards.map(card => ({ card, tierKey, readyAt, paidFee: feePer }))],
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
  buyFromVendor(card, price) {
    if (!get().spend(price)) return false
    const bought = { ...card, _ask: undefined, _mispriced: undefined }
    set(s => ({ collection: [bought, ...s.collection] }))
    get().log('buy', `Bought ${card.name} from a vendor`, -price)
    if (card._mispriced) get().addNotoriety(1) // you spotted a deal
    get().bumpGoal('buy', 1)
    return true
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
        const card = get().collection.find(c => c.uid === effect.uid)
        if (card) {
          let price = effect.price
          if (get().upgrades.cases) price = round2(price * 1.12)
          const { net, fee } = processingFee(price, effect.payMethod)
          set(st => ({ collection: st.collection.filter(c => c.uid !== effect.uid) }))
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
          const card = get().collection.find(c => c.uid === effect.uid)
          if (card) {
            // A counter is a normal sale of a card from your case — the display-case
            // bump applies here too (was previously missed).
            let price = effect.price
            if (get().upgrades.cases) price = round2(price * 1.12)
            const { net, fee } = processingFee(price, effect.payMethod)
            set(st => ({ collection: st.collection.filter(c => c.uid !== effect.uid) }))
            s.earn(net); s.addNotoriety(effect.notoriety)
            s.log('sell', `Countered and sold ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
            msg = appendFeeMsg(msg, fee, effect.payMethod, net)
          }
        } else { msg = 'They balk at your counter and walk away.' }
        break
      }
      case 'browseSale': {
        s.addNotoriety(effect.notoriety)
        if (Math.random() < (effect.chance ?? 0.3) && get().collection.length) {
          const blocked = s.paymentBlocked(effect.payMethod)
          if (blocked) { s.log('lost-sale', blocked, 0); msg = msg + ' …but ' + blocked.toLowerCase(); break }
          // they buy a random affordable card from your collection at market
          const owned = get().collection
          const card = owned[Math.floor(Math.random() * owned.length)]
          let price = rawValue(card)
          if (get().upgrades.cases) price = round2(price * 1.12)
          const { net, fee } = processingFee(price, effect.payMethod)
          set(st => ({ collection: st.collection.filter(c => c.uid !== card.uid) }))
          s.earn(net)
          s.log('sell', `A browser bought your ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
          msg = `They bought your ${card.name} for $${net.toFixed(2)}${fee > 0 ? ` (after $${fee.toFixed(2)} ${methodLabel(effect.payMethod)} fee)` : ''}!`
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
      const pruned = st.boothInbox.filter(enc => encounterStillValid(enc, st.collection))
      return pruned.length === st.boothInbox.length ? {} : { boothInbox: pruned }
    })
    return msg
  },

  clearInboxItem(idx) {
    set(s => ({ boothInbox: s.boothInbox.filter((_, i) => i !== idx) }))
  },
  // Pass a single day at home — generate that day's home orders into the inbox.
  nextDay() { return advanceDaysWith(set, get, 1, false) },
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
      consignments: [], listings: [], wantList: [], dailyGoals: [], goalsDay: 0,
      settings: { openSealedOneByOne: false, ripSpeed: 1, autoAdvance: false } })
  },
}), {
  name: 'poke-vendor-save',
  version: 10,
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
    return state
  },
}))

// In the sim, grading "days" pass in real seconds so you don't wait weeks.
// 1 grading-day = 1.2 real seconds.
export const DAY_MS_SIM = 1200
