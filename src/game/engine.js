// Core game engine: pack composition, pulls, pricing, grading, pack pricing.
import data from '../data/sets.json'

export const SETS = data.sets
export const FETCHED_AT = data.fetchedAt

// Rarity tiers ordered low → high, used for sorting/coloring and "hit" detection.
export const RARITY_ORDER = [
  'Common', 'Uncommon', 'Rare', 'Rare Holo', 'Double Rare',
  'ACE SPEC Rare', 'Illustration Rare', 'Ultra Rare', 'Special Illustration Rare',
  'Hyper Rare', 'MEGA_ATTACK_RARE', 'Mega Hyper Rare', 'Black White Rare',
]
export function rarityRank(r) {
  const i = RARITY_ORDER.indexOf(r)
  return i === -1 ? 0 : i
}
// Anything at Double Rare or above is a "hit" worth celebrating.
export const HIT_THRESHOLD = RARITY_ORDER.indexOf('Double Rare')
export function isHit(card) { return rarityRank(card.rarity) >= HIT_THRESHOLD }

export function cardsByRarity(set) {
  const map = {}
  for (const c of set.cards) (map[c.rarity] ||= []).push(c)
  return map
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

// Real per-pack pull rates (empirical), modeled as two independent slots that
// mirror how actual packs work: a RARE slot ("Rare or higher") and a REVERSE
// slot (usually an ordinary reverse holo, sometimes an upgrade).
//
// Rates vary by SET — special sets (Prismatic Evolutions, Black Bolt) run hotter.
// Sources per set are cited inline. Sets without published data (the near-future
// Mega-era expansions in this snapshot) use the SV-era baseline.

// SV-era baseline — Card Shop Live (1,728 packs) + DigitalTQ (676 packs).
//   rare    — the guaranteed "Rare or higher" slot.
//   reverse — the reverse-holo slot (usually ordinary RH, sometimes an upgrade).
//   aceSpec — sets WITH an ACE SPEC subset put one in roughly 1 in 5 packs, in
//             place of the reverse holo. Skipped entirely for sets that have none.
//   chase   — a small additional shot at a set's top "special" rarities
//             (MEGA_ATTACK / Black White), which ride alongside the reverse slot.
const BASELINE_RATES = {
  rare: [
    { rarity: 'Double Rare', p: 0.1405 },  // 1 in 7
    { rarity: 'Ultra Rare',  p: 0.0651 },  // 1 in 15
  ],
  reverse: [
    { rarity: 'Illustration Rare',         p: 0.0752 }, // 1 in 13
    { rarity: 'Special Illustration Rare', p: 0.0301 }, // 1 in 33
    { rarity: 'Hyper Rare',                p: 0.0185 }, // 1 in 54
    { rarity: 'Mega Hyper Rare',           p: 0.0035 }, // chase — ~1 in 285
  ],
  aceSpec: 0.20, // ~1 in 5 packs in sets that have an ACE SPEC subset
  chase: [
    { rarity: 'MEGA_ATTACK_RARE', p: 0.0090 }, // Mega-era ultra-chase — ~1 in 111
    { rarity: 'Black White Rare', p: 0.0040 }, // top chase — ~1 in 250
  ],
}

// Special foil patterns (applied to an otherwise-normal card in the reverse slot,
// like a reverse holo but rarer + more valuable). Only some sets have them.
//   pokeball  — Poké Ball foil  (~1 in 3 packs)         · modest premium
//   masterball — Master Ball foil (~1 in 19 packs)       · big premium, chase pattern
// God pack — the whole pack is high-rarity hits. Community-estimated ~1 in 2,500.
// Multipliers reflect real secondary-market premiums on the pattern:
//   Poké Ball foil    — trades ~2.5–4× the base card (common but desirable)  → 3×
//   Master Ball foil  — the chase pattern, ~40–80× base                       → 55×
const FOIL = {
  pokeball:   { key: 'pokeball',  label: 'Poké Ball Foil',  badge: '⦿ POKÉ BALL',  mult: 3.0,  color: '#ff6b6b' },
  masterball: { key: 'masterball', label: 'Master Ball Foil', badge: '◉ MASTER BALL', mult: 55.0, color: '#a06bff' },
}

// Per-set overrides (keyed by set id). Only sets with real published data differ.
const SET_RATES = {
  // Prismatic Evolutions — SIRs ~2× normal; DR 1-in-6.1, UR 1-in-13.4, Hyper 1-in-178.6.
  // Poké Ball foil ~1 in 3, Master Ball ~1 in 19. God pack ~1 in 2,500.
  // Sources: thepricedex.com/set/sv8pt5, TCGplayer, PokeBeach.
  sv8pt5: {
    rare: [
      { rarity: 'Double Rare', p: 0.1639 },  // 1 in 6.1
      { rarity: 'Ultra Rare',  p: 0.0746 },  // 1 in 13.4
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.0800 },
      { rarity: 'Special Illustration Rare', p: 0.0222 }, // 1 in 45 (the famous ~2× rate)
      { rarity: 'Hyper Rare',                p: 0.0056 }, // 1 in 178.6
    ],
    foils: [
      { ...FOIL.masterball, p: 0.0526 }, // 1 in 19
      { ...FOIL.pokeball,   p: 0.3333 }, // 1 in 3
    ],
    aceSpec: 0.20, // PE has a 6-card ACE SPEC subset — ~1 in 5 packs
    godPack: 1 / 2500,
  },
  // Black Bolt — Illustration Rares abundant (~1 in 6); generous overall.
  // Poké Ball foil ~1 in 3 (~30.6%). God pack ~1 in 3,000.
  // Sources: TCGplayer (~700 packs), PokePatch (1,000+ packs).
  zsv10pt5: {
    rare: [
      { rarity: 'Double Rare', p: 0.2111 },  // ~21%
      { rarity: 'Ultra Rare',  p: 0.0583 },  // ~5.8%
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.1639 }, // 1 in 6 — signature of the set
      { rarity: 'Special Illustration Rare', p: 0.0514 }, // ~1 in 19
      { rarity: 'Hyper Rare',                p: 0.0120 }, // ~1 in 83 top-end
    ],
    foils: [
      { ...FOIL.pokeball, p: 0.3056 }, // ~30.6%
    ],
    chase: [
      { rarity: 'Black White Rare', p: 0.0040 }, // the set's lone top chase — ~1 in 250
    ],
    godPack: 1 / 3000,
  },
}
function ratesFor(set) { return SET_RATES[set.id] || BASELINE_RATES }

