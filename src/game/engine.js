// Core game engine: pack composition, pulls, pricing, grading, pack pricing.
import data from '../data/sets.json'
import { SYNC_URL } from './syncConfig'
import { getIdToken } from './auth'
// 📊 Population reports and 🖨️ misprints both change what a card is WORTH, so they are wired
// into the pricing functions here. Both modules are pure and import nothing from the engine,
// so there is no cycle. See population.js for the mean-1.0 invariant that keeps grading
// balance intact, and misprints.js for why the error premium is split raw vs graded.
import { popMult, popCount, popLine } from './population'
import { misprintValue, rollMisprint, pickMisprintIndex } from './misprints'
import { sealedGradeMult } from './sealedgrading'

export const SETS = data.sets
export const FETCHED_AT = data.fetchedAt

// A card's collector number. For 20,454 of the 23,475 cards in the snapshot the number is
// simply the tail of the id ("sv8pt5-25" → "25"), so the data ships WITHOUT it and this
// rebuilds it — 288 KB raw and 48 KB gzipped off the payload, the single biggest download
// win available (see docs/PERFORMANCE.md). The exceptions keep an explicit `number`
// and are returned verbatim: Japanese cards print theirs as "094/165" while their id ends in
// a variant suffix ("jp-SV2a-094MB"), so the two genuinely differ.
//
// ALWAYS read a collector number through this, never `card.number` directly.
export function cardNumber(card) {
  if (!card) return ''
  if (card.number != null) return card.number
  const id = card.id
  if (typeof id !== 'string') return ''
  const i = id.lastIndexOf('-')
  return i > 0 ? id.slice(i + 1) : ''
}

// Card art URL resolution. pokemontcg.io art follows a fixed pattern derived from the
// card's id + number, so the data snapshot omits those URLs (~40% of its raw bytes) and
// they're rebuilt here. Cards with an explicit img/imgLarge — scrydex-hosted newest sets,
// the pattern-breakers (cel25's cel25c paths, suffixed filenames), synthetic pseudo-cards —
// use it verbatim. ALWAYS read card art through these, never card.img directly: card
// instances minted after the strip don't carry the fields.
export function cardImg(card) {
  if (!card) return null
  if (card.img) return card.img
  const sid = setIdOfCard(card)
  const num = cardNumber(card)
  return sid && num ? `https://images.pokemontcg.io/${sid}/${num}.png` : null
}
export function cardImgLarge(card) {
  if (!card) return null
  if (card.imgLarge) return card.imgLarge
  if (card.img) return card.img // pseudo-cards (sealed art, leads) carry one explicit URL for both sizes
  const sid = setIdOfCard(card)
  const num = cardNumber(card)
  return sid && num ? `https://images.pokemontcg.io/${sid}/${num}_hires.png` : null
}

// Card art lives on a remote CDN, so a just-pulled card can pop in slowly mid-reveal.
// Warm the browser cache the instant a pack is opened (or about to be), so by the time
// the reveal animation reaches each card its image is already downloaded + decoded.
// Cheap and idempotent — the browser dedupes repeat requests. No-op outside the browser.
const _imgWarmed = new Set()
export function preloadCardImages(cards) {
  if (typeof Image === 'undefined' || !cards) return
  for (const c of cards) {
    const url = cardImg(c)
    if (!url || _imgWarmed.has(url)) continue
    _imgWarmed.add(url)
    const img = new Image()
    img.src = url
    // Actually DECODE to a ready texture (not just download): otherwise the reveal flip's
    // compositor layer rasterizes before the image finishes decoding and paints the card
    // in halves ("half then fills") mid-turn. decode() warms the decoded bitmap in cache.
    if (img.decode) img.decode().catch(() => {})
  }
}

// Sets sold in the normal shop (excludes `vintage` sets, which only appear via the
// rare "Vintage Vault" vendor at higher-tier shows).
// Modern, in-print product the distributors sell fresh. Excludes vintage (Vault-only) AND
// secondary (older "aftermarket" sets you find rather than buy fresh — see SECONDARY_SETS).
// Sorted NEWEST → OLDEST by release date so the "first dibs on new sets" logic in
// distributorCatalog is correct no matter what order sets.json is written in (a scoped
// re-fetch appends fetched sets, which would otherwise scramble release order).
export const SHOP_SETS = data.sets.filter(s => !s.vintage && !s.secondary && !s.extra)
  .sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')))
// Vintage sets, keyed for the Vault vendor. The Vault sells these heavy old packs.
export const VINTAGE_SETS = data.sets.filter(s => s.vintage)
// Aftermarket / "still findable" older sets (SM + XY era). Not sold by modern distributors;
// they surface as finds at show-floor booths (full product lineups, at a collector's markup).
export const SECONDARY_SETS = data.sets.filter(s => s.secondary)
// `extra` sets — Black Star Promos, McDonald's, POP, trainer kits, one-off specials. These have
// NO sealed product to buy: they never enter the shop, distributors, or the Vault. They exist as
// a card POOL — browsable in the price guide, and the source the real bonus promos pin to (a
// "151 ETB" ships an svp black-star promo, a card that lives in an `extra` set, not sv3pt5). Kept
// out of SHOP_SETS above so their cards never flood modern shop stock / offers / wants.
export const EXTRA_SETS = data.sets.filter(s => s.extra)
// 🎌 Japanese sets the IMPORT channel can actually sell SEALED (Import License upgrade →
// the Japan Direct distributor). JP sets are `extra` (browse-only) by default; a set is
// promoted onto the import shelf only when its data can compose an HONEST pack:
//   • ≥95% card art (several fetched sets have none — TCGdex gaps — and would rip blank), and
//   • real base pools once pattern parallels are set aside: enough distinct low-rarity cards to
//     fill a pack's four filler slots, plus a real hit lineup for the rare slot.
// The failure mode this exists to catch is JP 151, where JustTCG carries the ENTIRE Common
// population as Master Ball mirrors — set the parallels aside and there is nothing to fill a
// pack with (baseLow = 0). It is NOT "this set lacks an English-style C/U/R ladder": JustTCG
// labels every sub-Double-Rare card in some sets (SV8a) uniformly `common`, so they have 288
// perfectly good base commons and zero Uncommons. openJapanesePack/jpPackEV already fall back
// when a tier is missing (`byR['Uncommon'] || commons`), so demanding all three tiers was
// stricter than the machinery needs and benched a fully-arted, fully-priced set.
// Data-driven, so finishing a set's fetch later auto-promotes it here. Newest first.
const JP_MIN_FILLER = 20   // distinct base Common/Uncommon cards — 4 slots/pack want real variety
const JP_MIN_HITS = 5      // distinct base Double Rare+ cards for the hit slot to land on
// Spelled out rather than via rarityRank(): this runs at module load, and RARITY_ORDER is a
// `const` declared BELOW — reaching for it here is a temporal-dead-zone crash on boot.
const JP_HIT_RARITIES = new Set([
  'Double Rare', 'Ultra Rare', 'Illustration Rare', 'Special Illustration Rare',
  'Hyper Rare', 'ACE SPEC Rare', 'Mega Hyper Rare', 'Black White Rare',
])
export const JP_SHOP_SETS = data.sets.filter(s => {
  if (!s.japanese || !s.cards?.length) return false
  if (s.cards.filter(c => c.img).length / s.cards.length < 0.95) return false
  const base = s.cards.filter(c => !jpPatternTag(c))
  const filler = base.filter(c => c.rarity === 'Common' || c.rarity === 'Uncommon').length
  const hits = base.filter(c => JP_HIT_RARITIES.has(c.rarity)).length
  return filler >= JP_MIN_FILLER && hits >= JP_MIN_HITS
}).sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')))
export function vintageProduct(set) {
  return (set.products || []).find(p => p.vintage) || setProducts(set)[0]
}

// --- Storefront branding -----------------------------------------------------
// A store's identity is { name, tagline, icon, accent } (see initialState). These read it
// with graceful fallbacks so an un-customized (or old-save) store still reads as "Your Store 🏬".
export function shopName(store) { return (store?.name || '').trim() || 'Your Store' }
export function shopIcon(store) { return (store?.icon || '').trim() || '🏬' }
export function shopTagline(store) { return (store?.tagline || '').trim() }
export function shopAccent(store) { return (store?.accent || '').trim() }

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
// Anything at Double Rare or above is a "hit" worth celebrating — OR anything worth real
// money. A card whose market value clears HIT_VALUE_THRESHOLD counts as a hit regardless of
// its printed rarity, so a valuable common/uncommon/reverse gets the on-rip celebration and
// is protected from the bulk "sell all / buylist" sweeps (see isBulkCard, which excludes hits).
export const HIT_THRESHOLD = RARITY_ORDER.indexOf('Double Rare')
export const HIT_VALUE_THRESHOLD = 20
export function isHit(card) {
  return rarityRank(card.rarity) >= HIT_THRESHOLD || cardValue(card) > HIT_VALUE_THRESHOLD
}
// Chase tier: a rung above a plain hit — every alt-art-and-up pull, plus the special foil
// patterns. That means Illustration Rare or better (IR, Ultra Rare, SIR, Hyper, Mega Attack
// Rare, Mega Hyper Rare, Black White Rare) and any Poké Ball / Master Ball foil. These are the
// cards worth a rainbow edge peeking out of the hand (HandReveal) and stopping a whole sift for
// (AutoRip) — the bar is deliberately WIDE: a $20 Illustration Rare is a card you want to turn
// over in your own hands, not one flashed past you on the churn clock.
//
// Note it does NOT include Double Rare: those are the baseline ex hits (1 in 5 packs, usually
// a dollar or two), and a "chase" that lands every fifth pack isn't a chase.
export const CHASE_RANK = rarityRank('Illustration Rare')
export function isChase(card) {
  return !!card?.foil || rarityRank(card?.rarity) >= CHASE_RANK
}
// Grail tier: the narrow top of the chase pile — a Master Ball foil or Special Illustration
// Rare and up. This is the bar that gets a suspense beat mid-reveal (PackOpening) and that
// stops a sift no matter how high you set its value bar; isChase is the wide net, this is the
// "you are never letting this one go by" one.
export function isGrail(card) {
  return card?.foil?.key === 'masterball' || rarityRank(card?.rarity) >= rarityRank('Special Illustration Rare')
}
// The sift's rarity bar (AutoRip's "Chase only"): every chase, PLUS the baseline ex. `Double
// Rare` is exactly the modern ex slot — every one of them in the snapshot is a "<Pokémon> ex" —
// and the ex is the card a pack is *about*, the one you want to turn over yourself even when it
// books at a dollar. Deliberately a separate bar from isChase(): this one answers "hand me the
// pack", not "paint a rainbow edge on it", and an edge that lands every fifth pack means nothing.
// Tested by NAME of the tier rather than by rank, because ACE SPEC Rare sits between Double Rare
// and Illustration Rare on the ladder — a rank test would drag those trainers in too (worth ~50¢,
// and on an ACE-SPEC set like Prismatic that alone is another 15pp of stops).
export function isChaseOrEx(card) {
  return isChase(card) || card?.rarity === 'Double Rare'
}

// A card counts as "bulk" purely by WORTH, not rarity: any raw card whose live market value
// is under BULK_VALUE_THRESHOLD. So a rarity chase or a foil that the market values at pennies
// IS bulk (it's genuinely worthless), while a plain common worth a few dollars is NOT — the
// thing that protects a card from the bulk sweep is its value, full stop. Graded slabs are never
// bulk (they live in a case, sold individually). Uses LIVE cardValue, so it tracks the market.
export const BULK_VALUE_THRESHOLD = 1 // under a dollar = bulk
export function isBulkCard(card) {
  return !card.grade && cardValue(card) < BULK_VALUE_THRESHOLD
}

export function cardsByRarity(set) {
  const map = {}
  for (const c of set.cards) (map[c.rarity] ||= []).push(c)
  return map
}

function pick(arr, rnd = Math.random) { return arr[Math.floor(rnd() * arr.length)] }

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
  aceSpec: 0.05, // ~1 in 20 packs — the real SV ACE SPEC rate (was 0.20, ~4x too generous)
  chase: [
    { rarity: 'MEGA_ATTACK_RARE', p: 0.0090 }, // Mega-era ultra-chase — ~1 in 111
    { rarity: 'Black White Rare', p: 0.0040 }, // top chase — ~1 in 250
  ],
}

// Special foil patterns (applied to an otherwise-normal card in the reverse slot,
// like a reverse holo but rarer + more valuable). Only some sets have them.
//   pokeball  — Poké Ball foil  (~1 in 3 packs)         · modest premium
//   masterball — Master Ball foil (~1 in 19 packs)       · big premium, chase pattern
// Multipliers reflect real secondary-market premiums on the pattern:
//   Poké Ball foil    — trades ~2.5–4× the base card (common but desirable)  → 3×
//   Master Ball foil  — the chase pattern, ~40–80× base                       → 55×
const FOIL = {
  pokeball:   { key: 'pokeball',  label: 'Poké Ball Foil',  badge: '⦿ POKÉ BALL',  mult: 3.0,  color: '#ff6b6b' },
  masterball: { key: 'masterball', label: 'Master Ball Foil', badge: '◉ MASTER BALL', mult: 55.0, color: '#a06bff' },
}

// --- Special-pack system -------------------------------------------------------
// Each set may define an ORDERED array of special-pack variants. openPack() rolls
// them in order before building a normal pack; the FIRST variant whose
// Math.random() < odds wins. List rarest-first within each set.
//
// Variant shape:
//   { tier: 'god' | 'demigod',   // 'god' sets _god=true; 'demigod' sets _demigod=true
//     key: string,               // unique key (e.g. 'mbgod', 'god', 'demigod')
//     label: string,             // display string (e.g. 'MASTER BALL GOD PACK')
//     odds: number,              // Math.random() < odds to trigger
//     slots: SlotSpec[],         // for god-tier: explicit card composition
//     hits?: SlotSpec,           // for demigod: spec for the high-rarity hit cards
//     filler?: SlotSpec,         // for demigod: spec for the non-hit filler cards
//   }
//
// SlotSpec shapes:
//   { rarity: string, count: number }          — pick `count` from byR[rarity]
//   { foil: 'pokeball'|'masterball',
//     from: 'reverseBase',  count: number }    — normal card w/ that foil pattern
//   { foil: 'pokeball'|'masterball',
//     rarity: string, count: number }          — high-rarity card w/ that foil
//   { fill: true }                             — remaining slots → normal cards
//
// Demigod packs: k = random int in [3..6] hit cards are drawn from `hits`,
// then (packSize - k) filler cards from `filler`. Hit cards carry _fromDemigod=true.
//
// Back-compat flags (CRITICAL — existing UI/stream/stats consumers depend on these):
//   God tier:    pulls._god=true,      each card c._fromGod=true
//   Demigod tier: pulls._demigod=true, each card c._fromDemigod=true (NOT _god/_fromGod)
//   All special:  pulls._specialKey=variant.key, pulls._specialLabel=variant.label
const SPECIAL_PACKS = {
  // Prismatic Evolutions — three variants, rarest first.
  sv8pt5: [
    // 1/15000: Master Ball God — every SIR gets a master-ball foil; common companions get pokeball foil.
    { tier: 'god', key: 'mbgod', label: 'MASTER BALL GOD PACK', odds: 1 / 15000,
      slots: [
        { foil: 'masterball', rarity: 'Special Illustration Rare', count: 3 },
        { foil: 'pokeball',   from: 'reverseBase',                 count: 7 },
      ],
    },
    // 1/2500: God — 9 SIRs (pad with next-best if pool short).
    { tier: 'god', key: 'god', label: 'GOD PACK', odds: 1 / 2500,
      slots: [
        { rarity: 'Special Illustration Rare', count: 9 },
        { fill: true },
      ],
    },
    // 1/500: Demigod — 3–6 SAR hits; remaining slots are pokeball-foil commons.
    { tier: 'demigod', key: 'demigod', label: 'DEMIGOD PACK', odds: 1 / 500,
      hits:   { rarity: 'Special Illustration Rare' },
      filler: { foil: 'pokeball', from: 'reverseBase' },
    },
  ],
  // Ascended Heroes — two variants.
  me2pt5: [
    // 1/2000: God — 3 MEGA_ATTACK_RARE + 7 SIR.
    { tier: 'god', key: 'god', label: 'GOD PACK', odds: 1 / 2000,
      slots: [
        { rarity: 'MEGA_ATTACK_RARE',           count: 3 },
        { rarity: 'Special Illustration Rare',  count: 7 },
      ],
    },
    // 1/400: Demigod — 3–6 IR-or-better hits (prefer SIR, fall back to IR); filler = normal.
    { tier: 'demigod', key: 'demigod', label: 'DEMIGOD PACK', odds: 1 / 400,
      hits:   { rarities: ['Special Illustration Rare', 'Illustration Rare'] }, // preferred order
      filler: { from: 'normal' },
    },
  ],
  // Black Bolt — one god variant.
  zsv10pt5: [
    { tier: 'god', key: 'god', label: 'GOD PACK', odds: 1 / 3000,
      slots: [
        { rarity: 'Special Illustration Rare', count: 1 },
        { rarity: 'Illustration Rare',         count: 9 },
      ],
    },
  ],
  // White Flare — one god variant (mirrors Black Bolt structure).
  rsv10pt5: [
    { tier: 'god', key: 'god', label: 'GOD PACK', odds: 1 / 3000,
      slots: [
        { rarity: 'Special Illustration Rare', count: 1 },
        { rarity: 'Illustration Rare',         count: 9 },
      ],
    },
  ],
  // 151 — one god variant: 4 IR + 2 SIR + 4 normal fill (mirrors the real starter-line hit pattern).
  sv3pt5: [
    { tier: 'god', key: 'god', label: 'GOD PACK', odds: 1 / 600,
      slots: [
        { rarity: 'Illustration Rare',         count: 4 },
        { rarity: 'Special Illustration Rare', count: 2 },
        { fill: true },
      ],
    },
  ],
}

// Build one special pack from a variant definition. Returns the card array with
// the correct tier flags set; does NOT set _specialKey/_specialLabel (caller does).
// Always pads/truncates to exactly packSize cards. Never emits undefined.
function buildSpecialPack(set, byR, variant, packSize) {
  const commons = byR['Common'] || byR['Uncommon'] || set.cards
  const uncommons = byR['Uncommon'] || commons

  if (variant.tier === 'demigod') {
    return buildDemigodPack(set, byR, variant, packSize, commons, uncommons)
  }

  // --- God-tier: explicit slot composition ---
  const cards = []
  for (const slot of variant.slots) {
    if (slot.fill) {
      // fill: remaining slots → normal (commons/uncommons)
      while (cards.length < packSize) cards.push(instance(pick(commons)))
      break
    }
    const count = slot.count ?? 1
    if (slot.foil && slot.from === 'reverseBase') {
      // Poké Ball / Master Ball foil on a normal (common-ish) card
      for (let i = 0; i < count && cards.length < packSize; i++) {
        const base = [...(byR['Common'] || []), ...(byR['Uncommon'] || []), ...(byR['Rare'] || [])]
        const pool = base.length ? base : commons
        const c = instance(pick(pool))
        c.foil = FOIL[slot.foil]
        cards.push(c)
      }
    } else if (slot.foil && slot.rarity) {
      // Foil applied to a high-rarity card (e.g. masterball on SIR)
      const pool = byR[slot.rarity]
      const fallback = topRarityPool(byR)
      for (let i = 0; i < count && cards.length < packSize; i++) {
        const src = (pool?.length ? pool : (fallback?.pool || commons))
        const c = instance(pick(src))
        c.foil = FOIL[slot.foil]
        cards.push(c)
      }
    } else if (slot.rarity) {
      // Plain rarity slot — degrade to next-best if pool empty
      const pool = byR[slot.rarity]
      const fallback = topRarityPool(byR)
      for (let i = 0; i < count && cards.length < packSize; i++) {
        const src = pool?.length ? pool : (fallback?.pool || commons)
        cards.push(instance(pick(src)))
      }
    }
  }
  // Safety pad: should already be at packSize from `fill`, but guard anyway
  while (cards.length < packSize) cards.push(instance(pick(commons)))
  if (cards.length > packSize) cards.splice(packSize)

  cards.forEach(c => { c._fromGod = true })
  cards._god = true
  return cards
}

// Build a demigod pack: k random hits (3–6) + (packSize - k) filler cards.
function buildDemigodPack(set, byR, variant, packSize, commons, uncommons) {
  const k = 3 + Math.floor(Math.random() * 4) // 3, 4, 5, or 6

  // Pick hit cards from the hits spec
  const hitCards = []
  const hitSpec = variant.hits
  if (hitSpec.rarities) {
    // Ordered fallback list: try each rarity, skip if empty pool
    const pool = []
    for (const r of hitSpec.rarities) if (byR[r]?.length) { pool.push(...byR[r]) }
    const src = pool.length ? pool : (topRarityPool(byR)?.pool || commons)
    for (let i = 0; i < k; i++) hitCards.push(instance(pick(src)))
  } else {
    const pool = byR[hitSpec.rarity]
    const fallback = topRarityPool(byR)
    const src = pool?.length ? pool : (fallback?.pool || commons)
    for (let i = 0; i < k; i++) hitCards.push(instance(pick(src)))
  }

  // Build filler cards
  const fillerCount = packSize - k
  const fillerCards = []
  const fillerSpec = variant.filler
  if (fillerSpec?.foil && fillerSpec.from === 'reverseBase') {
    const base = [...(byR['Common'] || []), ...(byR['Uncommon'] || []), ...(byR['Rare'] || [])]
    const pool = base.length ? base : commons
    for (let i = 0; i < fillerCount; i++) {
      const c = instance(pick(pool))
      c.foil = FOIL[fillerSpec.foil]
      fillerCards.push(c)
    }
  } else {
    // Normal filler: commons and uncommons
    for (let i = 0; i < fillerCount; i++) fillerCards.push(instance(pick(commons)))
  }

  const cards = [...hitCards, ...fillerCards]
  cards.forEach(c => { c._fromDemigod = true })
  cards._demigod = true
  return cards
}

