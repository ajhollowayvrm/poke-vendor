// 📱 The Local Marketplace — Facebook Marketplace for cardboard.
//
// Every other buying channel in this game is a BUSINESS. The shop, the warehouse, the
// marketplace, the wholesaler, even the auction house: somebody there knows what things are
// worth, and the price reflects it. This channel is the opposite, and that is the whole point.
//
//     Nobody here prices to market. They price to how they FEEL about the thing.
//
// So the listings are not a shelf, they are a cross-section of strangers: the man who is
// certain his 2016 commons are a pension, the woman who checked TCGplayer and will not move a
// dollar, the family moving on Saturday who want it gone, and — occasionally — somebody who
// found a binder in a closet and has no idea. The skill is not haggling. It is reading which
// one you are looking at, from a photo and a sentence.
//
// THE TRAP, and it is deliberate: cheap listings are NOT reliably good ones. A price at 20% of
// market is either somebody clueless or somebody lying, and from the price alone those look
// identical. "Buy everything under half market" loses money here. Reading the tells — how long
// it has sat, what the text says, how new the account is — is what separates them, and the
// 🤝 Dealer Network / 🔬 Authentication Kit are what confirm it.
//
// The other real cost is that you have to GO. Meets are capped per day and cost travel, so the
// question is never just "is this a good price" but "is this worth the trip today".

import {
  cardInValueRange, vintageCardInRange, gradedCardInRange, cardValue, rawValue, round2,
  SHOP_SETS, VINTAGE_SETS, setProducts, sealedValue, setById, CONDITIONS, instance,
} from './engine'

// --- Who is selling ---------------------------------------------------------------
// `mult` is the band they price in, as a multiple of what the thing is actually worth.
// `flex` is how far they will come down when messaged (0 = firm, 1 = will take anything).
// `risk` is the chance the item is not what the listing says.
export const SELLERS = {
  optimist: {
    key: 'optimist', weight: 35, mult: [1.6, 4.0], flex: 0.05, risk: 0.04,
    label: 'Priced with feeling', icon: '💭', color: '#ff5e6c',
    lines: [
      '"RARE!! Mint condition. Firm on price."',
      '"These are worth a lot, I looked it up. No lowballers."',
      '"Investment grade. Serious buyers only."',
      '"My son says these are super rare. Firm."',
    ],
  },
  comper: {
    key: 'comper', weight: 25, mult: [0.92, 1.15], flex: 0.18, risk: 0.03,
    label: 'Knows the comps', icon: '📊', color: '#5aa0ff',
    lines: [
      '"Priced off TCGplayer market. Happy to meet at the shop."',
      '"Checked recent sales. Fair price, no trades."',
      '"Collector downsizing. Everything priced to comps."',
    ],
  },
  mover: {
    key: 'mover', weight: 22, mult: [0.55, 0.80], flex: 0.45, risk: 0.06,
    label: 'Needs it gone', icon: '📦', color: '#36d399',
    lines: [
      '"Moving Saturday — need this gone this week."',
      '"Clearing the garage. Make me an offer."',
      '"Quitting the hobby, everything must go."',
      '"Need the cash before the 1st. Can meet today."',
    ],
  },
  clueless: {
    key: 'clueless', weight: 10, mult: [0.15, 0.50], flex: 0.30, risk: 0.05,
    label: 'No idea what they have', icon: '🎁', color: '#ffcb05',
    lines: [
      '"Found these cleaning out my late father\'s house. No idea what they are."',
      '"My kid lost interest. Just want them out of the house."',
      '"Got these in a storage unit auction. Selling as-is."',
      '"Cleaning out the attic — is this stuff worth anything?"',
    ],
  },
  // Looks exactly like a steal. Is not. This is why cheap is not a strategy.
  scammer: {
    key: 'scammer', weight: 8, mult: [0.15, 0.45], flex: 0.60, risk: 0.85,
    label: 'Something is off', icon: '⚠️', color: '#ff9f43',
    lines: [
      '"Sealed, never opened. Cash only, meet at the gas station."',
      '"Must sell today. Zelle or Venmo only, no holds."',
      '"Inherited, selling cheap. Can ship if you pay first."',
      '"Price is low because I need it gone TODAY. No questions."',
    ],
  },
}
const SELLER_LIST = Object.values(SELLERS)
const WEIGHT_TOTAL = SELLER_LIST.reduce((a, s) => a + s.weight, 0)

function pickSeller(rnd) {
  let r = rnd() * WEIGHT_TOTAL
  for (const s of SELLER_LIST) { r -= s.weight; if (r <= 0) return s }
  return SELLER_LIST[0]
}