// Highest-rarity cards in a set, for stuffing a god pack with hits.
function topRarityPool(byR) {
  for (const r of ['Black White Rare','Mega Hyper Rare','MEGA_ATTACK_RARE','Hyper Rare','Special Illustration Rare','Ultra Rare','Illustration Rare','Double Rare']) {
    if (byR[r]?.length) return { rarity: r, pool: byR[r] }
  }
  return null
}

// Roll a slot's upgrade table against absolute per-pack probabilities. Returns a
// card of an upgraded rarity, or null if no upgrade hit (caller fills the base).
// Rarities absent from the set are skipped (their probability isn't redistributed,
// so present-rarity odds stay true to the published rates).
function rollSlot(byR, table) {
  let roll = Math.random()
  for (const h of table) {
    const pool = byR[h.rarity]
    if (pool && pool.length) {
      if (roll < h.p) return pick(pool)
      roll -= h.p
    }
  }
  return null
}

// Open a single pack from a set. Returns an array of pulled card instances.
// The array may carry a `_god` flag (god pack) for the reveal to celebrate.
export function openPack(set) {
  const byR = cardsByRarity(set)
  const rates = ratesFor(set)
  const commons = byR['Common'] || byR['Uncommon'] || set.cards
  const uncommons = byR['Uncommon'] || commons

  // GOD PACK — every card is a high-rarity hit. The jackpot.
  if (rates.godPack && Math.random() < rates.godPack) {
    const top = topRarityPool(byR)
    const hitPool = top ? top.pool : (byR['Double Rare'] || byR['Rare'] || set.cards)
    const pulls = []
    for (let i = 0; i < 10; i++) pulls.push(instance(pick(hitPool)))
    pulls._god = true
    return pulls
  }

  const pulls = []
  // Real SV / Mega-era pack = 4 commons + 4 uncommons + 1 reverse + 1 rare = 10.
  // (The historical "energy" slot is folded into the extra common/uncommon here.)
  for (let i = 0; i < 4; i++) pulls.push(instance(pick(commons)))
  for (let i = 0; i < 4; i++) pulls.push(instance(pick(uncommons)))

  // RARE slot — Double/Ultra Rare upgrade, else Rare Holo, else plain Rare.
  const rareHit = rollSlot(byR, rates.rare)
  const rareCard = rareHit
    || (byR['Rare Holo']?.length ? pick(byR['Rare Holo']) : null)
    || (byR['Rare']?.length ? pick(byR['Rare']) : pick(uncommons))
  pulls.push(instance(rareCard))

  // Top-end chase shot (MEGA_ATTACK / Black White) — a rare extra upgrade that can
  // ride in addition to the normal reverse slot when the set has those rarities.
  const chaseHit = rates.chase ? rollSlot(byR, rates.chase) : null
  if (chaseHit) pulls.push(instance(chaseHit))

  // REVERSE slot. Sets with an ACE SPEC subset land one ~1 in 5 packs in this slot;
  // otherwise it's an IR/SIR/Hyper upgrade > special foil > ordinary reverse holo.
  const aceSpecPool = byR['ACE SPEC Rare']
  if (aceSpecPool?.length && rates.aceSpec && Math.random() < rates.aceSpec) {
    pulls.push(instance(pick(aceSpecPool)))
  } else {
    const revHit = rollSlot(byR, rates.reverse)
    if (revHit) {
      pulls.push(instance(revHit))
    } else {
      const revPool = [...(byR['Common']||[]), ...(byR['Uncommon']||[]), ...(byR['Rare']||[])]
      if (revPool.length) {
        const c = instance(pick(revPool))
        const foil = rates.foils ? rollFoil(rates.foils) : null
        if (foil) c.foil = foil          // Poké Ball / Master Ball pattern
        else c.reverse = true            // ordinary reverse holo
        pulls.push(c)
      }
    }
  }

  // sort so the best card is revealed last (foils rank above plain reverse)
  pulls.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) + foilWeight(a) - foilWeight(b))
  return pulls
}

