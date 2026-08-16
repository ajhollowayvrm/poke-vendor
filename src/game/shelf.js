// 🛒 What a retailer actually puts on a shelf.
//
// The card data carries the full MANUFACTURER lineup for a set — every SKU The Pokémon
// Company printed, including four artwork variants of the same checklane blister and ten
// different mini tins. That is a catalogue, not a shop. Handing it straight to the buy screen
// put ~40 sealed lines on a Local Game Store shelf, when a real small shop carries about five:
//
//     booster boxes of the two or three current sets (and loose packs out of them),
//     one blister by the till, and whatever premium box the distributor pushed that month.
//
// So a shelf is now a FILTER over the lineup, per retailer. Two ideas do the work:
//
//   1. ARCHETYPE. A "Premium Checklane Blister" and a "3-Pack Blister" are both *a blister* as
//      far as a shopkeeper's ordering decision goes. Classifying by archetype is what lets a
//      shelf say "one blister" instead of naming four SKUs it has never heard of.
//   2. VARIANT CAP. Within an archetype, a shelf shows a limited number of variants — chosen
//      deterministically from the week, so the shelf changes as weeks pass without ever being
//      random per render.
//
// The other thing this fixes is a channel error. `Pokémon Center Elite Trainer Box` is a
// Pokémon Center EXCLUSIVE — 19 of them were sitting on the local shop's shelf, which is
// doubly wrong because the Pokémon Center channel was deliberately removed from this game
// (it sells out to bots before a shop owner sees one). Exclusives now reach you the way they
// really do: through the marketplace, from somebody who queued, at a premium.

// --- Archetypes -------------------------------------------------------------------
// Ordered longest-match-first where names overlap ("Pokémon Center Elite Trainer Box" must
// be tested before "Elite Trainer Box", and "Half Booster Box" before "Booster Box").
const ARCHETYPE_TESTS = [
  ['pcetb',      /pok[eé]mon center/i],
  ['prerelease', /build\s*&\s*battle|build and battle/i],
  ['case',       null], // set by the _case flag, never by name
  ['box',        /^half booster box$|^booster box$/i],
  ['pack',       /^booster pack$/i],
  ['sleeved',    /^sleeved pack$/i],
  ['blister',    /blister/i],
  ['etb',        /elite trainer box/i],
  ['tin',        /tin/i],
  ['bundle',     /booster bundle/i],
  ['premium',    /premium|collection|ex box|^box$|surprise|binder|poster|sticker|pin/i],
]
export const ARCHETYPES = ['case', 'box', 'pack', 'sleeved', 'blister', 'etb', 'pcetb', 'tin', 'bundle', 'premium', 'prerelease']

export function archetypeOf(product) {
  if (!product) return 'premium'
  if (product._case) return 'case'
  const t = String(product.type || '')
  for (const [key, re] of ARCHETYPE_TESTS) {
    if (re && re.test(t)) return key
  }
  // Anything unrecognised is treated as a premium/collection line: it shows on the wide
  // shelves and stays off the small one, which is the safe direction for a new SKU type.
  return 'premium'
}

// Human labels, for the shelf-policy note on a distributor panel.
export const ARCHETYPE_LABEL = {
  case: 'cases', box: 'booster boxes', pack: 'loose packs', sleeved: 'sleeved packs', blister: 'blisters',
  etb: 'Elite Trainer Boxes', pcetb: 'Pokémon Center exclusives', tin: 'tins',
  bundle: 'booster bundles', premium: 'premium collections', prerelease: 'prerelease kits',
}

// --- Shelf policies ----------------------------------------------------------------
// `staples` are always on the shelf. `rotators` are the lines a shop carries SOME weeks —
// drawn one at a time so the shelf has a little movement without becoming a catalogue.
// `variants` caps how many artwork variants of one archetype appear at once.
//
// The LGS policy is modelled directly on a real small shop: boxes of the current sets, packs
// broken out of them, and one impulse line by the till.
export const SHELF_POLICY = {
  lgs: {
    staples: ['box', 'pack'],
    // Weighted, not uniform. The line by the till is a blister far more often than it is a
    // prerelease kit, and repeating an entry is the least clever way to say so.
    rotators: ['blister', 'blister', 'blister', 'etb', 'etb', 'sleeved', 'tin', 'bundle', 'premium', 'prerelease'],
    rotatorChance: 0.45,   // per set, per week — so most sets are just a box and packs
    variants: 1,
    // 👑 Cross-set collector product (Ultra Premium Collections, ex Boxes, the Mega tins).
    // A small shop gets ONE of these in at a time, and not every month — they are the piece
    // by the counter you either grab or watch somebody else grab. Everything wide carries the
    // lot, because a warehouse genuinely does.
    eraMax: 1, eraChance: 0.5,
  },
  // The marketplace: third-party sellers list everything, exclusives included. Still capped at
  // two variants per archetype, because a legible list beats a faithful one at ten mini tins.
  tcgplayer: {
    staples: ['box', 'pack', 'sleeved', 'blister', 'etb', 'bundle', 'tin', 'premium', 'pcetb', 'prerelease'],
    rotators: [],
    rotatorChance: 0,
    variants: 2,
  },
  // The warehouse: real retail lines, deep. No Pokémon Center exclusives — a warehouse does not
  // get allocation of another retailer's exclusive.
  amazon: {
    staples: ['box', 'pack', 'sleeved', 'blister', 'etb', 'bundle', 'tin', 'premium'],
    rotators: [],
    rotatorChance: 0,
    variants: 1,
  },
  // The hobby distributor: wholesale units. Nobody buys checklane blisters by the case.
  dna: {
    staples: ['case', 'box', 'etb', 'bundle', 'premium'],
    rotators: [],
    rotatorChance: 0,
    variants: 1,
  },
}
// Anything without a policy (the 🎌 import shelf, and any future channel) keeps the full
// lineup — those catalogues are already curated at the source.
export const DEFAULT_POLICY = { staples: ARCHETYPES, rotators: [], rotatorChance: 0, variants: 2 }