// Per-set overrides (keyed by set id). Only sets with real published data differ.
const SET_RATES = {
  // Chaos Rising (me4) — official TCGplayer pull rates (8,500+ packs opened).
  // The Mega Hyper Rare (Mega Greninja ex) is the true grail at ~1 in 956 packs — NOT the
  // near-every-box card it used to read as. SIR is rarer than the baseline too. Source:
  // TCGplayer Infinite, "Pokémon TCG: Chaos Rising Pull Rates" (Jun 2026).
  me4: {
    rare: [
      { rarity: 'Double Rare', p: 0.2030 },  // 1 in 5
      { rarity: 'Ultra Rare',  p: 0.0829 },  // 1 in 12
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.1066 }, // 1 in 9
      { rarity: 'Special Illustration Rare', p: 0.0121 }, // 1 in 83
      { rarity: 'Mega Hyper Rare',           p: 0.0010 }, // the grail — 1 in 956
    ],
  },
  // Perfect Order (me3) — official TCGplayer pull rates (3,500+ packs). Mega-era Series
  // rates, ~identical to Mega Evolution / Phantasmal Flames. MHR (Mega Zygarde ex) is the
  // grail at ~1 in 1786 packs. Source: TCGplayer Infinite, "Perfect Order Pull Rates" (Apr 2026).
  me3: {
    rare: [
      { rarity: 'Double Rare', p: 0.2097 },  // 1 in 5
      { rarity: 'Ultra Rare',  p: 0.0854 },  // 1 in 12
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.1120 }, // 1 in 9
      { rarity: 'Special Illustration Rare', p: 0.0123 }, // 1 in 81
      { rarity: 'Mega Hyper Rare',           p: 0.0006 }, // the grail — 1 in 1786
    ],
  },
  // Ascended Heroes (me2pt5) — official TCGplayer pull rates (2,000+ packs). The largest
  // English set; introduces the Mega Attack Rare, which sits in the RARE slot and REPLACES
  // an Ultra Rare in packs where it appears (so UR drops to ~5% and MAR fills the ~3% gap —
  // not additive). Two Mega Hyper Rares (Mega Charizard Y / Mega Dragonite ex) → ~1 in 540.
  // Source: TCGplayer Infinite, "Ascended Heroes Pull Rates" (Feb 2026).
  me2pt5: {
    rare: [
      { rarity: 'Double Rare',      p: 0.2037 }, // 1 in 5
      { rarity: 'Ultra Rare',       p: 0.0481 }, // 1 in 21 (down from ~8% — MAR took the gap)
      { rarity: 'MEGA_ATTACK_RARE', p: 0.0347 }, // 1 in 29 — new Mega-attack alt-art, rare slot
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.1125 }, // 1 in 9
      { rarity: 'Special Illustration Rare', p: 0.0144 }, // 1 in 70
      { rarity: 'Mega Hyper Rare',           p: 0.0019 }, // 2 grails — 1 in 540
    ],
  },
  // Phantasmal Flames (me2) — official TCGplayer pull rates (5,000+ packs). Mega-era
  // rates, ~identical to Mega Evolution. One Mega Hyper Rare (Mega Charizard X ex) → the
  // grail at 1 in 1260 packs. Source: TCGplayer Infinite, "Phantasmal Flames Pull Rates".
  me2: {
    rare: [
      { rarity: 'Double Rare', p: 0.2077 },  // 1 in 5
      { rarity: 'Ultra Rare',  p: 0.0806 },  // 1 in 12
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.1097 }, // 1 in 9
      { rarity: 'Special Illustration Rare', p: 0.0125 }, // 1 in 80
      { rarity: 'Mega Hyper Rare',           p: 0.0008 }, // the grail — 1 in 1260
    ],
  },
  // Mega Evolution (me1) — official TCGplayer pull rates (5,000+ packs). The set that
  // introduced the Mega Hyper Rare (replacing Hyper Rare); two grails (Mega Lucario ex /
  // Mega Gardevoir ex) at a brutal 1 in 1260 packs combined. Source: TCGplayer Infinite,
  // "Mega Evolution Pull Rates" (Sep 2025).
  me1: {
    rare: [
      { rarity: 'Double Rare', p: 0.2091 },  // 1 in 5
      { rarity: 'Ultra Rare',  p: 0.0823 },  // 1 in 12
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.1089 }, // 1 in 9
      { rarity: 'Special Illustration Rare', p: 0.0099 }, // 1 in 101
      { rarity: 'Mega Hyper Rare',           p: 0.0008 }, // 2 grails — 1 in 1260
    ],
  },
  // Prismatic Evolutions — SIRs ~2× normal; DR 1-in-6.1, UR 1-in-13.4, Hyper 1-in-178.6.
  // Poké Ball foil ~1 in 3, Master Ball ~1 in 19. Special packs are now in SPECIAL_PACKS.sv8pt5.
  // Sources: thepricedex.com/set/sv8pt5, TCGplayer, PokeBeach.
  sv8pt5: {
    rare: [
      { rarity: 'Double Rare', p: 0.1639 },  // 1 in 6.1
      { rarity: 'Ultra Rare',  p: 0.0746 },  // 1 in 13.4
    ],
    reverse: [
      // Prismatic has NO Illustration Rares — its reverse chase is the SIR pool (32 cards) + the
      // Poké/Master Ball foils below. (Earlier configs listed an IR line the set can't fill.)
      { rarity: 'Special Illustration Rare', p: 0.0222 }, // 1 in 45 (the famous ~2× rate)
      { rarity: 'Hyper Rare',                p: 0.0056 }, // 1 in 178.6
    ],
    foils: [
      { ...FOIL.masterball, p: 0.0526 }, // 1 in 19
      { ...FOIL.pokeball,   p: 0.3333 }, // 1 in 3
    ],
    aceSpec: 0.20, // PE has a 6-card ACE SPEC subset — ~1 in 5 packs
  },
  // Black Bolt — Illustration Rares abundant (~1 in 6, the set's signature); SIR is a true
  // chase (~1.25%, NOT the ~5% it used to read as), and the set has NO Hyper Rare cards —
  // its top chase is the Black White Rare. Poké Ball ~30.6% / Master Ball ~5.1% foils.
  // Sources: TCGplayer, PokePatch, ThePriceDex, dripshop (1,800+ packs) — Jul 2025.
  zsv10pt5: {
    rare: [
      { rarity: 'Double Rare', p: 0.2111 },  // ~21%
      { rarity: 'Ultra Rare',  p: 0.0600 },  // ~6%
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.1640 }, // ~16.4% — signature of the set
      { rarity: 'Special Illustration Rare', p: 0.0125 }, // ~1.25% (was wrongly ~5%)
    ],
    foils: [
      { ...FOIL.pokeball,   p: 0.3056 }, // ~30.6%
      { ...FOIL.masterball, p: 0.0514 }, // ~5.1%
    ],
    chase: [
      { rarity: 'Black White Rare', p: 0.0020 }, // the set's lone top chase — ~1 in 500
    ],
  },
  // White Flare — Black Bolt's twin set; near-identical published rates. Same IR-abundant
  // profile, SIR chase ~1.25%, Black White Rare top chase, Poké Ball / Master Ball foils.
  // Sources: TCGplayer, ThePriceDex, PokeBeach, dripshop (1,800+ packs) — Jul 2025.
  rsv10pt5: {
    rare: [
      { rarity: 'Double Rare', p: 0.2130 },  // ~21.3%
      { rarity: 'Ultra Rare',  p: 0.0580 },  // ~5.8%
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.1640 }, // ~16.4%
      { rarity: 'Special Illustration Rare', p: 0.0125 }, // ~1.25%
    ],
    foils: [
      { ...FOIL.pokeball,   p: 0.3060 }, // ~30.6%
      { ...FOIL.masterball, p: 0.0510 }, // ~5.1%
    ],
    chase: [
      { rarity: 'Black White Rare', p: 0.0020 }, // ~1 in 500
    ],
  },
  // Destined Rivals (sv10) — standard SV rates. Source: TCGplayer Infinite, GameRant,
  // dripshop (Destined Rivals Pull Rates, 2025).
  sv10: {
    rare: [
      { rarity: 'Double Rare', p: 0.2000 },  // ~20%
      { rarity: 'Ultra Rare',  p: 0.0639 },  // ~6.4%
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.0833 }, // ~8.3%
      { rarity: 'Special Illustration Rare', p: 0.0106 }, // ~1.06%
      { rarity: 'Hyper Rare',                p: 0.0067 }, // ~0.67%
    ],
  },
  // Scarlet & Violet—151 (sv3pt5) — famously generous SIR (~3.1%) and gold Hyper (~1.9%).
  // Source: TCGplayer Infinite "SV—151 Pull Rates", PokePatch, dripshop (2023/2025).
  sv3pt5: {
    rare: [
      { rarity: 'Double Rare', p: 0.1320 },  // ~13.2%
      { rarity: 'Ultra Rare',  p: 0.0640 },  // ~6.4%
    ],
    reverse: [
      { rarity: 'Illustration Rare',         p: 0.0850 }, // ~8.5%
      { rarity: 'Special Illustration Rare', p: 0.0310 }, // ~3.1% (unusually generous)
      { rarity: 'Hyper Rare',                p: 0.0190 }, // ~1.9%
    ],
  },

  // ===== Medium/low-confidence era estimates =====================================
  // No official large-sample rates exist for these older sets, so these map published
  // community/era ratios onto our rarity buckets: GX/EX/full-art/BREAK → Ultra Rare,
  // Rainbow/Crystal/Secret → Special Illustration Rare, Gold Star/Gold Secret → Hyper Rare.
  // Sources: TCGplayer, ThePriceDex, elitefourum, karpfolio, community box samples.

  // --- SM era (2018-2019) ---
  sm12: { rare: [{ rarity: 'Ultra Rare', p: 0.2400 }], // Cosmic Eclipse — GX/TAG TEAM heavy
    reverse: [{ rarity: 'Special Illustration Rare', p: 0.0140 }, { rarity: 'Hyper Rare', p: 0.0090 }] },
  sm11: { rare: [{ rarity: 'Ultra Rare', p: 0.1730 }], // Unified Minds
    reverse: [{ rarity: 'Special Illustration Rare', p: 0.0130 }, { rarity: 'Hyper Rare', p: 0.0090 }] },
  sm10: { rare: [{ rarity: 'Ultra Rare', p: 0.1400 }], // Unbroken Bonds
    reverse: [{ rarity: 'Special Illustration Rare', p: 0.0177 }, { rarity: 'Hyper Rare', p: 0.0076 }] },
  sm9:  { rare: [{ rarity: 'Ultra Rare', p: 0.1420 }], // Team Up
    reverse: [{ rarity: 'Special Illustration Rare', p: 0.0170 }, { rarity: 'Hyper Rare', p: 0.0080 }] },
  sm8:  { rare: [{ rarity: 'Ultra Rare', p: 0.1430 }], // Lost Thunder
    reverse: [{ rarity: 'Special Illustration Rare', p: 0.0141 }, { rarity: 'Hyper Rare', p: 0.0097 }] },
  // Hidden Fates — main-set GX + the 94-card Shiny Vault (shiny holo → SIR ~7%; shiny-GX +
  // gold secret → Hyper ~3.6%), so a Shiny Vault card lands ~1 in 9 packs.
  sm115:{ rare: [{ rarity: 'Ultra Rare', p: 0.1000 }],
    reverse: [{ rarity: 'Special Illustration Rare', p: 0.0700 }, { rarity: 'Hyper Rare', p: 0.0360 }] },

  // --- XY era (2015-2016): EX / M-EX / full-art / BREAK → Ultra Rare; Secret Rare → SIR ---
  xy8:  { rare: [{ rarity: 'Ultra Rare', p: 0.2500 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.0140 }] }, // BREAKthrough
  xy9:  { rare: [{ rarity: 'Ultra Rare', p: 0.2390 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.0140 }] }, // BREAKpoint
  xy10: { rare: [{ rarity: 'Ultra Rare', p: 0.2480 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.0080 }] }, // Fates Collide
  xy11: { rare: [{ rarity: 'Ultra Rare', p: 0.1940 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.0140 }] }, // Steam Siege
  xy6:  { rare: [{ rarity: 'Ultra Rare', p: 0.1700 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.0080 }] }, // Roaring Skies

  // --- EX era (2004-2006): ex → Ultra Rare, Gold Star → Hyper Rare, Crystal/Secret → SIR ---
  ex15: { rare: [{ rarity: 'Ultra Rare', p: 0.0830 }], reverse: [{ rarity: 'Hyper Rare', p: 0.0140 }] }, // EX Dragon Frontiers (Gold Star)
  ex8:  { rare: [{ rarity: 'Ultra Rare', p: 0.0740 }], reverse: [{ rarity: 'Hyper Rare', p: 0.0093 }, { rarity: 'Special Illustration Rare', p: 0.0083 }] }, // EX Deoxys
  ecard3: { rare: [], reverse: [{ rarity: 'Special Illustration Rare', p: 0.0460 }] }, // Skyridge Crystals

  // ===== EXHAUSTIVE AUDIT — researched real per-set rates (scripts/audit-pulls.mjs). Sources per era below. =====
  // --- Scarlet & Violet (DigitalTQ 500-700pk; ThePriceDex/TCGplayer 1000+pk). ACE SPEC returned in Paradox
  //     Rift, so sv4+ carry aceSpec ~1 in 20 (baseline's 1 in 5 was ~4x too generous). ---
  sv1: { rare: [{ rarity: 'Double Rare', p: 0.140 }, { rarity: 'Ultra Rare', p: 0.065 }], reverse: [{ rarity: 'Illustration Rare', p: 0.077 }, { rarity: 'Special Illustration Rare', p: 0.031 }, { rarity: 'Hyper Rare', p: 0.019 }] },
  sv2: { rare: [{ rarity: 'Double Rare', p: 0.143 }, { rarity: 'Ultra Rare', p: 0.075 }], reverse: [{ rarity: 'Illustration Rare', p: 0.077 }, { rarity: 'Special Illustration Rare', p: 0.029 }, { rarity: 'Hyper Rare', p: 0.024 }] },
  sv3: { rare: [{ rarity: 'Double Rare', p: 0.142 }, { rarity: 'Ultra Rare', p: 0.060 }], reverse: [{ rarity: 'Illustration Rare', p: 0.084 }, { rarity: 'Special Illustration Rare', p: 0.036 }, { rarity: 'Hyper Rare', p: 0.020 }] },
  sv4: { rare: [{ rarity: 'Double Rare', p: 0.153 }, { rarity: 'Ultra Rare', p: 0.075 }], reverse: [{ rarity: 'Illustration Rare', p: 0.084 }, { rarity: 'Special Illustration Rare', p: 0.019 }, { rarity: 'Hyper Rare', p: 0.012 }], aceSpec: 0.05 },
  sv4pt5: { rare: [{ rarity: 'Double Rare', p: 0.133 }, { rarity: 'Ultra Rare', p: 0.200 }], reverse: [{ rarity: 'Illustration Rare', p: 0.086 }, { rarity: 'Special Illustration Rare', p: 0.015 }, { rarity: 'Hyper Rare', p: 0.093 }] }, // Paldean Fates shiny set: Shiny Rare→Ultra Rare, Shiny Ultra Rare→Hyper Rare (both dominant)
  sv5: { rare: [{ rarity: 'Double Rare', p: 0.180 }, { rarity: 'Ultra Rare', p: 0.078 }], reverse: [{ rarity: 'Illustration Rare', p: 0.083 }, { rarity: 'Special Illustration Rare', p: 0.016 }, { rarity: 'Hyper Rare', p: 0.0072 }], aceSpec: 0.05 },
  sv6: { rare: [{ rarity: 'Double Rare', p: 0.169 }, { rarity: 'Ultra Rare', p: 0.066 }], reverse: [{ rarity: 'Illustration Rare', p: 0.078 }, { rarity: 'Special Illustration Rare', p: 0.0117 }, { rarity: 'Hyper Rare', p: 0.0068 }], aceSpec: 0.05 },
  sv6pt5: { rare: [{ rarity: 'Double Rare', p: 0.167 }, { rarity: 'Ultra Rare', p: 0.070 }], reverse: [{ rarity: 'Illustration Rare', p: 0.077 }, { rarity: 'Special Illustration Rare', p: 0.0115 }, { rarity: 'Hyper Rare', p: 0.0078 }], aceSpec: 0.05 },
  sv7: { rare: [{ rarity: 'Double Rare', p: 0.169 }, { rarity: 'Ultra Rare', p: 0.068 }], reverse: [{ rarity: 'Illustration Rare', p: 0.078 }, { rarity: 'Special Illustration Rare', p: 0.0111 }, { rarity: 'Hyper Rare', p: 0.0073 }], aceSpec: 0.05 },
  sv8: { rare: [{ rarity: 'Double Rare', p: 0.169 }, { rarity: 'Ultra Rare', p: 0.068 }], reverse: [{ rarity: 'Illustration Rare', p: 0.077 }, { rarity: 'Special Illustration Rare', p: 0.0115 }, { rarity: 'Hyper Rare', p: 0.0053 }], aceSpec: 0.05 },
  sv9: { rare: [{ rarity: 'Double Rare', p: 0.204 }, { rarity: 'Ultra Rare', p: 0.065 }], reverse: [{ rarity: 'Illustration Rare', p: 0.085 }, { rarity: 'Special Illustration Rare', p: 0.0116 }, { rarity: 'Hyper Rare', p: 0.0073 }] },
  me5: { rare: [{ rarity: 'Double Rare', p: 0.200 }, { rarity: 'Ultra Rare', p: 0.083 }], reverse: [{ rarity: 'Illustration Rare', p: 0.110 }, { rarity: 'Special Illustration Rare', p: 0.012 }, { rarity: 'Mega Hyper Rare', p: 0.0007 }] }, // Pitch Black — provisional (no large sample yet), mirrors me3/me4
  // --- Sword & Shield (elitefourum 2.7-5k pk / DigitalTQ / ThePriceDex). Ultra Rare = base Holo V + VMAX/VSTAR/
  //     Radiant/Amazing + full-art V (all → 'Ultra Rare' in our data). Trainer/Galarian Gallery + Shiny Vault are
  //     separate SUBSET_SLOT pulls. Hyper Rare = Rainbow + Gold Secret. ---
  swsh1: { rare: [{ rarity: 'Ultra Rare', p: 0.207 }], reverse: [{ rarity: 'Hyper Rare', p: 0.016 }] },
  swsh2: { rare: [{ rarity: 'Ultra Rare', p: 0.205 }], reverse: [{ rarity: 'Hyper Rare', p: 0.018 }] },
  swsh3: { rare: [{ rarity: 'Ultra Rare', p: 0.208 }], reverse: [{ rarity: 'Hyper Rare', p: 0.016 }] },
  swsh4: { rare: [{ rarity: 'Ultra Rare', p: 0.267 }], reverse: [{ rarity: 'Hyper Rare', p: 0.024 }] }, // incl. Amazing Rare
  swsh5: { rare: [{ rarity: 'Ultra Rare', p: 0.158 }], reverse: [{ rarity: 'Hyper Rare', p: 0.020 }] },
  swsh6: { rare: [{ rarity: 'Ultra Rare', p: 0.161 }], reverse: [{ rarity: 'Hyper Rare', p: 0.020 }] },
  swsh7: { rare: [{ rarity: 'Ultra Rare', p: 0.205 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }, { rarity: 'Hyper Rare', p: 0.021 }] }, // Evolving Skies — alt-art SIR 1 in 72
  swsh8: { rare: [{ rarity: 'Ultra Rare', p: 0.186 }], reverse: [{ rarity: 'Hyper Rare', p: 0.016 }] },
  swsh9: { rare: [{ rarity: 'Ultra Rare', p: 0.237 }], reverse: [{ rarity: 'Hyper Rare', p: 0.028 }] },
  swsh10: { rare: [{ rarity: 'Ultra Rare', p: 0.289 }], reverse: [{ rarity: 'Hyper Rare', p: 0.024 }] }, // incl. Radiant
  swsh11: { rare: [{ rarity: 'Ultra Rare', p: 0.228 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.005 }, { rarity: 'Hyper Rare', p: 0.020 }] },
  swsh12: { rare: [{ rarity: 'Ultra Rare', p: 0.290 }], reverse: [{ rarity: 'Hyper Rare', p: 0.029 }] },
  swsh35: { rare: [{ rarity: 'Ultra Rare', p: 0.253 }], reverse: [{ rarity: 'Hyper Rare', p: 0.020 }] }, // Champion's Path
  swsh45: { rare: [{ rarity: 'Ultra Rare', p: 0.200 }], reverse: [{ rarity: 'Hyper Rare', p: 0.021 }] }, // Shining Fates — Shiny Vault via SUBSET_SLOT
  swsh12pt5: { rare: [{ rarity: 'Ultra Rare', p: 0.300 }] }, // Crown Zenith — secrets live in the Galarian Gallery (SUBSET_SLOT)
  // --- Sun & Moon (PullRates + box-break). Ultra Rare = GX + full-art GX/EX (→ 'Ultra Rare'). Hyper = Rainbow +
  //     Gold Secret. holoRare ~1 in 3 for the non-GX rare. ---
  sm1: { rare: [{ rarity: 'Ultra Rare', p: 0.153 }], reverse: [{ rarity: 'Hyper Rare', p: 0.023 }], holoRare: 0.33 },
  sm2: { rare: [{ rarity: 'Ultra Rare', p: 0.153 }], reverse: [{ rarity: 'Hyper Rare', p: 0.023 }], holoRare: 0.33 },
  sm3: { rare: [{ rarity: 'Ultra Rare', p: 0.153 }], reverse: [{ rarity: 'Hyper Rare', p: 0.023 }], holoRare: 0.33 },
  sm4: { rare: [{ rarity: 'Ultra Rare', p: 0.153 }], reverse: [{ rarity: 'Hyper Rare', p: 0.023 }], holoRare: 0.33 },
  sm5: { rare: [{ rarity: 'Ultra Rare', p: 0.153 }], reverse: [{ rarity: 'Hyper Rare', p: 0.020 }], holoRare: 0.33 },
  sm6: { rare: [{ rarity: 'Ultra Rare', p: 0.153 }], reverse: [{ rarity: 'Hyper Rare', p: 0.020 }], holoRare: 0.33 },
  sm7: { rare: [{ rarity: 'Ultra Rare', p: 0.153 }], reverse: [{ rarity: 'Hyper Rare', p: 0.020 }], holoRare: 0.33 },
  sm35: { rare: [{ rarity: 'Ultra Rare', p: 0.153 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.111 }, { rarity: 'Hyper Rare', p: 0.020 }], holoRare: 0.33 }, // Shining Legends — Shining Pokémon → SIR
  sm75: { rare: [{ rarity: 'Ultra Rare', p: 0.193 }], reverse: [{ rarity: 'Hyper Rare', p: 0.022 }], holoRare: 0.33 }, // Dragon Majesty
  // --- XY (PullRates). Ultra Rare = EX + M-EX + full-art (→ 'Ultra Rare'). Secret Rare → SIR in our data
  //     (XY has no Rainbow/Hyper tier). ---
  xy1: { rare: [{ rarity: 'Ultra Rare', p: 0.157 }], holoRare: 0.33 }, // XY base — no Secret Rare
  xy2: { rare: [{ rarity: 'Ultra Rare', p: 0.161 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.010 }], holoRare: 0.33 },
  xy3: { rare: [{ rarity: 'Ultra Rare', p: 0.161 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.010 }], holoRare: 0.33 },
  xy4: { rare: [{ rarity: 'Ultra Rare', p: 0.161 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.010 }], holoRare: 0.33 },
  xy5: { rare: [{ rarity: 'Ultra Rare', p: 0.167 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.010 }], holoRare: 0.33 },
  xy7: { rare: [{ rarity: 'Ultra Rare', p: 0.167 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.013 }], holoRare: 0.33 },
  xy12: { rare: [{ rarity: 'Ultra Rare', p: 0.141 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.013 }], holoRare: 0.33 }, // Evolutions
  // ===== VINTAGE (era profiles; medium/low confidence — box-break + Flipside/community. holoRare = the era's
  //     ~1 in 3-3.5 holo rate, so vintage packs stop coming out ~92% holo). Tier→rarity per our data. =====
  // Black & White: Full Art → Ultra Rare, Secret → SIR.
  bw1: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }], holoRare: 0.28 },
  bw2: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], holoRare: 0.28 }, // Emerging Powers — no Secret Rare
  bw3: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }], holoRare: 0.28 },
  bw4: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }], holoRare: 0.28 },
  bw5: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }], holoRare: 0.28 },
  bw6: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }], holoRare: 0.28 },
  bw7: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }], holoRare: 0.28 },
  bw8: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }], holoRare: 0.28 },
  bw9: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }], holoRare: 0.28 },
  bw10: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }], holoRare: 0.28 },
  bw11: { rare: [{ rarity: 'Ultra Rare', p: 0.06 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.014 }], holoRare: 0.28 },
  col1: { rare: [], holoRare: 0.28 }, // Call of Legends — Shiny Legendary SL cards are Rare Holo (pull via holo slot)
  // HGSS: Prime → Ultra Rare, LEGEND → Hyper Rare, Shiny (base only) → SIR.
  hgss1: { rare: [{ rarity: 'Ultra Rare', p: 0.15 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.028 }, { rarity: 'Hyper Rare', p: 0.067 }], holoRare: 0.28 },
  hgss2: { rare: [{ rarity: 'Ultra Rare', p: 0.15 }], reverse: [{ rarity: 'Hyper Rare', p: 0.067 }], holoRare: 0.28 },
  hgss3: { rare: [{ rarity: 'Ultra Rare', p: 0.15 }], reverse: [{ rarity: 'Hyper Rare', p: 0.067 }], holoRare: 0.28 },
  hgss4: { rare: [{ rarity: 'Ultra Rare', p: 0.15 }], reverse: [{ rarity: 'Hyper Rare', p: 0.067 }], holoRare: 0.28 },
  // Platinum: Lv.X → Ultra Rare, shiny Secret → SIR.
  pl1: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.028 }], holoRare: 0.28 },
  pl2: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.028 }], holoRare: 0.28 },
  pl3: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], reverse: [{ rarity: 'Special Illustration Rare', p: 0.028 }], holoRare: 0.28 },
  pl4: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], holoRare: 0.28 }, // Arceus — no shiny Secret
  // Diamond & Pearl: Lv.X → Ultra Rare.
  dp1: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], holoRare: 0.28 },
  dp2: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], holoRare: 0.28 },
  dp3: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], holoRare: 0.28 },
  dp4: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], holoRare: 0.28 },
  dp5: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], holoRare: 0.28 },
  dp6: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], holoRare: 0.28 },
  dp7: { rare: [{ rarity: 'Ultra Rare', p: 0.05 }], holoRare: 0.28 },
  // EX era: ex → Ultra Rare, Gold Star → Hyper Rare (ex9 Team Rocket Returns onward only).
  ex1: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], holoRare: 0.28 },
  ex2: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], holoRare: 0.28 },
  ex3: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], holoRare: 0.28 },
  ex4: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], holoRare: 0.28 },
  ex5: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], holoRare: 0.28 },
  ex6: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], holoRare: 0.28 },
  ex7: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], holoRare: 0.28 },
  ex9: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], holoRare: 0.28 }, // Emerald — no Gold Star (secret filled by backstop)
  ex10: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], reverse: [{ rarity: 'Hyper Rare', p: 0.014 }], holoRare: 0.28 },
  ex11: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], reverse: [{ rarity: 'Hyper Rare', p: 0.014 }], holoRare: 0.28 },
  ex12: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], reverse: [{ rarity: 'Hyper Rare', p: 0.014 }], holoRare: 0.28 },
  ex13: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], reverse: [{ rarity: 'Hyper Rare', p: 0.014 }], holoRare: 0.28 },
  ex14: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], reverse: [{ rarity: 'Hyper Rare', p: 0.014 }], holoRare: 0.28 },
  ex16: { rare: [{ rarity: 'Ultra Rare', p: 0.08 }], reverse: [{ rarity: 'Hyper Rare', p: 0.030 }], holoRare: 0.28 }, // Power Keepers — Gold Star richer (~1 in 33)
  // e-Card: Crystal → SIR (Aquapolis/Skyridge only; Expedition has none).
  ecard1: { rare: [], holoRare: 0.28 }, // Expedition — no Crystals
  ecard2: { rare: [], reverse: [{ rarity: 'Special Illustration Rare', p: 0.030 }], holoRare: 0.28 }, // Aquapolis
  // WOTC: holo IS the chase (~1 in 3.5); Shining Pokémon → Hyper Rare (Neo Revelation/Destiny only).
  base1: { rare: [], holoRare: 0.28 },
  base2: { rare: [], holoRare: 0.28 },
  base3: { rare: [], holoRare: 0.28 },
  base4: { rare: [], holoRare: 0.28 },
  base5: { rare: [], holoRare: 0.28 },
  base6: { rare: [], holoRare: 0.28 },
  gym1: { rare: [], holoRare: 0.28 },
  gym2: { rare: [], holoRare: 0.28 },
  neo1: { rare: [], holoRare: 0.28 },
  neo2: { rare: [], holoRare: 0.28 },
  neo3: { rare: [], reverse: [{ rarity: 'Hyper Rare', p: 0.012 }], holoRare: 0.28 }, // Neo Revelation — Shining Pokémon
  neo4: { rare: [], reverse: [{ rarity: 'Hyper Rare', p: 0.012 }], holoRare: 0.28 }, // Neo Destiny — Shining Pokémon
}
function ratesFor(set) { return SET_RATES[set.id] || BASELINE_RATES }
// Which sets carry an explicit (researched) rate config vs. falling back to BASELINE_RATES —
// exposed for the pull-rate audit (scripts/audit-pulls.mjs) so it can flag baseline-only sets.
export const RATED_SET_IDS = new Set(Object.keys(SET_RATES))
export function rateConfigFor(setId) { return SET_RATES[setId] || null }
// The EFFECTIVE rate config a set actually runs on (its own, else the baseline). The audit uses
// this to tell a truly-orphaned chase tier (no slot routes to it) from a merely-brutal grail.
export function effectiveRates(setId) { return SET_RATES[setId] || BASELINE_RATES }

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
  for (const h of (table || [])) { // a config may omit `reverse`/`chase` entirely
    const pool = byR[h.rarity]
    if (pool && pool.length) {
      if (roll < h.p) return pick(pool)
      roll -= h.p
    }
  }
  return null
}

