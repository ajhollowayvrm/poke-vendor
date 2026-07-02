// Core game engine: pack composition, pulls, pricing, grading, pack pricing.
import data from '../data/sets.json'
import { SYNC_URL } from './syncConfig'
import { getIdToken } from './auth'

export const SETS = data.sets
export const FETCHED_AT = data.fetchedAt

// Card art lives on a remote CDN, so a just-pulled card can pop in slowly mid-reveal.
// Warm the browser cache the instant a pack is opened (or about to be), so by the time
// the reveal animation reaches each card its image is already downloaded + decoded.
// Cheap and idempotent — the browser dedupes repeat requests. No-op outside the browser.
const _imgWarmed = new Set()
export function preloadCardImages(cards) {
  if (typeof Image === 'undefined' || !cards) return
  for (const c of cards) {
    const url = c?.img
    if (!url || _imgWarmed.has(url)) continue
    _imgWarmed.add(url)
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }
}

// Sets sold in the normal shop (excludes `vintage` sets, which only appear via the
// rare "Vintage Vault" vendor at higher-tier shows).
// Modern, in-print product the distributors sell fresh. Excludes vintage (Vault-only) AND
// secondary (older "aftermarket" sets you find rather than buy fresh — see SECONDARY_SETS).
export const SHOP_SETS = data.sets.filter(s => !s.vintage && !s.secondary)
// Vintage sets, keyed for the Vault vendor. The Vault sells these heavy old packs.
export const VINTAGE_SETS = data.sets.filter(s => s.vintage)
// Aftermarket / "still findable" older sets (SM + XY era). Not sold by modern distributors;
// they surface as finds at show-floor booths (full product lineups, at a collector's markup).
export const SECONDARY_SETS = data.sets.filter(s => s.secondary)
export function vintageProduct(set) {
  return (set.products || []).find(p => p.vintage) || setProducts(set)[0]
}

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

