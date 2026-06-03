// Core game engine: pack composition, pulls, pricing, grading, pack pricing.
import data from '../data/sets.json'

export const SETS = data.sets
export const FETCHED_AT = data.fetchedAt

// Rarity tiers ordered low → high, used for sorting/coloring and "hit" detection.
export const RARITY_ORDER = [
  'Common', 'Uncommon', 'Rare', 'Rare Holo', 'Double Rare',
  'Illustration Rare', 'Ultra Rare', 'Special Illustration Rare',
  'Hyper Rare', 'Mega Hyper Rare',
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
}

// Special foil patterns (applied to an otherwise-normal card in the reverse slot,
// like a reverse holo but rarer + more valuable). Only some sets have them.
//   pokeball  — Poké Ball foil  (~1 in 3 packs)         · modest premium
//   masterball — Master Ball foil (~1 in 19 packs)       · big premium, chase pattern
// God pack — the whole pack is high-rarity hits. Community-estimated ~1 in 2,500.
const FOIL = {
  pokeball:   { key: 'pokeball',  label: 'Poké Ball Foil',  badge: '⦿ POKÉ BALL',  mult: 1.6, color: '#ff6b6b' },
  masterball: { key: 'masterball', label: 'Master Ball Foil', badge: '◉ MASTER BALL', mult: 6.0, color: '#a06bff' },
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
    godPack: 1 / 3000,
  },
}
function ratesFor(set) { return SET_RATES[set.id] || BASELINE_RATES }

// Highest-rarity cards in a set, for stuffing a god pack with hits.
function topRarityPool(byR) {
  for (const r of ['Mega Hyper Rare','Hyper Rare','Special Illustration Rare','Ultra Rare','Illustration Rare','Double Rare']) {
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
  // 4 commons + 3 uncommons
  for (let i = 0; i < 4; i++) pulls.push(instance(pick(commons)))
  for (let i = 0; i < 3; i++) pulls.push(instance(pick(uncommons)))

  // RARE slot — Double/Ultra Rare upgrade, else Rare Holo, else plain Rare.
  const rareHit = rollSlot(byR, rates.rare)
  const rareCard = rareHit
    || (byR['Rare Holo']?.length ? pick(byR['Rare Holo']) : null)
    || (byR['Rare']?.length ? pick(byR['Rare']) : pick(uncommons))
  pulls.push(instance(rareCard))

  // REVERSE slot — IR/SIR/Hyper/chase upgrade > special foil > ordinary reverse holo.
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

let _uid = 0
export function instance(card) {
  return {
    uid: `c${Date.now().toString(36)}${(_uid++).toString(36)}`,
    ...card,
    reverse: false,
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
  if (min > REAL_PRICE_CEILING && GRAIL_BASES.length) {
    const base = pick(GRAIL_BASES)
    const price = round2(min + Math.random() * (max - min))
    return instance({ ...base, price, _grail: true })
  }
  const pool = ALL_CARDS.filter(c => {
    const v = c.price ?? 0
    return v >= min && v <= max
  })
  if (pool.length) return instance(pick(pool))
  // fallback: nearest by value
  const sorted = [...ALL_CARDS].sort((a, b) =>
    Math.abs((a.price ?? 0) - (min + max) / 2) - Math.abs((b.price ?? 0) - (min + max) / 2))
  return instance(sorted[0])
}

// A graded copy of a real card (used for premium vendor stock / encounters).
export function gradedCardInRange(min, max, grade) {
  // For grail-level bands, keep the floor in grail territory so the slab is a
  // true grail; for normal bands, a high grade implies a cheaper raw base.
  const floor = min > REAL_PRICE_CEILING ? min : min / (grade >= 9 ? 3 : 1)
  const c = cardInValueRange(floor, max)
  c.grade = { overall: grade, centering: grade, corners: grade, edges: grade, surface: grade, tier: 'standard', gradedAt: Date.now() }
  return c
}

// ---- Pricing ----
// Runtime price overrides by card id, populated by refreshPrices(). Lets us
// update market values live (browser → pokemontcg.io) without rebuilding.
const PRICE_OVERRIDES = {}

export function rawValue(card) {
  const override = PRICE_OVERRIDES[card.id]
  let base = override ?? card.price ?? estimateByRarity(card.rarity)
  if (card.foil) base *= card.foil.mult // Poké Ball (1.6×) / Master Ball (6×) premium
  else if (card.reverse) base *= 1.4     // ordinary reverse holo premium
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
function estimateByRarity(r) {
  const table = { 'Common':0.08,'Uncommon':0.12,'Rare':0.25,'Rare Holo':1.0,
    'Double Rare':2.5,'Illustration Rare':4,'Ultra Rare':6,
    'Special Illustration Rare':25,'Hyper Rare':30,'Mega Hyper Rare':120 }
  return table[r] ?? 0.1
}

// Graded value multiplier by PSA grade (rough market behavior).
const GRADE_MULT = { 10: 4.0, 9: 1.8, 8: 1.1, 7: 0.8, 6: 0.6, 5: 0.5, 4: 0.4, 3: 0.35, 2: 0.3, 1: 0.25 }
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
  economy: { name: 'Economy', fee: 30, days: 45 },
  standard: { name: 'Standard', fee: 60, days: 20 },
  express:  { name: 'Express',  fee: 130, days: 5 },
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
// Effective fee for a service tier given how many cards you've submitted total.
export function gradingFee(tierKey, submitted) {
  const base = GRADING[tierKey].fee
  return round2(base * (1 - graderTier(submitted).discount))
}
// Roll subgrades. Better cards (by value) get a slightly tighter distribution,
// simulating that valuable cards are often handled carefully — but it's mostly luck.
export function rollGrade(card, tier, luck = 0) {
  // luck (0..~0.1) shifts the distribution toward higher grades — e.g. the loupe.
  const sub = () => {
    const r = Math.random() - luck
    // skew toward 8-10 but real chance of lower
    if (r < 0.30) return 10
    if (r < 0.62) return 9
    if (r < 0.82) return 8
    if (r < 0.92) return 7
    if (r < 0.97) return 6
    return 4 + Math.floor(Math.random()*2)
  }
  const centering = sub(), corners = sub(), edges = sub(), surface = sub()
  // PSA overall ≈ limited by the lowest subgrade, with some weighting
  const min = Math.min(centering, corners, edges, surface)
  const avg = (centering + corners + edges + surface) / 4
  let overall = Math.round(Math.min(min + 1, avg))
  overall = Math.max(1, Math.min(10, Math.min(overall, min === 10 ? 10 : min + 1)))
  return { overall, centering, corners, edges, surface, fee: GRADING[tier].fee, tier, gradedAt: Date.now() }
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
  if (product.bonus === 'promo') {
    const byR = cardsByRarity(set)
    const promoPool = byR['Ultra Rare'] || byR['Illustration Rare'] || byR['Double Rare'] || byR['Rare Holo']
    if (promoPool?.length) { const c = instance(pick(promoPool)); c._promo = true; all.push(c) }
  }
  return all
}
