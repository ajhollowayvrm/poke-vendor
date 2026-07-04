// Card-show system: calendar, tiers, vendor generation, procedural encounters.
import { cardInValueRange, gradedCardInRange, vintageCardInRange, rawValue, cardValue, sealedValue, round2, SHOP_SETS, rarityRank, VINTAGE_SETS, SECONDARY_SETS, vintageProduct, setProducts, setIdOfCard, setNameOfCard, setById } from './engine'
import { omniShelfCards } from './store/constants'

// --- Show tiers --------------------------------------------------------------
// Each tier gates by notoriety and defines the value band of stock floating
// around the hall + base foot traffic at your booth.
// `booths` also drives map size (bigger shows → bigger halls). `npcs` is how
// many other shoppers wander the floor. `days` is how long the show takes —
// attending advances the calendar by that much, so bigger shows cost you the
// smaller shows happening during that window (the opportunity cost).
// `booths` scaled up toward real-world floor sizes (a local meetup is ~15–30
// tables, not 5) and spread so each tier feels distinctly bigger than the last.
// `entryFee` = the SHOPPER ticket (walk the floor and buy). `vendorFee` = the extra cost
// to book a BOOTH and sell your own cards (on top of entry, and only if you own the Vendor
// Setup upgrade). A vendor table at a big expo costs real money, so it scales with the tier.
export const SHOW_TIERS = {
  meetup:   { name: 'Local Meetup',     minNotoriety: 0,   entryFee: 5,    vendorFee: 15,   days: 1, booths: 16, npcs: 12, valueBand: [0.5, 25],     traffic: 1.0, color: '#5ec98a' },
  shop:     { name: 'Card Shop Event',  minNotoriety: 15,  entryFee: 12,   vendorFee: 40,   days: 1, booths: 22, npcs: 18, valueBand: [1, 80],       traffic: 1.4, color: '#5aa0ff' },
  regional: { name: 'Regional Show',    minNotoriety: 40,  entryFee: 30,   vendorFee: 120,  days: 2, booths: 32, npcs: 30, valueBand: [3, 250],      traffic: 2.0, color: '#ff9f43' },
  national: { name: 'National Expo',    minNotoriety: 80,  entryFee: 75,   vendorFee: 350,  days: 2, booths: 44, npcs: 48, valueBand: [10, 1200],    traffic: 3.2, color: '#ff3df0' },
  // Elite-tier value bands top out at what the REAL price data supports (the priciest
  // true PSA-10 comps run ~$49k) — a showcase slab is a card that actually sells for that.
  invitational: { name: 'Invitational',  minNotoriety: 150, entryFee: 500,  vendorFee: 1500, days: 3, booths: 56, npcs: 64, valueBand: [200, 25000],  traffic: 4.5, color: '#7cf0ff' },
  worlds:   { name: 'World Championship', minNotoriety: 280, entryFee: 2500, vendorFee: 6000, days: 4, booths: 72, npcs: 90, valueBand: [1000, 50000], traffic: 6.0, color: '#ffd700' },
}

export const CALENDAR_DAYS = 30

const CITIES = ['Cerulean','Saffron','Celadon','Viridian','Pewter','Vermilion','Lavender',
  'Goldenrod','Ecruteak','Olivine','Petalburg','Rustboro','Lumiose','Hearthome','Snowpoint']
const VENUES = ['Community Center','Convention Hall','Gymnasium','Expo Center','Hotel Ballroom','Trade Center']
const VENDOR_NAMES = ['Ace Cards','Holo Haven','The Grading Gremlin','Pristine Pulls','Binder Bros',
  'Mint Condition','Slab City','Pocket Monsters Co.','Gemstone Cards','Foil & Fortune','Rip City',
  'The Card Cabin','Cardboard Gold','Chase Hunters','Top Loader Trading','Sketchy Steve\'s Singles',
  'Honest Hannah\'s','Lucky Pull Lou','Whale Watchers','Bargain Bin Barry']

function rng(seed) { // deterministic per-show generator
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
function pickR(r, arr) { return arr[Math.floor(r() * arr.length)] }
// Deterministic Fisher–Yates shuffle (uses the show's seeded rng), so we can draw
// names WITHOUT replacement — no two booths named "Rip City", no duplicate venues.
function shuffleR(r, arr) {
  const b = [...arr]
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b
}

// Generate a stable calendar of upcoming shows for the next ~30 game-days.
export function generateCalendar(notoriety, seed = 7) {
  const r = rng(seed)
  const shows = []
  const tierKeys = Object.keys(SHOW_TIERS)
  // Draw "City Venue" names without replacement so the month never lists the same
  // venue twice. There are CITIES×VENUES combos, far more than ~30 days of shows.
  const venueOrder = shuffleR(r, CITIES.flatMap(c => VENUES.map(v => `${c} ${v}`)))
  let vi = 0
  const nextVenue = () => venueOrder[vi++ % venueOrder.length]
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
      name: nextVenue(),
      tier: tier.name,
      locked: notoriety < tier.minNotoriety,
      seed: (seed * 131 + day * 17) >>> 0,
    })
  }
  // Aspirational targets: make sure the player always sees 1–2 still-locked
  // higher tiers on the calendar as something to climb toward (otherwise a level-0
  // player only ever sees Local Meetups). We slot them onto otherwise-empty days.
  const lockedTiers = tierKeys.filter(k => notoriety < SHOW_TIERS[k].minNotoriety)
  const aspirational = lockedTiers.slice(0, 2) // the next two tiers up
  const usedDays = new Set(shows.map(s => s.day))
  let placed = 0
  for (let day = 6; day <= 30 && placed < aspirational.length; day += 7) {
    if (usedDays.has(day)) continue
    const tierKey = aspirational[placed]
    const tier = SHOW_TIERS[tierKey]
    shows.push({
      id: `show-${seed}-asp-${day}`,
      day, tierKey,
      name: nextVenue(),
      tier: tier.name,
      locked: true,
      seed: (seed * 131 + day * 17) >>> 0,
    })
    usedDays.add(day)
    placed++
  }
  return shows.sort((a, b) => a.day - b.day)
}

// --- Pre-show leads -----------------------------------------------------------
// A few days before a show, people you matter to reach out — a reason to make THAT
// trip. Two kinds:
//   'vendor' — a recurring dealer you have rapport with sets aside a sealed vintage
//              pack at a held (under-market) price. It's waiting at their table.
//   'buyer'  — a collector arranges to meet you at the show to buy a specific card
//              (or any of a rarity), at a premium fatter than a normal want — the
//              extra is for making the trip.
// Leads live in state (showLeads), surface on the Calendar + log, are CLAIMED when
// you enter the show (App stashes them on activeShow._leads), and expire if the
// show passes unattended. `absDay` is the month-safe absolute day of the show.
export function makeShowLead(show, kind, opts = {}) {
  const base = {
    showId: show.id, showDay: show.day, showName: show.name, tierKey: show.tierKey,
    absDay: opts.absDay ?? show.day,
  }
  if (kind === 'buyer') {
    const w = makeWant(!!opts.bigSpender)
    const premiumMult = round2(w.premiumMult + 0.3) // the trip premium
    return {
      ...base,
      id: `lead-${show.id}-b${w.id}`,
      kind: 'buyer',
      who: w.who, want: w, img: w.img,
      desc: w.desc.replace(/^.*? wants /, ''), // just the item ("a Chespin (Chaos Rising)")
      premiumMult,
      notoriety: (w.notoriety || 2) + 1,
      text: `${cap(w.who)} messaged: "I'll be at ${show.name} (day ${show.day}) — bring ${w.desc.replace(/^.*? wants /, '')} and I'll pay ${Math.round(premiumMult * 100)}% of market, cash on the spot."`,
    }
  }
  // vendor hold — needs a vintage pool and a roster vendor to make the promise
  if (!VINTAGE_SETS.length || !opts.vendor) return null
  const set = VINTAGE_SETS[Math.floor(Math.random() * VINTAGE_SETS.length)]
  const product = vintageProduct(set)
  if (!product) return null
  const price = round2(product.price * 0.9) // held under the usual 1.15×+ show markup — a favor
  return {
    ...base,
    id: `lead-${show.id}-v${opts.vendor.id}`,
    kind: 'vendor',
    vendorId: opts.vendor.id, vendorName: opts.vendor.name,
    setId: set.id, setName: set.name, productType: product.type, price,
    text: `${opts.vendor.name} messaged: "Setting up at ${show.name} (day ${show.day}). Got a sealed ${product.type} of ${set.name} with your name on it — $${price.toFixed(2)}, holding it till then."`,
  }
}

// --- Vendor generation -------------------------------------------------------
// Each booth has a personality that colors prices, encounters, and stock.
// `flex` = how far (fraction toward fair market) a vendor will haggle from their
// opening price before walking. Fair dealers bend a lot; lowballers barely move.
const ARCHETYPES = [
  { key: 'fair',    label: 'Fair Dealer',    buyMult: 0.85, sellMult: 1.05, flex: 0.80, vibe: 'friendly and reasonable — fair both ways' },
  { key: 'sharp',   label: 'Sharp Trader',   buyMult: 0.60, sellMult: 1.35, flex: 0.45, vibe: 'shrewd — but stocks the deepest high-end & graded bins' },
  { key: 'whale',   label: 'High Roller',    buyMult: 0.90, sellMult: 1.6,  flex: 0.55, vibe: 'deals in the big stuff — and pays TOP dollar for yours' },
  { key: 'newbie',  label: 'Newer Vendor',   buyMult: 0.75, sellMult: 0.95, flex: 0.65, vibe: 'eager but green — sells under market, sometimes misprices a gem' },
  { key: 'fleecer', label: 'Lowballer',      buyMult: 0.35, sellMult: 1.8,  flex: 0.20, vibe: 'a shark — gouges on everything, but now and then fumbles a price' },
]
const ARCH_BY_KEY = Object.fromEntries(ARCHETYPES.map(a => [a.key, a]))
export function archetype(key) { return ARCH_BY_KEY[key] || ARCHETYPES[0] }