// Is this a "bulk" / non-worth card — safe to sweep into a bulk/quick-sell?
// Decided by LIVE card attributes, NOT the `_isHit` flag (which is only stamped at
// pull time, so a hit acquired any other way — bought, gifted, an old save — would
// have no flag and slip through). A card is bulk only if it's raw, unfoiled, and
// below the hit rarity threshold. A graded slab, a special foil, or any Double-Rare+
// (incl. MEGA_ATTACK / Mega Hyper / Black White) is NEVER bulk.
export function isBulkCard(card) {
  return !card.grade && !card.foil && !isHit(card)
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
      { rarity: 'Illustration Rare',         p: 0.0800 },
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

export function openPack(set) {
  if (set.id === 'cel25') return openCelebrationsPack(set) // bespoke 4-card structure
  const byR = cardsByRarity(set)
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

  // REVERSE slot — sets with an ACE SPEC subset land one ~1 in 5 packs here; otherwise
  // it's an IR/SIR/Hyper upgrade > special foil > ordinary reverse holo.
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

  // no two identical cards in one pack — swap dupes for unused cards of the same rarity
  dedupePack(pulls, byR)
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

// Vintage singles (Base Charizard, Shining Gyarados, …). These never enter the shop,
// wants, or online offers — but show vendors DO occasionally surface them in their bins,
// so the floor is where you hunt loose vintage. Drawn via vintageCardInRange below.
const VINTAGE_CARDS = VINTAGE_SETS.flatMap(s => s.cards).filter(c => c.price != null)
// A real vintage single whose raw value falls in [min,max] (nearest by value if the band
// is empty). Returns null if there's no vintage data at all. `floor` condition = a loose
// card in the wild varies in condition, like normal booth singles.
export function vintageCardInRange(min, max, rnd = Math.random) {
  if (!VINTAGE_CARDS.length) return null
  const pool = VINTAGE_CARDS.filter(c => c.price >= min && c.price <= max)
  if (pool.length) return instance(pick(pool, rnd), 'floor', rnd)
  const sorted = [...VINTAGE_CARDS].sort((a, b) =>
    Math.abs(a.price - (min + max) / 2) - Math.abs(b.price - (min + max) / 2))
  return instance(sorted[0], 'floor', rnd)
}

// Real-data price ceiling — anything requested above this is a synthesized "grail".
const REAL_PRICE_CEILING = ALL_CARDS.reduce((m, c) => Math.max(m, c.price ?? 0), 0)
// Highest-rarity real cards make convincing grail bases (chase/SIR/hyper art).
const GRAIL_BASES = ALL_CARDS.filter(c => rarityRank(c.rarity) >= rarityRank('Special Illustration Rare'))

// Mint a real card instance whose raw value falls within [min,max] if possible.
// When [min,max] exceeds what real market data offers (the high-roller show
// tiers), synthesize a "grail" — a top-rarity card with an overridden price in
// band, themed as a vintage/iconic chase piece.
export function cardInValueRange(min, max, rnd = Math.random) {
  // Grail territory: requested value is beyond anything in the real dataset.
  // Grails are pristine (NM) — a six-figure card in the wild is mint/slabbed.
  if (min > REAL_PRICE_CEILING && GRAIL_BASES.length) {
    const base = pick(GRAIL_BASES, rnd)
    const price = round2(min + rnd() * (max - min))
    return instance({ ...base, price, _grail: true, condition: 'NM' }, 'sealed', rnd)
  }
  const pool = ALL_CARDS.filter(c => {
    const v = c.price ?? 0
    return v >= min && v <= max
  })
  if (pool.length) return instance(pick(pool, rnd), 'floor', rnd) // singles in the wild vary in condition
  // fallback: nearest by value
  const sorted = [...ALL_CARDS].sort((a, b) =>
    Math.abs((a.price ?? 0) - (min + max) / 2) - Math.abs((b.price ?? 0) - (min + max) / 2))
  return instance(sorted[0], 'floor', rnd)
}

// A graded copy of a real card (used for premium vendor stock / encounters).
export function gradedCardInRange(min, max, grade, rnd = Math.random) {
  // For grail-level bands, keep the floor in grail territory so the slab is a
  // true grail; for normal bands, a high grade implies a cheaper raw base.
  const floor = min > REAL_PRICE_CEILING ? min : min / (grade >= 9 ? 3 : 1)
  const c = cardInValueRange(floor, max, rnd)
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
const VINTAGE_BIAS = 0.004    // +~0.4%/day upward drift on average
export const VINTAGE_MAX = 3.0
export function driftMultVintage(m, rnd = Math.random) {
  const cur = m ?? 1
  const step = (rnd() - 0.5) * 2 * MARKET_STEP   // [-step, +step]
  const next = cur + step + VINTAGE_BIAS
  return Math.round(Math.min(VINTAGE_MAX, Math.max(MARKET_BOUNDS.min, next)) * 1000) / 1000
}

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
    'Double Rare':2.5,'Illustration Rare':4,'Ultra Rare':6,
    'Special Illustration Rare':25,'Hyper Rare':30,'Mega Hyper Rare':120 }
  return table[r] ?? 0.1
}

// Graded value multiplier by PSA grade (fallback heuristic when no real comp exists).
const GRADE_MULT = { 10: 5.0, 9: 1.8, 8: 1.1, 7: 0.8, 6: 0.6, 5: 0.5, 4: 0.4, 3: 0.35, 2: 0.3, 1: 0.25 }
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
    // higher base-value cards see bigger grade premiums (gem mint chase)
    const scarcityBoost = 1 + Math.min(2, rawValue(card, multOverride) / 50)
    value = rawValue(card, multOverride) * mult * (g >= 9 ? scarcityBoost : 1)
    // A HEURISTIC grade must not overshoot a real higher-grade comp (real comps are
    // already monotonic from the snapshot's sanitize pass — only the heuristic can
    // invert the ladder). Real comps are trusted as-is and never capped here.
    value = Math.min(value, gradedCeiling(card, g, multOverride))
  }
  return round2(gradedFloor(card, g, value, multOverride))
}