function rollFoil(table) {
  let roll = Math.random()
  for (const f of table) { if (roll < f.p) return f; roll -= f.p }
  return null
}
function foilWeight(c) {
  if (c.foil?.key === 'masterball') return 0.9
  if (c.foil?.key === 'pokeball') return 0.6
  if (c.reverse) return 0.4
  return 0
}

// --- Card condition --------------------------------------------------------
// Every raw card has a condition. It multiplies value AND caps the PSA grade it
// can earn (you can't get a 10 out of a played card). Graded cards ignore this.
export const CONDITIONS = {
  NM:  { key: 'NM',  label: 'Near Mint',  short: 'NM',  mult: 1.0,  maxGrade: 10, color: '#36d399' },
  LP:  { key: 'LP',  label: 'Lightly Played', short: 'LP', mult: 0.72, maxGrade: 8,  color: '#9db8ff' },
  MP:  { key: 'MP',  label: 'Moderately Played', short: 'MP', mult: 0.45, maxGrade: 6, color: '#ff9f43' },
  DMG: { key: 'DMG', label: 'Damaged',    short: 'DMG', mult: 0.20, maxGrade: 4,  color: '#ff5e6c' },
}
// Roll a condition. `source`: 'sealed' (fresh from a pack — always NM; any flaws
// only show up as lower subgrades at grading time), 'floor' (a single off a show
// table — handled/played, varies), 'grail' (handled fresh).
function rollCondition(source = 'sealed') {
  // Cards out of a sealed pack are always Near Mint. A pack-fresh card is never
  // "lightly played" — defects are surface/centering flaws that the grader catches.
  if (source !== 'floor') return 'NM'
  const r = Math.random()
  if (r < 0.45) return 'NM'; if (r < 0.78) return 'LP'; if (r < 0.95) return 'MP'; return 'DMG'
}