// --- The tells --------------------------------------------------------------------
// Correlated with the seller, never conclusive. A player who reads all three does much better
// than one who reads the price; a player who reads them perfectly still gets burned sometimes.
//
// DAYS LISTED is the strongest and the most honest: a genuinely underpriced listing does not
// sit. If something cheap has been up for two weeks, ask why.
export function daysListedFor(seller, rnd) {
  if (seller.key === 'optimist') return 4 + Math.floor(rnd() * 25)   // nobody is buying that
  if (seller.key === 'comper') return 1 + Math.floor(rnd() * 8)
  if (seller.key === 'scammer') return Math.floor(rnd() * 3)          // fresh account, fresh bait
  return Math.floor(rnd() * 3)                                        // real deals do not linger
}
export const PHOTOS = {
  stock:  { key: 'stock',  label: 'Stock photo from the internet', tell: 'suspicious' },
  blurry: { key: 'blurry', label: 'One blurry photo on a carpet',  tell: 'ordinary' },
  clear:  { key: 'clear',  label: 'Clear photos, front and back',  tell: 'good' },
  pile:   { key: 'pile',   label: 'A phone photo of a pile on a table', tell: 'ordinary' },
}
export function photoFor(seller, rnd) {
  if (seller.key === 'scammer') return rnd() < 0.7 ? PHOTOS.stock : PHOTOS.blurry
  if (seller.key === 'comper') return PHOTOS.clear
  if (seller.key === 'clueless') return rnd() < 0.6 ? PHOTOS.pile : PHOTOS.blurry
  return rnd() < 0.5 ? PHOTOS.blurry : PHOTOS.clear
}
// Account age, the other Marketplace tell everyone actually uses.
export function accountFor(seller, rnd) {
  if (seller.key === 'scammer') return rnd() < 0.75 ? 'new' : 'young'
  if (seller.key === 'comper') return 'established'
  return rnd() < 0.35 ? 'young' : 'established'
}
export const ACCOUNT_LABEL = {
  new: 'Joined this week · no ratings',
  young: 'Joined a few months ago · a couple of ratings',
  established: 'Years on the platform · lots of ratings',
}

// --- Going to get it --------------------------------------------------------------
// You cannot click "buy". You have to drive there, and the day only has so much room in it.
export const MEETS_PER_DAY = 3
export const TRAVEL_PER_MILE = 0.7      // fuel and your time, roughly
export const MILES = [2, 5, 9, 14, 22, 35]
export function travelCost(miles) { return round2(TRAVEL_PER_MILE * (miles || 0)) }

// --- What is being sold -----------------------------------------------------------
// Weighted toward what people actually list locally: bulk lots and loose sealed, with the
// occasional single worth real money.
const KINDS = [
  { key: 'lot', weight: 55 },      // "whole collection" — a pile of cards, value is fuzzy
  { key: 'sealed', weight: 26 },   // a box, an ETB, some packs
  { key: 'card', weight: 19 },     // one single, sometimes a slab
]

// The lot is the heart of this channel, so it is not ONE thing. A shoebox, a 4,000-card
// long box and a binder somebody found in a closet are all "a pile you cannot see the
// bottom of", and each one asks a different question: how much is in there, how likely is
// it that the good cards are still in it, and how sure is the seller.
//
// `spread` widens or narrows the per-card value band. `pickedChance` is how often somebody
// has already been through it — the single biggest hidden variable in a real lot. `hidden`
// is the chance a genuinely good card is buried in it, which is what makes an unknown pile
// worth driving out for at all.
export const LOT_FLAVORS = [
  { key: 'shoebox',  weight: 26, size: [60, 300],    spread: [0.03, 0.16], pickedChance: 0.40, hidden: 0.30,
    title: (n) => `Shoebox of cards (~${n.toLocaleString()})`,
    note: 'A shoebox. They counted it once, roughly, a while ago.' },
  { key: 'longbox',  weight: 22, size: [400, 1600],  spread: [0.03, 0.10], pickedChance: 0.55, hidden: 0.22,
    title: (n) => `${n.toLocaleString()} card bulk lot`,
    note: 'Sorted into long boxes. Somebody cared about this once.' },
  { key: 'binder',   weight: 20, size: [90, 400],    spread: [0.10, 0.45], pickedChance: 0.50, hidden: 0.42,
    title: (n) => `Full binder (~${n.toLocaleString()} cards)`,
    note: 'A binder, filled front to back. Binders hold what somebody thought was good.' },
  { key: 'attic',    weight: 18, size: [150, 900],   spread: [0.04, 0.22], pickedChance: 0.18, hidden: 0.48,
    title: (n) => `Old collection from the attic (~${n.toLocaleString()})`,
    note: 'Been in a box since the nineties. Nobody has looked through it since.' },
  { key: 'storage',  weight: 14, size: [800, 4000],  spread: [0.02, 0.12], pickedChance: 0.62, hidden: 0.35,
    title: (n) => `Storage unit haul — ${n.toLocaleString()}+ cards`,
    note: 'Bought the unit, not the cards. They have no idea what is in there.' },
]
function pickLotFlavor(rnd) {
  const total = LOT_FLAVORS.reduce((a, f) => a + f.weight, 0)
  let r = rnd() * total
  for (const f of LOT_FLAVORS) { r -= f.weight; if (r <= 0) return f }
  return LOT_FLAVORS[0]
}
export function lotFlavorByKey(key) { return LOT_FLAVORS.find(f => f.key === key) || null }
function pickKind(rnd) {
  const total = KINDS.reduce((a, k) => a + k.weight, 0)
  let r = rnd() * total
  for (const k of KINDS) { r -= k.weight; if (r <= 0) return k.key }
  return 'sealed'
}

