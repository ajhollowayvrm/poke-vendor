// Card-show system: calendar, tiers, vendor generation, procedural encounters.
import { cardInValueRange, gradedCardInRange, rawValue, round2, SETS, rarityRank } from './engine'

// --- Show tiers --------------------------------------------------------------
// Each tier gates by notoriety and defines the value band of stock floating
// around the hall + base foot traffic at your booth.
// `booths` also drives map size (bigger shows → bigger halls). `npcs` is how
// many other shoppers wander the floor. `days` is how long the show takes —
// attending advances the calendar by that much, so bigger shows cost you the
// smaller shows happening during that window (the opportunity cost).
export const SHOW_TIERS = {
  meetup:   { name: 'Local Meetup',     minNotoriety: 0,   entryFee: 5,    days: 1, booths: 5,  npcs: 4,  valueBand: [0.5, 25],     traffic: 1.0, color: '#5ec98a' },
  shop:     { name: 'Card Shop Event',  minNotoriety: 15,  entryFee: 12,   days: 1, booths: 8,  npcs: 8,  valueBand: [1, 80],       traffic: 1.4, color: '#5aa0ff' },
  regional: { name: 'Regional Show',    minNotoriety: 40,  entryFee: 30,   days: 2, booths: 12, npcs: 16, valueBand: [3, 250],      traffic: 2.0, color: '#ff9f43' },
  national: { name: 'National Expo',    minNotoriety: 80,  entryFee: 75,   days: 2, booths: 18, npcs: 28, valueBand: [10, 1200],    traffic: 3.2, color: '#ff3df0' },
  invitational: { name: 'Invitational',  minNotoriety: 150, entryFee: 500,  days: 3, booths: 24, npcs: 40, valueBand: [200, 50000],  traffic: 4.5, color: '#7cf0ff' },
  worlds:   { name: 'World Championship', minNotoriety: 280, entryFee: 2500, days: 4, booths: 32, npcs: 60, valueBand: [1000, 1000000], traffic: 6.0, color: '#ffd700' },
}

export const CALENDAR_DAYS = 30

const CITIES = ['Cerulean','Saffron','Celadon','Viridian','Pewter','Vermilion','Lavender',
  'Goldenrod','Ecruteak','Olivine','Petalburg','Rustboro','Lumiose','Hearthome','Snowpoint']
const VENUES = ['Community Center','Convention Hall','Gymnasium','Expo Center','Hotel Ballroom','Trade Center']
const VENDOR_NAMES = ['Ace Cards','Holo Haven','The Grading Gremlin','Pristine Pulls','Binder Bros',
  'Mint Condition','Slab City','Pocket Monsters Co.','Gemstone Cards','Foil & Fortune','Rip City',
  'The Card Cabin','Vintage Vault','Chase Hunters','Top Loader Trading','Sketchy Steve\'s Singles',
  'Honest Hannah\'s','Lucky Pull Lou','Whale Watchers','Bargain Bin Barry']