let _uid = 0
export function instance(card, source = 'sealed') {
  return {
    uid: `c${Date.now().toString(36)}${(_uid++).toString(36)}`,
    ...card,
    reverse: false,
    condition: card.condition ?? rollCondition(source),
    grade: null, // null | {overall, centering, corners, edges, surface, fee, gradedAt}
  }
}

// Flat pool of every card across all sets (for vendor stock / offers / encounters).
const ALL_CARDS = SETS.flatMap(s => s.cards)
export function randomCard() { return instance(pick(ALL_CARDS)) }

// Real-data price ceiling — anything requested above this is a synthesized "grail".
const REAL_PRICE_CEILING = ALL_CARDS.reduce((m, c) => Math.max(m, c.price ?? 0), 0)
// Highest-rarity real cards make convincing grail bases (chase/SIR/hyper art).
const GRAIL_BASES = ALL_CARDS.filter(c => rarityRank(c.rarity) >= rarityRank('Special Illustration Rare'))

// Mint a real card instance whose raw value falls within [min,max] if possible.
// When [min,max] exceeds what real market data offers (the high-roller show
// tiers), synthesize a "grail" — a top-rarity card with an overridden price in
// band, themed as a vintage/iconic chase piece.
export function cardInValueRange(min, max) {
  // Grail territory: requested value is beyond anything in the real dataset.
  // Grails are pristine (NM) — a six-figure card in the wild is mint/slabbed.
  if (min > REAL_PRICE_CEILING && GRAIL_BASES.length) {
    const base = pick(GRAIL_BASES)
    const price = round2(min + Math.random() * (max - min))
    return instance({ ...base, price, _grail: true, condition: 'NM' })
  }
  const pool = ALL_CARDS.filter(c => {
    const v = c.price ?? 0
    return v >= min && v <= max
  })
  if (pool.length) return instance(pick(pool), 'floor') // singles in the wild vary in condition
  // fallback: nearest by value
  const sorted = [...ALL_CARDS].sort((a, b) =>
    Math.abs((a.price ?? 0) - (min + max) / 2) - Math.abs((b.price ?? 0) - (min + max) / 2))
  return instance(sorted[0], 'floor')
}

// A graded copy of a real card (used for premium vendor stock / encounters).
export function gradedCardInRange(min, max, grade) {
  // For grail-level bands, keep the floor in grail territory so the slab is a
  // true grail; for normal bands, a high grade implies a cheaper raw base.
  const floor = min > REAL_PRICE_CEILING ? min : min / (grade >= 9 ? 3 : 1)
  const c = cardInValueRange(floor, max)
  c.condition = 'NM' // it's slabbed; condition is locked in by the grade
  c.grade = { overall: grade, centering: grade, corners: grade, edges: grade, surface: grade, tier: 'standard', gradedAt: Date.now() }
  return c
}

// ---- Pricing ----
// Runtime price overrides by card id, populated by refreshPrices(). Lets us
// update market values live (browser → pokemontcg.io) without rebuilding.
const PRICE_OVERRIDES = {}