// A lot's TRUE value is the sum of its cards; the listing only says how many there are.
// That is the appraisal problem the buy-in system already poses, pointed the other way.

let _seq = 0
export function makeListing(notoriety = 0, day = 0, rnd = Math.random) {
  const seller = pickSeller(rnd)
  const kind = pickKind(rnd)
  // Band scales gently with your reach — a bigger name sees more of the local market, not
  // better prices. Pricing psychology is the seller's, never your reputation's.
  const ceiling = 30 + (notoriety || 0) * 6
  const listing = {
    id: `mk${day}_${_seq++}_${Math.floor(rnd() * 1e6).toString(36)}`,
    kind, seller: seller.key,
    line: seller.lines[Math.floor(rnd() * seller.lines.length)],
    daysListed: daysListedFor(seller, rnd),
    photo: photoFor(seller, rnd).key,
    account: accountFor(seller, rnd),
    miles: MILES[Math.floor(rnd() * MILES.length)],
    postedDay: day,
  }

  if (kind === 'lot') {
    const flavor = pickLotFlavor(rnd)
    const [lo, hi] = flavor.size
    const count = lo + Math.floor(rnd() * (hi - lo))
    // Most of a local pile is worthless. The value is in the few cards nobody pulled out —
    // and whether those are still in there is exactly what you cannot see from the photo.
    const [plo, phi] = flavor.spread
    const perCard = plo + rnd() * (phi - plo)
    const picked = rnd() < flavor.pickedChance   // has somebody already gone through it?
    // The buried grail. Only an unpicked pile can still have one, which is the entire reason
    // to care whether it has been picked — and you cannot tell from the listing.
    const buried = !picked && rnd() < flavor.hidden ? 40 + rnd() * 400 : 0
    const worth = round2(count * perCard * (picked ? 0.55 : 1) + buried)
    listing.lot = { count, picked, flavor: flavor.key }
    listing.worth = Math.max(1, worth)
    listing.title = flavor.title(count)
    listing.lotNote = flavor.note
    return priceIt(listing, seller, rnd)
  }

  if (kind === 'sealed') {
    const vintage = VINTAGE_SETS.length && rnd() < 0.22
    const set = vintage
      ? VINTAGE_SETS[Math.floor(rnd() * VINTAGE_SETS.length)]
      : SHOP_SETS[Math.floor(rnd() * SHOP_SETS.length)]
    if (!set) return null
    const prods = setProducts(set).filter(p => p.price > 0)
    if (!prods.length) return null
    const product = prods[Math.floor(rnd() * prods.length)]
    listing.item = { setId: set.id, product, vintage: !!set.vintage }
    listing.worth = sealedValue({ setId: set.id, product })
    listing.title = `${set.name} — ${product.type}`
    if (!listing.worth) return null
    return priceIt(listing, seller, rnd)
  }

  // A single. Occasionally a slab, which removes the condition argument entirely.
  const lo = 3 + rnd() * 20
  const hi = Math.max(lo + 10, lo + rnd() * ceiling)
  const card = rnd() < 0.18 && VINTAGE_SETS.length
    ? vintageCardInRange(lo, hi, rnd)
    : rnd() < 0.2 ? gradedCardInRange(lo, hi, rnd() < 0.5 ? 9 : 10, rnd) : cardInValueRange(lo, hi, rnd)
  if (!card) return null
  listing.card = card
  listing.worth = cardValue(card)
  listing.title = card.grade ? `${card.name} (graded)` : card.name
  if (!listing.worth) return null
  return priceIt(listing, seller, rnd)
}

