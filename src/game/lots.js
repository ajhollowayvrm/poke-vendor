// 🔨 The auction house — the BUY side of the hammer.
//
// The game already lets you send a card to auction. It never let you bid on one, which left
// out the channel most real dealers actually source from. This is that channel.
//
// It is built on three rules, and every one of them is a rule the real thing runs on:
//
//   1. YOU PAY ONE INCREMENT OVER THE SECOND-HIGHEST BID, not your maximum. That is how a
//      proxy bid works, and it is why the correct play is to enter the highest number you
//      would genuinely be happy to pay and then walk away from the screen. Bidding your true
//      maximum costs you nothing when the room is quiet and saves you nothing when it is not.
//   2. THE ROOM SETS THE PRICE. A lot with eleven watchers ends over market. A lot with one
//      watcher ends well under it. Reading which is which is the whole skill.
//   3. A QUIET LOT IS QUIET FOR A REASON. This is the trap, and it is deliberate. The lots
//      nobody is watching are disproportionately the ones with a bad photo and an optimistic
//      condition claim. Chasing cheap without checking is how a dealer loses money buying
//      things that looked like bargains.
//
// The buyer's premium is what stops the whole channel being free money: every win pays the
// house on top of the hammer. A naive bidder who enters market value on everything pays about
// market once the premium and the misdescribed lots are counted. The edge is real but it has
// to be worked for.

import {
  cardInValueRange, gradedCardInRange, vintageCardInRange, cardValue, rawValue, round2,
  CONDITIONS, VINTAGE_SETS, AFTERMARKET_SETS, vintageProduct, sealedValue, setById,
} from './engine'

// The house's cut of every win, charged on top of the hammer price. Real card auctioneers
// charge 15–20%; this sits just under, because the game's own sale channels already take a
// fee at the other end and the two must not compound into a dead loop.
export const HOUSE_PREMIUM = 0.13
// Postage and packing on a win. Flat, because the house ships one parcel however small the lot.
export const LOT_SHIP_FLAT = 4.5
export const LOT_SHIP_PCT = 0.012

// How long lots run. Short lots draw a thinner room, which is the same trade the sell side makes.
export const LOT_DAYS = [2, 3, 4, 5]

// --- What is in a lot ------------------------------------------------------------
export const LOT_KINDS = {
  raw:    { key: 'raw',    icon: '🃏', label: 'Raw single' },
  slab:   { key: 'slab',   icon: '🔟', label: 'Graded slab' },
  sealed: { key: 'sealed', icon: '📦', label: 'Sealed product' },
}

// --- The room --------------------------------------------------------------------
// Watchers are the visible signal, and they are the only honest one the player gets.
export const WATCHERS_MAX = 12
// How hard the room pushes the price. One watcher barely bids; a full room bids each other up
// past market, exactly as it does on the sell side.
export function roomMult(watchers) {
  return 0.62 + 0.055 * Math.max(0, Math.min(WATCHERS_MAX, watchers))
}
// Heat as a 0..1 figure, for everything that scales with how contested a lot is.
export function roomHeat(watchers) {
  return Math.max(0, Math.min(1, (watchers || 0) / WATCHERS_MAX))
}

// The highest COMPETING bid. Everything about whether a lot is worth entering comes down to
// this distribution, so it is deliberately simple to reason about: the room's pressure times
// a spread. `rnd` is injectable so the sim can measure it.
export function rivalTop(lot, rnd = Math.random) {
  const market = lotMarket(lot)
  const spread = 0.82 + rnd() * 0.36 // ±18% of noise around what the room is worth
  return round2(market * roomMult(lot.watchers) * spread)
}

// Bid increments, the way a real house steps them. Also what you pay over the runner-up.
export function bidIncrement(price) {
  if (price < 25) return 1
  if (price < 100) return 2.5
  if (price < 500) return 10
  if (price < 2500) return 25
  return 100
}