// Canonical price for every card id from the current bundled data. Cards pulled
// before a data refresh have an old (possibly null) price baked into the saved
// instance; this lets rawValue heal them to the current real price by id, rather
// than falling back to a flat rarity estimate.
const CANONICAL_PRICE = {}
for (const s of SETS) for (const c of s.cards) if (c.price != null) CANONICAL_PRICE[c.id] = c.price

export function rawValue(card) {
  const override = PRICE_OVERRIDES[card.id]
  let base = override ?? card.price ?? CANONICAL_PRICE[card.id] ?? estimateByRarity(card.rarity)
  if (card.foil) base *= card.foil.mult // Poké Ball (3×) / Master Ball (55×) premium
  else if (card.reverse) base *= reverseMult(card.rarity) // reverse holo: small on commons, larger on rares
  // raw (ungraded) cards are discounted by condition; a graded slab is priced by its grade
  if (!card.grade && card.condition && CONDITIONS[card.condition]) base *= CONDITIONS[card.condition].mult
  return Math.max(0.02, round2(base))
}

// Best market price across finishes, matching the build-time fetcher's logic.
function bestPrice(tp) {
  if (!tp) return null
  const finishes = ['holofoil', 'normal', 'reverseHolofoil', '1stEditionHolofoil', 'unlimitedHolofoil']
  for (const f of finishes) {
    const m = tp[f]?.market ?? tp[f]?.mid
    if (m) return Math.round(m * 100) / 100
  }
  for (const k of Object.keys(tp)) {
    const m = tp[k]?.market ?? tp[k]?.mid
    if (m) return Math.round(m * 100) / 100
  }
  return null
}

// Live-refresh market prices for every loaded set, in place.
// Returns { updated, total, fetchedAt }. Throws on network failure.
export async function refreshPrices(onProgress) {
  const API = 'https://api.pokemontcg.io/v2'
  let updated = 0, total = 0
  for (let si = 0; si < SETS.length; si++) {
    const set = SETS[si]
    onProgress?.({ setName: set.name, index: si, count: SETS.length })
    let page = 1
    const priceById = {}
    while (true) {
      const res = await fetch(`${API}/cards?q=set.id:${set.id}&pageSize=250&page=${page}&select=id,tcgplayer,cardmarket`)
      if (!res.ok) throw new Error(`API ${res.status} for ${set.id}`)
      const json = await res.json()
      for (const c of json.data) {
        const p = bestPrice(c.tcgplayer?.prices) ??
          (c.cardmarket?.prices?.averageSellPrice ? Math.round(c.cardmarket.prices.averageSellPrice * 100) / 100 : null)
        if (p != null) priceById[c.id] = p
      }
      if (json.data.length < 250) break
      page++
    }
    // apply to the in-memory set + override map
    for (const card of set.cards) {
      total++
      const p = priceById[card.id]
      if (p != null && p !== card.price) { card.price = p; PRICE_OVERRIDES[card.id] = p; updated++ }
      else if (p != null) { PRICE_OVERRIDES[card.id] = p }
    }
  }
  return { updated, total, fetchedAt: new Date().toISOString() }
}
// Reverse-holo premium scales with rarity: a reverse-holo common is barely worth
// more than the base, while a reverse-holo rare commands a real premium.
function reverseMult(r) {
  switch (r) {
    case 'Common':   return 1.05
    case 'Uncommon': return 1.10
    case 'Rare':     return 1.40
    case 'Rare Holo':return 1.50
    default:         return 1.30 // anything fancier than a rare
  }
}
function estimateByRarity(r) {
  const table = { 'Common':0.08,'Uncommon':0.12,'Rare':0.25,'Rare Holo':1.0,
    'Double Rare':2.5,'Illustration Rare':4,'Ultra Rare':6,
    'Special Illustration Rare':25,'Hyper Rare':30,'Mega Hyper Rare':120 }
  return table[r] ?? 0.1
}