// Price it the way the seller feels about it, then decide — hidden — whether the listing is
// telling the truth.
function priceIt(listing, seller, rnd) {
  const [lo, hi] = seller.mult
  const mult = lo + rnd() * (hi - lo)
  listing.ask = round2(Math.max(1, listing.worth * mult))
  listing.askMult = round2(mult)
  // The hidden truth. A scammer is usually lying; everybody else occasionally is, because
  // people misjudge their own cards honestly all the time.
  listing.bad = rnd() < seller.risk
  if (listing.bad) {
    if (listing.kind === 'sealed') listing.badKind = rnd() < 0.6 ? 'resealed' : 'noshow'
    else if (listing.kind === 'card') listing.badKind = rnd() < 0.7 ? 'condition' : 'noshow'
    else listing.badKind = rnd() < 0.6 ? 'picked' : 'noshow'
  }
  return listing
}

// --- What you actually get --------------------------------------------------------
// The listing's claim, versus the thing in the carrier bag.
const COND_WORSE = { NM: 'LP', LP: 'MP', MP: 'DMG', DMG: 'DMG' }
export function trueValue(listing) {
  if (!listing) return 0
  if (!listing.bad) return listing.worth
  switch (listing.badKind) {
    case 'resealed': return round2(listing.worth * 0.15)
    case 'condition': return round2(listing.worth * 0.45)
    case 'picked': return round2(listing.worth * 0.35)   // somebody pulled the good ones out
    default: return listing.worth
  }
}
export function trueCondition(listing) {
  if (listing?.badKind !== 'condition') return listing?.card?.condition || 'NM'
  return COND_WORSE[listing.card?.condition || 'NM'] || 'LP'
}

// Can the player SEE the problem before they drive out there?
//   🤝 Dealer Network — their people know the local sellers; a bad listing gets flagged.
//   🔬 Authentication Kit — you know what a resealed wrapper looks like in a photo.
export function listingWarning(listing, upgrades) {
  if (!listing?.bad) return null
  if (listing.badKind === 'resealed' && upgrades?.authkit) {
    return { icon: '🔬', text: 'The wrapper in that photo has been opened and re-taped.' }
  }
  if ((listing.badKind === 'condition' || listing.badKind === 'picked') && upgrades?.network) {
    return { icon: '⚠️', text: listing.badKind === 'picked'
      ? 'Your people know this seller — that lot has already been picked through.'
      : 'The photos do not match the description. It is rougher than they say.' }
  }
  if (listing.badKind === 'noshow' && upgrades?.network) {
    return { icon: '👻', text: 'Known time-waster. They will not turn up.' }
  }
  return null
}

// --- Messaging them ---------------------------------------------------------------
// Haggling is expected here, and how far it goes is entirely about which seller you drew.
// An optimist will not move; somebody moving house on Saturday very much will.
export function haggle(listing, offer, rnd = Math.random) {
  const seller = SELLERS[listing.seller]
  if (!seller) return { ok: false, line: 'No answer.' }
  const floor = round2(listing.ask * (1 - seller.flex))
  if (offer >= listing.ask) return { ok: true, price: round2(offer), line: '"Deal — when can you meet?"' }
  if (offer >= floor) {
    return { ok: true, price: round2(offer), line: seller.key === 'mover'
      ? '"Yeah alright, I just need it gone. When can you come?"'
      : '"Fine. Cash on pickup."' }
  }
  // Below their floor. They counter once, at the floor, unless they are the type to take offence.
  if (seller.key === 'optimist') {
    return { ok: false, line: '"lol no. These are RARE." — they stop replying.', dead: true }
  }
  return { ok: false, price: floor, line: `"Can't do that. ${'$' + floor.toFixed(2)} and it's yours."`, counter: floor }
}

// --- The board --------------------------------------------------------------------
export const BOARD_MIN = 8
export const BOARD_MAX = 16
export function boardSize(notoriety = 0) {
  return Math.max(BOARD_MIN, Math.min(BOARD_MAX, BOARD_MIN + Math.floor((notoriety || 0) / 70)))
}

// A listing's chance of being gone by tomorrow. THE defining rhythm of this channel: a real
// bargain does not wait for you. Priced under market and honest? Somebody else is already
// messaging them. Priced like a fantasy? It will be there next month, and the month after.
export function takenChance(listing) {
  const m = listing?.askMult ?? 1
  if (m >= 1.5) return 0.02
  if (m >= 1.0) return 0.10
  if (m >= 0.8) return 0.28
  if (m >= 0.55) return 0.50
  return 0.72                     // a genuine steal, publicly listed. Move.
}

// Refill the board, dropping what got taken or went stale.
export function refillBoard(listings, notoriety, day, rnd = Math.random) {
  const want = boardSize(notoriety)
  const live = (listings || []).filter(l => l && !l.gone)
  const out = [...live]
  let guard = 0
  while (out.length < want && guard++ < 40) {
    const l = makeListing(notoriety, day, rnd)
    if (l) out.push(l)
  }
  return out
}
