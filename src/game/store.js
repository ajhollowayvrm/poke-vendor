import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { cardValue, GRADING, rollGrade, round2, rawValue, gradingFee, graderTier } from './engine'
import { boothEncounter } from './shows'

const STARTING_CASH = 100

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
function appendFeeMsg(msg, fee, payMethod) {
  if (fee <= 0) return msg
  const m = PAYMENT_METHODS[payMethod]
  return `${msg} (${m?.short || 'processing'} took $${fee.toFixed(2)} in fees.)`.trim()
}

const CALENDAR_DAYS = 30
const INBOX_CAP = 8
// Per-day probability that a home order arrives on each channel.
// Flat & sparse early (a fresh vendor barely gets orders), ramping with
// notoriety toward a cap. e.g. online: ~0.08/day at noto 0 → ~0.85 at noto 200.
function dayOrderChance(channel, notoriety) {
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
  let missedOnline = 0, missedWalkin = 0
  const newOrders = []
  for (let i = 0; i < days; i++) {
    // online channel
    if (Math.random() < dayOrderChance('online', noto)) {
      if (onlineOK) newOrders.push({ ...boothEncounter(noto, s.collection, 'online'), channel: 'online' })
      else missedOnline++
    }
    // walk-in channel (only if you have a physical store)
    if (hasStore && Math.random() < dayOrderChance('walkin', noto)) {
      if (walkinOK) newOrders.push({ ...boothEncounter(noto, s.collection, 'walkin'), channel: 'walkin' })
      else missedWalkin++
    }
  }
  // advance the day counter, rolling months as needed
  let d = s.currentDay + days, seed = s.showSeed, months = s.monthsElapsed
  while (d > CALENDAR_DAYS) {
    d -= CALENDAR_DAYS
    seed = (seed * 1103515245 + 12345) >>> 0 || 7
    months += 1
    get().log('month', `A new month of shows begins.`, 0)
  }
  set(st => ({
    currentDay: d, showSeed: seed, monthsElapsed: months,
    boothInbox: [...newOrders.reverse(), ...st.boothInbox].slice(0, INBOX_CAP),
  }))
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
  network:  { name: 'Dealer Network',       cost: 1500, desc: 'Famous vendors reveal their best stock to you.', icon: '🤝' },
  banner:   { name: 'Charity Banner',       cost: 300, desc: 'Generous acts grant +50% extra notoriety.', icon: '🎗️' },
}