// --- Condition risk: the reason a quiet lot is cheap -------------------------------
// A raw lot carries a CLAIMED condition. Sometimes the claim is optimistic, and the odds of
// that rise as the room thins — a listing with one bad photo attracts neither bidders nor
// scrutiny. This is the single mechanic that punishes bidding on cheap-looking lots blind.
// These rates are TUNED, not guessed, and sim section 11 is what tunes them. They have to
// clear two bars at once: high enough that bidding blind on quiet lots is punished, and low
// enough that a disciplined bidder who reads the room still comes out ahead. An earlier pass
// ran at nearly half of quiet lots being misdescribed, which made the whole channel a net
// loss however carefully you played it — a trap rather than a market.
const COND_WORSE = { NM: 'LP', LP: 'MP', MP: 'DMG', DMG: 'DMG' }
export function misdescribeChance(lot) {
  if (lot.kind !== 'raw') return 0
  return 0.10 + 0.18 * (1 - roomHeat(lot.watchers))
}
// Sealed lots carry the other version of the same risk: the wrapper has been opened, searched
// and resealed. The 🔬 Authentication Kit is what tells you before you bid, not after — and
// because a resealed box loses almost all its value, that upgrade is the difference between
// bidding on sealed and staying away from it.
export function resealChance(lot) {
  if (lot.kind !== 'sealed') return 0
  return 0.06 + 0.14 * (1 - roomHeat(lot.watchers))
}

// Does the player get to SEE the problem before bidding?
//   🤝 Dealer Network — their people have handled this consignor's listings before, so a
//      dressed-up condition claim gets flagged.
//   🔬 Authentication Kit — you know what a resealed wrapper looks like in a photo.
export function lotWarning(lot, upgrades) {
  if (lot.kind === 'raw' && lot._misdescribed && upgrades?.network) {
    return { icon: '⚠️', text: `The photos do not match the claim — this is a ${CONDITIONS[lot.trueCondition]?.label || 'rougher'} card.` }
  }
  if (lot.kind === 'sealed' && lot._resealed && upgrades?.authkit) {
    return { icon: '🔬', text: 'The wrapper crimp is wrong. This has been opened, searched and resealed.' }
  }
  return null
}

// --- Valuing a lot ---------------------------------------------------------------
// What the lot is worth AS DESCRIBED. This is the number the player is bidding against, and
// it is deliberately the optimistic one: a misdescribed lot is worth less than this, and
// finding that out is the lesson.
export function lotMarket(lot) {
  if (!lot) return 0
  if (lot.kind === 'sealed') return sealedValue(lot.item)
  return cardValue(lot.card)
}
// What the lot turns out to be worth once it is in your hands.
export function lotTrueValue(lot) {
  if (!lot) return 0
  if (lot.kind === 'sealed') {
    // A resealed pack is worth what an opened, searched pack is worth: very little.
    return lot._resealed ? round2(sealedValue(lot.item) * 0.15) : sealedValue(lot.item)
  }
  if (lot.kind === 'raw' && lot._misdescribed) {
    return round2(rawValue({ ...lot.card, condition: lot.trueCondition }))
  }
  return cardValue(lot.card)
}

// What a win actually costs, hammer plus the house's cut plus postage.
export function lotTotalCost(hammer) {
  const premium = round2(hammer * HOUSE_PREMIUM)
  const ship = round2(LOT_SHIP_FLAT + hammer * LOT_SHIP_PCT)
  return { hammer: round2(hammer), premium, ship, total: round2(hammer + premium + ship) }
}

// --- Settling --------------------------------------------------------------------
// Run the clock out on one lot. `maxBid` is the player's proxy (0 or null = never bid).
export function settleLot(lot, rnd = Math.random) {
  const max = lot?.maxBid || 0
  const top = rivalTop(lot, rnd)
  if (max <= 0) return { won: false, reason: 'nobid', hammer: top }
  if (max <= top) return { won: false, reason: 'outbid', hammer: top }
  // Won. You pay one increment over the runner-up, never more than your own maximum — the
  // whole point of a proxy bid.
  const hammer = Math.min(max, round2(top + bidIncrement(top)))
  return { won: true, hammer, ...lotTotalCost(hammer) }
}

// --- Building the day's lots -----------------------------------------------------
// How many lots the house has running for you. A new account sees the public listings; a
// known dealer gets the consignments worth seeing.
export const LOTS_MAX = 8
export function lotSlots(notoriety = 0) {
  return Math.max(3, Math.min(LOTS_MAX, 3 + Math.floor((notoriety || 0) / 60)))
}