function rng(seed) { // deterministic per-show generator
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
function pickR(r, arr) { return arr[Math.floor(r() * arr.length)] }

// Generate a stable calendar of upcoming shows for the next ~30 game-days.
export function generateCalendar(notoriety, seed = 7) {
  const r = rng(seed)
  const shows = []
  const tierKeys = Object.keys(SHOW_TIERS)
  for (let day = 1; day <= 30; day += 1) {
    if (r() > 0.42) continue // not every day has a show
    // choose a tier the player might qualify for; bias toward unlocked tiers
    const eligible = tierKeys.filter(k => notoriety + 10 >= SHOW_TIERS[k].minNotoriety)
    const tierKey = pickR(r, eligible.length ? eligible : ['meetup'])
    const tier = SHOW_TIERS[tierKey]
    shows.push({
      id: `show-${seed}-${day}`,
      day,
      tierKey,
      name: `${pickR(r, CITIES)} ${pickR(r, VENUES)}`,
      tier: tier.name,
      locked: notoriety < tier.minNotoriety,
      seed: (seed * 131 + day * 17) >>> 0,
    })
  }
  return shows
}

// --- Vendor generation -------------------------------------------------------
// Each booth has a personality that colors prices, encounters, and stock.
// `flex` = how far (fraction toward fair market) a vendor will haggle from their
// opening price before walking. Fair dealers bend a lot; lowballers barely move.
const ARCHETYPES = [
  { key: 'fair',    label: 'Fair Dealer',    buyMult: 0.85, sellMult: 1.05, flex: 0.80, vibe: 'friendly and reasonable' },
  { key: 'sharp',   label: 'Sharp Trader',   buyMult: 0.60, sellMult: 1.35, flex: 0.45, vibe: 'shrewd, always angling' },
  { key: 'whale',   label: 'High Roller',    buyMult: 0.90, sellMult: 1.6,  flex: 0.55, vibe: 'only deals in the big stuff' },
  { key: 'newbie',  label: 'Newer Vendor',   buyMult: 0.75, sellMult: 0.95, flex: 0.65, vibe: 'eager but green' },
  { key: 'fleecer', label: 'Lowballer',      buyMult: 0.35, sellMult: 1.8,  flex: 0.20, vibe: 'notorious for ripping people off' },
]
const ARCH_BY_KEY = Object.fromEntries(ARCHETYPES.map(a => [a.key, a]))
export function archetype(key) { return ARCH_BY_KEY[key] || ARCHETYPES[0] }

// Resolve one haggle round. side 'buy' = you're buying from them (lower is better
// for you); 'sell' = they're buying from you (higher is better for you).
//   their  = their current price, market = fair value, yourOffer = your counter
//   flex   = archetype flex, round = 0-based round index (patience shrinks)
// Returns { accept, counter, walk } — accept their take, a counter to consider, or walkaway.
export function haggleRound({ side, their, market, yourOffer, flex, round }) {
  // best price they'd ever agree to = market nudged by remaining flex
  const patience = Math.max(0, flex * (1 - round * 0.34)) // they get firmer each round
  const floorPrice = side === 'buy'
    ? Math.max(market, their - (their - market) * (flex)) // buying: they won't go below ~market
    : Math.min(market * 1.05, their + (market - their) * (flex)) // selling: won't pay much over market
  // how good is your offer for them?
  const goodForThem = side === 'buy' ? yourOffer >= floorPrice : yourOffer <= floorPrice
  if (goodForThem) return { accept: true }
  // too aggressive → chance they walk, scaling with how far past their limit you pushed
  const overreach = side === 'buy'
    ? (floorPrice - yourOffer) / Math.max(1, floorPrice)
    : (yourOffer - floorPrice) / Math.max(1, floorPrice)
  if (overreach > 0.4 + patience) return { walk: true }
  // otherwise they meet you partway toward your offer
  const counter = side === 'buy'
    ? round2(Math.max(floorPrice, their - (their - yourOffer) * (0.35 + patience)))
    : round2(Math.min(floorPrice, their + (yourOffer - their) * (0.35 + patience)))
  return { counter }
}

// `dayOffset` re-rolls the floor for each day of a multi-day show — different
// vendors/stock show up day to day.
export function generateBooths(show, notoriety, dayOffset = 0) {
  const r = rng((show.seed + dayOffset * 2654435761) >>> 0)
  const tier = SHOW_TIERS[show.tierKey]
  const [lo, hi] = tier.valueBand
  const n = tier.booths
  const booths = []
  for (let i = 0; i < n; i++) {
    const arch = pickR(r, ARCHETYPES)
    // Bigger booths now: a deep bin of commons/uncommons + a few hits.
    const stockN = 14 + Math.floor(r() * 18) // 14–31 cards
    const stock = []
    for (let j = 0; j < stockN; j++) {
      const roll = r()
      let card
      // ~15% of stock are "hits" pulled from the upper band; rest is the bulk bin.
      if (arch.key === 'whale' || roll > 0.85) card = gradedCardInRange(hi * 0.4, hi, 8 + Math.floor(r() * 3))
      else card = cardInValueRange(lo, hi * (0.4 + r() * 0.6))
      let ask = rawValue(card) * arch.sellMult
      if (arch.key === 'newbie' && r() > 0.7) ask = rawValue(card) * 0.5 // mispriced gem!
      card._ask = Math.max(0.25, Math.round(ask * 100) / 100)
      card._mispriced = arch.key === 'newbie' && ask < rawValue(card) * 0.7
      stock.push(card)
    }
    // Highlight the booth's 1–3 priciest pieces as featured "showcase" cards.
    const byVal = [...stock].sort((a, b) => rawValue(b) - rawValue(a))
    const featuredN = Math.min(3, byVal.length)
    for (let k = 0; k < featuredN; k++) byVal[k]._highlight = true
    booths.push({
      id: `${show.id}-b${i}`,
      name: pickR(r, VENDOR_NAMES) + (i ? ` #${i+1}` : ''),
      archetype: arch.key,
      archLabel: arch.label,
      vibe: arch.vibe,
      buyMult: arch.buyMult,   // how much they'll pay for YOUR cards
      stock,
      // grid position assigned by the floor layout
    })
  }
  return booths
}

// Names floating above NPC shoppers for flavor.
export const NPC_EMOJI = ['🧑','👩','👨','🧓','👵','🧔','👱','👲','🧑‍🦱','👩‍🦰','🧑‍🦰','👨‍🦱','🧑‍🦳','👩‍🦳']

// --- Procedural encounters ---------------------------------------------------
// Encounters are assembled from templates + (sometimes) a real card.
// Each option has: text, effect fn name + payload resolved by the showStore.
// We return data only; the store applies effects so persistence stays centralized.

// Visitor flavor by channel.
const VISITOR_NAMES = {
  show: ['a wide-eyed kid','a seasoned collector','a nervous first-timer','a hyped teenager',
    'an old-school player','a parent shopping for their kid','a competitive grinder','a casual browser',
    'a livestreamer','a bargain hunter','a returning customer','someone who just got fleeced next door'],
  walkin: ['a regular','a kid with birthday money','a local collector','a curious passer-by',
    'a parent and their kid','a dadda after work','a TikTok follower who found your shop','a deck-builder'],
  online: ['a Reddit buyer','an eBay watcher','a Discord trader','an Instagram DM','a Facebook Marketplace user',
    'a Mercari shopper','a TCGplayer buyer','a forum lurker','a Twitter mutual'],
}
// Online buyers can\'t hand you cash or tap. In-person can use anything.
const ONLINE_METHODS = ['venmo', 'paypal', 'card']
const INPERSON_METHODS = ['cash', 'venmo', 'card', 'paypal', 'tap']

function pickAny(r, arr) { return arr[Math.floor((r ?? Math.random)() * arr.length)] }
function pickPayMethod(channel) {
  return pickAny(null, channel === 'online' ? ONLINE_METHODS : INPERSON_METHODS)
}

// Build an encounter. channel: 'show' | 'walkin' | 'online'.
// 'show' = at your table in the hall; 'walkin' = your physical store;
// 'online' = a remote buyer messaging you (the early game, from your house).
export function boothEncounter(notoriety, playerCollection, channel = 'show') {
  const roll = Math.random()
  const visitor = pickAny(null, VISITOR_NAMES[channel] || VISITOR_NAMES.show)
  const online = channel === 'online'

  // 1) Someone got fleeced — make their day (online: got scammed in a trade)
  if (roll < 0.22) {
    const want = cardInValueRange(2, 20)
    const pay = pickPayMethod(channel)
    return {
      kind: 'fleeced',
      title: online ? `${cap(visitor)} messages you, frustrated` : `${cap(visitor)} approaches, looking dejected`,
      body: online
        ? `"I just got burned on a trade — paid way over for a beat-up card. I'm tapped out but I really wanted a ${want.name}…"`
        : `"I just paid way too much for a beat-up card at another booth. I'm basically out of money. I really wanted a ${want.name}…"`,
      card: want,
      options: [
        { text: `${online ? 'Mail' : 'Give'} them the ${want.name} for free`, tone: 'kind',
          effect: { type: 'giveFromStockOrMint', card: want, notoriety: 6, msg: 'You made their whole week. Word spreads fast.' } },
        { text: `Sell it at cost ($${rawValue(want).toFixed(2)})`, tone: 'fair',
          effect: { type: 'sellMint', card: want, price: rawValue(want), payMethod: pay, notoriety: 2, msg: 'A fair deal earns quiet respect.' } },
        { text: online ? 'Leave them on read' : 'Shrug — not your problem', tone: 'cold',
          effect: { type: 'none', notoriety: -1, msg: 'They move on. Not a great look.' } },
      ],
    }
  }

  // 2) Lowball / good offer ON one of your cards
  if (roll < 0.5 && playerCollection.length) {
    const target = pickAny(null, playerCollection)
    const market = rawValue(target)
    const good = Math.random() > 0.5
    const offer = Math.round(market * (good ? (1.05 + Math.random()*0.4) : (0.4 + Math.random()*0.3)) * 100) / 100
    const pay = pickPayMethod(channel)
    const m = PAY_LABEL(pay)
    return {
      kind: 'offer',
      ownedUid: target.uid, // so the encounter can be re-validated if you sell it first
      title: online ? `${cap(visitor)} wants your ${target.name}` : `${cap(visitor)} eyes your ${target.name}`,
      body: good
        ? `"That ${target.name} is exactly what I need. I'll give you $${offer.toFixed(2)}, paying by ${m}." (Market: $${market.toFixed(2)})`
        : `"Eh, that ${target.name}'s pretty common. I'll take it for $${offer.toFixed(2)}, ${m}." (Market: $${market.toFixed(2)})`,
      card: target,
      options: [
        { text: `Accept $${offer.toFixed(2)} (${m})`, tone: good ? 'fair' : 'cold',
          effect: { type: 'sellOwned', uid: target.uid, price: offer, payMethod: pay, notoriety: good ? 1 : 0, msg: good ? 'Clean sale, happy customer.' : 'You took the lowball. Cash is cash.' } },
        { text: 'Politely decline', tone: 'fair',
          effect: { type: 'none', notoriety: good ? -1 : 1, msg: good ? 'They leave disappointed.' : 'Holding firm on value builds your reputation.' } },
        ...(good ? [] : [{ text: `Counter at market ($${market.toFixed(2)})`, tone: 'fair',
          effect: { type: 'counter', uid: target.uid, price: market, payMethod: pay, chance: 0.6, notoriety: 2, msg: 'They grumble but pay fair value.' } }]),
      ],
    }
  }

  // 3) A question about a card
  if (roll < 0.72) {
    const q = cardInValueRange(0.5, 150)
    const realMid = rawValue(q)
    const correct = realMid
    const wrongHigh = Math.round(realMid * 3 * 100) / 100
    const wrongLow = Math.round(realMid * 0.3 * 100) / 100
    const opts = shuffle([
      { v: correct, ok: true }, { v: wrongHigh, ok: false }, { v: wrongLow, ok: false },
    ])
    return {
      kind: 'question',
      title: online ? `${cap(visitor)} asks for a price check` : `${cap(visitor)} has a question`,
      body: `"Hey, you seem to know your stuff. Any idea what this ${q.name} is worth right now?"`,
      card: q,
      options: opts.map(o => ({
        text: `"Around $${o.v.toFixed(2)}."`, tone: 'fair',
        effect: o.ok
          ? { type: 'none', notoriety: 3, msg: 'Spot on. They trust you now — and tell their friends.' }
          : { type: 'none', notoriety: -1, msg: `Not quite — it's closer to $${correct.toFixed(2)}. They look skeptical.` },
      })),
    }
  }

  // 4) Generic browse → small sale chance
  const pay = pickPayMethod(channel)
  return {
    kind: 'browse',
    title: online ? `${cap(visitor)} is scrolling your listings` : `${cap(visitor)} stops to browse your case`,
    body: online ? '"Got any deals? Just browsing your store."' : '"Nice setup. Mind if I look?"',
    card: null,
    options: [
      { text: online ? 'Send a friendly note + deal' : 'Give them a warm welcome', tone: 'kind',
        effect: { type: 'browseSale', payMethod: pay, chance: 0.5 + Math.min(0.4, notoriety/200), notoriety: 1, msg: 'Friendliness pays off.' } },
      { text: online ? 'Let them browse' : 'Let them browse in peace', tone: 'fair',
        effect: { type: 'browseSale', payMethod: pay, chance: 0.3, notoriety: 0, msg: 'They look around quietly.' } },
    ],
  }
}

// An "offer" encounter is built around a specific card you own. If you sell that
// card before responding (e.g. an online order sits in your inbox while you're at
// a show), the encounter is stale — it'd talk about a card you no longer have.
// This returns true only when the encounter still makes sense for `collection`.
export function encounterStillValid(enc, collection) {
  if (!enc || !enc.ownedUid) return true // doesn't reference one of your cards
  return collection.some(c => c.uid === enc.ownedUid)
}

const PAY_LABELS = { venmo:'Venmo', cash:'cash', paypal:'PayPal', card:'card', tap:'tap-to-pay' }
function PAY_LABEL(k) { return PAY_LABELS[k] || 'cash' }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }
function shuffle(a) { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]} return b }