export function shelfPolicy(dist) {
  if (!dist) return DEFAULT_POLICY
  return SHELF_POLICY[dist.id] || DEFAULT_POLICY
}

// Deterministic 0..1 from a few strings — the rotator roll and the variant pick both use it,
// so a shelf is stable for a given (set, week) and changes when the week does. Never
// Math.random(): the buy screen re-renders constantly and a shelf that reshuffles under the
// player's finger is how you buy the wrong thing.
function hash01(...parts) {
  let h = 0x811c9dc5
  const s = parts.join('|')
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  // AVALANCHE — not optional. Plain FNV-1a leaves inputs that differ only in their LAST
  // character sitting in a narrow band: consecutive weeks returned 0.6990, 0.6951, 0.6912…
  // a ramp, not a hash. A set whose value happened to start above the threshold then never
  // rotated at all, which is exactly the bug this finalizer was missing. (murmur3 fmix32.)
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// Which archetypes this retailer stocks of this set, this week.
export function shelfArchetypes(dist, set, weekIndex = 0) {
  const pol = shelfPolicy(dist)
  const out = [...pol.staples]
  if (pol.rotators.length && pol.rotatorChance > 0) {
    const roll = hash01(dist?.id || '', set?.id || '', 'rot', weekIndex)
    if (roll < pol.rotatorChance) {
      const pick = pol.rotators[Math.floor(hash01(dist?.id || '', set?.id || '', 'pick', weekIndex) * pol.rotators.length)]
      if (pick && !out.includes(pick)) out.push(pick)
    }
  }
  return out
}

// THE ONE TO CALL. What this retailer has on the shelf for this set, this week.
//
// Preserves the lineup's own order within an archetype, and returns the products in the
// lineup's order overall, so the buy screen still reads cheapest-to-dearest the way it did.
export function shelfProducts(dist, products, set, weekIndex = 0) {
  const list = products || []
  if (!list.length) return list
  const pol = shelfPolicy(dist)
  const allowed = new Set(shelfArchetypes(dist, set, weekIndex))
  const seen = new Map()   // archetype → how many variants taken
  const keep = new Set()
  // Walk in a stable order and take up to `variants` of each allowed archetype. The variant
  // OFFSET rotates with the week, so a shop that carries "one blister" carries a different one
  // next month rather than the same artwork for ever.
  for (const arch of allowed) {
    const of = list.filter(p => archetypeOf(p) === arch)
    if (!of.length) continue
    const cap = Math.min(pol.variants, of.length)
    const offset = of.length > cap
      ? Math.floor(hash01(dist?.id || '', set?.id || '', arch, weekIndex) * of.length)
      : 0
    for (let i = 0; i < cap; i++) keep.add(of[(offset + i) % of.length])
    seen.set(arch, cap)
  }
  return list.filter(p => keep.has(p))
}

// 👑 Cross-set collector product, which hangs off the ERA rather than a set — and which was
// the actual reason a "five line" corner shop still showed fifteen. shelfProducts() only ever
// filtered a set's own lineup; these were rendered unfiltered, for every retailer.
//
// A variant cap is the wrong tool here: a Charizard UPC and a Terapagos UPC are two different
// products, where four checklane blisters are one product in four wrappers. So this caps the
// COUNT instead, and rolls whether the shop has one in at all this week.
export function shelfEraProducts(dist, products, series, weekIndex = 0) {
  const list = products || []
  const pol = shelfPolicy(dist)
  const max = pol.eraMax ?? Infinity
  if (!list.length || max === Infinity) return list
  if (max <= 0) return []
  if (hash01(dist?.id || '', series || '', 'era', weekIndex) > (pol.eraChance ?? 1)) return []
  const offset = Math.floor(hash01(dist?.id || '', series || '', 'erapick', weekIndex) * list.length)
  const out = []
  for (let i = 0; i < Math.min(max, list.length); i++) out.push(list[(offset + i) % list.length])
  return out
}

// Does this retailer carry this exact product right now? The question the overnight buyers
// ask (the 🧮 Purchasing Agent, 📇 special orders) — they must obey the same shelf the buy
// screen shows, or they can order a tin from a wholesaler that does not stock tins.
export function shelfCarries(dist, product, set, weekIndex = 0) {
  if (!product) return false
  return shelfArchetypes(dist, set, weekIndex).includes(archetypeOf(product))
}

// A one-line description of what this shop is, for the buy screen. Reads off the policy so it
// can never drift from what the shelf actually does.
export function shelfBlurb(dist) {
  const pol = shelfPolicy(dist)
  if (pol === DEFAULT_POLICY) return null
  const staples = pol.staples.filter(a => a !== 'pcetb').map(a => ARCHETYPE_LABEL[a])
  const lead = staples.slice(0, 3).join(', ')
  if (!pol.rotators.length) return `Stocks ${lead}${staples.length > 3 ? ' and more' : ''}.`
  return `Stocks ${lead} — plus whatever one line the rep pushed that week.`
}