// A slab is never worth LESS than the raw card (grading only adds value or you'd
// keep it raw), and a higher grade is never worth less than a lower one. eBay
// sold-comps are sparse and noisy, so a captured PSA-10 sale can land below the
// current raw price or below a worse grade's comp — clamp those nonsensical cases.
function gradedFloor(card, g, value, multOverride) {
  // Scale the lower-grade comps by the same living-market multiplier the headline value
  // rides, so the whole grade ladder moves with the set's market (a slab isn't immune to
  // a crash just because a lower grade has a captured comp). rawValue already carries it.
  const m = cardMult(card, multOverride)
  let floor = rawValue(card, multOverride) // a PSA-anything is at least the raw card
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

// The MOST a given buyer will pay for this card, as a multiple of market.
// = their base savvy tolerance, lifted by your notoriety (a known shop commands a
// premium) and the card's desirability (hot cards carry a markup), plus a little jitter.
export function buyerMaxMult(savvyKey, notoriety, card, rnd = Math.random) {
  const base = (BUYER_SAVVY[savvyKey] || BUYER_SAVVY.average).tolerance
  const notoLift = Math.min(0.35, notoriety / 400)        // up to +0.35× at high fame
  const desireLift = (cardDesirability(card) - 1) * 0.18  // hot cards tolerate more
  const jitter = (rnd() - 0.5) * 0.12                     // ±0.06 buyer-to-buyer noise
  return Math.max(0.6, base + notoLift + desireLift + jitter)
}

// Expected number of shoppers who browse a listing per game-day. More with fame and
// desirability; fair prices pull a few more eyes than wildly overpriced ones (which
// still get looked at — and passed on). Floors at a trickle so something always happens.
// `boost` multiplies the eyes (e.g. a recent livestream's afterglow pulls extra shoppers in).
export function dailyViewers(card, askMult, notoriety, rnd = Math.random, boost = 1) {
  const fame = 0.6 + Math.min(2.6, notoriety / 60)        // ~0.6 at noto 0 → ~3.2 high
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
  return round2(gradedFloor(card, grade, value))
}
// Hypothetical PSA-10 value — the headline "if it gemmed" number. Thin wrapper kept for
// existing callers; the general per-grade function is psaValueAt.
export function psa10Value(card) { return psaValueAt(card, 10) }

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
export const GRADING = {
  economy: { name: 'Economy', fee: 20, days: 45 },
  standard: { name: 'Standard', fee: 60, days: 20 },
  express:  { name: 'Express',  fee: 130, days: 5 },
  // On-site grading kiosk at big shows: skip the mail wait — results in ~2 days — but pay a
  // premium for it. `onSite` keeps it out of the normal (mail-in) Grader tier pickers.
  kiosk:    { name: 'On-Site Kiosk', fee: 240, days: 2, onSite: true },
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
  //
  // cutLuck: bias from the card's hidden cut quality (_cut 0..1, centered at 0.5).
  // K=0.16 → a Pristine card adds +0.08 lean; a Rough card subtracts -0.08.
  // Guard: _cut==null (old saves) → cutLuck=0, formula reduces to original exactly.
  const cutLuck = card._cut == null ? 0 : Math.max(-0.12, Math.min(0.12, (card._cut - 0.5) * 0.16))
  const effectiveLuck = Math.max(-0.25, Math.min(0.25, luck + cutLuck))
  const sub = () => {
    const r = Math.random()
    const b = (p) => Math.max(0.001, Math.min(0.999, p + effectiveLuck * (1 - p))) // pull each cutoff toward 1 by combined lean
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

// ---- Eyeball cut-quality estimate ----
// Returns a qualitative read on a card's hidden cut (_cut 0..1).
// precise=true (loupe owned): exact tier + specific detail line.
// precise=false: fuzzy, hedged wording that's directionally right but vague.
// Also appends a condition-cap note for played cards (LP/MP/DMG).
// Backward-compat: _cut==null → treat as 0.5 (Clean) so old saves show a neutral read.
const CUT_TIERS = [
  { tier: 'Rough',      min: 0,    max: 0.20, label: 'Rough',      color: '#ff5e6c', detail: 'Off-center with edge wear' },
  { tier: 'Off-center', min: 0.20, max: 0.40, label: 'Off-center', color: '#ff9f43', detail: 'Noticeably off-center' },
  { tier: 'Clean',      min: 0.40, max: 0.65, label: 'Clean',      color: '#9db8ff', detail: 'Decent centering, minor flaws' },
  { tier: 'Sharp',      min: 0.65, max: 0.85, label: 'Sharp',      color: '#36d399', detail: 'Well-centered, crisp edges' },
  { tier: 'Pristine',   min: 0.85, max: 1.01, label: 'Pristine',   color: '#7cf0ff', detail: 'Dead-centered, sharp corners' },
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
export function cutEstimate(card, precise) {
  // Null-safe: _cut==null means an old save with no cut data; treat as 0.5 (Clean).
  const cut = card._cut ?? 0.5
  const t = CUT_TIERS.find(t => cut >= t.min && cut < t.max) || CUT_TIERS[CUT_TIERS.length - 1]
  const cap = card.condition && CONDITIONS[card.condition] ? CONDITIONS[card.condition].maxGrade : 10
  const capNote = cap < 10 ? ` · capped at PSA ${cap} by condition` : ''
  // `short` is a compact word for tight UI: the exact tier when precise, a coarse
  // never-leaks-the-tier word when fuzzy. `label` is the full read for roomy UI.
  if (precise) {
    return { tier: t.tier, label: t.label, short: t.label, detail: t.detail + capNote, color: t.color }
  }
  return { tier: t.tier, label: FUZZY_LABELS[t.tier] + capNote, short: FUZZY_SHORT[t.tier], detail: null, color: t.color }
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
  // NOTE: each pack is deduped internally (a single pack never repeats a card), but a
  // multi-pack box is intentionally NOT deduped across packs — real boxes repeat cards
  // between packs, and that keeps the collection grind honest.
  return all
}

// Mint the guaranteed bonus promo for a product (null if it has no bonus).
// A product may pin an EXACT card via `fixedPromo` (a card id) — e.g. the
// Prismatic Evolutions Super-Premium Collection always ships the Eevee ex #174.
export function makeProductPromo(set, product) {
  if (product.bonus !== 'promo') return null
  if (product.fixedPromo) {
    const exact = set.cards.find(c => c.id === product.fixedPromo)
    if (exact) { const c = instance(exact); c._promo = true; return c }
  }
  const byR = cardsByRarity(set)
  const promoPool = byR['Ultra Rare'] || byR['Illustration Rare'] || byR['Double Rare'] || byR['Rare Holo']
  if (!promoPool?.length) return null
  const c = instance(pick(promoPool)); c._promo = true; return c
}

// ---- Sealed inventory -------------------------------------------------------
// A held sealed product (bought but not yet ripped). Its live value rides the set's
// market multiplier, so a hot modern set — or any vintage set (which trends up) —
// appreciates while it sits in your inventory. `item` = { uid, setId, product, ... }.
export const SEALED_FLIP_RATE = 0.92   // quick-flip payout as a fraction of live market value
export function sealedValue(item) {
  if (!item?.product) return 0
  return round2((item.product.price || 0) * marketMult(item.setId))
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
    price: p.price,
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
//   firstDibs     — gets the newest sets first (carries only the latest releases)
//   rotating      — small, weekly-rotating selection (a shop shelf, not a warehouse)
export const DISTRIBUTORS = [
  {
    id: 'lgs', name: 'Local Game Store', icon: '🎲', color: '#5ec98a',
    blurb: 'Your neighborhood shop. A small, rotating shelf and the odd weekend sale — and they hold hot product for regulars. Limited allocation, so stock is thin.',
    priceMult: 1.0, discountStep: 0.03, maxDiscount: 0.15, reliability: 0.4,
    rotating: true, clearance: true,
  },
  {
    id: 'pokecenter', name: 'Pokémon Center', icon: '⚡', color: '#ffcb05',
    blurb: 'The official store — first crack at new sets and exclusives at MSRP. Strict per-customer allocation, so you can only grab a few at a time.',
    priceMult: 1.0, discountStep: 0.02, maxDiscount: 0.10, reliability: 0.45, firstDibs: true,
  },
  {
    id: 'tcgplayer', name: 'TCGplayer', icon: '🛒', color: '#5aa0ff',
    blurb: 'The marketplace — every set at live market price, deep selection. You pay market, but it is (almost) always there.',
    priceMult: 1.04, discountStep: 0.02, maxDiscount: 0.10, reliability: 0.7,
  },
  {
    id: 'amazon', name: 'Amazon', icon: '📦', color: '#ff9f43',
    blurb: 'The everything store — reliable in-print staples, a hair over list. Never the chase deals, but rarely out of the basics.',
    priceMult: 1.06, discountStep: 0.015, maxDiscount: 0.08, reliability: 0.8,
  },
  {
    id: 'dna', name: "Dave & Adam's", icon: '🃏', color: '#b98cff',
    blurb: 'A hobby giant — real case pricing and bulk supply once you are a known buyer. The volume play.',
    priceMult: 0.93, discountStep: 0.035, maxDiscount: 0.24, reliability: 0.7,
    cases: true, casesMinLevel: 2, supply: true, supplyMinLevel: 3,
  },
]
export function distributorById(id) { return DISTRIBUTORS.find(d => d.id === id) || null }

// How many of the NEWEST sets a first-dibs seller carries, and how many the LGS rotates.
const NEW_SET_COUNT = 6
const LGS_SHELF_SIZE = 5

// Which sets a retailer carries right now. `weekIndex` rotates the LGS shelf.
// `sets` is the in-print shop list (SHOP_SETS), newest last. Perk-driven (not id-based).
export function distributorCatalog(dist, sets, weekIndex = 0) {
  if (!dist) return sets
  if (dist.firstDibs) return sets.slice(Math.max(0, sets.length - NEW_SET_COUNT)) // newest releases only
  if (dist.cases) return sets.filter(s => caseLot(s))                             // box/case-friendly sets
  if (dist.rotating) {                                                            // small weekly shelf
    const n = sets.length
    if (!n) return []
    const start = (Math.abs(weekIndex) * 3) % n
    const out = []
    for (let i = 0; i < Math.min(LGS_SHELF_SIZE, n); i++) out.push(sets[(start + i) % n])
    return out
  }
  return sets // marketplace / big-box: the full catalog
}

// The rapport discount a distributor extends at a given level (capped). Single source
// of truth for both pricing and the "what you've unlocked" banner.
export function distributorDiscount(dist, level) {
  if (!dist) return 0
  return Math.min(dist.maxDiscount, (level || 0) * dist.discountStep)
}
// Price a product from a distributor at a given rapport level.
export function distributorPrice(dist, retail, level) {
  if (!dist) return round2(retail || 0)
  return round2((retail || 0) * dist.priceMult * (1 - distributorDiscount(dist, level)))
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
export function stockCap(dist, product, level) {
  if (!dist) return 99
  const packs = product?.packs || 1
  let base
  if (product?._case) base = 1
  else if (packs >= 21) base = 1          // booster box
  else if (packs >= 9) base = 3           // ETB / super-premium collection
  else if (packs >= 2) base = 5           // booster bundle / premium / tin / blister
  else base = 10                          // single booster / sleeved pack
  const rel = 0.5 + dist.reliability        // 0.9 .. 1.5
  const allo = 1 + 0.25 * (level || 0)      // bigger allocation as rapport grows (up to +100%)
  return Math.max(1, Math.round(base * rel * allo))
}
// Units of stock a distributor regains per day (toward the cap).
export function restockRate(dist, cap) {
  if (!dist) return cap
  return Math.max(0.2, dist.reliability * cap * 0.18)
}
// Stock map key for a (set, product) pair.
export function stockKey(set, product) { return `${set.id}|${product.type}` }
// Live stock state for a (set, product) at a distributor. `stock` is that distributor's
// saved stock map ({ key: {q, cap} }); an absent key means a full shelf. The cap is the
// LARGER of any saved cap and the current allocation — so climbing a rapport rung widens
// the shelf immediately instead of waiting for the next full restock to recompute it.
export function stockState(dist, stock, set, product, level) {
  const entry = (stock || {})[stockKey(set, product)]
  const cap = Math.max(entry?.cap || 0, stockCap(dist, product, level))
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

// Cash + notoriety bonus for first-time completing a set. Scales with how big and
// how valuable the set is — finishing a 300-card chase-heavy set is a real feat.
export function completionReward(set) {
  const value = set.cards.reduce((a, c) => a + (c.price ?? 0), 0)
  const cash = round2(50 + set.cards.length * 2 + value * 0.05) // size + a slice of its book value
  const noto = Math.round(8 + set.cards.length / 12)
  return { cash, noto }
}