// Graded value multiplier by PSA grade (rough market behavior).
const GRADE_MULT = { 10: 5.0, 9: 1.8, 8: 1.1, 7: 0.8, 6: 0.6, 5: 0.5, 4: 0.4, 3: 0.35, 2: 0.3, 1: 0.25 }
export function gradedValue(card) {
  if (!card.grade) return rawValue(card)
  const mult = GRADE_MULT[card.grade.overall] ?? 1
  // higher base-value cards see bigger grade premiums (gem mint chase)
  const scarcityBoost = 1 + Math.min(2, rawValue(card) / 50)
  return round2(rawValue(card) * mult * (card.grade.overall >= 9 ? scarcityBoost : 1))
}
export function cardValue(card) { return card.grade ? gradedValue(card) : rawValue(card) }

// ---- Grading (PSA-style subgrades) ----
// `fee` is the LIST price (before your loyalty discount). Raised so early
// grading stings; the relationship below brings effective fees back down.
export const GRADING = {
  economy: { name: 'Economy', fee: 20, days: 45 },
  standard: { name: 'Standard', fee: 60, days: 20 },
  express:  { name: 'Express',  fee: 130, days: 5 },
}

// Bulk submission discount: sending several cards in one batch cuts the per-card
// fee (real grading bulk tiers work the same way). Stacks with loyalty discount.
// Keyed by batch size thresholds, low → high.
export const BULK_TIERS = [
  { min: 10, discount: 0.25 },
  { min: 5,  discount: 0.15 },
  { min: 3,  discount: 0.08 },
]
export function bulkDiscount(count) {
  for (const t of BULK_TIERS) if (count >= t.min) return t.discount
  return 0
}

// ---- Grader loyalty: volume builds a relationship that cuts fees ----
// One shared standing across all service tiers, by total cards ever submitted.
export const GRADER_TIERS = [
  { key: 'new',      name: 'New Customer', min: 0,   discount: 0,    color: '#8c97b8' },
  { key: 'bronze',   name: 'Bronze',       min: 5,   discount: 0.10, color: '#cd7f32' },
  { key: 'silver',   name: 'Silver',       min: 15,  discount: 0.20, color: '#c0c8d6' },
  { key: 'gold',     name: 'Gold',         min: 40,  discount: 0.30, color: '#ffcb05' },
  { key: 'platinum', name: 'Platinum',     min: 100, discount: 0.45, color: '#7cf0ff' },
]
export function graderTier(submitted) {
  let t = GRADER_TIERS[0]
  for (const tier of GRADER_TIERS) if (submitted >= tier.min) t = tier
  return t
}
export function nextGraderTier(submitted) {
  return GRADER_TIERS.find(t => t.min > submitted) || null
}
// Effective per-card fee for a service tier given how many cards you've submitted
// total (loyalty) and, optionally, how many you're submitting in this batch (bulk).
// The two discounts stack multiplicatively (you don't get more than 100% off).
export function gradingFee(tierKey, submitted, batchCount = 1) {
  if (!GRADING[tierKey]) return 0
  const base = GRADING[tierKey].fee
  const loyalty = graderTier(submitted).discount
  const bulk = bulkDiscount(batchCount)
  return round2(base * (1 - loyalty) * (1 - bulk))
}
// Roll subgrades. Better cards (by value) get a slightly tighter distribution,
// simulating that valuable cards are often handled carefully — but it's mostly luck.
export function rollGrade(card, tier, luck = 0, paidFee = null) {
  // luck (0..~0.1) shifts the distribution toward higher grades — e.g. the loupe.
  // It nudges each cutoff up proportionally rather than subtracting from the roll,
  // so the lower tail (6 and below) stays reachable instead of becoming impossible.
  const sub = () => {
    const r = Math.random()
    const b = (p) => p + luck * (1 - p) // pull each cutoff toward 1 by `luck`
    if (r < b(0.30)) return 10
    if (r < b(0.62)) return 9
    if (r < b(0.82)) return 8
    if (r < b(0.92)) return 7
    if (r < b(0.97)) return 6
    return 4 + Math.floor(Math.random()*2)
  }
  // condition caps how high this card can possibly grade (a played card won't gem).
  // For capped (played) cards, re-center the roll so subgrades spread BELOW the cap
  // instead of all clipping to it — a Damaged card should range PSA 1-4, not always 4.
  const cap = card.condition && CONDITIONS[card.condition] ? CONDITIONS[card.condition].maxGrade : 10
  const capSub = () => {
    const s = sub()
    if (s <= cap) return s
    // rolled above the cap: land somewhere in the realistic band below it
    const spread = cap >= 10 ? 0 : Math.min(3, cap - 1)
    return cap - Math.floor(Math.random() * (spread + 1))
  }
  const centering = capSub(), corners = capSub(), edges = capSub(), surface = capSub()
  // PSA overall ≈ limited by the lowest subgrade, with some weighting
  const min = Math.min(centering, corners, edges, surface)
  const avg = (centering + corners + edges + surface) / 4
  let overall = Math.round(Math.min(min + 1, avg))
  overall = Math.max(1, Math.min(cap, Math.min(overall, min === 10 ? 10 : min + 1)))
  // record the fee the player actually paid (after loyalty discount), not list price
  return { overall, centering, corners, edges, surface, fee: paidFee ?? GRADING[tier].fee, tier, gradedAt: Date.now() }
}