// A real booster never contains two copies of the same card. Slots are rolled
// independently (with replacement) and some pools overlap, so a pack can end up with
// dupes (e.g. two Kyogre, two Flying Pikachu V). Swap each duplicate for an UNUSED card
// of the SAME rarity — so pull odds and the foil/reverse look of the slot are preserved —
// falling back to leaving it only if that rarity has no other card left. Dedupes by the
// base card `id` (instances share it); mutates + returns the pulls array in place.
function dedupePack(pulls, byR, rnd = Math.random) {
  const seen = new Set()
  const allCards = Object.values(byR).flat() // every card in the set, for the fallback pool
  for (let i = 0; i < pulls.length; i++) {
    const c = pulls[i]
    if (!seen.has(c.id)) { seen.add(c.id); continue }
    // Prefer an unused card of the SAME rarity (keeps pull odds + the slot's look). If that
    // rarity is exhausted (tiny sets like Celebrations), fall back to ANY unused card in the
    // set so the pack is still dupe-free — negligible odds drift, no repeats.
    let pool = (byR[c.rarity] || []).filter(x => !seen.has(x.id))
    if (!pool.length) pool = allCards.filter(x => !seen.has(x.id))
    if (!pool.length) { seen.add(c.id); continue } // pack larger than the whole set (shouldn't happen)
    const repl = instance(pick(pool, rnd))
    repl.foil = c.foil || false          // keep the slot's foil pattern
    repl.reverse = !!c.reverse           // and reverse-holo flag
    if (c._fromGod) repl._fromGod = true
    if (c._fromDemigod) repl._fromDemigod = true
    pulls[i] = repl
    seen.add(repl.id)
  }
  return pulls
}

// Open a single pack from a set. Returns an array of pulled card instances.
// The array may carry a `_god` flag (god pack) or `_demigod` flag (demigod pack).
// Also sets `_specialKey` / `_specialLabel` for any special-pack variant that fires.
// Exact per-card, per-pack Celebrations pull rates (%), from DigitalTQ's 541-pack sample.
// Keyed by our card id. Main set is cel25-<number>; Classic Collection is cel25c-*.
const CEL_RATE = {
  // --- main set (cel25) ---
  'cel25-1': 21.44,  'cel25-2': 23.11,  'cel25-3': 21.81,  'cel25-4': 20.89,  'cel25-5': 13.49, // Ho-Oh…Pikachu
  'cel25-6': 6.47,   'cel25-7': 4.81,   'cel25-8': 5.36,   'cel25-9': 4.44,   'cel25-10': 22.55, // Pikachu V/VMAX…Zekrom
  'cel25-11': 12.94, 'cel25-12': 21.81, 'cel25-13': 24.03, 'cel25-14': 22.18, 'cel25-15': 9.61,  // Mew…Lunala
  'cel25-16': 7.39,  'cel25-17': 21.44, 'cel25-18': 5.18,  'cel25-19': 19.41, 'cel25-20': 19.96, // Zacian V…Dialga
  'cel25-21': 13.12, 'cel25-22': 21.44, 'cel25-23': 12.75, 'cel25-24': 3.88,  'cel25-25': 0.37,  // Solgaleo…Mew(Gold)
  // --- Classic Collection (cel25c) — matched by name ---
  'cel25c-4_A': 1.29,   'cel25c-2_A': 2.59,   'cel25c-15_A1': 2.59, 'cel25c-15_A2': 3.33, // Charizard, Blastoise, Venusaur, Team Rocket
  'cel25c-15_A4': 2.77, 'cel25c-15_A3': 2.22, 'cel25c-73_A': 1.85,  'cel25c-8_A': 1.11,   // Claydol, Rocket's Zapdos, Imposter Oak, Dark Gyarados
  'cel25c-66_A': 1.11,  'cel25c-24_A': 2.96,  'cel25c-20_A': 2.03,  'cel25c-86_A': 1.66,  // Shining Magikarp, Lt. Surge's Pikachu, Cleffa, Rocket's Admin
  'cel25c-17_A': 0.74,  'cel25c-88_A': 1.29,  'cel25c-93_A': 1.11,  'cel25c-9_A': 3.14,   // Umbreon★, Mew ex, Gardevoir ex, Team Magma's Groudon
  'cel25c-109_A': 0.74, 'cel25c-145_A': 1.48, 'cel25c-113_A': 0.55, 'cel25c-114_A': 1.48, // Luxray GL, Garchomp C, Reshiram, Zekrom
  'cel25c-54_A': 0.74,  'cel25c-97_A': 1.11,  'cel25c-60_A': 1.29,  'cel25c-107_A': 0.55, // Mewtwo-EX, Xerneas-EX, Tapu Lele-GX, Donphan
  'cel25c-76_A': 0.37,                                                                    // M Rayquaza-EX
}
// Aggregate slot odds: a pack's 4th "hit" card is a Classic Collection reprint 37.81% of
// packs, a main-set Ultra Rare art card 37.53%, else another holo rare (24.66%).
const CEL_CC_SLOT = 0.3781
const CEL_UR_SLOT = 0.3753

// Draw a card from `pool` (excluding already-used ids), weighted by its Celebrations pull
// rate so each card lands at its real frequency. Without replacement — no repeats in a pack.
function weightedCelPick(pool, used, rnd = Math.random) {
  const src = pool.filter(c => !used.has(c.id))
  const use = src.length ? src : pool
  let total = 0; for (const c of use) total += CEL_RATE[c.id] || 0.5
  let r = rnd() * total
  let chosen = use[use.length - 1]
  for (const c of use) { r -= (CEL_RATE[c.id] || 0.5); if (r <= 0) { chosen = c; break } }
  used.add(chosen.id)
  return chosen
}

// Celebrations (cel25) is a bespoke 4-card, all-holo pack — nothing like a normal booster,
// so it gets its own builder. Structure + odds match the real published pull rates
// (DigitalTQ, 541 packs): 3 main-set holo rares, then a 4th "hit" slot that's a Classic
// Collection reprint (37.81%), a main-set Ultra Rare art card (37.53%), or another holo.
// Every card is weighted by its EXACT per-card rate (Charizard 1.29%, Rayquaza 0.37%, …).
function openCelebrationsPack(set) {
  const byR = cardsByRarity(set)
  const base = [...(byR['Rare'] || []), ...(byR['Rare Holo'] || [])] // main-set holo rares
  const ur = byR['Ultra Rare'] || []                                 // main-set art rares
  const cc = byR['Special Illustration Rare'] || []                  // Classic Collection
  const basePool = base.length ? base : set.cards
  const used = new Set()
  const pulls = []
  for (let i = 0; i < 3; i++) pulls.push(instance(weightedCelPick(basePool, used)))
  const r = Math.random()
  const hitPool = (r < CEL_CC_SLOT && cc.length) ? cc
    : (r < CEL_CC_SLOT + CEL_UR_SLOT && ur.length) ? ur
    : basePool
  pulls.push(instance(weightedCelPick(hitPool, used)))
  // reveal the best (highest rarity) card last
  pulls.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity))
  return pulls
}

// In-set alt-art SUBSETS that, in real life, land in the REVERSE slot at a published aggregate
// rate (replacing the ordinary reverse holo) rather than trickling out of the generic rare/reverse
// ladder. Rates from pull-tracker samples of thousands of packs (DigitalTQ / ThePriceDex):
//   Shiny Vault      — Shining Fates ~1 in 2.8, Hidden Fates a touch rarer
//   Galarian Gallery — Crown Zenith ~1 in 3
//   Trainer Gallery  — SWSH sets ~1 in 8 (Brilliant Stars 1,004-pack sample; applied across the era)
const SUBSET_SLOT = {
  swsh45:    { odds: 0.36,  test: id => id.startsWith('swsh45sv-') },    // Shining Fates Shiny Vault
  sm115:     { odds: 0.30,  test: id => id.startsWith('sma-') },         // Hidden Fates Shiny Vault
  swsh12pt5: { odds: 0.30,  test: id => id.startsWith('swsh12pt5gg-') }, // Crown Zenith Galarian Gallery
  swsh9:     { odds: 0.126, test: id => id.startsWith('swsh9tg-') },     // Brilliant Stars Trainer Gallery
  swsh10:    { odds: 0.126, test: id => id.startsWith('swsh10tg-') },    // Astral Radiance Trainer Gallery
  swsh11:    { odds: 0.126, test: id => id.startsWith('swsh11tg-') },    // Lost Origin Trainer Gallery
  swsh12:    { odds: 0.126, test: id => id.startsWith('swsh12tg-') },    // Silver Tempest Trainer Gallery
}

// --- 🎌 Japanese packs (Import License) ----------------------------------------
// JP boosters are their own animal: 5 cards at ~¥180, no reverse slot, and a single
// rare-or-better slot with a DENSER hit ladder than English (why rippers import).
// Rates approximate SV-era JP box breakdowns (per 30-pack box: ~7 RR, ~3 AR, ~1 SR,
// a SAR every other box, a gold every ~5 boxes). JP rarity vocab maps onto our tiers
// in the fetch (AR→Illustration Rare, SR→Ultra Rare, SAR→Special Illustration Rare).
const JP_SLOT = [
  { rarity: 'Special Illustration Rare', p: 0.016 },  // SAR — ~1 in 63 packs
  { rarity: 'Hyper Rare',                p: 0.0066 }, // gold — ~1 in 150 (skipped if the set has none)
  { rarity: 'Ultra Rare',                p: 0.033 },  // SR — ~1 per box
  { rarity: 'Illustration Rare',         p: 0.10 },   // AR — ~3 per box
  { rarity: 'Double Rare',               p: 0.23 },   // RR — ~7 per box
]
// Pattern-parallel print (Master Ball / Poké Ball mirror), tagged in the card id by the
// JP fetch ("jp-SV2a-094MB"). These are separate PRICED cards sharing the base card's
// number — they must stay out of the normal pull pools or a $500 MB mirror reads as a
// common (this is also why 151 isn't rippable yet: JustTCG carries its C/U/R population
// ONLY as MB parallels, so there's no honest base pool to fill a pack from).
function jpPatternTag(card) {
  const m = /(MB|PB|PT)x*$/.exec(card?.id || '')
  return m ? m[1] : null
}
// Base (non-parallel) pools for a JP set, cached — pack composition and EV both read these.
const JP_POOLS = new Map()
function jpPools(set) {
  let byR = JP_POOLS.get(set.id)
  if (!byR) {
    byR = {}
    for (const c of set.cards) if (!jpPatternTag(c)) (byR[c.rarity] ||= []).push(c)
    JP_POOLS.set(set.id, byR)
  }
  return byR
}
function openJapanesePack(set) {
  const byR = jpPools(set)
  const commons = byR['Common'] || byR['Uncommon'] || set.cards
  const uncommons = byR['Uncommon'] || commons
  // 5 cards: 3 commons + 1 uncommon + the rare slot (an upgrade if the ladder hits).
  const pulls = []
  for (let i = 0; i < 3; i++) pulls.push(instance(pick(commons)))
  pulls.push(instance(pick(uncommons)))
  const hit = rollSlot(byR, JP_SLOT)
  const base = byR['Rare']?.length ? pick(byR['Rare'])
    : byR['Rare Holo']?.length ? pick(byR['Rare Holo']) : pick(uncommons)
  pulls.push(instance(hit || base))
  dedupePack(pulls, byR)
  pulls.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity))
  return pulls
}
// Analytic EV of one JP pack from BASE card prices (no market drift — product pricing
// must be deterministic across sessions). Mirrors openJapanesePack exactly: 3 commons +
// 1 uncommon + the slot ladder with skip-if-missing semantics, leftover to the base rare.
const JP_EV = new Map()
export function jpPackEV(set) {
  let ev = JP_EV.get(set.id)
  if (ev != null) return ev
  const byR = jpPools(set)
  const avg = (pool) => pool && pool.length ? pool.reduce((a, c) => a + (c.price || 0), 0) / pool.length : null
  const commons = avg(byR['Common']) ?? avg(byR['Uncommon']) ?? 0
  const uncommons = avg(byR['Uncommon']) ?? commons
  let slot = 0, used = 0
  for (const t of JP_SLOT) {
    const a = avg(byR[t.rarity])
    if (a != null) { slot += t.p * a; used += t.p }
  }
  slot += (1 - used) * (avg(byR['Rare']) ?? avg(byR['Rare Holo']) ?? uncommons)
  ev = round2(3 * commons + uncommons + slot)
  JP_EV.set(set.id, ev)
  return ev
}

// One pack. Every pack path in the game funnels through here, which is why the 🖨️ misprint
// roll lives in this wrapper rather than in each builder: a new pack structure cannot forget
// to include it. GOD PACKS are the deliberate exception — a pack where all ten cards are
// chases does not also need a press fault, and stacking the two would spike pack EV.
export function openPack(set) {
  const pulls = openPackInner(set)
  if (pulls && !pulls._specialKey) applyPackMisprint(pulls)
  return pulls
}
function openPackInner(set) {
  if (set.japanese) return openJapanesePack(set)     // 🎌 5-card JP structure, own hit ladder
  if (set.id === 'cel25') return openCelebrationsPack(set) // bespoke 4-card structure
  const byR = cardsByRarity(set)
  // An alt-art subset (Shiny Vault / Galarian or Trainer Gallery) comes ONLY from its dedicated
  // reverse slot below (at its real rate) — strip it from the generic rarity pools so it can't
  // also leak out of the rare/reverse ladder and double-count (which overshoots the real rate).
  const subset = SUBSET_SLOT[set.id]
  if (subset) for (const k of Object.keys(byR)) byR[k] = byR[k].filter(c => !subset.test(c.id))
  const rates = ratesFor(set)
  const commons = byR['Common'] || byR['Uncommon'] || set.cards
  const uncommons = byR['Uncommon'] || commons

  // A pack is 10 cards: 4 commons + 4 uncommons + a rare slot + a reverse slot.
  const nCommon = 4
  const nUncommon = 4
  const packSize = 10

  // SPECIAL PACKS — roll each variant in order (rarest first). First hit wins.
  // Variants that fire return a fully-formed pack with the right tier flags.
  const variants = SPECIAL_PACKS[set.id]
  if (variants) {
    for (const variant of variants) {
      if (Math.random() < variant.odds) {
        const pulls = buildSpecialPack(set, byR, variant, packSize)
        dedupePack(pulls, byR) // no two identical cards in one pack
        pulls._specialKey = variant.key
        pulls._specialLabel = variant.label
        return pulls
      }
    }
  }

  const pulls = []
  for (let i = 0; i < nCommon; i++) pulls.push(instance(pick(commons)))
  for (let i = 0; i < nUncommon; i++) pulls.push(instance(pick(uncommons)))

  // RARE slot — an upgrade (Double/Ultra Rare) if it hits, else the base rare. For MODERN sets
  // the base rare is a plain Rare (holo is its own upgrade tier). VINTAGE sets are different: the
  // slot is a HOLO only ~1 in 3 packs (`rates.holoRare`), else a non-holo Rare — without that,
  // every vintage pack came out holo (~92%) instead of the real ~28%.
  const rareHit = rollSlot(byR, rates.rare)
  let rareCard = rareHit
  if (!rareCard) {
    const wantHolo = rates.holoRare == null || Math.random() < rates.holoRare
    rareCard = (wantHolo && byR['Rare Holo']?.length ? pick(byR['Rare Holo']) : null)
      || (byR['Rare']?.length ? pick(byR['Rare']) : null)
      || (byR['Rare Holo']?.length ? pick(byR['Rare Holo']) : pick(uncommons))
  }
  pulls.push(instance(rareCard))

  // Top-end chase shot (MEGA_ATTACK / Black White) — a rare extra upgrade that can
  // ride in addition to the normal reverse slot when the set has those rarities.
  const chaseHit = rates.chase ? rollSlot(byR, rates.chase) : null
  if (chaseHit) pulls.push(instance(chaseHit))

  // REVERSE slot — an alt-art subset card (Shiny Vault / Galarian or Trainer Gallery) lands here
  // at its real rate, else sets with an ACE SPEC subset land one ~1 in 5 packs; otherwise it's an
  // IR/SIR/Hyper upgrade > special foil > ordinary reverse holo.
  const subsetPool = subset && Math.random() < subset.odds ? set.cards.filter(c => subset.test(c.id)) : null
  const aceSpecPool = byR['ACE SPEC Rare']
  if (subsetPool?.length) {
    pulls.push(instance(pick(subsetPool)))
  } else if (aceSpecPool?.length && rates.aceSpec && Math.random() < rates.aceSpec) {
    pulls.push(instance(pick(aceSpecPool)))
  } else {
    // Effective reverse table = the set's configured reverse tiers PLUS baseline coverage for any
    // chase rarity the set HAS but its config didn't route — so a set's SIR/Hyper/IR secrets are
    // never fully orphaned by an incomplete per-set config. Subset cards were already stripped from
    // byR above, so subset-covered tiers self-exclude (their byR bucket is empty).
    const cfgRev = rates.reverse || []
    const seen = new Set(cfgRev.map(e => e.rarity))
    const effReverse = [...cfgRev, ...BASELINE_RATES.reverse.filter(e => !seen.has(e.rarity) && byR[e.rarity]?.length)]
    const revHit = rollSlot(byR, effReverse)
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

  // no two identical cards in one pack — swap dupes for unused cards of the same rarity
  dedupePack(pulls, byR)
  // sort so the best card is revealed last (foils rank above plain reverse)
  pulls.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) + foilWeight(a) - foilWeight(b))
  return pulls
}

// Roll one error across a finished pack and stamp it onto a single card. The card is chosen
// UNIFORMLY: a press does not know what rarity it is printing, and because a pack is mostly
// commons the fault usually lands on one. That is what keeps the whole category's
// contribution to pack EV under a tenth of a percent, which sim section 1 depends on.
export function applyPackMisprint(pulls, rnd = Math.random) {
  if (!pulls?.length) return null
  const m = rollMisprint(rnd)
  if (!m) return null
  const card = pulls[pickMisprintIndex(pulls.length, rnd)]
  if (!card || card.misprint) return null
  card.misprint = m
  card._isMisprint = true
  return card
}

// The odds openPack() actually rolls, read back out as numbers — the input to the 🎲 luck panel
// (what you pulled vs what the packs owed you). It walks the SAME tables and the SAME slot
// structure as openPack above, so a rate change moves both together; there is no second copy of
// any number here. Mirrors, in order: special packs → rare slot → chase roll → reverse slot
// (which a subset card or an ACE SPEC pre-empts) → foils (only when the reverse didn't upgrade).
//
// Returns { [tier]: probability that a single pack yields one }, keyed by rarity name,
// `foil:<key>`, `subset`, or `god`/`demigod`. Tiers a set has no cards for are omitted, exactly
// as rollSlot skips them. Japanese and Celebrations packs have their own structures and aren't
// modelled — they return {} and the panel leaves them out rather than guessing.
export function pullOdds(set) {
  if (!set || set.japanese || set.id === 'cel25') return {}
  const byR = cardsByRarity(set)
  const subset = SUBSET_SLOT[set.id]
  if (subset) for (const k of Object.keys(byR)) byR[k] = byR[k].filter(c => !subset.test(c.id))
  const rates = ratesFor(set)
  const has = (r) => !!byR[r]?.length
  const odds = {}
  const add = (k, p) => { if (p > 0) odds[k] = (odds[k] || 0) + p }

  // Special packs replace the whole pack rather than modifying a slot, so they're their own
  // lines. Rolled in order with the first hit winning, so each is conditional on the earlier ones
  // missing — which is why this accumulates `taken` instead of using v.odds directly.
  let taken = 0
  for (const v of (SPECIAL_PACKS[set.id] || [])) {
    const p = v.odds * (1 - taken)
    taken += p
    add(v.tier === 'god' ? 'god' : 'demigod', p)
  }
  // RARE slot — always reached.
  for (const h of (rates.rare || [])) if (has(h.rarity)) add(h.rarity, h.p)
  // Top-end chase — an independent extra roll that rides alongside the reverse slot.
  for (const h of (rates.chase || [])) if (has(h.rarity)) add(h.rarity, h.p)

  // REVERSE slot. A Gallery/Shiny-Vault card takes it first, then an ACE SPEC; only what's left
  // reaches the upgrade ladder, and only what's left of THAT can carry a special foil.
  const pSubset = subset ? subset.odds : 0
  if (pSubset) add('subset', pSubset)
  const pAce = (has('ACE SPEC Rare') && rates.aceSpec) ? rates.aceSpec : 0
  if (pAce) add('ACE SPEC Rare', (1 - pSubset) * pAce)
  const reach = (1 - pSubset) * (1 - pAce)
  const cfgRev = rates.reverse || []
  const seenRev = new Set(cfgRev.map(e => e.rarity))
  const effReverse = [...cfgRev, ...BASELINE_RATES.reverse.filter(e => !seenRev.has(e.rarity) && has(e.rarity))]
  let upgrade = 0
  for (const h of effReverse) {
    if (!has(h.rarity)) continue
    add(h.rarity, reach * h.p)
    upgrade += h.p
  }
  const plain = reach * Math.max(0, 1 - upgrade)
  for (const f of (rates.foils || [])) add(`foil:${f.key}`, plain * f.p)
  return odds
}

// How a pulled card maps onto a pullOdds() tier. `packSetId` is the set of the pack it came out
// of: a card whose own set differs came from the Gallery / Shiny Vault subset slot.
export function luckTierOf(card, packSetId) {
  if (!card) return null
  if (packSetId && setIdOfCard(card) !== packSetId) return 'subset'
  if (card.foil) return `foil:${card.foil.key}`
  return LUCK_UNTRACKED.has(card.rarity) ? null : card.rarity
}
// The base slots every pack fills regardless of luck — nothing to compare against odds.
const LUCK_UNTRACKED = new Set(['Common', 'Uncommon', 'Rare', 'Rare Holo'])

// Is this card a hole in a set you're building? The rip has always badged ⭐ Want — somebody
// ELSE's want — and said nothing about your own, even though master-set completion is what pays
// the completion reward, the challenge bounty and the showcase perks.
//
// Matched on card id, deliberately: that's the same "one of every card" definition setCompletion
// uses to pay out, so the badge can't promise progress the reward won't recognise.
//   owned          — ownedIdSet(collection + binder)
//   challengeSetId — the declared 🃏 master set challenge, if any (explicit intent)
//   binderSets     — set ids you've filed anything into (implicit intent)
// Returns 'challenge' | 'binder' | null.
export function needTierFor(card, owned, challengeSetId, binderSets) {
  if (!card?.id || owned?.has(card.id)) return null
  const sid = setIdOfCard(card)
  if (challengeSetId && sid === challengeSetId) return 'challenge'
  if (binderSets?.has(sid)) return 'binder'
  return null
}