export const useGame = create(persist((set, get) => ({
  cash: STARTING_CASH,
  collection: [],          // owned cards (instances)
  pendingGrades: [],       // {card, readyAt, tier}
  history: [],             // {t, type, detail, amount}
  stats: { packsOpened: 0, cardsPulled: 0, hits: 0, spent: 0, earned: 0, bestPull: null },

  notoriety: 0,            // 0..100+, drives traffic, deals, show tiers
  upgrades: {},            // { signage:true, ... }
  showSeed: 7,             // seed for the current month's calendar
  currentDay: 1,           // calendar day; attending a show advances this
  monthsElapsed: 0,        // how many calendars have rolled (for display)
  boothInbox: [],          // pending encounters waiting at your home shop
  showsAttended: 0,
  generousActs: 0,
  gradesSubmitted: 0,      // total cards ever sent to the grader → loyalty tier

  // --- notoriety / upgrades ---
  addNotoriety(n) {
    if (!n) return
    let amt = n
    if (n > 0 && get().upgrades.banner) amt = Math.round(n * 1.5)
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

  addPulls(cards, setName) {
    set(s => {
      const hits = cards.filter(c => c._isHit).length
      const best = cards.reduce((b, c) => (cardValue(c) > (b?cardValue(b):0) ? c : b), s.stats.bestPull)
      return {
        collection: [...cards, ...s.collection],
        stats: {
          ...s.stats,
          packsOpened: s.stats.packsOpened + 1,
          cardsPulled: s.stats.cardsPulled + cards.length,
          hits: s.stats.hits + hits,
          bestPull: best,
        },
      }
    })
    get().log('rip', `Opened ${setName}`, 0)
  },

  sellCard(uid) {
    const card = get().collection.find(c => c.uid === uid)
    if (!card) return
    const v = cardValue(card)
    set(s => ({ collection: s.collection.filter(c => c.uid !== uid) }))
    get().earn(v)
    get().log('sell', `${card.grade ? 'PSA '+card.grade.overall+' ' : ''}${card.name}`, v)
  },

  sellAllUngraded() {
    const { collection } = get()
    const toSell = collection.filter(c => !c.grade && !c._isHit)
    const total = round2(toSell.reduce((a, c) => a + cardValue(c), 0))
    set(s => ({ collection: s.collection.filter(c => c.grade || c._isHit) }))
    get().earn(total)
    get().log('sell', `Bulk sold ${toSell.length} commons/uncommons`, total)
  },

  submitGrade(uid, tierKey) {
    const tier = GRADING[tierKey]
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
    set(s => ({ pendingGrades: [...s.pendingGrades, { card, tierKey, readyAt }] }))
    const disc = before.discount > 0 ? ` (${Math.round(before.discount*100)}% loyalty off)` : ''
    get().log('grade-submit', `Submitted ${card.name} (${tier.name}, $${fee.toFixed(2)}${disc})`, -fee)
    // crossed into a new loyalty tier?
    const after = graderTier(get().gradesSubmitted)
    if (after.key !== before.key) get().log('grade-tier', `Grader loyalty: reached ${after.name} (${Math.round(after.discount*100)}% off future fees)`, 0)
  },

  // Called on a tick to resolve grades whose timers elapsed.
  resolveGrades() {
    const now = Date.now()
    const ready = get().pendingGrades.filter(p => now >= p.readyAt)
    if (!ready.length) return []
    const luck = get().upgrades.loupe ? 0.08 : 0
    const resolved = ready.map(p => {
      const graded = { ...p.card, grade: rollGrade(p.card, p.tierKey, luck) }
      return graded
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
        // give a card away free — costs you nothing but inventory goodwill
        s.addNotoriety(effect.notoriety)
        s.log('give', `Gave away a ${effect.card.name} for free`, 0)
        set(st => ({ generousActs: st.generousActs + 1 }))
        break
      }
      case 'sellMint': {
        const blocked = s.paymentBlocked(effect.payMethod)
        if (blocked) { s.addNotoriety(-1); s.log('lost-sale', blocked, 0); return blocked }
        const { net, fee } = processingFee(effect.price, effect.payMethod)
        s.earn(net)
        s.addNotoriety(effect.notoriety)
        s.log('sell', `Sold a ${effect.card.name} at cost (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
        msg = appendFeeMsg(msg, fee, effect.payMethod)
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
          msg = appendFeeMsg(msg, fee, effect.payMethod)
        }
        break
      }
      case 'counter': {
        const blocked = s.paymentBlocked(effect.payMethod)
        if (blocked) { s.addNotoriety(-1); s.log('lost-sale', blocked, 0); return blocked }
        if (Math.random() < (effect.chance ?? 0.5)) {
          const card = get().collection.find(c => c.uid === effect.uid)
          if (card) {
            const { net, fee } = processingFee(effect.price, effect.payMethod)
            set(st => ({ collection: st.collection.filter(c => c.uid !== effect.uid) }))
            s.earn(net); s.addNotoriety(effect.notoriety)
            s.log('sell', `Countered and sold ${card.name} (${methodLabel(effect.payMethod)})${feeNote(fee)}`, net)
            msg = appendFeeMsg(msg, fee, effect.payMethod)
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
    // days waiting until the show opens (home, not away) + the show's run (away)
    const wait = Math.max(0, showDay - get().currentDay)
    if (wait > 0) advanceDaysWith(set, get, wait, false)
    return advanceDaysWith(set, get, days, true)
  },

  reset() {
    set({ cash: STARTING_CASH, collection: [], pendingGrades: [], history: [],
      stats: { packsOpened: 0, cardsPulled: 0, hits: 0, spent: 0, earned: 0, bestPull: null },
      notoriety: 0, upgrades: {}, showSeed: 7, currentDay: 1, monthsElapsed: 0, boothInbox: [], showsAttended: 0, generousActs: 0, gradesSubmitted: 0 })
  },
}), {
  name: 'poke-vendor-save',
  version: 3,
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
    return state
  },
}))

// In the sim, grading "days" pass in real seconds so you don't wait weeks.
// 1 grading-day = 1.2 real seconds.
export const DAY_MS_SIM = 1200