export { rawValue }

// --- Want-list collectors --------------------------------------------------
// A collector posts a specific need; fill it from your collection for an
// above-market premium + notoriety. Two kinds: a named card, or "any <rarity>
// from <set>". Bigger asks pay a fatter premium.
const COLLECTOR_NAMES = ['Marco the completist','a binder grinder','an Eeveelution superfan','a vintage hound',
  'a set-builder','a deep-pocketed whale','a nostalgic dad','a rising streamer','a master-set chaser','a local legend']
const WANT_RARITIES = ['Illustration Rare','Ultra Rare','Special Illustration Rare','Hyper Rare']

function wpick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

// Make one want. `rich` (high notoriety) skews toward pricier asks.
export function makeWant(rich = false) {
  const who = wpick(COLLECTOR_NAMES)
  const daysLeft = 4 + Math.floor(Math.random() * 6) // 4–9 days to fill
  // 55% named card, 45% "any rarity from set"
  if (Math.random() < 0.55) {
    const all = SETS.flatMap(s => s.cards.filter(c => (c.price ?? 0) > (rich ? 8 : 1)))
    const card = wpick(all)
    const premium = 1.25 + Math.random() * (rich ? 0.6 : 0.3) // 1.25–1.85×
    return {
      id: `w${Math.floor(Math.random()*1e9).toString(36)}`,
      kind: 'card', who, daysLeft,
      cardId: card.id, cardName: card.name, img: card.img,
      premiumMult: round2(premium),
      notoriety: 3 + Math.floor((card.price ?? 0) / 20),
      desc: `${cap(who)} wants a ${card.name}`,
    }
  }
  const set = wpick(SETS)
  const rar = wpick(WANT_RARITIES)
  const premium = 1.2 + Math.random() * (rich ? 0.4 : 0.25)
  return {
    id: `w${Math.floor(Math.random()*1e9).toString(36)}`,
    kind: 'rarity', who, daysLeft,
    setId: set.id, setName: set.name, rarity: rar,
    premiumMult: round2(premium),
    notoriety: rar === 'Special Illustration Rare' || rar === 'Hyper Rare' ? 6 : 3,
    desc: `${cap(who)} wants any ${rar} from ${set.name}`,
  }
}

// Does a collection card satisfy a want?
export function cardMatchesWant(card, want) {
  if (card.grade) return false // they want a raw single to slot in a binder
  if (want.kind === 'card') return card.id === want.cardId
  if (want.kind === 'rarity') return card.setId === want.setId && card.rarity === want.rarity
  return false
}