// ===== Recurring show vendors (rapport across the circuit) ===================
// A fixed roster of named dealers who RECUR across shows (injected into generated
// floors). Buying from them builds rapport (lifetime $ spent with that vendor), which
// earns a standing discount at their table + reveals more of their showcase — the
// show-floor sibling of distributor rapport and customer regulars. Their archetype is
// fixed, so a given vendor's character is the same every time you see them.
const SHOW_VENDOR_DEFS = [
  { name: 'Slab City',      archetype: 'sharp'  },
  { name: 'Rip City',       archetype: 'whale'  },
  { name: 'Binder Bros',    archetype: 'fair'   },
  { name: 'Chase Hunters',  archetype: 'sharp'  },
  { name: 'Gemstone Cards', archetype: 'fair'   },
  { name: 'Foil & Fortune', archetype: 'whale'  },
  { name: "Honest Hannah",  archetype: 'fair'   },
  { name: 'Lucky Pull Lou', archetype: 'newbie' },
]
// Rapport ladder by lifetime $ spent with a vendor. `disc` = standing discount on their
// asking prices; higher rapport also widens how much of their showcase they'll show you.
// Thresholds are reachable within a normal run (a roster vendor only shows up some shows, so
// a $8k top rung was almost never hit) — lowered so the discount ladder actually pays off.
export const VENDOR_RAPPORT = [
  { level: 0, name: 'Stranger', min: 0,    disc: 0,    color: '#8c97b8' },
  { level: 1, name: 'Familiar', min: 250,  disc: 0.05, color: '#5ec98a' },
  { level: 2, name: 'Regular',  min: 1200, disc: 0.09, color: '#5aa0ff' },
  { level: 3, name: 'Trusted',  min: 4500, disc: 0.14, color: '#ffcb05' },
]
export function vendorRapport(spend) {
  let r = VENDOR_RAPPORT[0]
  for (const l of VENDOR_RAPPORT) if ((spend || 0) >= l.min) r = l
  return r
}
export function nextVendorRapport(spend) { return VENDOR_RAPPORT.find(l => l.min > (spend || 0)) || null }
// Build the recurring roster once (persisted). Six of the named dealers, stable ids.
export function makeShowVendors() {
  return shuffle(SHOW_VENDOR_DEFS).slice(0, 6).map((d, i) => ({
    id: `sv${i}`, name: d.name, archetype: d.archetype,
  }))
}