export function round2(n) { return Math.round(n * 100) / 100 }

// Compact money formatting so high-roller grails ($1,000,000) fit nicely.
// < $1k → exact cents; ≥ $1k → $12.3k / $1.2M style.
export function fmtMoney(n) {
  const v = n ?? 0
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 2).replace(/\.0+$/, '')}M`
  if (v >= 10_000) return `$${(v / 1000).toFixed(v >= 100_000 ? 0 : 1).replace(/\.0$/, '')}k`
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return `$${v.toFixed(2)}`
}

// --- Sealed products (real TCGplayer market prices via TCGCSV) -------------
// Each set ships a `products` list (type, icon, packs, bonus, price). For sets
// without fetched data, synthesize a basic Pack + Box so the shop still works.
export function setProducts(set) {
  if (set.products && set.products.length) return set.products
  const byR = cardsByRarity(set)
  const hasChase = (byR['Special Illustration Rare']?.length || 0) + (byR['Mega Hyper Rare']?.length || 0) > 0
  const pack = hasChase ? 4.49 : 3.99
  return [
    { type: 'Booster Pack', icon: '🎴', packs: 1, bonus: null, price: pack },
    { type: 'Booster Box', icon: '🗃️', packs: 36, bonus: null, price: round2(pack * 36 * 0.92) },
  ]
}
// Cheapest single-pack product for a set (used as the "pack price" baseline).
export function packPrice(set) {
  const single = setProducts(set).find(p => p.packs === 1)
  return single ? single.price : 4.49
}

// Open a sealed product: rip `packs` packs and (if any) add a guaranteed bonus
// promo. Returns the flat array of all cards pulled.
export function openProduct(set, product) {
  const all = []
  for (let i = 0; i < product.packs; i++) {
    const pack = openPack(set)
    if (pack._god) pack.forEach(c => { c._fromGod = true })
    all.push(...pack)
  }
  // Bonus promo: a guaranteed hit-tier card (ETBs/tins/premiums include one).
  const promo = makeProductPromo(set, product)
  if (promo) all.push(promo)
  return all
}

// Mint the guaranteed bonus promo for a product (null if it has no bonus).
export function makeProductPromo(set, product) {
  if (product.bonus !== 'promo') return null
  const byR = cardsByRarity(set)
  const promoPool = byR['Ultra Rare'] || byR['Illustration Rare'] || byR['Double Rare'] || byR['Rare Holo']
  if (!promoPool?.length) return null
  const c = instance(pick(promoPool)); c._promo = true; return c
}