// The value band a lot is drawn in. It scales with your notoriety because the house puts
// better consignments in front of accounts with a history — and because a five-figure slab
// in front of a day-one player is not a decision, it is scenery.
function lotBand(notoriety, rnd) {
  const ceiling = 40 + (notoriety || 0) * 14
  const lo = 4 + rnd() * 30
  const hi = Math.max(lo + 12, lo + rnd() * ceiling)
  return [round2(lo), round2(hi)]
}

let _lotSeq = 0
export function makeLot(notoriety, day, rnd = Math.random) {
  const [lo, hi] = lotBand(notoriety, rnd)
  const roll = rnd()
  let kind = 'raw'
  if (roll > 0.78) kind = 'sealed'
  else if (roll > 0.52) kind = 'slab'

  // Graded lots draw a fuller room. The market for slabs is efficient precisely because the
  // grade removes the argument — there is nothing to misjudge, so everyone bids.
  const base = kind === 'slab' ? 4 + rnd() * 8 : 1 + rnd() * 10
  const watchers = Math.max(1, Math.min(WATCHERS_MAX, Math.round(base)))

  const lot = {
    id: `lot${day}_${_lotSeq++}_${Math.floor(rnd() * 1e6).toString(36)}`,
    kind, watchers,
    endsOn: day + LOT_DAYS[Math.floor(rnd() * LOT_DAYS.length)],
    maxBid: 0,
    listedOn: day,
  }

  if (kind === 'sealed') {
    const pool = rnd() < 0.55 && VINTAGE_SETS.length ? VINTAGE_SETS : (AFTERMARKET_SETS.length ? AFTERMARKET_SETS : VINTAGE_SETS)
    const set = pool[Math.floor(rnd() * pool.length)]
    if (!set) return null
    const product = vintageProduct(set)
    if (!product) return null
    lot.item = { setId: set.id, product, vintage: !!set.vintage }
    lot.title = `${set.name} — ${product.type || 'Sealed'}`
    lot._resealed = rnd() < resealChance(lot)
    return lot
  }

  if (kind === 'slab') {
    const grade = rnd() < 0.45 ? 10 : rnd() < 0.7 ? 9 : 8
    const card = gradedCardInRange(lo, hi, grade, rnd)
    if (!card) return null
    lot.card = card
    lot.title = `${card.name} — PSA ${card.grade?.overall ?? grade}`
    return lot
  }

  // Raw. The claimed condition is what the listing says; the true one may be worse.
  const card = rnd() < 0.25 && VINTAGE_SETS.length
    ? vintageCardInRange(lo, hi, rnd)
    : cardInValueRange(lo, hi, rnd)
  if (!card) return null
  // A slab can come back out of cardInValueRange at high bands — treat it as the slab it is.
  if (card.grade) {
    lot.kind = 'slab'
    lot.card = card
    lot.title = `${card.name} — PSA ${card.grade.overall}`
    return lot
  }
  card.condition = card.condition || 'NM'
  lot.card = card
  lot.claimedCondition = card.condition
  lot.trueCondition = card.condition
  lot.title = card.name
  if (rnd() < misdescribeChance(lot)) {
    lot._misdescribed = true
    lot.trueCondition = COND_WORSE[card.condition] || card.condition
    // Two tiers out is rare, and it is how a "Near Mint" arrives creased.
    if (rnd() < 0.22) lot.trueCondition = COND_WORSE[lot.trueCondition] || lot.trueCondition
    if (lot.trueCondition === lot.claimedCondition) lot._misdescribed = false
  }
  return lot
}

// Refill the board to its slot count. Existing lots keep running; only the empty slots fill.
export function refillLots(lots, notoriety, day, rnd = Math.random) {
  const slots = lotSlots(notoriety)
  const live = (lots || []).filter(l => l && day < l.endsOn)
  const out = [...live]
  let guard = 0
  while (out.length < slots && guard++ < 40) {
    const lot = makeLot(notoriety, day, rnd)
    if (lot) out.push(lot)
  }
  return out
}

// A one-line read on whether a lot is worth a look, for the panel's sort order.
export function lotAppeal(lot) {
  const market = lotMarket(lot)
  if (!market) return 0
  // Cheap rooms first; a full room is not an opportunity, it is a queue.
  return market * (1.3 - roomHeat(lot.watchers))
}

// The set behind a lot, for display.
export function lotSetName(lot) {
  if (lot?.kind === 'sealed') return setById(lot.item?.setId)?.name || ''
  return ''
}