// Resolve one haggle round. side 'buy' = you're buying from them (lower is better
// for you); 'sell' = they're buying from you (higher is better for you).
//   their  = their current price, market = fair value, yourOffer = your counter
//   flex   = archetype flex, round = 0-based round index (patience shrinks)
// Returns { accept, counter, walk } — accept their take, a counter to consider, or walkaway.
export function haggleRound({ side, their, market, yourOffer, flex, round, archKey }) {
  // best price they'd ever agree to = market nudged by remaining flex
  const patience = Math.max(0, flex * (1 - round * 0.34)) // they get firmer each round
  // BUYING: they won't sell below ~market — BUT never above what they're already asking
  // (a mispriced gem priced under market stays a steal; they don't get to raise it on you).
  // SELLING: they won't pay much over market, and never below their standing offer.
  const floorPrice = side === 'buy'
    ? Math.min(their, Math.max(market, their - (their - market) * flex))
    : Math.max(their, Math.min(market * 1.05, their + (market - their) * flex))
  // how good is your offer for them?
  const goodForThem = side === 'buy' ? yourOffer >= floorPrice : yourOffer <= floorPrice
  // PRIDE WALK: low-flex sharks/lowballers won't fold to a near-market offer on
  // the very first round — it'd betray their whole vibe. They posture instead,
  // countering off their opening price so you have to actually work them down.
  const proud = (archKey === 'fleecer' || archKey === 'sharp') && flex <= 0.45
  if (proud && round === 0 && goodForThem) {
    const nearMarket = side === 'buy'
      ? yourOffer <= market * 1.12   // you're trying to buy at ~market or below
      : yourOffer >= market * 0.88   // you're trying to sell at ~market or above
    if (nearMarket) {
      const counter = side === 'buy'
        ? round2(Math.max(floorPrice, their - (their - yourOffer) * 0.2)) // barely budge
        : round2(Math.min(floorPrice, their + (yourOffer - their) * 0.2))
      return { counter, pride: true }
    }
  }
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

// What sealed product (if any) a booth has on its table. Returns an array of
// { card-less sealed entry } with `set`, the product, a marked-up `_ask`, and an
// `_origin` tag for the UI. Buying it hands off to the same rip flow as the Vault.
//   - Most booths occasionally lay out a MODERN sealed pack/box at a vendor markup
//     (convenience: buy product at the show, but you pay over retail).
//   - Whales reliably stock a big-ticket sealed item (fits "only deals in the big stuff").
//   - Any booth has a small shot at an occasional VINTAGE sealed pack — so the Vault isn't
//     the only place to find sealed vintage.
// `r` is the show's seeded rng so the floor stays stable as you walk it.
function boothSealed(r, arch, band = [1, 100]) {
  const out = []
  const isWhale = arch.key === 'whale'
  // Modern sealed: whales always lay boxes out; others reliably have SOMETHING sealed on the
  // table now (a show floor should be full of sealed product). A single modern pack tier plus
  // a good shot at a second modern item, so most booths carry a couple of options.
  const addModern = (boxes) => {
    const set = pickR(r, SHOP_SETS)
    const prods = setProducts(set)
    const pool = boxes ? prods.filter(p => p.packs >= 9) : prods.filter(p => p.packs <= 6)
    const base = (pool.length ? pickR(r, pool) : pickR(r, prods))
    const markup = 1.12 + r() * (boxes ? 0.33 : 0.18)
    out.push({ set, product: base, _ask: round2(base.price * markup), _origin: 'modern' })
  }
  if (isWhale || r() < 0.62) addModern(isWhale)       // most tables now stock modern sealed
  if (r() < 0.30) addModern(isWhale || r() < 0.4)     // a good chunk carry a second item too
  // Aftermarket FINDS: older sealed (Team Up, Evolutions, Fates Collide, the Zygarde /
  // Mega Gyarados boxes…) you "can still kinda find" — a vendor often has an old ETB / box /
  // tin on the table at a collector's markup.
  if (SECONDARY_SETS.length && r() < 0.38) {
    const sSet = pickR(r, SECONDARY_SETS)
    const prods = setProducts(sSet)
    const product = prods.length ? prods[Math.floor(r() * prods.length)] : null
    if (product) {
      const markup = 1.10 + r() * 0.25
      out.push({ set: sSet, product, _ask: round2((product.price || 0) * markup), _origin: 'aftermarket' })
    }
  }
  // A surprise vintage sealed pack on a regular table — any booth at any show.
  if (VINTAGE_SETS.length && r() < 0.16) {
    const vSet = pickR(r, VINTAGE_SETS)
    const product = vintageProduct(vSet)
    const markup = 1.2 + r() * 0.5
    out.push({ set: vSet, product, _ask: round2(product.price * markup), _origin: 'vintage' })
  }
  // MYSTERY PACKS: repackaged grab-bags — pay a fixed price, get one random pull (usually a
  // single, occasionally a sealed product) whose value lands somewhere in the pack's band
  // (usually a small loss, sometimes a jackpot). A show-floor staple. Prices are CAPPED at
  // real repack money — a bigger show means a slightly nicer pack, not a $10k gamble; nobody
  // repacks five figures into a grab-bag. Basic is common; premium less so; big shows
  // sometimes lay out a high-roller repack.
  const [, hi] = band
  const clampP = (x, lo2, hi2) => round2(Math.min(hi2, Math.max(lo2, x)))
  const basicPrice = clampP(hi * 0.06, 5, 20)
  if (r() < 0.5) out.push({ mystery: true, key: 'basic', name: 'Mystery Pack', icon: '❓',
    price: basicPrice, band: [round2(basicPrice * 0.25), round2(basicPrice * 3)],
    blurb: 'One random pull — could be bulk, could be a banger, could even be sealed.' })
  const premPrice = clampP(hi * 0.2, 20, 100)
  if (r() < 0.22) out.push({ mystery: true, key: 'premium', name: 'Premium Mystery Pack', icon: '🎁',
    price: premPrice, band: [round2(premPrice * 0.35), round2(premPrice * 4)],
    blurb: 'A pricier grab-bag — bigger floor, bigger ceiling. Sometimes hides sealed product.' })
  // High-roller repack: only where serious money walks the floor (value band tops $1k+).
  if (hi >= 1200 && r() < 0.18) {
    const hrPrice = clampP(hi * 0.01, 150, 400)
    out.push({ mystery: true, key: 'highroller', name: 'High Roller Repack', icon: '💎',
      price: hrPrice, band: [round2(hrPrice * 0.5), round2(hrPrice * 6)],
      blurb: 'The serious gamble — a real chase piece or sealed heat is in some of these.' })
  }
  return out
}

// `dayOffset` re-rolls the floor for each day of a multi-day show — different
// vendors/stock show up day to day. `roster` is the recurring show-vendor list (their
// identities get injected into some booths so you see familiar faces). `arrival` is when
// you walked the floor: 'open' (fresh, first dibs) or 'late' (picked-over but marked down).
export function generateBooths(show, notoriety, dayOffset = 0, roster = [], arrival = 'open', leads = []) {
  const r = rng((show.seed + dayOffset * 2654435761) >>> 0)
  const tier = SHOW_TIERS[show.tierKey]
  const [lo, hi] = tier.valueBand
  const n = tier.booths
  // Which recurring roster vendors are at THIS show (a seeded 2–4 of them), and in which
  // booth slots. Their identity + fixed archetype override the procedural pick for that slot.
  const recCount = roster.length ? Math.min(roster.length, n, 2 + Math.floor(r() * 3)) : 0
  const recPick = recCount ? shuffleR(r, roster).slice(0, recCount) : []
  // A vendor who DM'd you a pre-show hold is guaranteed to actually be here —
  // swap them into the recurring slots if the seeded draw left them out.
  for (const l of (leads || []).filter(x => x.kind === 'vendor')) {
    if (recPick.some(v => v.id === l.vendorId)) continue
    const v = roster.find(x => x.id === l.vendorId)
    if (v) { if (recPick.length < Math.max(1, Math.min(n, 4))) recPick.push(v); else recPick[recPick.length - 1] = v }
  }
  // Draw vendor names without replacement. If a show has more booths than names,
  // wrap to a fresh shuffle and tag with a "II"/"III" suffix so every full name
  // is still unique (no two bare "Rip City" tables). Roster vendors present at THIS
  // show keep their name exclusive — no procedural doppelgänger table beside them.
  const recNames = new Set(recPick.map(v => v.name))
  const nameOrder = shuffleR(r, VENDOR_NAMES.filter(nm => !recNames.has(nm)))
  const SUFFIX = ['', ' II', ' III', ' IV']
  const vendorName = (i) => nameOrder[i % nameOrder.length] + SUFFIX[Math.floor(i / nameOrder.length)] || nameOrder[i % nameOrder.length]
  // Loose vintage singles surface in booth bins more often at bigger shows (the venues that
  // draw serious collectors). 0 at meetups → meaningful at Worlds. This is where you hunt
  // raw vintage — you can't buy these sets in the shop.
  const VINTAGE_SINGLE_CHANCE = { meetup: 0, shop: 0.04, regional: 0.08, national: 0.13, invitational: 0.18, worlds: 0.25 }
  const vintageChance = VINTAGE_SINGLE_CHANCE[show.tierKey] || 0
  const booths = []
  for (let i = 0; i < n; i++) {
    // A recurring roster vendor claims this slot (fixed character), else a procedural one.
    const rec = recPick[i] || null
    const arch = rec ? archetype(rec.archetype) : pickR(r, ARCHETYPES)
    // Bigger booths now: a deep bin of commons/uncommons + a few hits.
    const stockN = 14 + Math.floor(r() * 18) // 14–31 cards
    const stock = []
    // Repeat guards for THIS table: high-band graded stock comes from a finite pool of
    // real PSA comps (dedupe by card+grade), and pricier raw singles shouldn't stack
    // either (dupe COMMONS are fine — real bins are full of them).
    const seenSlabs = new Set()
    const seenIds = new Set()
    for (let j = 0; j < stockN; j++) {
      const roll = r()
      let card
      // A small slice of the bin is a loose VINTAGE single (Base Charizard etc.) at bigger
      // shows — drawn from the vintage pool instead of the shop pool.
      if (vintageChance && r() < vintageChance) {
        card = vintageCardInRange(lo, hi * 3, r, seenIds) || null // vintage skews pricey; widen the band
      }
      // Hit density varies by archetype — this is a REASON to pick a vendor. SHARP traders
      // are shrewd operators who corner the good stuff: their bins run far deeper in high-end
      // singles and graded slabs (you pay their premium, but they're where the chase cards
      // ARE). Whales always deal big; everyone else runs a normal ~15% hit rate.
      // The hit band floor sits low (15% of the tier cap) so elite tiers draw from the
      // whole real-comp spread instead of exhausting the handful of top comps.
      const hitChance = arch.key === 'sharp' ? 0.38 : 0.15
      if (!card) {
        if (arch.key === 'whale' || roll < hitChance) {
          card = gradedCardInRange(hi * 0.15, hi, 8 + Math.floor(r() * 3), r, seenSlabs)
        } else {
          // The BIN is a spread, not wall-to-wall chase cards — an elite tier means the
          // top showcase is bigger, not a four-figure floor on every sleeve. Half the
          // bin draws from the tier's band; half from the wider spread beneath it
          // (there are plenty of real vintage + modern cards at every price in between).
          const bulkLo = r() < 0.5 ? lo : lo * (0.05 + r() * 0.25)
          card = cardInValueRange(bulkLo, hi * (0.4 + r() * 0.6), r, seenIds)
        }
      }
      if (card?.grade) seenSlabs.add(`${card.id}|${card.grade.overall}`)
      else if (card && (card.price ?? 0) >= 300) seenIds.add(card.id)
      // Price against the card's TRUE value (grade-aware) — a slabbed gem is
      // worth its graded value, not its raw value, so the ask tracks that.
      const worth = cardValue(card)
      let ask = worth * arch.sellMult
      if (arch.key === 'newbie' && r() > 0.7) ask = worth * 0.5 // mispriced gem!
      // FLEECER steal: a greedy lowballer overprices everything — but every so often fumbles a
      // price and tags a real piece dirt cheap (they misjudged it). It's the ONE reason to dig
      // through a lowballer's bin: the rare mislabeled grail. Worth-gated so it lands on
      // something worth grabbing, not a 25¢ common.
      if (arch.key === 'fleecer' && worth >= Math.max(5, lo * 3) && r() < 0.12) ask = worth * (0.4 + r() * 0.2)
      card._ask = Math.max(0.25, Math.round(ask * 100) / 100)
      card._mispriced = ask < worth * 0.7 && (arch.key === 'newbie' || arch.key === 'fleecer')
      stock.push(card)
    }
    let boothStock = stock
    // LATE arrival: the best 1–2 pieces got snapped up by early birds, and the vendor marks
    // the rest down to move it before teardown. OPEN: everything's fresh and you get first dibs.
    if (arrival === 'late') {
      const top = [...boothStock].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 1 + Math.floor(r() * 2))
      const gone = new Set(top.map(c => c.uid))
      boothStock = boothStock.filter(c => !gone.has(c.uid))
      const markdown = 0.85 + r() * 0.07 // ~8–15% off to clear
      for (const c of boothStock) c._ask = Math.max(0.25, round2(c._ask * markdown))
    }
    // Highlight the booth's priciest pieces as featured "showcase" cards — skipping
    // same-NAME repeats (two different Charizards are distinct cards, but a showcase
    // reading "Charizard · Houndoom · Charizard" looks like a dupe to a shopper).
    const byVal = [...boothStock].sort((a, b) => cardValue(b) - cardValue(a))
    const featNames = new Set()
    for (const c of byVal) {
      if (featNames.size >= 3) break
      if (featNames.has(c.name)) continue
      c._highlight = true
      featNames.add(c.name)
    }
    booths.push({
      id: `${show.id}-b${i}`,
      name: rec ? rec.name : vendorName(i),
      vendorId: rec ? rec.id : undefined, // recurring roster vendor (rapport applies)
      recurring: !!rec,
      archetype: arch.key,
      archLabel: arch.label,
      vibe: arch.vibe,
      buyMult: arch.buyMult,   // how much they'll pay for YOUR cards
      stock: boothStock,
      products: boothSealed(r, arch, tier.valueBand),  // sealed + mystery packs on the table (may be empty)
      // grid position assigned by the floor layout
    })
  }

  // --- VINTAGE IS ALWAYS AT SHOWS ---------------------------------------------
  // There's no more dedicated Vintage Vault — vintage sealed just turns up on regular booth
  // tables (see boothSealed, ~16% per booth). To GUARANTEE it every show, make sure at least
  // one booth is holding a sealed vintage pack; if the random rolls produced none, inject one
  // onto a random regular table. Bigger shows draw more (scaled markup). So: shows always have
  // vintage to hunt, on top of what rotates through your shop vendors during the week.
  if (VINTAGE_SETS.length && booths.length) {
    const already = booths.some(b => (b.products || []).some(p => p._origin === 'vintage'))
    if (!already) {
      const vSet = pickR(r, VINTAGE_SETS)
      const product = vintageProduct(vSet)
      const markup = 1.15 + r() * (show.tierKey === 'worlds' ? 0.9 : 0.45)
      const entry = { set: vSet, product, _ask: round2(product.price * markup), _origin: 'vintage' }
      const regs = booths.filter(b => !b.special)
      const target = regs.length ? regs[Math.floor(r() * regs.length)] : booths[0]
      target.products = [...(target.products || []), entry]
    }
  }

  // --- PRE-SHOW VENDOR HOLDS ----------------------------------------------------
  // A dealer who messaged you before the show has the promised sealed waiting on
  // their table, at the price they quoted (locked when they DM'd you — a real favor
  // vs the usual 1.15×+ show markup). Flagged so the booth + directory can show it.
  for (const l of (leads || []).filter(x => x.kind === 'vendor')) {
    const booth = booths.find(b => b.vendorId === l.vendorId)
    const set = setById(l.setId)
    const product = set ? vintageProduct(set) : null
    if (!booth || !set || !product) continue
    booth.products = [{ set, product, _ask: l.price, _origin: 'vintage', _lead: true }, ...(booth.products || [])]
    booth.leadNote = `holding a ${product.type} of ${set.name} for you — $${(l.price ?? 0).toFixed(2)}`
  }

  // --- ON-SITE GRADING KIOSK ---------------------------------------------------
  // Big shows (National+) host a grading service booth: submit a raw card and it comes back
  // graded in ~2 days (vs the mail-in wait) — for a premium fee. Always present at these tiers.
  if (['national', 'invitational', 'worlds'].includes(show.tierKey)) {
    booths.push({
      id: `${show.id}-kiosk`,
      name: 'On-Site Grading Kiosk',
      archetype: 'kiosk', archLabel: 'Grading Service',
      vibe: 'a pop-up grading service — slabs while you shop',
      special: 'kiosk',
      buyMult: 0,
      stock: [],
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

// Visitor flavor by channel. Split into pools that match the encounter KIND so a
// "just got fleeced next door" visitor never shows up asking a calm price-quiz:
//   base    — neutral browsers/buyers, safe for any encounter
//   fleeced — only used by the "someone got fleeced" branch
// Each channel's general pool = base (the fleeced flavor is added per-branch).
const VISITOR_NAMES = {
  show: ['a wide-eyed kid','a seasoned collector','a nervous first-timer','a hyped teenager',
    'an old-school player','a parent shopping for their kid','a competitive grinder','a casual browser',
    'a livestreamer','a bargain hunter','a returning customer'],
  walkin: ['a regular','a kid with birthday money','a local collector','a curious passer-by',
    'a parent and their kid','a dad after work','a TikTok follower who found your shop','a deck-builder'],
  online: ['a Reddit buyer','an eBay watcher','a Discord trader','an Instagram DM','a Facebook Marketplace user',
    'a Mercari shopper','a TCGplayer buyer','a forum lurker','a Twitter mutual'],
}
// Visitors specific to the "got fleeced/scammed" branch.
const FLEECED_VISITORS = {
  show: ['someone who just got fleeced next door','a kid who overpaid at another booth','a collector burned on a bad trade'],
  walkin: ['a neighbor who got scammed online','a regular who paid too much elsewhere'],
  online: ['a trader who just got burned','a buyer scammed in a Discord deal','someone who overpaid on eBay'],
}
function visitorFor(channel, kind) {
  if (kind === 'fleeced') return pickAny(null, FLEECED_VISITORS[channel] || FLEECED_VISITORS.show)
  return pickAny(null, VISITOR_NAMES[channel] || VISITOR_NAMES.show)
}
// In-person walk-in customers at your STORE pay a premium over online buyers — no shipping,
// they can hold it, and impulse is real. This is a core reason to run a brick-and-mortar shop:
// the same card sells for more across your counter than in a web listing. Applied at sale
// resolution to walk-in sale/counter/browse effects (see store/booth.resolveEncounter).
export const STORE_SALE_PREMIUM = 0.12
// Online buyers can\'t hand you cash. In-person can use anything you accept.
const ONLINE_METHODS = ['venmo', 'paypal', 'card']
const INPERSON_METHODS = ['cash', 'venmo', 'card', 'paypal']

// --- Notoriety as a DOUBLE-EDGED sword ---------------------------------------
// Fame changes WHO comes to your door, not just how many. The upside: WHALES — deep-
// pocketed collectors who pay real premiums for your best piece and don't haggle. The
// downsides: NAME-DROP LOWBALLERS who invoke your reputation to talk you down, and more
// SCAMMERS targeting a known name (see the sealed-deal frequency scaling in boothEncounter).
const WHALE_NOTO_GATE = 100   // whales start showing up once you've got a real name
const WHALE_MIN_VALUE = 40    // they only bother for a genuinely worthwhile piece
const NAMEDROP_NOTO_GATE = 60 // chancers start name-dropping your rep on lowballs around here
const WHALE_NAMES = ['a deep-pocketed whale', 'a serious collector with a fat wallet', 'a big-money buyer',
  'a hedge-fund hobbyist', 'a well-known set completist', 'a flush returning client']

function pickAny(r, arr) { return arr[Math.floor((r ?? Math.random)() * arr.length)] }
// Some ONLINE buyers won't budge on how they pay — a share insist on their preferred rail
// (PayPal / a card), and if you can't take it the sale is LOST. That's exactly what the
// PayPal / Credit-Card upgrades capture: more rails you accept → fewer online buyers walk.
// In-person buyers (show/walk-in) are flexible, so we keep steering them to a method you can
// take. Venmo is always accepted, so an insistent Venmo buyer never costs you a sale.
const PAYMENT_INSIST_RATE = 0.30
function pickPayMethod(channel, accepted) {
  const pool = channel === 'online' ? ONLINE_METHODS : INPERSON_METHODS
  if (accepted) {
    // online insister: pick their true preference from the full pool (may be one you lack)
    if (channel === 'online' && Math.random() < PAYMENT_INSIST_RATE) return pickAny(null, pool)
    const ok = pool.filter(m => accepted.has(m))
    if (ok.length) return pickAny(null, ok)
  }
  return pickAny(null, pool)
}

// Build a MANY-TO-MANY trade proposal. They want a bundle of YOUR items (cards and/or held
// sealed, from `offerPool` + `sealedPool`) and offer a bundle of real cards of theirs near the
// same total value, with a cash adjustment to balance. Fairness tilts with notoriety/luck:
// ~60% are roughly even ("fair"), the rest tilt in THEIR favor (they short you on the cash).
// Returns { yours:[{kind,item}], theirs:[cards], cashAdj, fair } or null if nothing tradeable.
//   cashAdj > 0 → they add cash to you · < 0 → you add cash to them · 0 → straight swap
export function makeTradeOffer(offerPool, notoriety, sealedPool = []) {
  const candidates = [
    ...(offerPool || []).map(c => ({ kind: 'card', item: c, val: cardValue(c) })),
    ...(sealedPool || []).map(it => ({ kind: 'sealed', item: it, val: sealedValue(it) })),
  ].filter(x => x.val > 0)
  if (!candidates.length) return null
  // Your side: 1–3 of your items (more only when you have them to give).
  const nYours = Math.min(candidates.length, 1 + (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0))
  const yours = sampleN(candidates, nYours)
  const yoursVal = yours.reduce((a, y) => a + y.val, 0)
  if (yoursVal <= 0) return null
  // Their side: 1–3 cards whose total sits in a band around your bundle's value.
  const nTheirs = 1 + (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0)
  const theirs = []
  let budget = yoursVal * (0.85 + Math.random() * 0.5) // aim near your value, spread across their cards
  for (let i = 0; i < nTheirs; i++) {
    const left = nTheirs - i
    const share = i === nTheirs - 1 ? budget : (budget / left) * (0.7 + Math.random() * 0.6)
    const lo = Math.max(0.25, share * 0.6)
    const hi = Math.max(lo + 0.5, share * 1.4)
    const c = cardInValueRange(lo, hi)
    theirs.push(c); budget = Math.max(0, budget - cardValue(c))
  }
  const theirsVal = theirs.reduce((a, c) => a + cardValue(c), 0)
  // a fair trade balances the value gap with cash; an unfair one shorts you. Higher
  // notoriety → more often you get a fair counterpart (people deal you straight).
  const fair = Math.random() < (0.5 + Math.min(0.35, notoriety / 300))
  const gap = round2(yoursVal - theirsVal) // +: their bundle is worth less, they should add cash
  // fair: cash closes the gap. unfair: they pay ~55% of what they owe, or overcharge ~40%
  // extra when YOU'd owe — always tilted their way.
  const cashAdj = fair ? gap : round2(gap >= 0 ? gap * 0.55 : gap * 1.4)
  return { yours, theirs, cashAdj, fair }
}

// Sample up to n distinct entries from an array (no mutation of the source).
function sampleN(arr, n) {
  const pool = [...arr]
  const out = []
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  return out
}
// Join names as "A", "A & B", or "A, B & C".
function listAnd(names) {
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

// --- Inbound sealed deals ----------------------------------------------------
// A stranger DMs you offering to SELL you sealed product below market — sometimes a
// genuine steal, sometimes a scam (you pay and get an empty box / a resealed fake). The
// outcome (`deal.fake`) is rolled HERE and hidden in the encounter; the player decides on
// the TELLS alone. Those tells CORRELATE with the risk so a sharp player can read a deal:
// a deeper discount, vintage product, and a no-feedback seller all push the fake odds up;
// an established seller (and your own notoriety) pushes them down. None of it is a tell
// that perfectly reveals the outcome — an honest sketchy-looking seller still exists.
const DEAL_SELLERS = [
  { who: 'a longtime forum regular',           tell: 'hundreds of clean transactions',          trust: 0.90, sketchy: false },
  { who: "a collector you've traded with",     tell: 'a solid track record with you',           trust: 0.72, sketchy: false },
  { who: 'a Discord stranger',                 tell: 'a pretty new account',                    trust: 0.42, sketchy: true  },
  { who: 'a brand-new marketplace account',    tell: 'zero feedback and a stock-photo listing', trust: 0.18, sketchy: true  },
]
function clampN(x, lo, hi) { return Math.max(lo, Math.min(hi, x)) }

export function makeSealedDeal(channel, notoriety = 0) {
  const online = channel === 'online'
  // ~30% vintage when any vintage set exists — juicier and scammier; the rest modern.
  const goVintage = VINTAGE_SETS.length && Math.random() < 0.3
  let set, product, origin
  if (goVintage) {
    set = pickAny(null, VINTAGE_SETS); product = vintageProduct(set); origin = 'vintage'
  } else {
    set = pickAny(null, SHOP_SETS)
    const prods = setProducts(set)
    const pool = prods.filter(p => p.packs <= 18) // packs / small boxes — what moves in a DM
    product = pickAny(null, pool.length ? pool : prods); origin = 'modern'
  }
  const reference = round2(product.price || 0)
  if (reference <= 0) return null
  // 10–45% under reference; the deeper the bait, the higher the fake odds.
  const disc = 0.10 + Math.random() * 0.35
  const ask = round2(reference * (1 - disc))
  const seller = pickAny(null, DEAL_SELLERS)
  const fakeProb = clampN(
    0.20 + disc * 0.8 + (origin === 'vintage' ? 0.18 : 0)
      - seller.trust * 0.5 - Math.min(0.12, notoriety / 700), // a known name gets scammed less
    0.03, 0.92)
  const fake = Math.random() < fakeProb
  // Fake QUALITY: most fakes are crude (an Authentication Kit nails them), but a
  // sophisticated minority (~30%) are good reseals it usually MISSES — so a GENUINE read
  // tilts the odds without ever being a guarantee. `detectability` = the chance the kit
  // correctly flags THIS fake; vintage reseals are harder still. 0 for a genuine item.
  let detectability = 0
  if (fake) {
    const sophisticated = Math.random() < 0.3
    detectability = sophisticated ? 0.45 : 0.92
    if (origin === 'vintage') detectability *= 0.8
    detectability = Math.round(detectability * 100) / 100
  }
  // Sketchy sellers insist on irreversible payment — a tell that correlates with risk.
  const pay = seller.sketchy ? (online ? 'venmo' : 'cash') : pickPayMethod(channel, null)
  const payTell = seller.sketchy
    ? (online ? " They'll only take Venmo F&F — no refunds." : ' Cash only, no receipt.')
    : ''
  const pct = Math.round(disc * 100)
  const logo = set.logo || null
  const what = origin === 'vintage'
    ? `a sealed ${product.name || set.name + ' pack'}`
    : `a ${product.type} of ${set.name}`
  const reversible = pay === 'card' || pay === 'paypal' // card/PayPal can be charged back; Venmo F&F / cash can't
  return {
    kind: 'sealedDeal',
    title: online ? `${cap(seller.who)} DMs you a deal` : `${cap(seller.who)} offers you sealed product`,
    body: `"Got ${what} I'll let go for $${ask.toFixed(2)} — ${pct}% under retail (~$${reference.toFixed(2)})."`
      + ` It's ${seller.tell}.${payTell} Could be a steal… or a fake.`,
    card: logo ? { name: product.type, img: logo, imgLarge: logo } : null,
    // Everything the deal modal + store actions need to resolve a buy / authenticate /
    // chargeback. `fake` is the hidden outcome; `reversible` decides chargeback eligibility.
    deal: { setId: set.id, product: { ...product }, ask, reference, fake, detectability, origin,
      payMethod: pay, reversible, sketchy: seller.sketchy, what },
  }
}

// Build an encounter. channel: 'show' | 'walkin' | 'online'.
// 'show' = at your table in the hall; 'walkin' = your physical store;
// 'online' = a remote buyer messaging you (the early game, from your house).
export function boothEncounter(notoriety, playerCollection, channel = 'show', accepted = null, listedCards = null, shelfCards = null, regulars = null, showSealedPool = null) {
  const roll = Math.random()
  const online = channel === 'online'
  const walkin = channel === 'walkin'
  // Sealed you brought to your booth is tradeable at a show (only there — no sealed on the
  // store shelf or in online DMs in this phase).
  const sealedPool = channel === 'show' ? (showSealedPool || []) : []
  // Who can buyers make offers on? Buyers only see what you've PUT OUT on that channel:
  //   online → your LISTINGS (listed/tweeted)
  //   walkin → your shop SHELF (display case — you choose what's out)
  //   show   → your booth table (playerCollection is the show inventory the caller passed)
  const offerPool = online ? (listedCards || []) : walkin ? (shelfCards || []) : playerCollection

  // 0a) A RETURNING REGULAR. Once you've earned a few repeat customers (see store.formRegular),
  // some visits are a familiar face instead of a stranger — and their encounter is targeted to
  // what they collect, scaled by how much they trust you. Only on your home turf (online DMs /
  // store walk-ins) in this phase; show-floor crowds stay anonymous.
  const homeRoster = (regulars || []).filter(r => r.channel === (walkin ? 'walkin' : 'online') && !r.flags?.burned)
  if (homeRoster.length && (online || walkin)) {
    const pReg = Math.min(0.6, homeRoster.length * 0.15) // more regulars → more often it's one of them
    if (Math.random() < pReg) {
      const reg = pickRegular(homeRoster)
      const enc = regularEncounter(reg, offerPool, channel, accepted, notoriety)
      if (enc) return enc
    }
  }

  // 0b) THE WHALE — the upside of fame. A high-notoriety vendor attracts deep-pocketed
  // collectors who pay a real premium for the best piece you have out and won't haggle. Home
  // channels only (online DMs / store walk-ins); its own roll so it doesn't shift the bands.
  if ((online || walkin) && notoriety >= WHALE_NOTO_GATE && offerPool.length) {
    const pWhale = Math.min(0.16, 0.05 + (notoriety - WHALE_NOTO_GATE) / 1200)
    if (Math.random() < pWhale) {
      const target = offerPool.reduce((a, b) => (cardValue(b) > cardValue(a) ? b : a))
      if (cardValue(target) >= WHALE_MIN_VALUE) {
        const market = cardValue(target)
        const offer = round2(market * (1.15 + Math.random() * 0.45)) // 1.15–1.60× — they pay up
        const pay = pickPayMethod(channel, accepted)
        const m = PAY_LABEL(pay)
        const who = pickAny(null, WHALE_NAMES)
        return {
          kind: 'offer',
          ownedUid: target.uid,
          title: online ? `${cap(who)} slides into your DMs` : `${cap(who)} makes a beeline for your case`,
          body: `"I hear you're the one to see. That ${target.name} — I want it and I don't haggle. `
            + `$${offer.toFixed(2)}, ${m}, right now." (Market: $${market.toFixed(2)})`,
          card: target,
          options: [
            { text: `Accept $${offer.toFixed(2)} (${m})`, tone: 'fair',
              effect: { type: 'sellOwned', uid: target.uid, price: offer, payMethod: pay, notoriety: 2,
                formSeed: mkSeed(target, channel), msg: 'The whale is thrilled — and whales talk to other whales.' } },
            { text: 'Hold out for more', tone: 'fair',
              effect: { type: 'none', notoriety: 0, msg: 'You let a paying whale walk away. Bold move.' } },
          ],
        }
      }
    }
  }

  // 0) Inbound sealed-product DEAL — a stranger offers to SELL you sealed below market
  // (sometimes a steal, sometimes a fake). Mostly online; rarer in person. Fires on its
  // OWN roll so it doesn't shift the offer/question/browse bands below it. A KNOWN name is a
  // bigger target: scammers seek you out more the more famous you get (the downside of fame).
  const scamChance = (online ? 0.20 : 0.08) + Math.min(online ? 0.12 : 0.08, notoriety / (online ? 900 : 1200))
  if ((online || walkin) && Math.random() < scamChance) {
    const deal = makeSealedDeal(channel, notoriety)
    if (deal) return deal
  }

  // 1) Someone got fleeced — make their day (online: got scammed in a trade)
  const fleecePool = offerPool.filter(c => { const v = cardValue(c); return v >= 2 && v <= 20 })
  if (roll < 0.22 && fleecePool.length) {
    const visitor = visitorFor(channel, 'fleeced')
    const want = pickAny(null, fleecePool)
    const setName = setNameOfCard(want)
    const pay = pickPayMethod(channel, accepted)
    return {
      kind: 'fleeced',
      ownedUid: want.uid,
      title: online ? `${cap(visitor)} messages you, frustrated` : `${cap(visitor)} approaches, looking dejected`,
      body: online
        ? `"I just got burned on a trade — paid way over for a beat-up card. I'm tapped out but I really wanted a ${want.name}${setName ? ` from ${setName}` : ''}…"`
        : `"I just paid way too much for a beat-up card at another booth. I'm basically out of money. I really wanted a ${want.name}${setName ? ` from ${setName}` : ''}…"`,
      card: want,
      options: [
        { text: `${online ? 'Mail' : 'Give'} them the ${want.name} for free`, tone: 'kind',
          effect: { type: 'giveOwned', uid: want.uid, card: want, notoriety: 6, formSeed: mkSeed(want, channel, true), msg: 'You made their whole week. Word spreads fast.' } },
        { text: `Sell it at cost ($${rawValue(want).toFixed(2)})`, tone: 'fair',
          effect: { type: 'sellOwned', uid: want.uid, card: want, price: rawValue(want), payMethod: pay, notoriety: 2, formSeed: mkSeed(want, channel, true), msg: 'A fair deal earns quiet respect.' } },
        { text: online ? 'Leave them on read' : 'Shrug — not your problem', tone: 'cold',
          effect: { type: 'none', notoriety: -1, msg: 'They move on. Not a great look.' } },
      ],
    }
  }

  // 2) Lowball / good offer ON one of your cards. Online buyers can only offer on
  // cards you've LISTED/tweeted (offerPool); in-person can offer on anything you own.
  if (roll < 0.5 && offerPool.length) {
    const visitor = visitorFor(channel, 'offer')
    const target = pickAny(null, offerPool)
    const market = cardValue(target) // grade-aware — offers track the card's real worth
    const good = Math.random() > 0.5
    let offer = Math.round(market * (good ? (1.05 + Math.random()*0.4) : (0.4 + Math.random()*0.3)) * 100) / 100
    const pay = pickPayMethod(channel, accepted)
    const m = PAY_LABEL(pay)
    // NAME-DROP LOWBALLER — a downside of fame. Once you're a known name, chancers invoke
    // your reputation to talk you DOWN ("you're big, you can spare it"). Only on lowballs.
    const nameDrop = !good && notoriety >= NAMEDROP_NOTO_GATE && Math.random() < 0.4
    if (nameDrop) offer = Math.round(offer * 0.9 * 100) / 100
    const lowBody = nameDrop
      ? `"Come on, everyone knows you're THE shop now — you can let this ${target.name} go cheap. $${offer.toFixed(2)}, ${m}. Do a little guy a solid." (Market: $${market.toFixed(2)})`
      : `"Eh, that ${target.name}'s pretty common. I'll take it for $${offer.toFixed(2)}, ${m}." (Market: $${market.toFixed(2)})`
    return {
      kind: 'offer',
      ownedUid: target.uid, // so the encounter can be re-validated if you sell it first
      title: online ? `${cap(visitor)} wants your ${target.name}` : `${cap(visitor)} eyes your ${target.name}`,
      body: good
        ? `"That ${target.name} is exactly what I need. I'll give you $${offer.toFixed(2)}, paying by ${m}." (Market: $${market.toFixed(2)})`
        : lowBody,
      card: target,
      options: [
        { text: `Accept $${offer.toFixed(2)} (${m})`, tone: good ? 'fair' : 'cold',
          effect: { type: 'sellOwned', uid: target.uid, price: offer, payMethod: pay, notoriety: good ? 1 : 0, formSeed: good ? mkSeed(target, channel) : undefined, msg: good ? 'Clean sale, happy customer.' : 'You took the lowball. Cash is cash.' } },
        { text: 'Politely decline', tone: 'fair',
          effect: { type: 'none', notoriety: good ? -1 : 1, msg: good ? 'They leave disappointed.' : 'Holding firm on value builds your reputation.' } },
        ...(good ? [] : [{ text: `Counter at market ($${market.toFixed(2)})`, tone: 'fair',
          effect: { type: 'counter', uid: target.uid, price: market, payMethod: pay, chance: 0.6, notoriety: 2, msg: 'They grumble but pay fair value.' } }]),
      ],
    }
  }

  // 2b) A TRADE: they want one of your cards and offer a card of theirs (± cash to
  // balance). Card-for-card is the signature Pokémon deal. Their fairness tilts with
  // savvy: a shark proposes lopsided swaps in their favor; a fair dealer evens it out.
  // Only in-person/at-a-show (you can see each other's cards) and only if you own
  // something tradeable. ~12% band (0.50–0.62).
  if (!online && roll < 0.62 && (offerPool.length || sealedPool.length)) {
    const trade = makeTradeOffer(offerPool, notoriety, sealedPool)
    if (trade) {
      const visitor = visitorFor(channel, 'offer')
      const { yours, theirs, cashAdj, fair } = trade
      // cashAdj > 0: they ADD cash to you; < 0: you add cash to them; 0: straight swap
      const cashLine = cashAdj > 0 ? ` + $${cashAdj.toFixed(2)} your way`
        : cashAdj < 0 ? ` if you add $${(-cashAdj).toFixed(2)}`
        : ' — straight up'
      const give = yours.map(y => ({ kind: y.kind, uid: y.item.uid }))
      const giveCards = yours.filter(y => y.kind === 'card').map(y => y.item)
      const giveSealed = yours.filter(y => y.kind === 'sealed').map(y => y.item)
      const yoursNames = yours.map(y => y.kind === 'sealed' ? y.item.product.type : y.item.name)
      const theirsNames = theirs.map(c => c.name)
      const yoursVal = yours.reduce((a, y) => a + y.val, 0)
      const theirsVal = theirs.reduce((a, c) => a + cardValue(c), 0)
      const seedCard = yours.find(y => y.kind === 'card')?.item // regulars form off a real card
      const cashTag = cashAdj > 0 ? ` (+$${cashAdj.toFixed(2)})` : cashAdj < 0 ? ` (−$${(-cashAdj).toFixed(2)})` : ''
      return {
        kind: 'trade',
        ownedUid: yours[0].item.uid,     // re-validate the primary item
        title: `${cap(visitor)} wants to trade`,
        body: `"I'll trade you my ${listAnd(theirsNames)} for your ${listAnd(yoursNames)}${cashLine}." `
          + `(Theirs ~$${theirsVal.toFixed(2)} · yours ~$${yoursVal.toFixed(2)})`,
        // Bundle payload for the modal (arrays); `card`/`yourCard` kept for legacy single render.
        giveCards, giveSealed, theirs, cashAdj,
        card: theirs[0] || null,
        yourCard: giveCards[0] || null,
        options: [
          { text: `Trade my ${yours.length} for their ${theirs.length}${cashTag}`,
            tone: fair ? 'fair' : 'cold',
            effect: { type: 'trade', give, theirs, cashAdj, notoriety: fair ? 1 : 0,
              formSeed: fair && seedCard ? mkSeed(seedCard, channel) : undefined,
              msg: fair ? 'A clean trade — both walk away happy.' : 'You took the deal. Cards are cards.' } },
          { text: 'Pass on the trade', tone: 'fair',
            effect: { type: 'none', notoriety: fair ? -1 : 1, msg: fair ? 'They shrug and move on.' : 'Smart — that swap favored them.' } },
        ],
      }
    }
  }

  // 3) A question about a card
  if (roll < 0.72) {
    const visitor = visitorFor(channel, 'question')
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

  // 4) Generic browse → small sale chance. Which of YOUR cards can they actually buy?
  //   show   → your show table (showInventory): only what you brought to the booth.
  //   online → your LISTINGS: an online shopper can only buy what you've put up for sale.
  //   walkin → your shop SHELF (display case): only what you've put out on display.
  // The store resolves `browseSale` against the pool named here. With nothing put out on
  // the relevant channel there's nothing to browse, so we skip the sale.
  const pool = channel === 'show' ? 'show' : online ? 'listings' : 'shop'
  // Online/walk-in buyers only buy what you've PUT OUT (listings / shop shelf). With nothing
  // out there's nothing to sell them — fall back to a price-check so the visit still does
  // something (no phantom sale from your private collection).
  const putOut = online ? (listedCards || []) : walkin ? (shelfCards || []) : null
  if ((online || walkin) && !(putOut && putOut.length)) {
    const v = visitorFor(channel, 'question')
    const q = cardInValueRange(0.5, 60)
    const realMid = rawValue(q)
    const opts = shuffle([{ v: realMid, ok: true }, { v: round2(realMid*3), ok: false }, { v: round2(realMid*0.3), ok: false }])
    const where = online ? 'up for sale' : 'out on the shelf'
    const nudge = online ? '(List some cards to start selling online!)' : '(Put some cards out on the shelf to start selling in-store!)'
    return {
      kind: 'question',
      title: `${cap(v)} asks for a price check`,
      body: `"You don't have anything ${where} right now, but — any idea what a ${q.name} goes for?"`,
      card: q,
      options: opts.map(o => ({
        text: `"Around $${o.v.toFixed(2)}."`, tone: 'fair',
        effect: o.ok
          ? { type: 'none', notoriety: 2, msg: `Spot on — they appreciate the help. ${nudge}` }
          : { type: 'none', notoriety: -1, msg: `Not quite — it's closer to $${realMid.toFixed(2)}.` },
      })),
    }
  }
  const visitor = visitorFor(channel, 'browse')
  const pay = pickPayMethod(channel, accepted)
  return {
    kind: 'browse',
    title: online ? `${cap(visitor)} is scrolling your listings` : `${cap(visitor)} stops to browse your case`,
    body: online ? '"Got any deals? Just browsing your store."' : '"Nice setup. Mind if I look?"',
    card: null,
    options: [
      { text: online ? 'Send a friendly note + deal' : 'Give them a warm welcome', tone: 'kind',
        effect: { type: 'browseSale', pool, payMethod: pay, chance: 0.5 + Math.min(0.4, notoriety/200), notoriety: 1, msg: 'Friendliness pays off.' } },
      { text: online ? 'Let them browse' : 'Let them browse in peace', tone: 'fair',
        effect: { type: 'browseSale', pool, payMethod: pay, chance: 0.3, notoriety: 0, msg: 'They look around quietly.' } },
    ],
  }
}

// --- Brick-and-mortar walk-in REQUESTS ---------------------------------------
// A walk-in asks for a SPECIFIC thing (a sealed product or a single). If it's on your SHELF
// → instant, happy sale. If it's in the BACK (your collection / held inventory) → you can grab
// it. If you don't have it AT ALL → they leave disappointed (a demand signal + small rep ding).
// ~55% of requests are for something you actually have, so keeping stock stocked pays off.
// The premium is already baked into the returned price (in-store premium + a "came for it"
// bump), so resolveEncounter charges effect.price as-is (no double premium).
const REQUEST_PREMIUM = 0.06
export function makeShopRequest(s, accepted = null) {
  const pay = pickPayMethod('walkin', accepted)
  const visitor = visitorFor('walkin', 'offer')
  const priceFor = (base) => round2((base || 0) * (1 + STORE_SALE_PREMIUM + REQUEST_PREMIUM))

  // Assemble the encounter once the desired item + its location are known.
  //   loc: 'shelf' (on display) | 'back' (owned, not out) | 'none' (don't own it)
  function build({ label, article, img, price, loc, kind, uid }) {
    const has = loc === 'shelf' || loc === 'back'
    const options = has
      ? [
          { text: loc === 'shelf' ? `Ring it up — $${price.toFixed(2)}` : `Grab it from the back — $${price.toFixed(2)}`,
            tone: 'kind',
            effect: { type: 'fulfillRequest', kind, uid, price, payMethod: pay, fromShelf: loc === 'shelf',
              notoriety: loc === 'shelf' ? 2 : 1,
              msg: loc === 'shelf' ? 'Rang it up right off the shelf — happy customer! 😄' : 'Grabbed it from the back — sale made! 🙂' } },
          { text: "Tell them it's not for sale", tone: 'fair',
            effect: { type: 'none', notoriety: 0, msg: 'They shrug and move on — you had it but passed.' } },
        ]
      : [
          { text: "Apologize — you don't have it", tone: 'fair',
            effect: { type: 'requestMiss', what: label, notoriety: -1, msg: `You don't stock ${article} ${label}. They leave disappointed. 😞` } },
          { text: 'Offer to try and get one in', tone: 'kind',
            effect: { type: 'requestMiss', what: label, notoriety: 0, msg: `You take their number and promise to hunt one down. Stock ${label} to catch this demand.` } },
        ]
    return {
      kind: 'request', channel: 'walkin', // no ownedUid → never auto-pruned; the sell option re-validates on click
      title: `${cap(visitor)} is after something`,
      body: has
        ? `"Hey — you got ${article} ${label}? I've been hunting one."`
        : `"You carry ${article} ${label} by any chance? Been looking everywhere."`,
      card: img ? { name: label, img, imgLarge: img } : null,
      options,
    }
  }

  const wantSealed = Math.random() < 0.5
  if (wantSealed) {
    // Items HELD for a regular are behind the counter — not sellable to a walk-in.
    const sealedOut = (s.shopSealed || []).filter(it => !it._heldFor)
    const shelf = sealedOut.map(it => ({ it, loc: 'shelf' }))
    const back = (s.sealedInventory || []).map(it => ({ it, loc: 'back' }))
    const have = [...shelf, ...back]
    if (have.length && Math.random() < 0.55) {
      const { it, loc } = pickAny(null, have)
      const set = setById(it.setId)
      return build({ label: `${it.product.type} of ${set?.name || 'that set'}`, article: 'a', img: set?.logo || null,
        price: priceFor(sealedValue(it)), loc, kind: 'sealed', uid: it.uid })
    }
    // a random product they want — maybe you happen to have it, usually not
    const set = pickAny(null, SHOP_SETS)
    const prod = pickAny(null, setProducts(set))
    const onShelf = sealedOut.find(x => x.setId === set.id && x.product.type === prod.type)
    const inBack = (s.sealedInventory || []).find(x => x.setId === set.id && x.product.type === prod.type)
    const hit = onShelf || inBack
    return build({ label: `${prod.type} of ${set.name}`, article: 'a', img: set.logo || null,
      price: priceFor(hit ? sealedValue(hit) : prod.price),
      loc: onShelf ? 'shelf' : inBack ? 'back' : 'none', kind: 'sealed', uid: hit?.uid })
  }

  // singles — the "shelf" is the display case PLUS any card listed everywhere
  // (online + in-store): a walk-in can be rung up for those on the spot too.
  // Cards HELD for a regular sit behind the counter and are off-limits.
  const caseCards = [...(s.shopDisplay || []).filter(c => !c._heldFor), ...omniShelfCards(s.listings)]
  const shelf = caseCards.map(c => ({ c, loc: 'shelf' }))
  const back = (s.collection || []).map(c => ({ c, loc: 'back' }))
  const have = [...shelf, ...back]
  if (have.length && Math.random() < 0.55) {
    const { c, loc } = pickAny(null, have)
    return build({ label: c.name, article: 'a', img: c.img, price: priceFor(cardValue(c)), loc, kind: 'card', uid: c.uid })
  }
  const want = cardInValueRange(1, 300)
  const onShelf = caseCards.find(x => x.id === want.id)
  const inBack = (s.collection || []).find(x => x.id === want.id)
  const hit = onShelf || inBack
  return build({ label: want.name, article: 'a', img: want.img,
    price: priceFor(hit ? cardValue(hit) : cardValue(want)),
    loc: onShelf ? 'shelf' : inBack ? 'back' : 'none', kind: 'card', uid: hit?.uid })
}

// --- Walk-in consignment intake ------------------------------------------------
// A local wants YOU to sell their card: it sits in your case at their asking price,
// and when it sells you keep a commission — zero capital tied up, pure counter fee.
// (The flip side of you consigning cards out.) Generated by the day-tick when you
// run a storefront with a bit of a name; you accept or pass from the Sell tab.
export function makeConsignRequest(notoriety) {
  const rich = Math.random() < 0.12 // occasionally someone brings in a real piece
  const hi = Math.max(6, (18 + notoriety * 0.6) * (rich ? 5 : 1))
  const card = cardInValueRange(2, hi)
  const ask = round2(cardValue(card) * (0.95 + Math.random() * 0.2)) // their price, around market
  return {
    id: `csg${Math.floor(Math.random() * 1e9).toString(36)}`,
    who: cap(wpick(COLLECTOR_NAMES)),
    card, ask,
    commissionPct: round2(0.15 + Math.random() * 0.10), // your cut when it sells (15–25%)
    days: 6 + Math.floor(Math.random() * 4),            // how long you'd carry it
    pendingDays: 2 + Math.floor(Math.random() * 2),     // how long they'll wait for an answer
  }
}

// --- Collection buy-ins ----------------------------------------------------------
// A local walks in wanting to SELL you a lot of cards — the store as a sourcing
// channel. You never see the exact cards before you pay: you get a noisy eyeball
// ESTIMATE of the lot's market value (±25%; the Jeweler's Loupe tightens it to ±8%)
// plus a vibe hint. Their ask runs 45–70% of true market — most lots are profitable
// if you read them right; the sharky sellers price tight.
const BUYIN_SELLERS = [
  { who: 'a kid clearing out his binder', tone: 'soft' },
  { who: 'a parent selling an outgrown collection', tone: 'soft' },
  { who: 'a college student who needs rent', tone: 'soft' },
  { who: 'a local downsizing before a move', tone: 'mid' },
  { who: 'a weekend collector thinning doubles', tone: 'mid' },
  { who: 'a sharp-eyed flipper flipping through you', tone: 'sharp' },
  { who: 'a grinder who knows every comp', tone: 'sharp' },
]
export function makeBuyinOffer(notoriety) {
  const seller = BUYIN_SELLERS[Math.floor(Math.random() * BUYIN_SELLERS.length)]
  // The lot: a stack of bulk with 1–2 real pieces mixed in (scaled by your local fame —
  // better-known shops get brought better collections).
  const n = 5 + Math.floor(Math.random() * 8)
  const cards = []
  const hits = 1 + (Math.random() < 0.4 ? 1 : 0)
  for (let i = 0; i < n - hits; i++) cards.push(cardInValueRange(0.25, 6))
  for (let i = 0; i < hits; i++) cards.push(cardInValueRange(5, 18 + notoriety * 0.4))
  const market = round2(cards.reduce((a, c) => a + cardValue(c), 0))
  // Ask by seller tone: soft sellers leave meat on the bone; sharp ones price tight.
  const askMult = seller.tone === 'soft' ? 0.45 + Math.random() * 0.15
    : seller.tone === 'sharp' ? 0.62 + Math.random() * 0.13
    : 0.52 + Math.random() * 0.15
  const askCash = Math.max(1, round2(market * askMult))
  // Two pre-rolled estimates so the readout is stable: the naked-eye one (±25%) and
  // the Loupe one (±8%) — the UI shows whichever your gear earns.
  const noisy = (band) => round2(market * (1 - band + Math.random() * band * 2))
  return {
    id: `bi${Math.floor(Math.random() * 1e9).toString(36)}`,
    who: seller.who, tone: seller.tone,
    hint: seller.tone === 'sharp' ? 'priced like someone who checked comps' : seller.tone === 'soft' ? 'just wants it gone' : 'seems reasonable',
    cards, count: n, market, askCash,
    estimate: noisy(0.25), estimateTight: noisy(0.08),
    pendingDays: 2,
  }
}

// An "offer" encounter is built around a specific card you own. If you sell that
// card before responding (e.g. an online order sits in your inbox while you're at
// a show), the encounter is stale — it'd talk about a card you no longer have.
// The card may be in your collection OR out on the market (listed/tweeted), since
// online offers target listed cards — valid as long as it's in either bucket.
export function encounterStillValid(enc, collection, listings = null, shopDisplay = null) {
  if (!enc || !enc.ownedUid) return true // doesn't reference one of your cards
  if (collection.some(c => c.uid === enc.ownedUid)) return true
  if (listings && listings.some(l => l.card.uid === enc.ownedUid)) return true
  // a walk-in offer/trade references a card out on your shop shelf — still valid there.
  return !!(shopDisplay && shopDisplay.some(c => c.uid === enc.ownedUid))
}

const PAY_LABELS = { venmo:'Venmo', cash:'cash', paypal:'PayPal', card:'card' }
function PAY_LABEL(k) { return PAY_LABELS[k] || 'cash' }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }
function shuffle(a) { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]} return b }

export { rawValue }

// --- Want-list collectors --------------------------------------------------
// A collector posts a specific need; fill it from your collection for an
// above-market premium + notoriety. Two kinds: a named card, or "any <rarity>
// from <set>". Bigger asks pay a fatter premium.
const COLLECTOR_NAMES = ['Marco the completist','a binder grinder','an Eeveelution superfan','a vintage hound',
  'a set-builder','a deep-pocketed whale','a nostalgic dad','a rising streamer','a master-set chaser','a local legend',
  'a bulk-bin digger','a kid building their first deck','a playset hunter','a common-card completist','a rainbow-rare fan',
  'a reverse-holo nerd','a page-filler','a weekend collector','a type collector','a Poké Ball foil fanatic']
// The full rarity spectrum a collector might ask for — from bulk commons all the way to the
// chase. Weighted so most requests are the everyday cards (commons/uncommons/rares) with the
// occasional big chase ask, so filling wants is a constant, varied part of the loop — not just
// a rare IR/SIR event. `w` = relative frequency.
const WANT_RARITIES = [
  { rarity: 'Common', w: 5 }, { rarity: 'Uncommon', w: 5 }, { rarity: 'Rare', w: 4 },
  { rarity: 'Rare Holo', w: 3 }, { rarity: 'Double Rare', w: 3 }, { rarity: 'Illustration Rare', w: 2 },
  { rarity: 'Ultra Rare', w: 2 }, { rarity: 'Special Illustration Rare', w: 1 }, { rarity: 'Hyper Rare', w: 1 },
]
// Notoriety a filled rarity-want pays, by rarity tier.
const WANT_RARITY_NOTO = {
  'Common': 1, 'Uncommon': 1, 'Rare': 2, 'Rare Holo': 2, 'Double Rare': 3,
  'Illustration Rare': 4, 'Ultra Rare': 5, 'Special Illustration Rare': 6, 'Hyper Rare': 6,
}

function wpick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
// Weighted pick from [{...,w}] entries.
function wpickWeighted(arr) {
  let total = 0; for (const a of arr) total += a.w || 1
  let r = Math.random() * total
  for (const a of arr) { r -= a.w || 1; if (r <= 0) return a }
  return arr[arr.length - 1]
}

// Make one want. Collectors ask for a HUGE variety — a common to fill a binder page just as
// often as a chase. `rich` (high notoriety) skews toward pricier named asks.
export function makeWant(rich = false) {
  const who = wpick(COLLECTOR_NAMES)
  const daysLeft = 4 + Math.floor(Math.random() * 6) // 4–9 days to fill
  // 55% named card, 45% "any <rarity> from <set>"
  if (Math.random() < 0.55) {
    // Only ever name cards the player can actually OBTAIN — i.e. non-vintage sets sold in the
    // shop. A rich collector skews toward pricier cards; everyone else can ask for anything,
    // including cheap commons/uncommons (variety over value).
    const floor = rich ? 8 : 0
    let all = SHOP_SETS.flatMap(s => s.cards.filter(c => (c.price ?? 0) >= floor))
    if (!all.length) all = SHOP_SETS.flatMap(s => s.cards)
    const card = wpick(all)
    const price = card.price ?? 0
    // Cheaper cards pay a fatter multiple (a $0.25 common at 1.25× is nothing — bump the % so
    // filling a low want is still a small but real reward); pricier cards a tighter multiple.
    const premium = price < 2 ? 2.5 + Math.random() * 2.5   // 2.5–5× on bulk (still pennies-to-dollars)
      : price < 15 ? 1.4 + Math.random() * (rich ? 0.5 : 0.35)
      : 1.25 + Math.random() * (rich ? 0.6 : 0.3)
    const setName = setNameOfCard(card)
    return {
      id: `w${Math.floor(Math.random()*1e9).toString(36)}`,
      kind: 'card', who, daysLeft,
      cardId: card.id, cardName: card.name, img: card.img, setName,
      premiumMult: round2(premium),
      notoriety: 1 + Math.floor(price / 20),
      desc: `${cap(who)} wants a ${card.name}${setName ? ` (${setName})` : ''}`,
    }
  }
  const set = wpick(SHOP_SETS) // non-vintage only — wants must be fulfillable (see above)
  const rar = wpickWeighted(WANT_RARITIES).rarity
  // Low-rarity asks pay a fatter multiple so a common/uncommon want is worth doing.
  const low = rarityRank(rar) < rarityRank('Double Rare')
  const premium = low ? 1.8 + Math.random() * 1.2   // 1.8–3× on commons/uncommons/rares
    : 1.2 + Math.random() * (rich ? 0.4 : 0.25)
  return {
    id: `w${Math.floor(Math.random()*1e9).toString(36)}`,
    kind: 'rarity', who, daysLeft,
    setId: set.id, setName: set.name, rarity: rar,
    premiumMult: round2(premium),
    notoriety: WANT_RARITY_NOTO[rar] ?? 3,
    desc: `${cap(who)} wants any ${rar} from ${set.name}`,
  }
}

// Does a collection card satisfy a want?
export function cardMatchesWant(card, want) {
  if (card.grade) return false // they want a raw single to slot in a binder
  if (want.kind === 'card') return card.id === want.cardId
  if (want.kind === 'rarity') return setIdOfCard(card) === want.setId && card.rarity === want.rarity
  return false
}

// ============================== REGULARS =====================================
// Persistent, named customers who come back. Each has a collecting FOCUS, a spend
// BUDGET, and a TRUST meter (0–100) that grows when you deal them fair and dents when
// you gouge them. They're BORN from treating an anonymous walk-up well (store.formRegular,
// seeded by the `formSeed` stamped on a good deal's effect). After that they recur instead
// of a faceless stranger — with offers targeted to what they collect, scaled by how much
// they trust you. The realization of "whatever you have meets whatever the customer wants."

const REGULAR_NAMES = ['Maya','Diego','Priya','Sam','Tomás','Nina','Reggie','Yuki','Cole','Aisha',
  'Bran','Lena','Omar','Kira','Theo','Sofia','Wes','Mara','Jin','Hank','Dev','Rosa','Cleo','Marcus']
const REGULAR_EMOJI = ['🧑','👩','👨','🧓','🧔','👱','🧑‍🦱','👩‍🦰','🧑‍🦰','👨‍🦱','🧑‍🦳','👩‍🦳','🧕','👨‍🦳']

// Archetype shapes how a regular bids and how much they'll spend on one card.
// `tolerance` mirrors BUYER_SAVVY (the ×-market they'll pay AT FULL TRUST); `budget`
// caps a single buy so a casual never drops whale money.
const REGULAR_ARCH = {
  casual:    { label: 'casual collector',    tolerance: 1.10, budget: 60,    weight: 0.40 },
  collector: { label: 'serious collector',   tolerance: 1.00, budget: 450,   weight: 0.34 },
  sharp:     { label: 'sharp buyer',         tolerance: 0.92, budget: 1500,  weight: 0.18 },
  whale:     { label: 'deep-pocketed whale', tolerance: 1.06, budget: 15000, weight: 0.08 },
}
const REGULAR_ARCH_KEYS = Object.keys(REGULAR_ARCH)

// Trust ladder (highest first). trust is 0..100.
const TRUST_TIERS = [
  { key: 'vip',          label: 'VIP',          min: 85 },
  { key: 'friend',       label: 'Friend',       min: 60 },
  { key: 'regular',      label: 'Regular',      min: 35 },
  { key: 'acquaintance', label: 'Acquaintance', min: 15 },
  { key: 'stranger',     label: 'New face',     min: 0  },
]
export function trustTier(trust) {
  return TRUST_TIERS.find(t => (trust ?? 0) >= t.min) || TRUST_TIERS[TRUST_TIERS.length - 1]
}

function pickWeighted(table, keys) {
  let r = Math.random()
  for (const k of keys) { r -= table[k].weight; if (r <= 0) return k }
  return keys[0]
}
// Weight regular selection toward higher-trust customers — your best customers shop most.
function pickRegular(pool) {
  const total = pool.reduce((a, r) => a + 1 + (r.trust || 0) / 25, 0)
  let r = Math.random() * total
  for (const reg of pool) { r -= 1 + (reg.trust || 0) / 25; if (r <= 0) return reg }
  return pool[pool.length - 1]
}

// The seed a good deal leaves behind, from which a regular is built. Stamped on the
// transacting option's effect; store.formRegular rolls on it after the deal resolves.
function mkSeed(card, channel, generous = false) {
  return { channel, setId: setIdOfCard(card), setName: setNameOfCard(card), cardName: card.name, rarity: card.rarity, generous }
}

// Build a collecting focus from the card that won them over. A set-focus is robust and
// always matchable ("building <set>"); a high-rarity seed makes them hunt that tier in the set.
function makeFocus(seed) {
  const set = setById(seed.setId)
  const setName = set?.name || seed.setName || 'modern sets'
  if (seed.rarity && rarityRank(seed.rarity) >= rarityRank('Illustration Rare') && seed.setId) {
    return { kind: 'rarity', setId: seed.setId, rarity: seed.rarity, setName, label: `hunting ${seed.rarity}s from ${setName}` }
  }
  if (seed.setId) return { kind: 'set', setId: seed.setId, setName, label: `building ${setName}` }
  return { kind: 'any', label: 'hunting good deals' }
}

// Turn a deal-seed into a fresh regular. `taken` = names already in the roster (avoid dupes).
export function makeRegular(seed, taken = []) {
  const archKey = pickWeighted(REGULAR_ARCH, REGULAR_ARCH_KEYS)
  const arch = REGULAR_ARCH[archKey]
  const free = REGULAR_NAMES.filter(n => !taken.includes(n))
  const name = wpick(free.length ? free : REGULAR_NAMES)
  return {
    id: `r${Math.floor(Math.random() * 1e9).toString(36)}`,
    name,
    emoji: wpick(REGULAR_EMOJI),
    channel: seed.channel === 'walkin' ? 'walkin' : 'online', // show acquaintances become online DMs
    archetype: archKey,
    archLabel: arch.label,
    focus: makeFocus(seed),
    budget: arch.budget,
    trust: seed.generous ? 26 : 18,   // a generous first meeting starts you off warmer
    visits: 1,
    spentTotal: 0,
    lastSeenDay: seed.day ?? 1,
    flags: {},
  }
}

// Does a card fit a regular's focus? (Slabs DO count — collectors buy graded too.)
export function cardMatchesFocus(card, focus) {
  if (!focus) return false
  if (focus.kind === 'set') return setIdOfCard(card) === focus.setId
  if (focus.kind === 'rarity') return setIdOfCard(card) === focus.setId && rarityRank(card.rarity) >= rarityRank(focus.rarity)
  if (focus.kind === 'any') return true
  return false
}

// Build an encounter for a returning regular against your current sell pool. If you hold
// something in their lane, they make a TARGETED offer (generosity scales with trust, capped
// by budget); otherwise they check in / browse and mention what they're still after.
export function regularEncounter(regular, offerPool, channel, accepted, notoriety) {
  const tier = trustTier(regular.trust)
  const regTag = { id: regular.id, name: regular.name, emoji: regular.emoji, tier: tier.label, focusLabel: regular.focus?.label }
  const pay = pickPayMethod(channel, accepted)
  const m = PAY_LABEL(pay)
  const arch = REGULAR_ARCH[regular.archetype] || REGULAR_ARCH.collector

  const matches = (offerPool || []).filter(c => cardMatchesFocus(c, regular.focus))
  if (matches.length) {
    // They want your best piece in their lane.
    const target = matches.reduce((a, b) => (cardValue(b) > cardValue(a) ? b : a))
    const market = cardValue(target)
    // trust 0→1.2, full trust lifts their tolerance; low trust drags it into lowball land.
    const trustFactor = 0.6 + 0.6 * ((regular.trust || 0) / 100)
    const mult = Math.max(0.45, Math.min(1.4, arch.tolerance * trustFactor + (Math.random() - 0.5) * 0.08))
    const offer = round2(Math.min(market * mult, regular.budget))
    const fair = offer >= market * 0.9
    const capped = offer >= regular.budget - 0.005 && market * mult > regular.budget // budget-limited
    return {
      kind: 'offer',
      regular: regTag,
      ownedUid: target.uid,
      title: `${regular.emoji} ${regular.name} (${tier.label}) is back`,
      body: capped
        ? `"Love that ${target.name} — it's perfect for ${regular.focus.label}. I can't go higher than $${offer.toFixed(2)} though, that's my ceiling. ${cap(m)}?" (Market: $${market.toFixed(2)})`
        : fair
          ? `"You've got a ${target.name}! Exactly what I need — I'm ${regular.focus.label}. $${offer.toFixed(2)} by ${m}, sound fair?" (Market: $${market.toFixed(2)})`
          : `"That ${target.name} fits ${regular.focus.label}… I'll give you $${offer.toFixed(2)} for it, ${m}." (Market: $${market.toFixed(2)})`,
      card: target,
      options: [
        { text: `Accept $${offer.toFixed(2)} (${m})`, tone: fair ? 'fair' : 'cold',
          effect: { type: 'sellOwned', uid: target.uid, price: offer, payMethod: pay,
            notoriety: fair ? 1 : 0, regularId: regular.id, trustDelta: fair ? 5 : 2,
            msg: fair ? `${regular.name} is thrilled — another piece toward ${regular.focus.label}.` : `${regular.name} got a deal. They'll remember it.` } },
        ...(!fair ? [{ text: `Counter at market ($${market.toFixed(2)})`, tone: 'fair',
          effect: { type: 'counter', uid: target.uid, price: market, payMethod: pay, chance: 0.5 + Math.min(0.4, (regular.trust || 0) / 150),
            notoriety: 1, regularId: regular.id, trustDelta: 3,
            msg: `${regular.name} respects you holding value — pays fair.` } }] : []),
        { text: 'Politely decline', tone: 'fair',
          effect: { type: 'none', regularId: regular.id, trustDelta: fair ? -4 : 0, notoriety: fair ? -1 : 0,
            msg: fair ? `${regular.name} is let down — they thought you two had a rapport.` : `${regular.name} shrugs; no hard feelings on a lowball.` } },
      ],
    }
  }

  // Nothing in their lane right now — they check in and browse what you do have.
  const pool = online_(channel) ? 'listings' : channel === 'walkin' ? 'shop' : 'show'
  return {
    kind: 'browse',
    regular: regTag,
    title: `${regular.emoji} ${regular.name} (${tier.label}) checks in`,
    body: `"Hey! Still ${regular.focus?.label || 'on the hunt'} — got anything new for me? I'll take a look around."`,
    card: null,
    options: [
      { text: 'Show them around', tone: 'kind',
        effect: { type: 'browseSale', pool, payMethod: pay, chance: 0.4 + Math.min(0.4, (regular.trust || 0) / 150),
          notoriety: 1, regularId: regular.id, trustDelta: 2, msg: `${regular.name} appreciates the attention.` } },
      { text: 'Let them browse', tone: 'fair',
        effect: { type: 'browseSale', pool, payMethod: pay, chance: 0.25,
          regularId: regular.id, trustDelta: 1, msg: `${regular.name} has a look around.` } },
    ],
  }
}
function online_(channel) { return channel === 'online' }