// Display name for a tier key.
export function luckTierLabel(tier) {
  if (tier === 'god') return '✨ God pack'
  if (tier === 'demigod') return '🌟 Demigod pack'
  if (tier === 'subset') return '🖼️ Gallery / Shiny Vault'
  if (tier?.startsWith('foil:')) return FOIL[tier.slice(5)]?.label || tier
  return tier
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
function rollCondition(source = 'sealed', rnd = Math.random) {
  // Cards out of a sealed pack are always Near Mint. A pack-fresh card is never
  // "lightly played" — defects are surface/centering flaws that the grader catches.
  if (source !== 'floor') return 'NM'
  const r = rnd()
  if (r < 0.45) return 'NM'; if (r < 0.78) return 'LP'; if (r < 0.95) return 'MP'; return 'DMG'
}

// Hidden cut quality: a 0..1 score assigned at pull time representing the card's
// physical cut/centering quality. Average of 3 uniform samples → bell-ish, most
// cards cluster mid (0.3–0.7), true gems (0.85+) and duds (<0.20) are uncommon.
function rollCut(rnd = Math.random) { return (rnd() + rnd() + rnd()) / 3 }

let _uid = 0
// `rnd` is injectable so a seeded caller (e.g. the show floor's per-seed rng) gets a
// reproducible condition/cut — the uid still carries a timestamp for global uniqueness.
export function instance(card, source = 'sealed', rnd = Math.random) {
  return {
    uid: `c${Date.now().toString(36)}${(_uid++).toString(36)}`,
    ...card,
    reverse: false,
    condition: card.condition ?? rollCondition(source, rnd),
    _cut: card._cut ?? rollCut(rnd),
    grade: null, // null | {overall, centering, corners, edges, surface, fee, gradedAt}
  }
}

// Flat pool of every card across all NON-vintage sets (for offers / encounters / wants
// / the modern shop). The base of normal vendor stock too.
const ALL_CARDS = SHOP_SETS.flatMap(s => s.cards)
export function randomCard() { return instance(pick(ALL_CARDS)) }

// 🎌 Japanese singles circulate in the wider hobby, not only through your import account.
// The Import License is a WHOLESALE channel — it is not what makes JP cards exist. A show
// vendor keeps a JP binder, a customer wants a Master Ball chase, an online offer surfaces
// one. So imports join the general draw as a deliberate MINORITY: frequent enough to feel
// like part of the world, rare enough that pulling one still reads as a find.
// Every JP set with real prices qualifies, INCLUDING browse-only ones (jp-SV2a's Master Ball
// parallels are perfectly real singles even though its base pool can't fill a pack).
export const JP_CARD_SETS = data.sets.filter(s => s.japanese && s.cards?.some(c => c.price != null))
const JP_CARDS = JP_CARD_SETS.flatMap(s => s.cards).filter(c => c.price != null)
export const JP_WORLD_RATE = 0.12

// Vintage singles (Base Charizard, Shining Gyarados, …). These never enter the shop,
// wants, or online offers — but show vendors DO occasionally surface them in their bins,
// so the floor is where you hunt loose vintage. Drawn via vintageCardInRange below.
const VINTAGE_CARDS = VINTAGE_SETS.flatMap(s => s.cards).filter(c => c.price != null)
// A real vintage single whose raw value falls in [min,max] (nearest by value if the band
// is empty). Returns null if there's no vintage data at all. `floor` condition = a loose
// card in the wild varies in condition, like normal booth singles.
export function vintageCardInRange(min, max, rnd = Math.random, exclude = null) {
  if (!VINTAGE_CARDS.length) return null
  let pool = VINTAGE_CARDS.filter(c => c.price >= min && c.price <= max)
  const fresh = pool.filter(c => !exclude?.has(c.id))
  if (fresh.length) pool = fresh // avoid repeating a bin's pricier singles while variety remains
  if (pool.length) return instance(pick(pool, rnd), 'floor', rnd)
  const sorted = [...VINTAGE_CARDS].sort((a, b) =>
    Math.abs(a.price - (min + max) / 2) - Math.abs(b.price - (min + max) / 2))
  return instance(sorted[0], 'floor', rnd)
}

// Real-data RAW price ceiling for modern shop cards. Above this, the high end of the
// hobby lives in VINTAGE singles and REAL graded comps — never in made-up prices.
const REAL_PRICE_CEILING = ALL_CARDS.reduce((m, c) => Math.max(m, c.price ?? 0), 0)

// Every (card, grade) pair with a REAL PSA sale comp in the snapshot (eBay medians),
// across modern + vintage. This is the game's true high end — the five-figure slabs a
// big show's showcase case is made of (PSA 10 Aquapolis Umbreon ~$49k, Skyridge
// Charizard ~$35k, Shining Mewtwo ~$36k, …). Values are read at pick time via
// psaValueAt so they ride the living market like everything else.
const COMP_SLABS = [...ALL_CARDS, ...VINTAGE_CARDS].flatMap(c =>
  [10, 9, 8].filter(g => c.psa?.[String(g)] != null).map(g => ({ card: c, grade: g })))

// A card that ACTUALLY commands this much is a genuine grail (crown styling + hall hype).
const GRAIL_VALUE = 10000

// Mint a slabbed instance of a real (card, grade) comp entry.
function mintSlab(entry, rnd) {
  const g = entry.grade
  const c = instance({ ...entry.card, condition: 'NM' }, 'sealed', rnd)
  c.grade = { overall: g, centering: g, corners: g, edges: g, surface: g, tier: 'standard', gradedAt: Date.now() }
  if (gradedValue(c) >= GRAIL_VALUE) c._grail = true
  return c
}
// The dozen most valuable real slabs — the clamp target when a request exceeds reality.
function topCompSlabs() {
  return [...COMP_SLABS]
    .sort((a, b) => psaValueAt(b.card, b.grade) - psaValueAt(a.card, a.grade))
    .slice(0, 12)
}

// Deep-band raw requests draw from the WHOLE hobby — modern shop cards AND vintage
// singles both fit a "pricey card" ask. The modern pool alone thins to a handful of
// chase SIRs above a few hundred dollars, which is how an elite show's bins ended up
// stacked with six of the same Gengar. (Kept above everyday bands so vintage still
// never leaks into the shop, wants, or cheap walk-in requests.)
const VINTAGE_JOIN_MIN = 300

// Mint a real card instance whose ACTUAL value falls within [min,max] if possible.
// Above the modern raw ceiling the pool becomes real vintage singles + real graded
// comps; a band beyond even the best real sale clamps to the true top pieces instead
// of inventing a price. Every dollar figure shown traces back to market data.
// `exclude` (a Set of card ids) keeps one booth from repeating its pricier singles —
// honored only while the pool has other options.
export function cardInValueRange(min, max, rnd = Math.random, exclude = null) {
  const fresh = c => !exclude?.has(c.id)
  if (min > REAL_PRICE_CEILING) {
    const vintAll = VINTAGE_CARDS.filter(c => (c.price ?? 0) >= min && (c.price ?? 0) <= max)
    const vint = vintAll.some(fresh) ? vintAll.filter(fresh) : vintAll
    const slabs = COMP_SLABS.filter(e => { const v = psaValueAt(e.card, e.grade); return v >= min && v <= max })
    const total = vint.length + slabs.length
    if (total) {
      const i = Math.floor(rnd() * total)
      if (i < vint.length) return instance({ ...vint[i], condition: 'NM' }, 'sealed', rnd) // a four-figure raw is kept mint
      return mintSlab(slabs[i - vint.length], rnd)
    }
    if (COMP_SLABS.length) {
      const top = topCompSlabs()
      return mintSlab(top[Math.floor(rnd() * top.length)], rnd)
    }
  }
  // 🎌 Import roll, before the domestic draw: this is the single funnel every "a card appears"
  // path runs through (vendor bins, wants, online offers, encounters, shop requests), so one
  // hook here puts Japanese cards everywhere at once. It only ever REPLACES the pool, never
  // widens the band, so the value the caller asked for is unchanged — era/import theming picks
  // WHICH card shows up, never what it's worth. Empty band → fall straight through to domestic.
  if (JP_CARDS.length && rnd() < JP_WORLD_RATE) {
    const band = JP_CARDS.filter(c => { const v = c.price ?? 0; return v >= min && v <= max })
    const unseenJp = band.filter(fresh)
    const jpPool = unseenJp.length ? unseenJp : band
    if (jpPool.length) return instance(pick(jpPool, rnd), 'floor', rnd)
  }
  const base = min >= VINTAGE_JOIN_MIN ? [...ALL_CARDS, ...VINTAGE_CARDS] : ALL_CARDS
  let pool = base.filter(c => {
    const v = c.price ?? 0
    return v >= min && v <= max
  })
  const unseen = pool.filter(fresh)
  if (unseen.length) pool = unseen
  if (pool.length) return instance(pick(pool, rnd), 'floor', rnd) // singles in the wild vary in condition
  // fallback: nearest by value
  const sorted = [...base].sort((a, b) =>
    Math.abs((a.price ?? 0) - (min + max) / 2) - Math.abs((b.price ?? 0) - (min + max) / 2))
  return instance(sorted[0], 'floor', rnd)
}

// Cards drawn from a SPECIFIC set of sets, within a value band — the piece that makes an era
// buy-in cohere: a '99 attic lot's SINGLES read as old cards, not just its sealed pack. Value
// stays inside [min,max] on BOTH paths (an in-band era card, else the global picker), so era
// theming changes WHICH cards appear, never their worth — the economy is unmoved by it.
export function cardFromSetsInRange(sets, min, max, rnd = Math.random) {
  const inBand = []
  for (const s of sets || []) for (const c of (s.cards || [])) {
    const v = c.price
    if (v != null && v >= min && v <= max) inBand.push(c)
  }
  if (inBand.length) return instance(pick(inBand, rnd), 'floor', rnd) // singles in the wild vary in condition
  return cardInValueRange(min, max, rnd) // era had nothing in this band — stay in-band via the global pool
}

// A graded copy of a real card (used for premium vendor stock / encounters).
// High bands draw ONLY from real (card, grade) sale comps — a $35k slab in a showcase
// is a card that has actually sold for $35k at that grade. Modest bands keep the old
// behavior: a cheap real card slabbed, valued by the (comp-capped) grade heuristic.
// `exclude` (a Set of "<cardId>|<grade>" keys) lets a booth avoid stacking three of the
// same slab — honored only while the pool has other options.
export function gradedCardInRange(min, max, grade, rnd = Math.random, exclude = null) {
  if (max > REAL_PRICE_CEILING && COMP_SLABS.length) {
    const inBand = e => { const v = psaValueAt(e.card, e.grade); return v >= min && v <= max }
    const fresh = e => !exclude?.has(`${e.card.id}|${e.grade}`)
    let pool = COMP_SLABS.filter(e => e.grade === grade && inBand(e)) // honor the asked grade first
    if (!pool.length) pool = COMP_SLABS.filter(inBand)                // any real grade in band
    const unseen = pool.filter(fresh)
    if (unseen.length) pool = unseen                                  // avoid dupes while variety remains
    if (pool.length) return mintSlab(pick(pool, rnd), rnd)
    const top = topCompSlabs().filter(fresh)                          // band above the best real sale → clamp
    const clamp = top.length ? top : topCompSlabs()
    return mintSlab(clamp[Math.floor(rnd() * clamp.length)], rnd)
  }
  const c = cardInValueRange(min / (grade >= 9 ? 3 : 1), Math.min(max, REAL_PRICE_CEILING), rnd)
  c.condition = 'NM' // it's slabbed; condition is locked in by the grade
  c.grade = { overall: grade, centering: grade, corners: grade, edges: grade, surface: grade, tier: 'standard', gradedAt: Date.now() }
  return c
}

// ---- Pricing ----
// Runtime price overrides by card id, populated by refreshPrices(). Lets us
// update market values live (browser → pokemontcg.io) without rebuilding.
const PRICE_OVERRIDES = {}

// --- Living market ----------------------------------------------------------
// Per-SET price multiplier (default 1.0) applied on top of the base price in
// rawValue, so every value in the game (singles, sealed, collection, offers,
// listings) moves together. The store owns the persisted values and drifts them
// each game-day; it pushes the current map in here via setMarketMults() so the
// pricing functions stay synchronous. A live price refresh resets all multipliers
// to 1.0 (a fresh snapshot is the new truth — drift mustn't stack on top of it).
export const MARKET_BOUNDS = { min: 0.6, max: 1.8 }
let MARKET_MULT = {}
export function setMarketMults(map) { MARKET_MULT = map || {} }
export function marketMult(setId) { return MARKET_MULT[setId] ?? 1 }

// Advance one set's multiplier one game-day: a small random step, mean-reverting
// toward 1.0 so it never runs away, clamped to the bounds. `rnd` injectable for tests.
const MARKET_STEP = 0.025   // ±~2.5% daily wiggle
const MARKET_REVERT = 0.06  // pull 6%/day back toward 1.0
export function driftMult(m, rnd = Math.random) {
  const cur = m ?? 1
  const step = (rnd() - 0.5) * 2 * MARKET_STEP   // [-step, +step]
  const revert = (1 - cur) * MARKET_REVERT       // toward 1.0
  const next = cur + step + revert
  return Math.round(Math.min(MARKET_BOUNDS.max, Math.max(MARKET_BOUNDS.min, next)) * 1000) / 1000
}

// VINTAGE drift: unlike modern sets, sealed vintage trends UP over time (a finite,
// shrinking supply of decades-old product). Same daily wiggle, but with a small
// positive bias and NO mean-reversion to 1.0 — so holding vintage sealed appreciates.
// A higher ceiling lets it climb well past the modern cap over a long hold.
const VINTAGE_BIAS = 0.004    // +~0.4%/day upward drift on average (at mult 1.0)
export const VINTAGE_MAX = 3.0
export function driftMultVintage(m, rnd = Math.random) {
  const cur = m ?? 1
  const step = (rnd() - 0.5) * 2 * MARKET_STEP   // [-step, +step]
  // Bias TAPERS as the mult climbs, so appreciation slows toward the ceiling instead of
  // marching to it — holding vintage still trends up, but it's not a riskless money-printer
  // that maxes every unit at 3×. (The rare crash events in driftMarket are the downside.)
  const headroom = Math.max(0, (VINTAGE_MAX - cur) / (VINTAGE_MAX - 1))
  const next = cur + step + VINTAGE_BIAS * headroom
  return Math.round(Math.min(VINTAGE_MAX, Math.max(MARKET_BOUNDS.min, next)) * 1000) / 1000
}

// Vintage/secondary sealed CAN crash — a reprint scare, an authentication scandal, a
// big hoard hitting the market. Rare (checked per set per day at VINTAGE_CRASH_CHANCE)
// but real, so a long vintage hold carries genuine tail risk instead of guaranteed gains.
export const VINTAGE_CRASH_CHANCE = 0.006 // ~1 in 167 set-days
export const VINTAGE_CRASH_EVENTS = [
  { pct: [-0.35, -0.18], lines: ['A sealed {set} case hoard surfaced — the market’s spooked.', 'Rumors of a {set} reprint tanked sealed demand.', 'A big graded-{set} authentication scandal cooled the whole vintage market.'] },
]

// Named hype/crash events that jolt one set's multiplier for flavor + a price swing.
// Returned with the magnitude already applied to a base mult by the caller.
export const MARKET_EVENTS = [
  { kind: 'hype',  pct: [0.15, 0.30], lines: ['A big YouTuber featured {set} — demand is spiking!', '{set} singles are trending on socials — prices jumping.', 'A tournament win put {set} in the spotlight — it\'s hot.'] },
  { kind: 'crash', pct: [-0.28, -0.12], lines: ['A {set} reprint was announced — prices are sliding.', 'Hype cooled on {set} — the market\'s pulling back.', 'A big collection dump flooded {set} supply — values dipping.'] },
]
// Apply an event's jolt to a set's current multiplier: pick a magnitude in the
// event's pct range and shift the mult by it, clamped to the bounds. Returns
// { mult, pct, line } — the new mult, the actual % applied, and a flavor line with
// {set} still as a placeholder for the caller to fill in. `rnd` injectable for tests.
export function applyMarketEvent(cur, event, rnd = Math.random) {
  const [lo, hi] = event.pct
  const pct = lo + rnd() * (hi - lo)
  const raw = (cur ?? 1) * (1 + pct)
  const mult = Math.round(Math.min(MARKET_BOUNDS.max, Math.max(MARKET_BOUNDS.min, raw)) * 1000) / 1000
  const line = event.lines[Math.floor(rnd() * event.lines.length)]
  return { mult, pct: Math.round(pct * 100), line }
}

// Canonical price for every card id from the current bundled data. Cards pulled
// before a data refresh have an old (possibly null) price baked into the saved
// instance; this lets rawValue heal them to the current real price by id, rather
// than falling back to a flat rarity estimate.
const CANONICAL_PRICE = {}
for (const s of SETS) for (const c of s.cards) if (c.price != null) CANONICAL_PRICE[c.id] = c.price

// Set id from a card id ("me4-90" → "me4"; "sv8pt5-12" → "sv8pt5").
export function setIdOfCard(card) {
  const id = card?.id; if (!id) return null
  const i = id.lastIndexOf('-')
  return i > 0 ? id.slice(0, i) : id
}

const SET_BY_ID = Object.fromEntries(SETS.map(s => [s.id, s]))
export function setById(setId) { return SET_BY_ID[setId] }
// Every card across EVERY set (shop + secondary + vintage + extra), indexed by id. This is the
// lookup a product's bonus promo uses to pin its REAL card, which often lives in a different set
// than the product — a "151 ETB" ships an svp Black Star Promo, whose card id is `svp-…`.
const CARD_BY_ID = new Map()
for (const s of SETS) for (const c of (s.cards || [])) CARD_BY_ID.set(c.id, c)
export function cardById(id) { return CARD_BY_ID.get(id) || null }
export function setNameOfId(setId) { return SET_BY_ID[setId]?.name }
export function setNameOfCard(card) { const id = setIdOfCard(card); return id ? SET_BY_ID[id]?.name : undefined }

// Resolve the market multiplier for a card: the live drift by default, or an explicit
// override (used by valueHistory to reproject a card's value across past multipliers).
function cardMult(card, multOverride) {
  return multOverride != null ? multOverride : marketMult(setIdOfCard(card))
}

export function rawValue(card, multOverride) {
  const override = PRICE_OVERRIDES[card.id]
  let base = override ?? card.price ?? CANONICAL_PRICE[card.id] ?? estimateByRarity(card.rarity)
  base *= cardMult(card, multOverride) // living-market drift for this set
  if (card.foil) base *= card.foil.mult // Poké Ball (3×) / Master Ball (55×) premium
  else if (card.reverse) base *= reverseMult(card.rarity) // reverse holo: small on commons, larger on rares
  // raw (ungraded) cards are discounted by condition; a graded slab is priced by its grade
  if (!card.grade && card.condition && CONDITIONS[card.condition]) base *= CONDITIONS[card.condition].mult
  // 🖨️ A press fault is worth money on its own terms, and it sets a dollar floor the card
  // underneath cannot explain. Raw, it only realises part of that — the market discounts a
  // claim nobody has authenticated. See misprints.js.
  if (card.misprint) base = misprintValue(base, card.misprint, false)
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

// The last refreshed prices, persisted so they survive a reload — without this,
// PRICE_OVERRIDES is module memory and every boot falls back to the bundled
// (build-time) snapshot until someone presses Refresh again.
const PRICE_SNAPSHOT_KEY = 'poke-vendor-price-snapshot' // { fetchedAt: ms, prices: {cardId: usd} }
const SNAPSHOT_STALE_MS = 24 * 3600 * 1000

function readPriceSnapshot() {
  try {
    const j = JSON.parse(localStorage.getItem(PRICE_SNAPSHOT_KEY))
    return j && typeof j.prices === 'object' && j.prices ? j : null
  } catch { return null }
}
function storePriceSnapshot(prices, fetchedAt) {
  try { localStorage.setItem(PRICE_SNAPSHOT_KEY, JSON.stringify({ fetchedAt, prices })) } catch {}
}

// Apply a {cardId: price} map to one set, in place. Shared by both refresh paths.
function applyPrices(set, priceById) {
  let updated = 0, total = 0
  for (const card of set.cards) {
    total++
    const p = priceById[card.id]
    if (p != null && p !== card.price) { card.price = p; PRICE_OVERRIDES[card.id] = p; updated++ }
    else if (p != null) { PRICE_OVERRIDES[card.id] = p }
  }
  return { updated, total }
}

// Fast path: the AWS backend keeps a shared price snapshot in DynamoDB (re-warmed
// daily), so a signed-in player gets every set's prices in ONE request instead of
// ~one slow pokemontcg.io call per set. Returns null when unavailable (signed out,
// offline, backend error) — the caller falls back to fetching upstream directly.
async function fetchCachedPrices(onProgress) {
  if (!SYNC_URL) return null
  let token = null
  try { token = await getIdToken() } catch { return null }
  if (!token) return null
  onProgress?.({ setName: 'the cloud price cache', index: 0, count: 1 })
  try {
    const ids = SETS.map(s => s.id).join(',')
    // A cold cache makes the backend walk pokemontcg.io itself, which can be slow —
    // give up after 20s and fall back to fetching directly (with per-set progress).
    // The Lambda finishes filling the cache regardless, so the NEXT refresh is instant.
    const res = await fetch(`${SYNC_URL}prices?sets=${encodeURIComponent(ids)}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout?.(20_000),
    })
    if (!res.ok) return null
    const j = await res.json()
    if (!j?.prices || !Object.keys(j.prices).length) return null
    return j // { prices: {cardId: usd}, fetchedAt: ms, missing: [setId] }
  } catch { return null }
}

// Live-refresh market prices for every loaded set, in place.
// Returns { updated, total, fetchedAt }. Throws on network failure.
export async function refreshPrices(onProgress) {
  let updated = 0, total = 0

  const cached = await fetchCachedPrices(onProgress)
  if (cached) {
    for (const set of SETS) {
      const r = applyPrices(set, cached.prices)
      updated += r.updated; total += r.total
    }
    storePriceSnapshot(cached.prices, cached.fetchedAt)
    MARKET_MULT = {} // fresh snapshot = the new market truth (see below)
    return { updated, total, fetchedAt: new Date(cached.fetchedAt).toISOString(), marketReset: true }
  }

  const API = 'https://api.pokemontcg.io/v2'
  const combined = {} // every set's prices, for the persisted snapshot
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
    const r = applyPrices(set, priceById)
    updated += r.updated; total += r.total
    Object.assign(combined, priceById)
  }
  storePriceSnapshot(combined, Date.now())
  // Fresh live snapshot = the new market truth. Reset the living-market drift so it
  // doesn't stack on top of already-updated numbers; it resumes from 1.0 going forward.
  MARKET_MULT = {}
  return { updated, total, fetchedAt: new Date().toISOString(), marketReset: true }
}

// Boot-time price warm-up, called once from App. Re-applies the persisted snapshot
// (instant, offline-safe), then quietly pulls a newer one from the cloud cache if ours
// is over a day old and we're signed in. Unlike an explicit Refresh, this NEVER resets
// the living-market drift — new base prices slide in under the day-to-day multipliers,
// so the market mechanic keeps its history across sessions.
export async function warmPricesOnBoot() {
  const snap = readPriceSnapshot()
  if (snap) for (const set of SETS) applyPrices(set, snap.prices)
  if (Date.now() - (snap?.fetchedAt || 0) < SNAPSHOT_STALE_MS) return
  const cached = await fetchCachedPrices()
  if (!cached || (snap && cached.fetchedAt <= snap.fetchedAt)) return
  for (const set of SETS) applyPrices(set, cached.prices)
  storePriceSnapshot(cached.prices, cached.fetchedAt)
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
    'Double Rare':2.5,'ACE SPEC Rare':8,'Illustration Rare':4,'Ultra Rare':6,
    'Special Illustration Rare':25,'Hyper Rare':30,'MEGA_ATTACK_RARE':40,
    'Mega Hyper Rare':120,'Black White Rare':150 }
  return table[r] ?? 0.1
}

// Graded value multiplier by PSA grade (fallback heuristic when no real comp exists).
// With real-world gem odds (blind ~24%), grading a decent card is a genuine, profitable
// business — the tools (pre-screen/loupe/cut) + fee discounts only widen an already-positive
// edge. PSA 9 ≈ modest premium, PSA 8 ≈ just under raw (real-world modern behavior); the
// dream stays in the 10.
const GRADE_MULT = { 10: 5.0, 9: 1.35, 8: 0.95, 7: 0.8, 6: 0.6, 5: 0.5, 4: 0.4, 3: 0.35, 2: 0.3, 1: 0.25 }
// Real PSA median-sale comp for a grade, if the snapshot captured one for this card.
// `card.psa` is { "10": usd, "9": usd, ... } from eBay sold listings (pokemon-api.com).
function psaComp(card, grade) {
  const v = card.psa?.[String(grade)]
  return v != null ? v : null
}
export function gradedValue(card, multOverride) {
  if (!card.grade) return rawValue(card, multOverride)
  const g = card.grade.overall
  // Prefer the REAL market price of this card at this PSA grade. Sparse data: if this
  // exact grade has no comp, fall back to the heuristic (don't interpolate tiny samples).
  const real = psaComp(card, g)
  let value
  // The real PSA comp is an absolute dollar that doesn't flow through rawValue, so
  // apply the set's living-market multiplier here too — a slab rides its set's market.
  if (real != null) value = real * cardMult(card, multOverride)
  else {
    const mult = GRADE_MULT[g] ?? 1
    // Gem-scarcity premium: higher base-value cards see a bigger TRUE-GEM premium — but
    // only at PSA 10, and capped at 1.5× (was: up to 3× for any 9+, which made comp-less
    // chases worth 15× raw and every submission +EV regardless of outcome).
    const scarcityBoost = 1 + Math.min(0.5, rawValue(card, multOverride) / 160)
    value = rawValue(card, multOverride) * mult * (g >= 10 ? scarcityBoost : 1)
    // A HEURISTIC grade must not overshoot a real higher-grade comp (real comps are
    // already monotonic from the snapshot's sanitize pass — only the heuristic can
    // invert the ladder). Real comps are trusted as-is and never capped here.
    value = Math.min(value, gradedCeiling(card, g, multOverride))
  }
  // Every comp and heuristic above is a PSA number — that's the market's reference holder.
  // Re-price it for the holder this card is actually IN before the floors apply, so a
  // strong slab still can't fall under the raw card no matter who graded it.
  value *= slabMultiplier(card.grade)
  // 📊 The population report. A PSA 10 with 40 copies in the census is not the same asset as
  // a PSA 10 with 9,000, and this is where that difference reaches the price. The multiplier
  // averages EXACTLY 1.0 across the catalog (see population.js), so the grading business is
  // no more or less profitable than it was — only the choice of WHICH card to send changes.
  value *= cardPopMult(card, g)
  // 🖨️ A grader's label is what the error market pays for. Raw, the premium is discounted;
  // authenticated, it is realised in full.
  if (card.misprint) value = misprintValue(value, card.misprint, true)
  return round2(gradedFloor(card, g, value, multOverride))
}

// 📊 What the PLAYER's own submissions have added to the census, as { 'cardId|grade': n }.
// Held in module state and pushed in by the store, exactly like the living-market multipliers
// above — for the same reason. A census entry is a fact about the CARD, not about one copy of
// it, so the moment you slab another Umbreon every Umbreon slab you already own re-prices.
// Stamping the count onto each card instead would freeze each copy at the census it was born
// into, and the whole point of the mechanic is that over-slabbing devalues the stack you hold.
// The store re-pushes this on rehydrate (see onRehydrateStorage).
let POP_ADDS = {}
export function setPopAdds(map) { POP_ADDS = map || {} }
export function popAddsFor(cardId, grade) { return POP_ADDS[`${cardId}|${grade}`] || 0 }

// The population multiplier for a card at a grade, guarded so it only ever applies to a REAL
// catalog card. Synthetic cards (the sim's test card, any future fixture) have no census and
// must price exactly as they did before this system existed.
function cardPopMult(card, grade) {
  if (!card?.id || !CARD_BY_ID.has(card.id)) return 1
  const vintage = !!SET_BY_ID[setIdOfCard(card)]?.vintage
  return popMult(card, grade, { vintage, adds: popAddsFor(card.id, grade) })
}
// Public read of a card's census, for the Grading Scope panel and the card modal.
export function cardPopulation(card, grade) {
  if (!card?.id || !CARD_BY_ID.has(card.id)) return null
  const vintage = !!SET_BY_ID[setIdOfCard(card)]?.vintage
  const adds = popAddsFor(card.id, grade)
  return {
    count: popCount(card, grade, { vintage, adds }),
    mult: popMult(card, grade, { vintage, adds }),
    line: popLine(card, grade, { vintage, adds }),
    mine: adds,
  }
}

// Floors: a STRONG slab (PSA 9/10) is never worth less than the raw card, and a higher
// grade is never worth less than a lower grade's real comp. But a LOW grade (≤8) has no
// raw-value floor — slabbing a modern card at PSA 6 genuinely destroys value, exactly
// like real life. (The old "any slab ≥ raw" floor meant grading had zero downside, so
// grading everything was strictly dominant and the fee was the only cost.)
function gradedFloor(card, g, value, multOverride) {
  // Scale the lower-grade comps by the same living-market multiplier the headline value
  // rides, so the whole grade ladder moves with the set's market (a slab isn't immune to
  // a crash just because a lower grade has a captured comp). rawValue already carries it.
  const m = cardMult(card, multOverride)
  let floor = g >= 9 ? rawValue(card, multOverride) : 0 // only strong slabs floor at raw
  // pull the floor up to the best comp of any STRICTLY LOWER grade
  for (let lower = 1; lower < g; lower++) {
    const c = psaComp(card, lower)
    if (c != null && c * m > floor) floor = c * m
  }
  return Math.max(value, floor)
}
// Ceiling for a HEURISTIC grade only (real comps are trusted as-is). PSA comps are sparse,
// so a missing grade falls to the heuristic — and the PSA-9 scarcity heuristic can balloon
// WAY past a modest real PSA-10 sale (e.g. a card whose only comp is PSA-10 $985, but whose
// heuristic PSA-9 computes to ~$1,988). gradedFloor only pushes values up, so nothing caught
// that inversion. Here we cap a heuristic grade g at the nearest HIGHER grade that has a real
// comp (a trustworthy anchor), scaled down by the typical grade-to-grade ratio (GRADE_MULT)
// so the rungs stay spread out. Returns Infinity (no cap) when no higher grade has a real
// comp — the heuristic stands (a low-pop gem can legitimately be worth many multiples of raw).
function gradedCeiling(card, g, multOverride) {
  const m = cardMult(card, multOverride)
  for (let higher = g + 1; higher <= 10; higher++) {
    const c = psaComp(card, higher)
    if (c != null) {
      const ratio = (GRADE_MULT[g] ?? 1) / (GRADE_MULT[higher] ?? 1) // < 1 (lower grade)
      return c * m * Math.min(1, ratio)
    }
  }
  return Infinity
}
export function cardValue(card, multOverride) { return card.grade ? gradedValue(card, multOverride) : rawValue(card, multOverride) }

// ---- Deal detector (customizable) -----------------------------------------
// What counts as a "DEAL" on a vendor's single, per the player's own definition. Defaults
// reproduce the old flat "15%+ under market" rule; the settings let you narrow it to, say,
// "a Near-Mint, ungraded card at or under market" (the classic gem-hunter's buy).
export const DEFAULT_DEAL_CFG = { dealMaxMult: 0.85, dealCondition: 'any', dealUngradedOnly: false, dealMinValue: 0, dealCut: 'any' }
const CONDITION_RANK = { NM: 3, LP: 2, MP: 1, DMG: 0 }
// Is `card` a deal at `ask`, under config `cfg`? maxMult is the ceiling on ask as a fraction
// of market (0.85 = 15% under; 1.05 = "around market"). condition/cut/ungraded filters apply
// to RAW cards (a slab has no raw condition or cut to read); minValue skips bulk. The cut
// filter uses the card's true hidden cut tier (Rough…Pristine) — the detector surfaces
// sharp-cut gems for you even before you loupe them. Slabs skip condition/cut (already graded).
export function isCardDeal(card, ask, cfg = DEFAULT_DEAL_CFG) {
  const mkt = cardValue(card)
  if (!(mkt > 0) || !(ask >= 0)) return false
  const c = cfg || DEFAULT_DEAL_CFG
  if (c.dealMinValue && mkt < c.dealMinValue) return false
  if (c.dealUngradedOnly && card.grade) return false
  if (!card.grade && c.dealCondition && c.dealCondition !== 'any') {
    if ((CONDITION_RANK[card.condition] ?? 3) < (CONDITION_RANK[c.dealCondition] ?? 0)) return false
  }
  if (!card.grade && c.dealCut && c.dealCut !== 'any') {
    if (cutRank(card) < CUT_ORDER.indexOf(c.dealCut)) return false
  }
  return ask <= mkt * (c.dealMaxMult ?? 0.85) + 1e-6
}

// ---- Customers / buyers (own-site listings) --------------------------------
// Listed cards aren't sold by a timer — real customers BROWSE them. Each buyer has
// a savvy level that sets how far over market they'll pay. List too high and no
// buyer ever bites (it just sits). Fair/under-market asks sell fast.
//
//  • casual  — doesn't track prices; happily pays a markup (impulse buyer)
//  • average — rough sense of value; a small markup is fine
//  • sharp   — knows the comps; won't pay much over market
//  • shark   — hunting deals; only bites at/under market, and may lowball
// `tolerance` = the ask-multiple (× market) at which this buyer will still buy at ask.
// `weight` = how common this buyer type is in the browsing pool.
// Tuned so RAW singles listed AT market (1.0×) rarely clear — most buyers want a discount,
// so the reliable sweet spot for raw cards is ~85% of market. Graded slabs and hot cards
// claw back above market via cardDesirability's desireLift, so they can list near/at market.
export const BUYER_SAVVY = {
  casual:  { label: 'Casual buyer',  icon: '🙂', tolerance: 1.05, weight: 0.34 },
  average: { label: 'Average buyer', icon: '🧑', tolerance: 0.90, weight: 0.40 },
  sharp:   { label: 'Sharp buyer',   icon: '🤓', tolerance: 0.80, weight: 0.20 },
  shark:   { label: 'Deal shark',    icon: '🦈', tolerance: 0.68, weight: 0.06 },
}
const SAVVY_KEYS = Object.keys(BUYER_SAVVY)

// Roll a random buyer savvy from the weighted pool.
export function rollBuyerSavvy(rnd = Math.random) {
  let r = rnd()
  for (const k of SAVVY_KEYS) { r -= BUYER_SAVVY[k].weight; if (r <= 0) return k }
  return 'average'
}

// How desirable a card is to browse/buy: hits, graded slabs, and pricier cards
// pull more eyes and a touch more markup tolerance. Returns ~0.6 (bulk) → ~2.4 (grail).
export function cardDesirability(card) {
  let d = 1
  if (isHit(card)) d += 0.5
  if (card.foil) d += 0.2
  if (card.grade) d += 0.3 + Math.min(0.6, (card.grade.overall - 7) * 0.2) // PSA 8/9/10 climb
  const v = cardValue(card)
  d += Math.min(0.6, v / 300)             // pricier cards draw collectors
  if (rarityRank(card.rarity) < rarityRank('Rare')) d -= 0.4 // bulk commons/uncommons
  return Math.max(0.5, +d.toFixed(2))
}

// --- FAME: the one curve --------------------------------------------------------------
// Notoriety is the game's long arc, but for a long time it bought HARD UNLOCKS (show tiers,
// jobs) plus a handful of soft curves that ALL flatlined by ~noto 235 — while the show ladder
// runs to 280. Past that, extra fame bought you nothing. This is the single curve that fixes
// it: everything that should scale with your name multiplies by fameMult(), so getting famous
// keeps paying instead of hitting a wall.
//
// Diminishing returns, but NO ceiling — the sub-1 exponent means each point of fame is worth
// a little less than the last, yet the curve never goes flat:
//   noto    0 → 1.00×      noto  200 → 3.67×
//   noto   50 → 1.94×      noto  400 → 5.49×
//   noto  100 → 2.59×      noto  800 → 8.55×   (still climbing, slowly)
// Tuned so a world-famous vendor's shop is a genuinely different business from a local's,
// without going superlinear and printing money.
export const FAME_KNEE = 54    // notoriety at which fame is worth ~2×
export const FAME_POWER = 0.75 // <1 → diminishing returns, but never a hard wall
export function fameMult(notoriety) {
  return 1 + Math.pow(Math.max(0, notoriety || 0) / FAME_KNEE, FAME_POWER)
}
// Fame earned BEYOND the point where an old curve used to flatline: 0 until `saturateAt`,
// then grows without a wall. This is the safe way to revive a dead ceiling — bolt it onto the
// existing formula and the early/mid game is bit-for-bit unchanged (it contributes exactly 0
// below the old saturation point); only the dead zone past it comes alive. Used wherever a
// Math.min(cap, …) had quietly killed the fame curve.
export function fameBeyond(notoriety, saturateAt) {
  return Math.max(0, fameMult(notoriety) - fameMult(saturateAt))
}

// The MOST a given buyer will pay for this card, as a multiple of market.
// = their base savvy tolerance, lifted by your notoriety (a known shop commands a
// premium) and the card's desirability (hot cards carry a markup), plus a little jitter.
export function buyerMaxMult(savvyKey, notoriety, card, rnd = Math.random) {
  const base = (BUYER_SAVVY[savvyKey] || BUYER_SAVVY.average).tolerance
  // The lift used to cap at +0.35× (reached at noto 140) — a household name commanded no more
  // than a locally-known one. It keeps growing now, but SLOWLY and with a hard stop: this is
  // a price multiplier on every sale, so it's the most dangerous dial in the game to open up.
  const notoLift = Math.min(0.6, Math.min(0.35, notoriety / 400) + fameBeyond(notoriety, 140) * 0.05)
  const desireLift = (cardDesirability(card) - 1) * 0.18  // hot cards tolerate more
  const jitter = (rnd() - 0.5) * 0.12                     // ±0.06 buyer-to-buyer noise
  return Math.max(0.6, base + notoLift + desireLift + jitter)
}

// Expected number of shoppers who browse a listing per game-day. More with fame and
// desirability; fair prices pull a few more eyes than wildly overpriced ones (which
// still get looked at — and passed on). Floors at a trickle so something always happens.
// `boost` multiplies the eyes (e.g. a recent livestream's afterglow pulls extra shoppers in).
export function dailyViewers(card, askMult, notoriety, rnd = Math.random, boost = 1) {
  // Fame used to cap at 3.2 eyes/day (reached at noto 156) and go flat forever after. Now it
  // keeps climbing past that: ~4.9 at noto 300, ~9.6 at noto 800 — a famous seller's listings
  // are genuinely busy, which is the whole point of building a name.
  const fame = 0.6 + Math.min(2.6, notoriety / 60) + fameBeyond(notoriety, 156) * 1.2
  const desire = cardDesirability(card)
  // overpricing softly suppresses eyeballs (window-shoppers skip the obvious gouge)
  const priceDrag = askMult <= 1.2 ? 1 : Math.max(0.45, 1 - (askMult - 1.2) * 0.4)
  const expected = fame * desire * priceDrag * boost
  // Poisson-ish: expected value with random rounding so low traffic is bursty.
  const whole = Math.floor(expected)
  return whole + (rnd() < (expected - whole) ? 1 : 0)
}

// Hypothetical "if this graded PSA <grade>" value for a still-raw card — what the slab
// would be worth at that grade. Prefers the REAL PSA comp for the grade when the snapshot
// has one (scaled by the set's living market, exactly like gradedValue does for a real
// slab), else mirrors gradedValue's heuristic. Used to tease grading upside on a raw card.
// The gradedFloor keeps the ladder monotonic: a PSA 10 is never worth less than a PSA 9,
// which is never worth less than the raw card.
export function psaValueAt(card, grade) {
  if (card.grade) return gradedValue(card)
  const real = psaComp(card, grade)
  let value
  if (real != null) value = real * marketMult(setIdOfCard(card))
  else {
    const base = rawValue(card)
    const mult = GRADE_MULT[grade] ?? 1
    // higher base-value cards see a bigger grade premium (gem-mint chase), gated to 9+
    const scarcityBoost = 1 + Math.min(2, base / 50)
    value = base * mult * (grade >= 9 ? scarcityBoost : 1)
    // heuristic-only: don't let it overshoot a real higher-grade comp (see gradedValue).
    value = Math.min(value, gradedCeiling(card, grade))
  }
  // 📊 The same census the real slab would be priced against — otherwise the "if it gemmed"
  // teaser would quote a number the returned slab could never sell for.
  value *= cardPopMult(card, grade)
  if (card.misprint) value = misprintValue(value, card.misprint, true)
  return round2(gradedFloor(card, grade, value))
}
// Hypothetical PSA-10 value — the headline "if it gemmed" number. Thin wrapper kept for
// existing callers; the general per-grade function is psaValueAt.
export function psa10Value(card) { return psaValueAt(card, 10) }

// Chase quality of a set's HIT pool: of the cards that count as a hit when pulled (Double
// Rare and up — the set's real chase lineup), what fraction would clear `$threshold` if they
// graded PSA `grade`. A quick read on how stacked a set is — a box whose hits are mostly
// $100+ gems is a very different rip than one whose hits top out at $20. Rides the living
// market (psaValueAt does), so a hot set's rate climbs with it. Returns { pct, count, total }.
export function hitGemRate(set, threshold = 100, grade = 10) {
  const hits = (set?.cards || []).filter(c => rarityRank(c.rarity) >= HIT_THRESHOLD)
  if (!hits.length) return { pct: 0, count: 0, total: 0 }
  const count = hits.reduce((n, c) => n + (psaValueAt(c, grade) > threshold ? 1 : 0), 0)
  return { pct: count / hits.length, count, total: hits.length }
}

// A per-card PRICE HISTORY series over a set's recent market-multiplier samples
// (store.marketHistory[setId], the same ring the Price-guide sparkline uses). We recompute
// the card's value through the real pricing path under EACH historical multiplier, oldest
// → newest. Raw value is linear in the multiplier, but a graded slab's value is clamped by
// lower-grade comps, so a naive `v * (m/cur)` reprojection would misstate graded history —
// running each point through cardValue(card, m) keeps the line exact for slabs too.
// Returns [] when there's no history yet; callers render a "no trend" note under 2 points.
export function valueHistory(card, history) {
  const pts = (history || []).filter(m => typeof m === 'number')
  if (!pts.length) return []
  return pts.map(m => cardValue(card, m))
}

// ---- Grading (PSA-style subgrades) ----
// `fee` is the LIST price (before your loyalty discount). Raised so early
// grading stings; the relationship below brings effective fees back down.
// `luck` nudges the grade roll toward higher grades (like the loupe), so the premium tiers
// aren't ONLY paying for speed — a pricier submission also gets a slightly better shot at the
// gem (careful handling, a better grader queue). Economy is cheap + slow + no edge; Express /
// Kiosk cost more but grade a touch kinder. Stacks with the Jeweler's Loupe.
// Service tiers, priced off real PSA rate cards (Value ≈ $25, Regular ≈ $75, Express ≈ $150).
// `maxValue` is the DECLARED-VALUE ceiling the tier covers — the part that was missing before,
// and the reason grading used to cost a flat ~$70 no matter what you sent. A real grader will
// not take a $9,000 card on a $25 bulk submission: above a tier's ceiling you are priced off
// what the card is WORTH. See gradingFee.
// `valueRate` is the slice of declared value charged ABOVE that ceiling. It rises with speed
// for the same reason the sticker does — otherwise every tier converges on one number at the
// top end and Express strictly dominates Economy (same price, nine times faster), which would
// delete the speed-vs-cost decision exactly where it matters most.
export const GRADING = {
  economy: { name: 'Economy', fee: 25, days: 45, luck: 0, maxValue: 499, valueRate: 0.03 },
  standard: { name: 'Standard', fee: 75, days: 20, luck: 0.02, maxValue: 1499, valueRate: 0.05 },
  express:  { name: 'Express',  fee: 150, days: 5, luck: 0.05, maxValue: 2499, valueRate: 0.08 },
  // On-site grading kiosk at big shows: skip the mail wait — results in ~2 days — but pay a
  // premium for it. `onSite` keeps it out of the normal (mail-in) Grader tier pickers.
  kiosk:    { name: 'On-Site Kiosk', fee: 300, days: 2, luck: 0.06, onSite: true, maxValue: 2499, valueRate: 0.12 },
}
// Above a tier's declared-value ceiling the fee becomes a percentage of the card's value, which
// is how every real grader prices high-end submissions (PSA's premium tiers work out to ~4–6%).
// This is the knob that makes slabbing a four-figure chase a real cost instead of a rounding
// error — and it is deliberately NOT discountable: loyalty and bulk are volume perks on cheap
// cards, and no grader hands you 45% off insuring a $20,000 card.
export const GRADING_VALUE_RATE = 0.05
// PSA's real ladder above the standard tiers, straight off their rate card. It is a STEP
// function keyed on insured value, not a percentage — and the effective rate FALLS as the card
// gets more valuable (7% at $5k, 6% at $10k, 4% at $25k, 2% at $250k), which no flat percentage
// reproduces. Premium proper begins above $10,000: Walk-Through is the last tier that covers a
// five-figure card, and everything past it is Premium 1 and up.
export const PREMIUM_TIERS = [
  { max: 5000,      fee: 349,  name: 'Super Express', days: 12 },
  { max: 10000,     fee: 599,  name: 'Walk-Through',  days: 8 },
  { max: 25000,     fee: 999,  name: 'Premium 1',     days: 6 },
  { max: 50000,     fee: 1999, name: 'Premium 2',     days: 6 },
  { max: 100000,    fee: 2999, name: 'Premium 3',     days: 6 },
  { max: 250000,    fee: 4999, name: 'Premium 5',     days: 6 },
  { max: Infinity,  fee: 9999, name: 'Premium 10',    days: 6 },
]
export function premiumTierFor(value) {
  return PREMIUM_TIERS.find(t => (value || 0) <= t.max) || PREMIUM_TIERS[PREMIUM_TIERS.length - 1]
}
// The floor under everything. There is a technician's time, a sonic-sealed holder and a printed
// label in every slab, so nobody grades a card for pocket change — real bulk rates bottom out
// around $19-25/card and REQUIRE a 20-card submission. Loyalty and bulk here stack
// multiplicatively, which compounded a perfectly realistic $25 Economy fee down to $10.31 at
// Platinum, and $6.70 once CGC's cheaper rate was applied on top. Scaled by the grader's own
// feeMult so CGC stays genuinely the budget option without becoming free.
export const GRADING_FLOOR = 18
// And a ceiling on the discounts themselves. Volume earning you a better rate is real; volume
// earning you 73% off is not. Half price is already the best deal in the hobby.
export const MAX_GRADING_DISCOUNT = 0.5

// ---- Grading COMPANIES -------------------------------------------------------------
// Who you mail the card to, as opposed to which service tier you buy. The three real
// graders don't differ in how strictly they grade here — they differ in what a slab in
// their holder is WORTH when you sell it, what they charge, and how long they take. That
// keeps the tuning invariant intact (graders sell price/speed/resale, never odds: every
// company runs the identical rollGrade), while making the choice a real one:
//
//   🟥 PSA — the benchmark. The market pays for the red label; nothing is cheap or fast.
//   🟦 BGS — pricier and slower, and modern BGS trades a touch under PSA… except that a
//            card grading all-10 subgrades comes back a BLACK LABEL, which is a different
//            asset entirely. The lottery-ticket grader: submit your pristine cuts here.
//   🟨 CGC — cheapest and quickest by a mile, and the slabs sell for meaningfully less.
//            The volume grader: how you slab a stack of mid cards without tying up capital.
//
// A grade with no `company` is a PSA slab (every grade written before this existed).
export const GRADERS = {
  psa: { key: 'psa', name: 'PSA', full: 'Professional Sports Authenticator', icon: '🟥', color: '#ff5e6c',
    feeMult: 1, daysMult: 1, slabMult: 1,
    blurb: 'The benchmark. Slabs sell for exactly what the comps say — every PSA figure in this game is a PSA figure.' },
  bgs: { key: 'bgs', name: 'BGS', full: 'Beckett Grading Services', icon: '🟦', color: '#3b6cff',
    feeMult: 1.35, daysMult: 1.25, slabMult: 0.92, blackLabelMult: 2.4,
    blurb: 'Dearer and slower, and modern BGS trades ~8% under PSA — but all-10 subgrades come back a ⬛ BLACK LABEL worth multiples of the same card in red. Send your pristine cuts.' },
  cgc: { key: 'cgc', name: 'CGC', full: 'Certified Guaranty Company', icon: '🟨', color: '#ffcb05',
    feeMult: 0.65, daysMult: 0.6, slabMult: 0.85,
    blurb: 'A third cheaper and nearly twice as fast, at ~15% less on resale. The volume play: slab the mid stack without parking your capital for six weeks.' },
}
export const DEFAULT_GRADER = 'psa'
export function graderById(key) { return GRADERS[key] || GRADERS[DEFAULT_GRADER] }
// ⬛ Black label: a BGS slab whose four subgrades all came back 10. Nothing else earns it.
export function isBlackLabel(grade) {
  return grade?.company === 'bgs' && grade.centering === 10 && grade.corners === 10 &&
    grade.edges === 10 && grade.surface === 10
}
// What this card's holder does to its market value, relative to the PSA comps everything
// else in the game is priced from.
export function slabMultiplier(grade) {
  if (!grade) return 1
  if (isBlackLabel(grade)) return GRADERS.bgs.blackLabelMult
  return graderById(grade.company || DEFAULT_GRADER).slabMult
}
// How a slab reads on screen: "PSA 10", "CGC 9", "⬛ BGS 10". One helper so every surface
// that used to hardcode `PSA ${grade.overall}` names the right holder.
export function slabLabel(grade) {
  if (!grade) return ''
  if (isBlackLabel(grade)) return `⬛ BGS ${grade.overall}`
  return `${graderById(grade.company || DEFAULT_GRADER).name} ${grade.overall}`
}
// Turnaround in days for a service tier at a given company (the courier upgrade still
// applies on top, at the submission site).
export function gradingDays(tierKey, company = DEFAULT_GRADER, cardVal = 0) {
  const g = GRADING[tierKey]
  if (g?.days == null) return null
  // A card past the tier's insured ceiling isn't on that service any more — it's on the premium
  // ladder, and the ladder sets the TURNAROUND as well as the price. This matters: without it a
  // player could nominate Economy on a $10,000 card, pay the same $599 the ladder charges
  // everyone, and then wait 45 days for the privilege. In reality there is no slow, cheap option
  // for a five-figure card; every premium service comes back inside a week or so.
  const days = (g.maxValue != null && cardVal > g.maxValue)
    ? Math.min(g.days, premiumTierFor(cardVal).days)
    : g.days
  return Math.max(1, Math.ceil(days * graderById(company).daysMult))
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
// `cardVal` is the card's declared value (raw market). Omit it and you get the old flat
// sticker, which is still right for anything inside the tier's ceiling.
export function gradingFee(tierKey, submitted, batchCount = 1, company = DEFAULT_GRADER, cardVal = 0) {
  const g = GRADING[tierKey]
  if (!g) return 0
  const feeMult = graderById(company).feeMult
  const loyalty = graderTier(submitted).discount
  const bulk = bulkDiscount(batchCount)
  // Combined, and capped: loyalty × bulk compounded to 59% before, and the grader's own
  // multiplier could take it past 70%. Half off is the most anyone gets.
  const off = Math.min(MAX_GRADING_DISCOUNT, 1 - (1 - loyalty) * (1 - bulk))
  const sticker = Math.max(GRADING_FLOOR * feeMult, g.fee * feeMult * (1 - off))
  // Above the tier's insured ceiling you are off the standard rate card entirely and onto the
  // premium ladder — you cannot send a $20,000 card on a bulk service at any speed, which is
  // why this REPLACES the tier rather than scaling it. Bulk slabbing of ordinary cards is
  // untouched; it's the four-figure chase that now costs what it really costs.
  const premium = (g.maxValue != null && cardVal > g.maxValue)
    ? premiumTierFor(cardVal).fee * feeMult : 0
  return round2(Math.max(sticker, premium))
}
// Does this card blow past the tier's declared-value ceiling (i.e. is it being priced off its
// value rather than the sticker)? Drives the UI's "priced by value" note.
export function overTierValue(tierKey, cardVal = 0) {
  const cap = GRADING[tierKey]?.maxValue
  return cap != null && cardVal > cap
}
// 💸 The RETURN INVOICE. A grader re-values the card on the way out: the service level you paid
// for insured it up to a ceiling, and if the slab they just created is worth more than that,
// they bill you the difference before it ships back. You genuinely do not know the final cost
// of a submission when you send it — which is the point, and why sending a sleeper on the cheap
// tier is a gamble in BOTH directions. The fee for a big hit is part of the hit.
// Returns what's still owed once the grade is known (0 when the tier already covered it).
export function gradeUpcharge(gradedCard, paidFee, tierKey, submitted, company = DEFAULT_GRADER) {
  const worth = gradedValue(gradedCard)
  const required = gradingFee(tierKey, submitted, 1, company, worth)
  return round2(Math.max(0, required - (paidFee || 0)))
}

// 📦 Freight, both ways, per SUBMISSION — the cost every real submitter pays and the game
// wasn't modelling at all. You mail the cards insured for what they're worth and pay return
// postage on the slabs coming back. Charged ONCE per submission rather than per card, which is
// precisely why the hobby batches: one card eats the whole round trip, forty share it.
//
// This is the piece that made grading feel free. A single $100 card on Economy cost $25; it
// really costs $25 plus the best part of $25 to get it there and back, and that is exactly why
// nobody sends one card at a time.
export const GRADE_SHIP_BASE = 22        // round-trip postage + packaging on a small parcel
export const GRADE_SHIP_INSURED = 0.01   // insured for declared value, in both directions
export function gradingShipping(cards, upgrades) {
  const list = cards || []
  if (!list.length) return 0
  const declared = list.reduce((a, c) => a + rawValue(c), 0)
  // 📦 The Shipping Station's thermal labels and bulk mailers cut the postage, never the
  // insurance — the carrier doesn't care how neat your parcel is.
  const base = GRADE_SHIP_BASE * (upgrades?.shipStation ? 0.6 : 1)
  const parcels = 1 + Math.floor(list.length / 30) * 0.5   // a bigger, heavier box costs more
  return round2(base * parcels + declared * GRADE_SHIP_INSURED)
}

// What a whole batch costs. Since declared-value pricing makes the per-card fee depend on the
// CARD, a batch total is a sum, not a multiply — every quoting UI must go through this or it
// will show a number the store then refuses to charge.
// `upgrades` opts the submission freight in. Omit it and you get fees only (what the per-card
// pickers quote); pass it and you get what the submission actually costs, freight included.
export function gradingFeeTotal(cards, tierKey, submitted, company = DEFAULT_GRADER, upgrades = null) {
  const list = cards || []
  const fees = list.reduce((a, c) => a + gradingFee(tierKey, submitted, list.length, company, rawValue(c)), 0)
  return round2(fees + (upgrades === null ? 0 : gradingShipping(list, upgrades)))
}
// Roll subgrades. Better cards (by value) get a slightly tighter distribution,
// simulating that valuable cards are often handled carefully — but it's mostly luck.
export function rollGrade(card, tier, luck = 0, paidFee = null, company = DEFAULT_GRADER) {
  // luck (0..~0.1) shifts the distribution toward higher grades — e.g. the loupe.
  // It nudges each cutoff up proportionally rather than subtracting from the roll,
  // so the lower tail (6 and below) stays reachable instead of becoming impossible.
  //
  // cutLuck: bias from the card's hidden cut quality (_cut 0..1, centered at 0.5).
  // K=0.16 → a Pristine card adds +0.08 lean; a Rough card subtracts -0.08.
  // Guard: _cut==null (old saves) → cutLuck=0, formula reduces to original exactly.
  const cutLuck = card._cut == null ? 0 : Math.max(-0.12, Math.min(0.12, (card._cut - 0.5) * 0.16))
  const effectiveLuck = Math.max(-0.25, Math.min(0.25, luck + cutLuck))
  const sub = () => {
    const r = Math.random()
    const b = (p) => Math.max(0.001, Math.min(0.999, p + effectiveLuck * (1 - p))) // pull each cutoff toward 1 by combined lean
    // Subgrade cutoffs are calibrated to REAL modern-Pokémon PSA data. An untooled, average-cut
    // card lands ≈ 24% PSA 10 · 50% PSA 9 · 20% PSA 8 · 6% ≤7 overall — matching pop-report gem
    // rates for modern chase sets (Paradox Rift 32%, 151 31%, Surging Sparks 35% are pre-screened
    // submissions; unscreened runs a touch under). The tools + cut ARE the pre-screen: loupe /
    // express / a pristine cut push the gem rate to ≈ 32-38% (well-screened levels). Modern print
    // quality means the low tail is thin — a ≤7 is a genuinely rough card.
    if (r < b(0.40)) return 10
    if (r < b(0.76)) return 9
    if (r < b(0.93)) return 8
    if (r < b(0.985)) return 7
    if (r < b(0.996)) return 6
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
  // PSA overall ≈ the average, held back by the weakest subgrade — but not as harshly as a
  // strict "min + 1" gate (which made a true 10 require ALL FOUR subgrades to be a 10, ~0.8%).
  // A near-perfect card (worst subgrade 9) can still GEM when the average rounds up, so 10s
  // land at a satisfying rate for pristine pulls while a genuinely flawed card is still capped.
  const min = Math.min(centering, corners, edges, surface)
  const avg = (centering + corners + edges + surface) / 4
  const ceiling = min >= 9 ? 10 : min + 1 // one 9 subgrade no longer blocks a gem
  let overall = Math.round(Math.min(ceiling, avg))
  overall = Math.max(1, Math.min(cap, ceiling, overall))
  // record the fee the player actually paid (after loyalty discount), not list price, and
  // WHICH grader's holder it came back in — that's what slabMultiplier prices off.
  return { overall, centering, corners, edges, surface, fee: paidFee ?? GRADING[tier].fee, tier,
    company, gradedAt: Date.now() }
}

// ---- 🔨 Cracking a slab -------------------------------------------------------------
// Breaking a card out of its holder to send it again is a real and common play: you buy an
// under-graded slab cheap, crack it, resubmit, and hope the second opinion is kinder.
//
// The design problem is obvious. If cracking simply re-rolled the same distribution, the
// correct strategy would be to crack every 9 forever until it gemmed, and grading would stop
// being a decision. THE FIX IS THE HONEST ONE: a grade is EVIDENCE about the physical card.
//
// So each grade a card receives refines its hidden cut quality toward what that grade implies,
// and the refinement gets heavier with every observation. A card that grades 8 twice ends up
// with a genuinely poor recorded cut, its regrade odds get worse, and the reroll dries up. A
// card that graded 9 once still has real upside, because one observation is weak evidence —
// which is exactly the case where a real dealer cracks.
const CUT_IMPLIED = { 10: 0.88, 9: 0.62, 8: 0.42, 7: 0.28, 6: 0.18 }
export function refineCut(card, grade) {
  const cut = card._cut ?? 0.5
  const implied = CUT_IMPLIED[grade?.overall] ?? 0.12
  // How many opinions this card has now had. Each one makes the estimate firmer.
  const n = Math.max(1, (card.gradeHistory?.length || 0))
  const weight = 1 - 1 / (1 + n * 0.8)   // 1 grade → 0.44, 2 → 0.62, 3 → 0.71 …
  return Math.max(0, Math.min(1, cut * (1 - weight) + implied * weight))
}

// The physical risk of cracking. Most cracks are clean; a slip nicks a corner and drops the
// card a condition tier, which also caps every grade it can earn from then on. This is the
// cost that stops cracking being a free option even when the odds look good.
export const CRACK_DAMAGE_CHANCE = 0.05
export function crackSlab(card, rnd = Math.random) {
  const refined = refineCut(card, card.grade)
  const damaged = rnd() < CRACK_DAMAGE_CHANCE
  const worse = { NM: 'LP', LP: 'MP', MP: 'DMG', DMG: 'DMG' }
  const out = {
    ...card,
    grade: null,
    _cut: refined,
    _cracked: (card._cracked || 0) + 1,
    condition: damaged ? (worse[card.condition || 'NM'] || 'LP') : (card.condition || 'NM'),
  }
  return { card: out, damaged }
}

// Predicted grade RANGE for a still-raw card (the Grading Scope upgrade). Monte-Carlos the
// SAME rollGrade path the real submission uses — so it honours the card's hidden cut, its
// condition cap, and the player's loupe luck — then summarises the outcome: the likeliest
// grade, a confidence band (10th–90th percentile), and the gem-10 odds. Purely informational;
// it changes nothing about the actual roll. Returns null-safe fields for the UI.
export function gradePrediction(card, luck = 0, samples = 600) {
  const counts = {}
  for (let i = 0; i < samples; i++) {
    const g = rollGrade(card, 'standard', luck).overall
    counts[g] = (counts[g] || 0) + 1
  }
  const grades = Object.keys(counts).map(Number).sort((a, b) => a - b)
  // likeliest grade (mode)
  let likely = grades[0], best = -1
  for (const g of grades) if (counts[g] > best) { best = counts[g]; likely = g }
  // 10th / 90th percentile band (walk the cumulative distribution low→high)
  let cum = 0, lo = grades[0], hi = grades[grades.length - 1]
  const loMark = samples * 0.1, hiMark = samples * 0.9
  let loSet = false
  for (const g of grades) {
    const prev = cum; cum += counts[g]
    if (!loSet && cum > loMark) { lo = g; loSet = true }
    if (prev < hiMark && cum >= hiMark) { hi = g; break }
  }
  return {
    likely, lo, hi,
    gemChance: (counts[10] || 0) / samples,               // P(PSA 10)
    highChance: ((counts[10] || 0) + (counts[9] || 0)) / samples, // P(9 or 10)
  }
}

// ---- Eyeball cut-quality estimate ----
// Returns a qualitative read on a card's hidden cut (_cut 0..1).
// precise=true (loupe owned): exact tier + specific detail line.
// precise=false: fuzzy, hedged wording that's directionally right but vague.
// Also appends a condition-cap note for played cards (LP/MP/DMG).
// Backward-compat: _cut==null → treat as 0.5 (Clean) so old saves show a neutral read.
const CUT_TIERS = [
  { tier: 'Rough',      min: 0,    max: 0.20, label: 'Rough',      abbr: 'Rgh',  color: '#ff5e6c', detail: 'Off-center with edge wear' },
  { tier: 'Off-center', min: 0.20, max: 0.40, label: 'Off-center', abbr: 'OC',   color: '#ff9f43', detail: 'Noticeably off-center' },
  { tier: 'Clean',      min: 0.40, max: 0.65, label: 'Clean',      abbr: 'Cln',  color: '#9db8ff', detail: 'Decent centering, minor flaws' },
  { tier: 'Sharp',      min: 0.65, max: 0.85, label: 'Sharp',      abbr: 'Shrp', color: '#36d399', detail: 'Well-centered, crisp edges' },
  { tier: 'Pristine',   min: 0.85, max: 1.01, label: 'Pristine',   abbr: 'Pris', color: '#7cf0ff', detail: 'Dead-centered, sharp corners' },
]
// Fuzzy labels span ~±1 tier in wording; never name the exact tier confidently.
const FUZZY_LABELS = {
  'Rough':      'Looks rough — hard to tell without a loupe',
  'Off-center': 'Looks a bit off — could be better',
  'Clean':      'Looks clean-ish',
  'Sharp':      'Looks sharp — could be a gem?',
  'Pristine':   'Looks really sharp — could be a gem?',
}
// Compact fuzzy word for tight UI (the Bench tile): a deliberately COARSE bucket that
// must never reveal the exact tier without the loupe. Adjacent tiers share a word (so
// Sharp/Pristine are indistinguishable, Rough/Off-center likewise), and the words are
// chosen to NOT match any exact tier name — only the loupe gives the real classification.
const FUZZY_SHORT = {
  'Rough':      'iffy?',
  'Off-center': 'iffy?',
  'Clean':      'ok?',
  'Sharp':      'nice?',
  'Pristine':   'nice?',
}
// --- Binder reserve ---------------------------------------------------------
// A masterset is where DUPLICATE / display copies live — the genuinely sharp copies are
// worth more graded and sold than buried in a slot. So the binder "reserve" is a CEILING,
// not a floor: a raw copy whose cut is AT OR ABOVE the reserve tier is held OUT of the
// auto-fill and the nightly Curator, left free to grade & sell. Everything BELOW the tier
// is binder-grade and gets filed. Tiers are ordered worst → best, so "at or above X" is a
// simple index comparison.
//
// Graded slabs are exempt (always eligible to file): a slab is no longer a "card to grade",
// so whether to sell it or slot it is a per-card decision you make by hand — the reserve,
// which is about NOT burying grade-worthy RAW cards, doesn't apply to it.
export const CONDITION_ORDER = ['DMG', 'MP', 'LP', 'NM']   // worst → best
export const CUT_ORDER = ['Rough', 'Off-center', 'Clean', 'Sharp', 'Pristine']

export function conditionRank(key) {
  const i = CONDITION_ORDER.indexOf(key)
  return i === -1 ? CONDITION_ORDER.length - 1 : i // unknown/absent = treat as best, never block
}
// A card's true cut tier index (0 Rough … 4 Pristine). Null cut (old saves) reads as 'Clean'.
export function cutRank(card) {
  const cut = card?._cut ?? 0.5
  const i = CUT_TIERS.findIndex(t => cut >= t.min && cut < t.max)
  return i === -1 ? CUT_TIERS.length - 1 : i
}
// The cut-tier index at/above which raw copies are RESERVED (held out of the binder). Null
// (reserveCut unset / 'off') means reserve nothing. See the reserve note above.
export function reserveRank(reserveCut) {
  if (!reserveCut || reserveCut === 'off') return null
  const i = CUT_ORDER.indexOf(reserveCut)
  return i === -1 ? null : i
}
// Is this card eligible to be FILED into the masterset (i.e. NOT reserved for grading)?
// Slabs always qualify (see above). A raw card qualifies only if its cut is BELOW the
// reserve tier; a cut at/above it is your grade-and-sell copy and stays out. With no
// reserve set, everything qualifies — exactly the behaviour before the reserve existed.
export function fileableInBinder(card, reserveCut) {
  if (!card) return false
  if (card.grade) return true
  const bar = reserveRank(reserveCut)
  if (bar == null) return true
  return cutRank(card) < bar
}

export function cutEstimate(card, precise) {
  // Null-safe: _cut==null means an old save with no cut data; treat as 0.5 (Clean).
  const cut = card._cut ?? 0.5
  const t = CUT_TIERS.find(t => cut >= t.min && cut < t.max) || CUT_TIERS[CUT_TIERS.length - 1]
  const cap = card.condition && CONDITIONS[card.condition] ? CONDITIONS[card.condition].maxGrade : 10
  const capNote = cap < 10 ? ` · capped at PSA ${cap} by condition` : ''
  // `short` is a compact word for tight UI: the exact tier when precise, a coarse
  // never-leaks-the-tier word when fuzzy. `label` is the full read for roomy UI.
  if (precise) {
    return { tier: t.tier, label: t.label, short: t.label, abbr: t.abbr, detail: t.detail + capNote, color: t.color }
  }
  return { tier: t.tier, label: FUZZY_LABELS[t.tier] + capNote, short: FUZZY_SHORT[t.tier], abbr: null, detail: null, color: t.color }
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
  if (set.japanese) return jpProducts(set)
  const byR = cardsByRarity(set)
  const hasChase = (byR['Special Illustration Rare']?.length || 0) + (byR['Mega Hyper Rare']?.length || 0) > 0
  const pack = hasChase ? 4.49 : 3.99
  return [
    { type: 'Booster Pack', icon: '🎴', packs: 1, bonus: null, price: pack },
    { type: 'Booster Box', icon: '🗃️', packs: 36, bonus: null, price: round2(pack * 36 * 0.92) },
  ]
}
// 🎌 JP sealed lineup — synthesized (JustTCG lists JP sealed without usable structure), but
// PRICED off the set's own real singles market: import boxes trade where rippers price them,
// a hair over aggregate pull EV. Box = 30 packs at ~78% EV-to-price (JP boxes run closer to
// break-even than English product — that's the import play), floored at a $45 freight-real
// minimum; the single pack carries the usual per-pack premium over the box rate. Derived
// from BASE prices (not live drift) so the sticker is stable across sessions — the live
// market still moves the VALUE of a held unit via sealedValue's marketMult, like any sealed.
const JP_EV_RATIO = 0.78
const JP_PRODUCTS = new Map()
function jpProducts(set) {
  let ps = JP_PRODUCTS.get(set.id)
  if (!ps) {
    const box = Math.max(45, Math.round(jpPackEV(set) * 30 / JP_EV_RATIO)) - 0.01
    const pack = Math.round((box / 30) * 1.10 * 4) / 4 // per-pack premium, quarter-rounded
    ps = [
      { type: 'Booster Pack', icon: '🎴', packs: 1, bonus: null, price: pack },
      { type: 'Booster Box', icon: '🗃️', packs: 30, bonus: null, price: box },
    ]
    JP_PRODUCTS.set(set.id, ps)
  }
  return ps
}
// Cheapest single-pack product for a set (used as the "pack price" baseline).
export function packPrice(set) {
  const single = setProducts(set).find(p => p.packs === 1)
  return single ? single.price : 4.49
}

// Open a sealed product: rip `packs` packs and (if any) add a guaranteed bonus
// promo. Returns the flat array of all cards pulled.
// 🔦 SEARCHED PACKS. A loose out-of-print pack has been out of the factory box for years, and
// somebody along the chain may have weighed or candled it and pulled the holo before resealing.
// The odds are a property of WHERE you bought it, rolled once at purchase and stamped on the
// item — so it's a decision about who you trust, not a coin flip at rip time. A searched pack
// still opens; it just can't hold a hit, because the hit already left.
export const SEARCH_RISK = { shop: 0.03, vendor: 0.10, floor: 0.20, sketchy: 0.34 }
// Only loose, out-of-print single packs carry the risk. A modern in-print pack came off a pallet
// last month; a factory-sealed box is still shrink-wrapped whatever its age. And a pack you got
// by BREAKING your own sealed box is clean by construction — which quietly makes buying boxes
// and breaking them yourself the trustworthy way to get old singles.
export function searchable(set, product) {
  return !!set && product?.packs === 1 && (set.vintage || AFTERMARKET_SET_IDS.has(set.id))
}
export function rollSearched(sourceKey, rnd = Math.random) {
  return rnd() < (SEARCH_RISK[sourceKey] ?? 0)
}
// Swap anything above a plain Rare for a common from the same set — what's left after someone
// has been through it. Keeps the pack's SHAPE (same card count) so the rip still reads normally
// right up to the moment you realise nothing good is coming.
// The animated single-pack rip goes through openPack directly (not openProduct), so it needs
// its own way in. Same rule: loose packs only, and the pack keeps its shape.
export function openPackFor(set, product) {
  const cards = openPack(set)
  if (!product?._searched || product.packs !== 1) return cards
  const out = stripSearched(cards, set)
  out._searched = true
  return out
}
function stripSearched(cards, set) {
  const pool = (set.cards || []).filter(c => c.rarity === 'Common')
  if (!pool.length) return cards
  return cards.map(c => (rarityRank(c.rarity) > rarityRank('Rare') || c.foil)
    ? instance(pool[Math.floor(Math.random() * pool.length)], c.condition || 'NM')
    : c)
}

// --- Cross-set ("era") product ------------------------------------------------
// An Ultra Premium Collection belongs to an ERA, not an expansion. A Charizard UPC holds
// "16 booster packs from the Sword & Shield Series" and the box never says which — because
// the mix genuinely varies. A reviewer who opened one got 3 Evolving Skies, 3 Fusion Strike,
// 3 Astral Radiance, 3 Brilliant Stars, 2 Lost Origin, 1 Vivid Voltage and 1 Darkness Ablaze,
// and reported that another box held 17 packs instead of 16. So the game does not need a pack
// LIST for these products. It needs a pool and a draw.
//
// These carry `pool: { series }` instead of living under a set. See fetch-data.mjs.
export const ERA_PRODUCTS = data.eraProducts || []

// The sets an era product can pull a pack from. Promo/collectible pools (`extra`) and the
// Japanese catalog are excluded — neither is sold as a booster pack in an English collection.
const ERA_POOL = new Map()
export function eraPool(series) {
  if (!series) return []
  let pool = ERA_POOL.get(series)
  if (!pool) {
    pool = SETS.filter(s => s.series === series && !s.japanese && !s.extra && (s.cards?.length || 0) > 0)
      .sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || ''))) // newest first
    ERA_POOL.set(series, pool)
  }
  return pool
}

// Weight the draw by chase density, because The Pokémon Company packs the hot sets heavily.
// A UPC that mostly coughed up filler sets would lose the exact thing people chase it for.
// The +1 floor keeps a quiet set in the mix — real collections do carry the odd dud pack.
const ERA_CHASE = ['Special Illustration Rare', 'Illustration Rare', 'Hyper Rare', 'Mega Hyper Rare', 'Ultra Rare']
const ERA_WEIGHT = new Map()
function eraWeights(series) {
  let w = ERA_WEIGHT.get(series)
  if (!w) {
    w = eraPool(series).map(s => {
      const byR = cardsByRarity(s)
      return 1 + ERA_CHASE.reduce((a, r) => a + (byR[r]?.length || 0), 0)
    })
    ERA_WEIGHT.set(series, w)
  }
  return w
}

// The pack list for ONE physical unit, derived — never stored.
//
// Seeded from the item's uid, so a given box always holds the same packs (they were sealed
// at the factory long before you bought it) while two boxes of the same product hold
// different ones. Deriving rather than storing buys three things: saves don't grow by 16-36
// set ids per box (slimsave stays honest), held units stay fungible so heldMatches keeps
// grouping them, and sealedValue has nothing to read — a sealed box CANNOT leak its contents
// into its price, so it sells on potential like the real thing.
export function drawPackSets(product, uid) {
  const series = product?.pool?.series
  const n = product?.packs || 0
  if (!series || !n || !uid) return null
  const pool = eraPool(series)
  if (!pool.length) return null
  const w = eraWeights(series)
  const total = w.reduce((a, b) => a + b, 0)
  let s = hashStr(`${uid}|${product.tcgId || product.name || ''}`)
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  const out = []
  for (let i = 0; i < n; i++) {
    let r = rnd() * total
    let k = 0
    while (k < pool.length - 1 && (r -= w[k]) > 0) k++
    out.push(pool[k].id)
  }
  return out
}

// The set a cross-set product anchors to once you own it. Held sealed is
// `{ uid, setId, product }` and a lot of machinery keys off setId — marketMult, the synthetic
// `<setId>-sealed` card id, makeProductPromo — so an era product still needs ONE home set.
// Prefer the set that actually holds the card the product is named for, so a "Greninja ex
// Ultra-Premium Collection" ships a real Greninja ex rather than a synthesised stand-in.
// Otherwise the era's newest set.
export function eraAnchorSet(product) {
  const pool = eraPool(product?.pool?.series)
  if (!pool.length) return null
  const name = promoNameFromProduct(null, product)
  if (name) {
    const hit = pool.find(s => findSetCardByName(s, name))
    if (hit) return hit
  }
  return pool[0]
}

export function openProduct(set, product, opts = {}) {
  const all = []
  // A cross-set product resolves a set PER PACK; everything else uses the one set it belongs
  // to. `opts.uid` identifies the physical unit being opened, so two UPCs rip differently.
  const packSets = opts.packSets || drawPackSets(product, opts.uid)
  for (let i = 0; i < product.packs; i++) {
    const from = (packSets && setById(packSets[i])) || set
    const pack = openPack(from)
    if (pack._god) pack.forEach(c => { c._fromGod = true })
    all.push(...pack)
  }
  // Only a LOOSE pack can have been searched — a factory-sealed box or ETB is still shrink-
  // wrapped, and nobody resealed that. Applied before the bonus promo so a product that ships
  // one still gets it: the promo is on the packaging, not inside a pack somebody went through.
  if ((opts.searched || product._searched) && product.packs === 1) {
    all.splice(0, all.length, ...stripSearched(all, set))
    all._searched = true
  }
  // Bonus promo: the single fixed card this product ships (see makeProductPromo) — usually a
  // cheap black-star foil, occasionally a headline ex/GX/V chase in a premium collection / box.
  const promo = makeProductPromo(set, product)
  if (promo) all.push(promo)
  // NOTE: each pack is deduped internally (a single pack never repeats a card), but a
  // multi-pack box is intentionally NOT deduped across packs — real boxes repeat cards
  // between packs, and that keeps the collection grind honest.
  return all
}

// --- Guaranteed bonus promos -------------------------------------------------
// In real life a sealed product's bonus promo is a SINGLE fixed card the packaging tells
// you about — a "Mini Tin [Flareon]" always holds the Flareon promo, a "Charizard ex Box"
// always holds a Charizard ex. It is NOT a random chase re-rolled every rip. We honor that:
// the promo a product yields is DETERMINISTIC (same product → same card, every time),
// recovered from explicit data or the product name. The lone real exception is a Build &
// Battle Box, which ships 1 of a small fixed pool (usually 4) of foil promos — that stays
// randomised, but only within its real pool, never the whole set's chase.
//
// Real promos also skew CHEAP: most (bare-Pokémon blister/tin promos — Pachirisu, Cottonee)
// are their own low-value black-star foil print, not the set's holo. Only the headline
// ex/GX/V/VMAX/VSTAR promos in premium collections and ex/V boxes are genuinely valuable, and
// those we pin to the real in-set card. This replaces the old behavior, which handed out a
// randomly-drawn Ultra/Illustration Rare on EVERY etb/tin/blister rip — both unrealistic and
// far too generous.

// FNV-1a 32-bit string hash — a stable, deterministic pick seed so a given product always
// yields the same promo WITHOUT touching Math.random (which would re-roll on every rip).
function hashStr(s) {
  const str = String(s)
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// A promo whose name carries an ex/GX/V/VMAX/VSTAR suffix is a valuable headline foil (pinned
// to the real in-set card); a bare-Pokémon name is a cheap black-star foil print (minted).
const CHASE_SUFFIX = /\b(?:ex|gx|v|vmax|vstar)$/i

// Recover the featured promo's card name from a product name, or null when the name reveals no
// single card (a plain ETB / Build & Battle / generic collection):
//   "… Mini Tin [Flareon]"                 → "Flareon"
//   "… Tin [Mega Feraligatr ex]"           → "Mega Feraligatr ex"
//   "Blastoise GX Premium Collection"      → "Blastoise GX"
//   "Charizard EX Box"                     → "Charizard EX"
//   "Ascended Heroes Mega Feraligatr ex Box" → "Mega Feraligatr ex" (set-name prefix stripped)
function promoNameFromProduct(set, product) {
  let raw = product.name || ''
  const br = raw.match(/\[([^\]]+)\]/)
  // "[Luxray Line]" → "Luxray", "[Zorua & Cramorant]" → "Zorua" (a blister ships ONE promo).
  if (br) return br[1].replace(/\s+line\b/i, '').replace(/\s*&.*$/, '').trim()
  if (set?.name && raw.toLowerCase().startsWith(set.name.toLowerCase())) raw = raw.slice(set.name.length).trim()
  // "…ex Ultra-Premium Collection" / "…ex Super-Premium Collection" count too — without the
  // ultra/super branch a "Greninja ex Ultra-Premium Collection" matched nothing and shipped a
  // random card from the anchor set instead of the Greninja ex on the box.
  const m = raw.match(/^(.+?\b(?:ex|gx|v|vmax|vstar))\s+(?:(?:ultra|super)[- ])?(?:premium\s+)?(?:collection|box|powers)\b/i)
  return m ? m[1].trim() : null
}

// Normalize a card/promo name for loose matching ("Charizard EX" ≡ "Charizard ex").
function normName(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }

// Rarities a sealed product's promo may NEVER be. A promo print is a stamped edition of a
// card's BASE art — a Special Illustration Rare (or an Illustration Rare, a gold/rainbow Hyper
// Rare, a Mega Hyper Rare) is a pack-only chase that is never boxed as a guaranteed promo.
// A "Mega Feraligatr ex Box" ships the plain Mega Feraligatr ex, not the $170 SIR alt art.
const PROMO_BANNED_RARITY = new Set([
  'Illustration Rare', 'Special Illustration Rare', 'Hyper Rare',
  'MEGA_ATTACK_RARE', 'Mega Hyper Rare', 'Black White Rare', 'ACE SPEC Rare',
])
// Subset-gallery numbering: Trainer Gallery (TG/GG), Shiny Vault (SV), Radiant Collection (RC).
// Those live INSIDE their parent set's card pool (see EXTRA_SETS / alsoFetch), but they're
// pack-only subset pulls — never a boxed promo either.
const GALLERY_NUMBER = /^(?:TG|GG|SV|RC)\d/i
function promoEligible(card) {
  return !PROMO_BANNED_RARITY.has(card.rarity) && !GALLERY_NUMBER.test(String(cardNumber(card) || ''))
}

// A card's collector number as a sortable integer — secret/full-art reprints are numbered ABOVE
// the set's printed total, so the lowest number of a name's prints is its base art. Non-numeric
// (gallery/promo) numbers sort last.
function numOf(card) {
  const n = parseInt(String(cardNumber(card) || ''), 10)
  return Number.isFinite(n) ? n : Infinity
}

// Find the in-set card a promo name pins to: the BASE print of that card — lowest rarity tier,
// then lowest collector number — never one of its chase reprints. Alt arts, illustration rares
// and gold secrets are filtered out entirely (promoEligible); null when the set has no eligible
// print, so the caller can fall back to a real Black Star Promo or a cheap synthetic one.
function findSetCardByName(set, name) {
  const want = normName(name)
  if (!want) return null
  const matches = set.cards.filter(c => normName(c.name) === want && promoEligible(c))
  if (!matches.length) return null
  return matches.reduce((best, c) => {
    const dr = rarityRank(c.rarity) - rarityRank(best.rarity)
    return (dr < 0 || (dr === 0 && numOf(c) < numOf(best))) ? c : best
  })
}

// The Black Star Promo `extra` set that pairs with a main set's era. A bare-Pokémon blister/tin
// promo is a REAL card from here — a "Surging Sparks [Pachirisu]" blister ships the svp Pachirisu
// black-star promo, not a synthetic. Only modern eras press blister/tin promos we can pin.
function eraPromoSetId(setId) {
  const id = String(setId || '')
  if (/^(sv|me|zsv|rsv)/.test(id)) return 'svp'
  if (/^swsh/.test(id)) return 'swshp'
  if (/^sm/.test(id)) return 'smp'
  if (/^xy/.test(id)) return 'xyp'
  if (/^bw/.test(id)) return 'bwp'
  return null
}

// Resolve a bare-Pokémon promo name to the real Black Star Promo in the set's era pool. Prefers an
// exact name match; among ties picks the CHEAPEST — a blister/tin promo is the cheap black-star
// print, never a set's pricey alt-art of the same Pokémon. null if none (→ synthetic mint).
function findEraPromo(set, name) {
  const promoSet = SET_BY_ID[eraPromoSetId(set.id)]
  if (!promoSet?.cards?.length) return null
  const want = normName(name)
  const matches = promoSet.cards.filter(c => normName(c.name) === want)
  if (!matches.length) return null
  return matches.reduce((lo, c) => (cardValue(c) < cardValue(lo) ? c : lo))
}

// A synthetic low-value black-star promo print for a name not in the set. Deterministic value
// in ~$2–6 (where real bare-Pokémon foil promos actually trade). Its id carries exactly one
// hyphen so setIdOfCard resolves it to the real set for market drift. Returns a card OBJECT —
// makeProductPromo mints the instance once, after optionally stamping it (see below).
function synthPromoCard(set, name, seed) {
  const price = round2(2 + (hashStr(seed) % 400) / 100) // $2.00–$5.99, stable per product
  return {
    id: `${set.id}-promo${normName(name).replace(/\s+/g, '')}`,
    name, number: 'PROMO', rarity: 'Promo', supertype: 'Pokémon',
    price, foil: null, reverse: false,
  }
}

// The candidate pool the deterministic ETB / Build & Battle fallbacks draw from. Real promos
// there are foil POKÉMON in a believable ~$1–15 band — never bulk energy/Trainer chaff, never
// a re-rolled chase. Alt-art/secret/gallery prints are excluded outright (promoEligible): a
// cheap Shiny Vault or Illustration Rare is still a pack-only chase, price notwithstanding.
// Falls back gracefully to the set's foil tiers, then anything.
function promoCandidates(set) {
  const clean = set.cards.filter(promoEligible)
  const pokemon = clean.filter(c => (c.supertype || 'Pokémon') === 'Pokémon')
  const src = pokemon.length ? pokemon : (clean.length ? clean : set.cards)
  const band = src.filter(c => { const v = cardValue(c); return v >= 1 && v <= 15 })
  if (band.length) return band
  const byR = cardsByRarity(set)
  const foils = [...(byR['Rare Holo'] || []), ...(byR['Double Rare'] || []), ...(byR['Rare'] || [])]
    .filter(c => (c.supertype || 'Pokémon') === 'Pokémon' && promoEligible(c))
  return foils.length ? foils : src
}

// The deterministic promo CARD (object) an ETB / unresolved product falls back to: a real,
// stable card from the candidate pool above (never a re-rolled chase). Same product → same card.
function fallbackPromoCard(set, seed) {
  const src = promoCandidates(set)
  if (!src.length) return null
  return src[hashStr(seed) % src.length]
}

// Is this the Pokémon Center exclusive edition of a product? Those ship a Pokémon Center-
// STAMPED promo — a distinct, pricier collectible print of the same featured card. Those stamped
// cards aren't in the raw set data, so we mint the stamp on the fly (see pokemonCenterStamp).
function isPokemonCenterProduct(product) {
  return /pok[eé]mon\s*center/i.test(`${product?.type || ''} ${product?.name || ''}`)
}

// Turn a resolved base promo (a card OBJECT) into its Pokémon Center-stamped edition: a distinct
// collectible id, a "(Pokémon Center)" name, and REAL price + graded data derived from the base
// card — stamped PC promos trade above their plain siblings, in raw AND slabbed. Deterministic
// per product, so a given PC box always stamps the same card at the same value.
//
// There's no live price source for the stamped prints specifically (see fetch-data.mjs — PSA
// comps have no live feed either), so both the raw price and the whole PSA ladder are anchored
// to the base card's real market data and lifted by the stamp premium. That keeps every figure
// traceable to a real comp rather than invented, and preserves the ladder's monotonicity.
function pokemonCenterStamp(base, set, seed) {
  const basePrice = base.price ?? CANONICAL_PRICE[base.id] ?? estimateByRarity(base.rarity)
  const premium = 1.7 + (hashStr(`${seed}|pc`) % 90) / 100 // 1.70–2.59×, stable per product
  const baseSet = setIdOfCard(base) || set.id
  const num = String(cardNumber(base) || normName(base.name).replace(/\s+/g, '') || 'promo')
  const card = {
    ...base,
    id: `${baseSet}-pcstamp${num}`,           // one hyphen → market drift still tracks the base set
    name: `${base.name} (Pokémon Center)`,
    rarity: base.rarity || 'Promo',
    price: round2(Math.max(5, basePrice * premium)),
    foil: null, reverse: false,               // premium is baked into price — no pattern mult on top
  }
  // Real graded data: scale each of the base card's captured PSA comps by the same premium, so a
  // slabbed stamped promo has a full, monotonic grade ladder grounded in real comps. If the base
  // has no comps, drop the key and the card grades on the same heuristic every comp-less card uses.
  if (base.psa && typeof base.psa === 'object') {
    card.psa = Object.fromEntries(Object.entries(base.psa).map(([g, v]) => [g, round2(v * premium)]))
  } else {
    delete card.psa
  }
  return card
}

// Mint the guaranteed bonus promo for a product (null if it has no bonus). Resolution order:
//   1. `fixedPromo`     — an exact card id (the featured chase, e.g. Prismatic SPC Eevee ex).
//   2. `fixedPromoName` — a card NAME: pinned to the in-set card if present, else minted.
//   3. `promoPool`      — Build & Battle's real 1-of-N: a RANDOM pick (per box) among ids/names.
//   4. product name     — bracket [X] or "<Card> ex/GX/… Box/Collection": pin in-set chase, or
//                         pin the real era Black Star Promo for a bare Pokémon (else mint cheap).
//   5. Build & Battle   — no data: 1-of-4 random from a deterministic cheap set slice.
//   6. fallback         — a deterministic cheap set card (plain ETBs, generic collections).
export function makeProductPromo(set, product, rnd = Math.random) {
  if (product.bonus !== 'promo') return null
  const seed = `${set.id}|${product.name || product.type}`
  const base = resolveBasePromo(set, product, seed, rnd)
  if (!base) return null
  // A Pokémon Center edition ships the STAMPED version of that promo — a distinct, pricier
  // collectible we mint on the fly (those stamped prints aren't in the raw set data).
  const isPC = isPokemonCenterProduct(product)
  const inst = instance(isPC ? pokemonCenterStamp(base, set, seed) : base)
  inst._promo = true
  if (isPC) inst._stamp = 'pc'
  return inst
}

// Resolve the CARD (object, pre-instance) a product's bonus promo pins to. Same resolution
// order as before — explicit id, explicit name, Build & Battle pool, name parsed from the
// product, B&B fallback slice, deterministic cheap fallback — but returning the card rather than
// an instance, so makeProductPromo can optionally stamp it before minting the single instance.
function resolveBasePromo(set, product, seed, rnd) {
  // 1. Exact card id — resolved across ALL sets, so it can pin a Black Star Promo (e.g. svp-…)
  //    that lives in an `extra` set rather than the product's own set.
  if (product.fixedPromo) {
    const exact = cardById(product.fixedPromo)
    if (exact) return exact
  }
  // 2. Explicit card name — pin the in-set card, else the era Black Star Promo, else synth.
  if (product.fixedPromoName) {
    return findSetCardByName(set, product.fixedPromoName) || findEraPromo(set, product.fixedPromoName)
      || synthPromoCard(set, product.fixedPromoName, seed)
  }
  // 3. Build & Battle's real small pool — one of N, varying per box (an id, or a name to resolve).
  if (product.promoPool?.length) {
    const choice = pick(product.promoPool, rnd)
    return cardById(choice) || findSetCardByName(set, choice) || findEraPromo(set, choice)
      || synthPromoCard(set, choice, `${seed}|${choice}`)
  }
  // 4. Identity parsed from the product name.
  const name = promoNameFromProduct(set, product)
  if (name) {
    if (CHASE_SUFFIX.test(name)) {
      // The headline foil → the real in-set BASE print (never its alt-art/secret reprint).
      // No eligible print (the card isn't in this set, or exists only as a chase): fall back to
      // the era's Black Star Promo, else a cheap synthetic with the right name — the box still
      // ships the card it names, we just never fabricate a chase to fill the slot.
      return findSetCardByName(set, name) || findEraPromo(set, name) || synthPromoCard(set, name, seed)
    } else {
      // A bare-Pokémon promo is a real Black Star Promo — pin it from the era's promo pool if we
      // have that card, else a cheap synthetic stand-in with the right name.
      return findEraPromo(set, name) || synthPromoCard(set, name, seed)
    }
  }
  // 5. Build & Battle with no explicit pool: a real 1-of-4 from a deterministic candidate slice.
  if (/build\s*&?\s*battle/i.test(product.type || '')) {
    const src = promoCandidates(set)
    if (src.length) {
      const slice = Array.from({ length: Math.min(4, src.length) }, (_, i) => src[(hashStr(seed) + i * 2654435761) % src.length])
      return pick(slice, rnd)
    }
  }
  // 6. Deterministic cheap set-card fallback.
  return fallbackPromoCard(set, seed)
}

// ---- Sealed inventory -------------------------------------------------------
// A held sealed product (bought but not yet ripped). Its live value rides the set's
// market multiplier, so a hot modern set — or any vintage set (which trends up) —
// appreciates while it sits in your inventory. `item` = { uid, setId, product, ... }.
// Quick-flip is the INSTANT sealed exit — a real convenience spread under market, so that
// LISTING a sealed item (patient, rides the buyer engine, can catch a hot-set spike) has a
// reason to exist. Was 0.92 (too close to market — it dominated listing); now a clear haircut.
export const SEALED_FLIP_RATE = 0.80   // quick-flip payout as a fraction of live market value

// Bulk (raw commons/uncommons/plain rares) isn't worth cash — you turn it in at the Local
// Game Store for IN-STORE CREDIT at a flat nickel a card (real bulk economics; a common is
// worth ~$0.08, so this is right in the ballpark and honest about what bulk is). That credit
// is spendable on LGS product, so bulk feeds the loop that restocks your shelves.
export const BULK_CREDIT_PER_CARD = 0.05

// You, the distributor. At the very top of the game — a Household Name AND a millionaire — the
// trade starts treating YOU as a source: other shops place standing wholesale orders, a passive
// daily margin scaled by your reputation and the sealed stock you keep on hand to fill them.
export const DISTRIBUTOR_NOTO = 250        // Household Name
export const DISTRIBUTOR_WORTH = 1_000_000 // Millionaire
export function sealedValue(item) {
  if (!item?.product) return 0
  let base = sealedBase(item.product) * marketMult(item.setId)
  // 🔨 A resealed box. Distinct from a `_searched` loose pack (which keeps its shape and only
  // loses its hit): this is a whole product that has been opened, gone through and shut again,
  // and the market prices it as the empty box it now is. It only ever arrives from an auction
  // lot nobody checked — see game/lots.js.
  if (item.resealed) base *= 0.15
  // 📦🔟 A graded wrapper. The ladder is steep for genuine vintage and almost flat for
  // anything still in print — see sealedgrading.js for why that asymmetry is the whole point.
  if (item.grade) return round2(base * sealedGradeMult(sealedEra(item), item.grade))
  return round2(base)
}
// Normalize a sealed row into the era flags the grading premium is scaled by. `vintage` is
// already stamped on the row when it is bought; whether the set has stopped printing is a
// catalog fact, so it is resolved here rather than persisted onto every item.
export function sealedEra(item) {
  return { ...item, aftermarket: AFTERMARKET_SET_IDS.has(item?.setId) }
}
// The market price of ONE unit of a sealed product, before the set's market drift.
//
// A CASE is the exception and it was silently broken: the shop builds its case product by
// spreading the underlying BOX (`{ ...lot.unit, packs: 216, _retail: 3592, _case: true }`), so
// the case carried the BOX's `price`. A case you paid ~$3,000 for therefore valued at $598 —
// one sixth of its worth — in your inventory, your net worth, and any listing you made of it.
// `_retail` is the case's real (6-box) price, so prefer it whenever it's there.
export function sealedBase(product) {
  if (!product) return 0
  if (product._case && product._retail) return product._retail
  return product.price || 0
}
// Wrap a sealed item in a card-shaped object so a sealed LISTING flows through the
// exact same listing / offer / browsing machinery as a single card (no duplicated
// logic). The synthetic id "<setId>-sealed" makes setIdOfCard resolve to the real
// set (so marketMult applies); rarity 'Rare Holo' keeps it clear of the bulk
// desirability penalty without ever counting as a "hit". `_sealed`/`sealedRef` let
// the store restore it to inventory if the listing is pulled.
export function sealedCard(item) {
  const set = SET_BY_ID[item.setId]
  const p = item.product
  const art = set?.logo || set?.symbol || p.img || null
  return {
    uid: item.uid,
    id: `${item.setId}-sealed`,
    name: `${set?.name ? set.name + ' ' : ''}${p.type}`,
    number: 'sealed',
    rarity: 'Rare Holo',
    supertype: 'Sealed Product',
    // sealedBase, not p.price — a CASE carries the underlying box's price (see sealedBase), so
    // listing one used to put a $3,600 case on your site with a $599 sticker on it.
    price: sealedBase(p),
    img: art,
    imgLarge: art,
    foil: null, reverse: false, condition: null, grade: null,
    _sealed: true,
    sealedRef: item,
  }
}

// Wholesale price for a product at a flat discount (retail × (1−discount)).
export function wholesalePrice(retail, discount) {
  return round2(retail * (1 - (discount || 0)))
}

// --- Breaking sealed product down -------------------------------------------------------
// Real vendors buy big and sell small: a case gets split into boxes, a box into loose packs.
// This returns what a held sealed unit can be broken INTO — each option is a real product of
// the same set, with the count and what the resulting pile is worth at market.
//
// The value delta is the whole decision and we surface it rather than hiding it: sealed product
// carries a per-pack PREMIUM the further up the chain it sits (the live data prices a Destined
// Rivals box at $598 — about $16.60 a pack — while a single pack is $10.62). So splitting a case
// into boxes is roughly value-neutral and pure margin over what you paid, while cracking boxes
// down into singles gives up real money in exchange for liquidity: 216 cheap packs move through a
// store, a stream and repacks far faster than one $3,600 case ever will. Both are legitimate;
// the UI shows the numbers and lets the player choose.
//
// Returns [] for something already atomic (a single pack).
export function breakOptions(item) {
  const set = SET_BY_ID[item?.setId]
  const p = item?.product
  if (!set || !p) return []
  // A cross-set product can't be broken down. Splitting converts a box into N units of ONE
  // set's loose packs, and a UPC's packs come from a dozen different sets — the swap would
  // quietly launder them into anchor-set packs. Rip it or sell it whole.
  if (p.pool?.series) return []
  const n = p.packs || 1
  if (n < 2) return []
  const products = setProducts(set)
  const single = products.find(x => (x.packs || 1) === 1)
  const opts = []
  // A case breaks into its boxes first — derive the box from the pack maths rather than a
  // stored type string, because the shop's case product overrides `type` with the case's name.
  if (p._case && p.boxes > 1) {
    const box = products.find(x => (x.packs || 0) === Math.round(n / p.boxes))
    if (box) opts.push({ product: box, count: p.boxes })
  }
  // Anything multi-pack can go all the way down to loose packs.
  if (single && single.type !== p.type) opts.push({ product: single, count: n })
  const mult = marketMult(item.setId)
  const was = round2(sealedBase(p) * mult)
  return opts.map(o => {
    const unit = round2(sealedBase(o.product) * mult)
    const total = round2(unit * o.count)
    return { ...o, unit, total, was, delta: round2(total - was) }
  })
}

// A CASE LOT: N boxes of a set bought together at an extra bulk cut on top of the
// wholesale discount (real cases are cheaper per box than singles). We synthesize a
// case from the set's biggest box-type product. Returns null if the set has no box.
export const CASE_BOXES = 6      // boxes in a case
export const CASE_BULK_CUT = 0.06 // extra discount vs buying the boxes individually
export function caseLot(set) {
  const products = setProducts(set)
  // pick the largest multi-pack "box" as the case unit
  const box = [...products].sort((a, b) => b.packs - a.packs)[0]
  if (!box || box.packs < 10) return null // only real boxes form a case
  return {
    type: `Case (${CASE_BOXES}× ${box.type})`,
    icon: '🏗️',
    boxType: box.type,
    unit: box,                       // the underlying box product
    packs: box.packs * CASE_BOXES,
    bonus: box.bonus,
    boxes: CASE_BOXES,
    retail: round2(box.price * CASE_BOXES), // before wholesale + the case cut
  }
}
// Final case price at a given wholesale discount (wholesale on the boxes, then the
// extra case bulk cut on top).
export function casePrice(lot, discount) {
  return round2(wholesalePrice(lot.retail, discount) * (1 - CASE_BULK_CUT))
}

// ---- Distributors -----------------------------------------------------------
// You buy sealed product from a handful of distinct WHOLESALERS rather than one
// abstract shop. Each has its own catalog, base pricing, reliability (how deep and
// fast their stock is), and perks — and a RELATIONSHIP you build by spending with
// them. Rapport (lifetime $ you've put through that distributor) climbs a shared
// ladder; each rung deepens your discount, widens your stock allocation, and (for
// some distributors) unlocks gated perks like case lots, channel supply, or
// clearance lots. Stock is finite: buying it down means waiting for the restock.

// Shared rapport ladder. `min` = lifetime $ spent WITH THAT DISTRIBUTOR.
export const RAPPORT_LEVELS = [
  { level: 0, name: 'New Account', min: 0,      color: '#8c97b8' },
  { level: 1, name: 'Known',       min: 4000,   color: '#5ec98a' },
  { level: 2, name: 'Preferred',   min: 18000,  color: '#5aa0ff' },
  { level: 3, name: 'Trusted',     min: 55000,  color: '#b98cff' },
  { level: 4, name: 'Partner',     min: 140000, color: '#ffcb05' },
]
export function rapportLevel(spend) {
  let r = RAPPORT_LEVELS[0]
  for (const lvl of RAPPORT_LEVELS) if ((spend || 0) >= lvl.min) r = lvl
  return r
}
export function nextRapport(spend) {
  return RAPPORT_LEVELS.find(r => r.min > (spend || 0)) || null
}

// The retailer roster: your local game store + the major online sellers you'd actually
// buy sealed from. Same mechanics, re-themed.
//   priceMult     — base multiple of retail BEFORE rapport discount (1.0 = MSRP)
//   discountStep  — extra fraction off per rapport level
//   maxDiscount   — cap on the rapport discount
//   reliability   — drives stock depth + restock speed (higher = deeper/faster, lower = sparse)
//   cases         — sells case lots (gated at casesMinLevel)
//   supply        — unlocks supplying the channel (gated at supplyMinLevel)
//   clearance     — occasionally runs a steeply-discounted sale lot
//   rotating      — small, weekly-rotating selection (a shop shelf, not a warehouse)
//   deepStock     — sits on warehouse/marketplace inventory, so it keeps selling a set for
//                   YEARS after the printer stops (see the sell-through stage below). A
//                   `rotating` allocation shelf can't: when it's gone, it's gone.
export const DISTRIBUTORS = [
  {
    id: 'lgs', name: 'Local Game Store', icon: '🎲', color: '#5ec98a',
    blurb: 'Your neighborhood shop. A small, rotating shelf and the odd weekend sale — and they hold hot product for regulars. Limited allocation, so stock is thin.',
    priceMult: 1.0, discountStep: 0.03, maxDiscount: 0.15, reliability: 0.4,
    rotating: true, clearance: true,
  },
  // (The Pokémon Center MSRP shelf was REMOVED 2026-08-10 at the user's request: "in real
  // life it sells out so fast no one gets anything." A shop owner has no retail allocation —
  // fresh drops are bought at the scalped market number like everyone else. hypeSurge below
  // is now the whole drop-day story: the newest set costs a premium over market everywhere.)
  {
    id: 'tcgplayer', name: 'TCGplayer', icon: '🛒', color: '#5aa0ff',
    blurb: 'The marketplace — every set at live market price, deep selection. You pay market, but it is (almost) always there.',
    priceMult: 1.04, discountStep: 0.02, maxDiscount: 0.10, reliability: 0.7,
    deepStock: true, // third-party sellers list out-of-print sealed indefinitely
  },
  {
    id: 'amazon', name: 'Amazon', icon: '📦', color: '#ff9f43',
    blurb: 'The everything store — pay a hair over market and it is ALWAYS in stock, however hot the set. The catch is the one thing a warehouse can never sell you: it ships. Orders land in your storeroom a couple of days later, so Amazon is what you fall back on, never what you rip tonight.',
    priceMult: 1.06, discountStep: 0.015, maxDiscount: 0.08, reliability: 1.0, guaranteed: true,
    leadDays: 2,     // 📦 always available, never immediate — availability stops being free
    deepStock: true, // the warehouse is still shipping sets the printer finished with years ago
  },
  {
    id: 'dna', name: "Dave & Adam's", icon: '🃏', color: '#b98cff',
    blurb: 'A hobby giant — real case pricing and bulk supply. But a distributor this size only opens a wholesale account once you are a name in the hobby: build your notoriety first, then earn rapport with them. The volume play, late-game.',
    priceMult: 0.93, discountStep: 0.035, maxDiscount: 0.24, reliability: 0.7,
    cases: true, casesMinLevel: 2, supply: true, supplyMinLevel: 3,
    deepStock: true, // a hobby giant's warehouse is exactly where finished print runs go to sit
    minNotoriety: 75, // kept for the unlock progress bar; the door itself is minRank below
    minRank: 3, // 🎪 Regional Name — a distributor this size wants a résumé, not just a number (deeds + ⭐80)
  },
  {
    id: 'japan', name: 'Japan Direct', icon: '🎌', color: '#ff5e6c',
    blurb: 'Your import partner in Osaka — authentic Japanese sealed the local market never sees. JP boosters are 5 cards with a denser hit ladder (SARs the room will turn to look at), boxes run closer to break-even than English product, and everything ships across the Pacific: orders land in your storeroom a few days after you pay.',
    priceMult: 1.0, discountStep: 0.025, maxDiscount: 0.12, reliability: 0.6,
    requiresUpgrade: 'importLicense', // the ⛩️ Import License upgrade IS the account
    leadDays: 3,     // 🚢 orders arrive this many days after purchase, not instantly
    japanese: true,  // catalog = JP_SHOP_SETS, not the English shop list
  },
]
export function distributorById(id) { return DISTRIBUTORS.find(d => d.id === id) || null }
// Whether a distributor will do business with you yet. Most are open from day one; a big
// wholesaler (Dave & Adam's) gates the whole account behind a NOTORIETY threshold, and the
// import channel (Japan Direct) behind the ⛩️ Import License UPGRADE — the license is the
// account. Once open, rapport builds from scratch.
export function distributorUnlocked(dist, notoriety, upgrades, rank = 0) {
  if (dist?.requiresUpgrade && !(upgrades || {})[dist.requiresUpgrade]) return false
  // ⭐ rework: a rank-gated account opens on the BANKED ladder rank (rep.js), not the raw
  // number — being a Regional Name is the door. minNotoriety stays for progress displays.
  if (dist?.minRank != null) return (rank || 0) >= dist.minRank
  return !dist?.minNotoriety || (notoriety || 0) >= dist.minNotoriety
}

// A real local shop stocks what one weekly case order gets them — two sets, maybe three, and
// whatever's left of last month's. Not a catalogue.
const LGS_SHELF_SIZE = 2
// 🕰️ IN PRINT → SELL-THROUGH → AFTERMARKET. "Out of print" describes the PRINTER, not the shelf,
// and the gap between those two is YEARS wide. Three stages, and the middle one is what a naive
// in-print/out-of-print flag throws away:
//   1. IN PRINT     — the printer is running. Every channel stocks it, at market (+ hype if fresh).
//   2. SELL-THROUGH — the printer has stopped, but the warehouses and marketplaces are still full
//                     of it. You can walk over to Amazon and buy sealed 151 right now; what you
//                     CAN'T do is get your local shop to reorder it, and you pay over market
//                     because what's left is finite and shrinking. ← RETIRED_IDS sets live here.
//   3. AFTERMARKET  — channel stock finally exhausted; only collectors and vendors have it. That's
//                     the `secondary` flag, and those sets leave the fresh shelf altogether.
// Which stage a set is in tracks DEMAND and Standard ROTATION, never its age. 151 and Prismatic
// prove it in both directions: 151 outlived half a dozen sets released after it, then stopped at
// the April 2026 rotation (regulation mark G) rather than from age, while Prismatic (mark H)
// survived that rotation and is under active mass reprint years on. A "newest N sets" window gets
// both cases exactly wrong, which is why print status is CURATED here rather than computed.
// NOTE none of this narrows SHOP_SETS itself — that pool still backs wants, walk-in requests and
// the general card draw, so a set's SINGLES stay as obtainable as ever. Only the sealed ORDER
// channel narrows, and even then only down to the `deepStock` retailers.
const RETIRED_IDS = new Set([
  // 151 — regulation mark G. Rotated out of Standard 2026-04-10 (when Perfect Order became legal)
  // alongside sv1 / sv2 / sv3 / sv4 / sv4pt5, all already `secondary` here, and stopped printing
  // with them. Kept OUT of `secondary` because 151 is nowhere near stage 3: it's stacked at every
  // big-box in the country and its singles are everywhere. Sell-through, not aftermarket.
  'sv3pt5',
])
// "The printer is still running" — NOT "you can still buy it" (that's distributorCatalog, which
// keeps sell-through sets on every deepStock shelf).
export const IN_PRINT_SETS = SHOP_SETS.filter(s => !RETIRED_IDS.has(s.id))
export const OUT_OF_PRINT_SETS = SHOP_SETS.filter(s => RETIRED_IDS.has(s.id))
// 💸 What a finished print run costs OVER market while it sells through. The supply is finite and
// everyone knows it, so the ask drifts up — the exact mirror of hypeSurge on a fresh drop, and the
// reason "buy it before it rotates" is real advice. Applied to the shop ASK only, never to
// sealedValue: like hype, paying the premium is a knowingly worse trade than having bought early.
const SELL_THROUGH_PREMIUM = 1.22
export function sellThroughPremium(setOrId) {
  const id = typeof setOrId === 'string' ? setOrId : setOrId?.id
  return RETIRED_IDS.has(id) ? SELL_THROUGH_PREMIUM : 1
}

// Which sets a retailer carries right now. `weekIndex` rotates the LGS shelf.
// `sets` is the in-print shop list (SHOP_SETS), newest FIRST (see the sort above). The newest
// release is on every wide shelf from day one — at the full scalper surge (hypeSurge), because
// a shop owner has no retail MSRP allocation; you buy the fresh drop at what the market bears.
export function distributorCatalog(dist, sets, weekIndex = 0) {
  if (!dist) return sets
  if (dist.japanese) return JP_SHOP_SETS                   // 🎌 the import shelf — its own catalog entirely
  // 🕰️ Drop what the printer has finished with — but ONLY from allocation shelves. A `deepStock`
  // retailer (warehouse, marketplace, hobby giant) goes on selling a set for years after the last
  // print run, which is why sealed 151 is a click away on Amazon and unobtainable at your LGS.
  // Done here rather than at each call site so every shelf in the game inherits it.
  const wide = dist.deepStock ? (sets || []) : (sets || []).filter(s => !RETIRED_IDS.has(s.id))
  if (dist.cases) return wide.filter(s => caseLot(s))                             // box/case-friendly sets
  if (dist.rotating) {                                                            // small weekly shelf
    const n = wide.length
    if (!n) return []
    const start = (Math.abs(weekIndex) * 3) % n
    const out = []
    for (let i = 0; i < Math.min(LGS_SHELF_SIZE, n); i++) out.push(wide[(start + i) % n])
    return out
  }
  return wide // marketplace / big-box: the full in-print catalog
}

// --- Vintage finds: sealed vintage surfaces RANDOMLY at your retailers -------
// (There's no more Vintage Vault.) Instead, a sealed vintage pack turns up on a vendor's
// shelf on a given WEEK — deterministic per (distributor, week), so it's stable while you shop
// and ROTATES week to week. That's the hook: check your vendors regularly to catch one. Not
// every vendor deals vintage — the local shop and hobby channels turn it up most; the import
// channel never does. Priced at current market (vintage appreciates) plus a small finder
// markup. Returns { setId, setName, logo, product, price, qty } or null.
//
// `qty` is the whole point of the fiction: this is old, out-of-print product a vendor
// happened to turn up — a couple of packs from a collection they bought, not a case they
// can reorder. So the shelf holds ONE (usually) or TWO, and once you've bought them the
// shelf is BARE until next week's find. Vintage must never be a bottomless well you can
// grind for cash; scarcity is what makes it worth hunting.
const VINTAGE_FIND_RATE = { lgs: 0.45, tcgplayer: 0.30, dna: 0.32, amazon: 0.15, japan: 0 }
function findRng(distId, weekIndex) {
  let s = ((weekIndex + 1) * 2654435761) >>> 0
  for (let i = 0; i < distId.length; i++) s = (s * 31 + distId.charCodeAt(i)) >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
// `boost` scales the find rate (the 🕵️ Vintage Scout upgrade passes ~1.5).
export function distributorVintageFind(dist, weekIndex = 0, boost = 1) {
  if (!dist || !VINTAGE_SETS.length) return null
  const rate = Math.min(0.85, (VINTAGE_FIND_RATE[dist.id] ?? 0.2) * boost)
  if (rate <= 0) return null
  const r = findRng(dist.id, weekIndex)
  if (r() >= rate) return null
  const set = VINTAGE_SETS[Math.floor(r() * VINTAGE_SETS.length)]
  const product = vintageProduct(set)
  const markup = 1.05 + r() * 0.2 // 1.05–1.25× current market
  const price = round2(sealedValue({ product, setId: set.id }) * markup)
  // Drawn LAST so the rate/set/markup draws above keep their existing sequence — adding a
  // qty roll must not silently reshuffle which set turns up this week, or at what price.
  const qty = r() < 0.25 ? 2 : 1 // they usually turn up a single pack; sometimes a pair
  // 🕰️ Some weeks the back room turns up recent OUT-OF-PRINT product instead of true vintage —
  // the last sealed Evolving Skies booster rather than a '99 pack. Same slot, same finite qty, so
  // the whole existing shelf works unchanged. Rolled LAST, after every draw above, so adding it
  // can't reshuffle which vintage set surfaces on the weeks it doesn't fire.
  if (AFTERMARKET_SETS.length && r() < AFTERMARKET_SHARE) {
    // 👑 A retired-era collector piece — a Sword & Shield Charizard UPC, a GX-era premium
    // collection. These belong to an era whose sets ALL left print, so no shop shelf carries
    // them; the back room is the only place they can turn up, which is exactly right for
    // out-of-print product. In-print eras (Mega Evolution, Scarlet & Violet) are excluded —
    // those sell on the era shelf in the shop, and a "find" for something still on the shelf
    // would be nonsense.
    const retired = retiredEraProducts()
    if (retired.length && r() < ERA_FIND_SHARE) {
      const ep = retired[Math.floor(r() * retired.length)]
      const anchor = eraAnchorSet(ep)
      if (anchor) {
        const eprice = round2(sealedValue({ product: ep, setId: anchor.id }) * (1.12 + r() * 0.28))
        return { setId: anchor.id, setName: `${ep.pool.series} era`, logo: anchor.logo,
          product: ep, price: eprice, qty: 1, aftermarket: true }
      }
    }
    const aset = AFTERMARKET_SETS[Math.floor(r() * AFTERMARKET_SETS.length)]
    const aprods = setProducts(aset)
    if (aprods.length) {
      const aprod = aprods[Math.floor(r() * aprods.length)]
      // Out-of-print sealed only goes one way, and a shop still holding it knows that.
      const aprice = round2(sealedValue({ product: aprod, setId: aset.id }) * (1.12 + r() * 0.28))
      return { setId: aset.id, setName: aset.name, logo: aset.logo, product: aprod, price: aprice,
        qty: r() < 0.3 ? 2 : 1, aftermarket: true }
    }
  }
  return { setId: set.id, setName: set.name, logo: set.logo, product, price, qty }
}
// How often an aftermarket find is an era collector piece rather than a set's own sealed.
const ERA_FIND_SHARE = 0.35
// Era products whose era has NO set on the shop shelf — i.e. the whole era is out of print.
// Cached: SHOP_SETS never changes at runtime.
let RETIRED_ERA_PRODUCTS = null
function retiredEraProducts() {
  if (!RETIRED_ERA_PRODUCTS) {
    const live = new Set(SHOP_SETS.map(s => s.series))
    RETIRED_ERA_PRODUCTS = ERA_PRODUCTS.filter(p => !live.has(p.pool?.series) && eraPool(p.pool?.series).length)
  }
  return RETIRED_ERA_PRODUCTS
}
// 🕰️ AFTERMARKET FIND — the other half of the in-print line. A set that has left the order
// channel doesn't vanish; it ends up in the back room, on a clearance shelf, in the case a
// vendor bought off a collector. This is where you hunt it. Same weekly-deterministic shape as
// the vintage find (stable while you shop, rotates week to week), but drawn from the retired
// modern sets plus the older `secondary` pool — and priced ABOVE market, because a shop that
// still has sealed Paldean Fates knows exactly what it's sitting on.
// While RETIRED_IDS is empty this is just SECONDARY_SETS, which is the right answer: the older
// aftermarket sets ARE the out-of-print product a back room turns up.
export const AFTERMARKET_SETS = [...OUT_OF_PRINT_SETS, ...SECONDARY_SETS]
const AFTERMARKET_SET_IDS = new Set(AFTERMARKET_SETS.map(s => s.id))
// How often a back-room find is recent-out-of-print product rather than true vintage. Deliberately
// routed through the SAME weekly find slot: a shop has one back room, and what's in it this week
// is either a '99 pack or the last sealed Crown Zenith ETB nobody shifted. Sharing the slot means
// the existing buy path, stock tracking and shelf UI all work unchanged.
const AFTERMARKET_SHARE = 0.45

// Build a vintage item a high-rapport vendor RESERVES for you (the "we'll hold it" perk). Priced
// at market with the vendor's standing rapport discount — the relationship perk is a fair price
// PLUS them setting it aside. `rnd` lets the caller vary the pick. Returns { setId, product, price }.
export function makeVintageHold(discount = 0, rnd = Math.random) {
  if (!VINTAGE_SETS.length) return null
  const set = VINTAGE_SETS[Math.floor(rnd() * VINTAGE_SETS.length)]
  const product = vintageProduct(set)
  const price = round2(sealedValue({ product, setId: set.id }) * (1 - Math.min(0.2, discount)))
  return { setId: set.id, setName: set.name, logo: set.logo, product, price }
}

// The rapport discount a distributor extends at a given level (capped). Single source
// of truth for both pricing and the "what you've unlocked" banner.
export function distributorDiscount(dist, level) {
  if (!dist) return 0
  return Math.min(dist.maxDiscount, (level || 0) * dist.discountStep)
}
// ---- The scalper premium ---------------------------------------------------------------
// `product.price` in the snapshot is real TCGplayer MARKET data — already the scalped number
// for anything people want. There is deliberately NO MSRP channel in the game (the Pokémon
// Center shelf was removed 2026-08-10 — in real life it sells out to bots and queues before a
// shop owner gets one): a fresh drop is bought at market PLUS the surge below, and cools as
// the set ages. Buying into the surge is a knowingly bad trade — patience is the discount.
// 🔥 Hype surge — what a scalper charges OVER market on a fresh drop, because everyone wants
// it at once and supply hasn't caught up. Keyed on RECENCY RANK, not calendar age: the game
// runs its own abstract calendar (year 1 opens in September) that never lines up with a set's
// real-world release date, so "days since release" isn't computable. Rank is truer anyway —
// the newest drop is the hyped one whatever the date says.
// Deliberately applied to the SHOP ASK only, never to sealedValue: a scalped pack is worth
// market the moment you own it, so buying into hype at full markup is a bad trade.
const HYPE_SURGE_MAX = 0.45
const HYPE_SPAN = 5
const HYPE_RANK = new Map(SHOP_SETS.map((s, i) => [s.id, i]))   // 0 = newest release
export function hypeSurge(setOrId) {
  const id = typeof setOrId === 'string' ? setOrId : setOrId?.id
  const rank = HYPE_RANK.get(id)
  if (rank == null) return 1                        // vintage / aftermarket / import: no drop hype
  const fresh = Math.max(0, 1 - rank / HYPE_SPAN)
  return 1 + HYPE_SURGE_MAX * fresh * fresh         // 1.45× newest → 1.29 → 1.16 → 1.07 → 1.02 → 1
}

// Price a product from a distributor at a given rapport level. `opts.set` unlocks the
// fresh-drop surge; without it this degrades to the old plain-market maths.
export function distributorPrice(dist, retail, level, opts = {}) {
  if (!dist) return round2(retail || 0)
  // Every shelf rides the scalper surge on the way IN and the sell-through premium on the way
  // OUT. The two never overlap (a set can't be both the fresh drop and a finished print run),
  // so multiplying both is safe — whichever applies, the other is 1.
  const base = (retail || 0) * hypeSurge(opts.set) * sellThroughPremium(opts.set)
  return round2(base * dist.priceMult * (1 - distributorDiscount(dist, level)))
}
// Case price from a distributor: wholesale on the boxes, then the extra case bulk cut.
export function distributorCasePrice(dist, lot, level) {
  return round2(distributorPrice(dist, lot.retail, level) * (1 - CASE_BULK_CUT))
}

// Stock cap for a product from a retailer at a rapport level. Sealed allocation is SPARSE
// (real product is hard to keep on a shelf): a handful of single packs, only a few
// multi-pack products (ETBs / bundles / premiums), one or two booster boxes, cases are
// rare. Scaled by reliability and — as a wider allocation — by rapport, so building a
// relationship is how you get to buy in any real quantity.
export function stockCap(dist, product, level, set) {
  if (!dist) return 99
  const packs = product?.packs || 1
  let base
  if (product?._case) base = 1
  else if (packs >= 21) base = 1          // booster box — a shop gets a couple a week, not a pallet
  else if (packs >= 9) base = 2           // ETB / super-premium collection
  else if (packs >= 2) base = 3           // booster bundle / premium / tin / blister
  else base = 5                           // single booster / sleeved pack
  const rel = 0.5 + dist.reliability        // 0.9 .. 1.5
  const allo = 1 + 0.25 * (level || 0)      // bigger allocation as rapport grows (up to +100%)
  // 🕰️ A finished print run is drawn down, never replenished — what's left on a warehouse shelf
  // is a fraction of a live allocation however deep that warehouse is. Amazon stays `guaranteed`
  // (you can always get SOME sealed 151) but you can no longer buy it by the armful.
  const run = RETIRED_IDS.has(set?.id) ? 0.5 : 1
  return Math.max(1, Math.round(base * rel * allo * run))
}
// Units of stock a distributor regains per day (toward the cap).
export function restockRate(dist, cap) {
  if (!dist) return cap
  return Math.max(0.2, dist.reliability * cap * 0.18)
}
// Stock map key for a (set, product) pair.
// Keyed on the PRODUCT, not its type. Under the old one-product-per-type shop those were the
// same key; now that a set carries its full lineup, a type key would pool the shelf across all
// eight Prismatic mini tins — buy out the Umbreon one and the Flareon one would read sold out
// too. tcgId is TCGplayer's per-product id; synthesized products (JP, vintage) fall back to
// type, which is unique for them anyway. Old saves just start those keys at a full shelf.
export function stockKey(set, product) { return `${set.id}|${product.tcgId || product.type}` }
// Live stock state for a (set, product) at a distributor. `stock` is that distributor's
// saved stock map ({ key: {q, cap} }); an absent key means a full shelf. The cap is the
// LARGER of any saved cap and the current allocation — so climbing a rapport rung widens
// the shelf immediately instead of waiting for the next full restock to recompute it.
export function stockState(dist, stock, set, product, level) {
  // A "guaranteed" retailer (Amazon) never sells out — its shelf is treated as always full,
  // so it's the reliable "need it now" option that offsets its higher price.
  if (dist?.guaranteed) {
    const cap = stockCap(dist, product, level, set)
    return { q: cap, cap, out: false }
  }
  const entry = (stock || {})[stockKey(set, product)]
  const cap = Math.max(entry?.cap || 0, stockCap(dist, product, level, set))
  const q = entry ? entry.q : cap
  return { q, cap, out: q < 1 }
}
// Days until a depleted product is back in stock (qty climbs back to ≥1).
export function daysToRestock(dist, qty, cap) {
  if (qty >= 1) return 0
  return Math.ceil((1 - qty) / restockRate(dist, cap))
}

// ---- Master sets / completion ----------------------------------------------
// A card is "owned" for completion purposes if you hold any copy of its id (raw OR
// graded — a slab still counts toward the set). Completion ignores condition/grade.
// "Chase" cards are the hard, expensive top rarities — owning them all is the real
// flex within a set. Set completion = one of EVERY card; chase completion = every
// top-rarity card.
const CHASE_THRESHOLD = rarityRank('Special Illustration Rare')
export function isChaseCard(card) {
  return !!card.foil || rarityRank(card.rarity) >= CHASE_THRESHOLD
}

// Build the set of owned card ids from a collection (+ any other owned buckets the
// caller passes flattened in). Cheap Set for O(1) lookups.
export function ownedIdSet(cards) {
  const s = new Set()
  for (const c of cards || []) if (c?.id) s.add(c.id)
  return s
}

// Completion stats for one set given an owned-id Set. Returns counts for the whole
// set and for just the chase cards, plus the missing-card lists (for a shopping list).
export function setCompletion(set, ownedIds) {
  const all = set.cards
  const chase = all.filter(isChaseCard)
  const ownedAll = all.filter(c => ownedIds.has(c.id))
  const ownedChase = chase.filter(c => ownedIds.has(c.id))
  const missing = all.filter(c => !ownedIds.has(c.id))
  return {
    total: all.length, owned: ownedAll.length,
    chaseTotal: chase.length, chaseOwned: ownedChase.length,
    missing,
    complete: ownedAll.length === all.length && all.length > 0,
    chaseComplete: chase.length > 0 && ownedChase.length === chase.length,
    pct: all.length ? Math.round((ownedAll.length / all.length) * 100) : 0,
  }
}

// ---- Masterset variants -----------------------------------------------------
// A "masterset" is stronger than a plain set: it wants EVERY printing variant of every
// card — the normal, its reverse holo, and (where a set has them) the Poké Ball and Master
// Ball foil patterns. These helpers describe which variant slots a card contributes and
// which variant a specific owned copy represents.
export const MASTERSET_VARIANTS = {
  normal:     { key: 'normal',     label: 'Normal',           badge: '●',  color: '#9aa6c8' },
  reverse:    { key: 'reverse',    label: 'Reverse Holo',     badge: '↻',  color: '#7cf0ff' },
  pokeball:   { key: 'pokeball',   label: 'Poké Ball Foil',   badge: '⦿',  color: FOIL.pokeball.color },
  masterball: { key: 'masterball', label: 'Master Ball Foil', badge: '◉',  color: FOIL.masterball.color },
}
export const MASTERSET_VARIANT_ORDER = ['normal', 'reverse', 'pokeball', 'masterball']

// The variant a specific card INSTANCE represents (used to slot an owned copy).
export function cardVariant(card) {
  const k = card?.foil?.key
  if (k === 'masterball') return 'masterball'
  if (k === 'pokeball') return 'pokeball'
  if (k) return k
  if (card?.reverse) return 'reverse'
  return 'normal'
}

// Does a set's rate table / special packs ever produce a given foil pattern?
function setSupportsFoil(setId, foilKey) {
  const rates = SET_RATES[setId]
  const inReverse = rates?.reverse?.some(r => r.key === foilKey)
  const sp = SPECIAL_PACKS[setId]
  const inSpecial = sp?.some(v =>
    v.slots?.some(s => s.foil === foilKey) || v.hits?.foil === foilKey || v.filler?.foil === foilKey)
  return !!(inReverse || inSpecial)
}
// Does a set have a reverse-holo slot at all? Modern sets do; vintage doesn't.
function setHasReverse(set) {
  if (set?.vintage) return false
  const rates = SET_RATES[set.id]
  return rates ? !!rates.reverse : true // baseline (used when a set has no override) has a reverse slot
}
// Reverse-eligible cards are the low/mid rarities that ride the reverse slot (and thus can
// appear as reverse/Poké Ball/Master Ball foils). Chase cards (Double Rare+) don't.
function reverseEligible(card) { return rarityRank(card.rarity) < HIT_THRESHOLD }

// The ordered variant columns a set's masterset shows.
export function setVariantColumns(set) {
  const cols = ['normal']
  if (setHasReverse(set)) cols.push('reverse')
  if (setSupportsFoil(set.id, 'pokeball')) cols.push('pokeball')
  if (setSupportsFoil(set.id, 'masterball')) cols.push('masterball')
  return cols
}
// The variant slots a specific card contributes to its set's masterset.
export function cardMastersetVariants(set, card) {
  const cols = setVariantColumns(set)
  const out = ['normal']
  const elig = reverseEligible(card)
  for (const v of cols) {
    if (v === 'normal') continue
    if (elig) out.push(v) // reverse/pokeball/masterball apply to reverse-eligible cards
  }
  return out
}
// Masterset completion stats for a set given the placed BINDER cards + everything else you
// own. `binderCards` are the copies physically slotted into the binder; `ownedCards` is any
// other bucket (collection) whose variants count as "available to place". Returns per-slot
// totals so the UI can render progress + a fill button.
// `reserveCut` = your binder reserve tier (see fileableInBinder). A copy at/above it isn't
// "placeable", so the fill button's count matches what the button will actually do. `reserved`
// reports the slots where the ONLY copy you own is being held out for grading, so the UI can
// explain an empty slot instead of leaving it looking like a bug.
export function mastersetStats(set, binderCards, ownedCards = [], reserveCut = null) {
  const binderKeys = new Set(binderCards.filter(c => setIdOfCard(c) === set.id).map(c => `${c.id}:${cardVariant(c)}`))
  const mine = ownedCards.filter(c => setIdOfCard(c) === set.id)
  const looseKeys = new Set(mine.filter(c => fileableInBinder(c, reserveCut)).map(c => `${c.id}:${cardVariant(c)}`))
  const anyKeys = new Set(mine.map(c => `${c.id}:${cardVariant(c)}`))
  let total = 0, placed = 0, placeable = 0, reserved = 0
  for (const card of set.cards) {
    for (const v of cardMastersetVariants(set, card)) {
      total++
      const key = `${card.id}:${v}`
      if (binderKeys.has(key)) placed++
      else if (looseKeys.has(key)) placeable++
      else if (anyKeys.has(key)) reserved++ // you own a copy, but it's reserved for grading
    }
  }
  return { total, placed, placeable, reserved, pct: total ? Math.round((placed / total) * 100) : 0,
    complete: total > 0 && placed === total }
}

// --- Bulk-sell protection ----------------------------------------------------
// The master-set safety net for the "sell everything" buttons. Given the full
// collection, the uids a bulk action WANTS to move, and the player's protection
// settings, decide which cards are actually safe to sell:
//   • a LOCKED card (card.locked) is never swept — a hard, explicit "keep this."
//   • keepOne: retain at least one copy of every card id you own, so a sweep only
//     dumps DUPLICATES. A copy already staying behind (outside the sweep, or locked)
//     satisfies "keep one"; only when EVERY copy of an id is in the sweep do we hold
//     back its best copy so the set need survives.
// Returns { sell:[uid], kept:[uid] } — `kept` are the protected uids pulled out.
export function bulkSellableUids(collection, candidateUids, { keepOne = false } = {}) {
  const cand = new Set(candidateUids)
  const kept = [], sell = []
  const byId = new Map() // card id → [candidate cards with that id]
  for (const c of collection) {
    if (!cand.has(c.uid)) continue
    if (c.locked) { kept.push(c.uid); continue }   // hard lock — always keep
    if (c._heldFor) { kept.push(c.uid); continue } // behind the counter for a regular — not sweepable
    if (!c.id) { sell.push(c.uid); continue }      // no set id → can't be a set need
    let g = byId.get(c.id); if (!g) { g = []; byId.set(c.id, g) }
    g.push(c)
  }
  for (const [id, group] of byId) {
    // A copy "survives" if it's staying behind anyway: not in this sweep, or locked.
    const survivorOutside = collection.some(c => c.id === id && (!cand.has(c.uid) || c.locked))
    if (!keepOne || survivorOutside) { for (const c of group) sell.push(c.uid); continue }
    // keepOne is on and EVERY copy is in the sweep — hold back the best (highest-value) one.
    const keepCard = group.reduce((b, c) => cardValue(c) > cardValue(b) ? c : b, group[0])
    for (const c of group) (c.uid === keepCard.uid ? kept : sell).push(c.uid)
  }
  return { sell, kept }
}

// Cash + notoriety + clout bonus for first-time completing a set. Scales with how big and
// how VALUABLE the set is — the ⭐ used to be card-count only, which paid a $22k chase-heavy
// vintage master set the same as a cheap 250-carder of equal length.
export function completionReward(set) {
  const value = set.cards.reduce((a, c) => a + (c.price ?? 0), 0)
  const cash = round2(50 + set.cards.length * 2 + value * 0.05) // size + a slice of its book value
  const noto = Math.round(6 + Math.sqrt(Math.max(0, value)) / 4 + set.cards.length / 40)
  const clout = 1 + (value >= 5000 ? 1 : 0) // 🎫 a real feat earns a favor — two for a flagship
  return { cash, noto, clout }
}

// ---- 🖼️ The showcase: a completed set on display is a shop DRAW -----------------------
// The one-time completion bonus was the whole payoff, and it was a fraction of one chase
// card's price — mastersetting was dead capital. Now the binder is infrastructure:
// a set counts as SHOWCASED while it's been completed (completedSets) AND you still own one
// of every card (collection + binder). Sell the lot — or break the set up — and the draw
// leaves with it; the badge/deeds/milestones keep reading completedSets and never revert.
export function showcaseSetIds(state) {
  const done = state.completedSets || []
  if (!done.length) return []
  const owned = ownedIdSet([...(state.collection || []), ...(state.binder || [])])
  return done.filter(id => { const s = setById(id); return s && setCompletion(s, owned).complete })
}
// Foot-traffic draw: +4% walk-ins per showcased set, hard cap +16% (same altitude as the
// 🪧 signage multiplier — a display, not a demand printer).
export function showcaseMult(n) { return 1 + Math.min(0.16, (n || 0) * 0.04) }
// On-air draw (people tune in to see the binder): +2%/set, hard cap +10%.
export function showcaseStreamMult(n) { return 1 + Math.min(0.10, (n || 0) * 0.02) }

// 🖼️ Completion premium: what a collector pays OVER book for the intact page — the real-world
// "a complete master set sells for more than its parts" premium. Band pinned by the sim.
export const LOT_PREMIUM_LO = 1.15
export const LOT_PREMIUM_HI = 1.30
// The copies a master-lot sale hands over: ONE copy per card id — the binder copy first
// (that's the display being bought), else the cheapest unlocked raw collection copy, else the
// cheapest slab. Respects every sale rail (🔒 locked and held-for-a-regular never sell);
// returns null if any card has no sellable copy (e.g. your only copy is locked or listed).
export function pickMasterLot(state, set) {
  if (!set) return null
  const byId = new Map()
  for (const c of (state.binder || [])) {
    if (!byId.has(c.id)) byId.set(c.id, [])
    byId.get(c.id).push({ card: c, from: 'binder' })
  }
  for (const c of (state.collection || [])) {
    if (c.locked || c._heldFor) continue
    if (!byId.has(c.id)) byId.set(c.id, [])
    byId.get(c.id).push({ card: c, from: 'collection' })
  }
  const copies = []
  let value = 0
  for (const cardDef of set.cards) {
    const cands = byId.get(cardDef.id)
    if (!cands?.length) return null // a card has no sellable copy — the page can't be sold intact
    const pick = cands.sort((a, b) =>
      (a.from === 'binder' ? -1 : 0) - (b.from === 'binder' ? -1 : 0)   // display copy first
      || (a.card.grade ? 1 : 0) - (b.card.grade ? 1 : 0)                // raw before slabs
      || cardValue(a.card) - cardValue(b.card))[0]                      // cheapest copy goes
    copies.push(pick)
    value += cardValue(pick.card)
  }
  return { copies, value: round2(value) }
}
