// Fetches Pokémon TCG sets + cards into src/data/sets.json.
//
// PRIMARY source: pokemontcg.io (https://api.pokemontcg.io/v2) — free, no key required.
//   Optional free API key via env POKEMONTCG_IO_KEY (header X-Api-Key) to lift rate limits.
//   Provides: card names, numbers, rarities, images, and USD/EUR prices for all English sets.
//
// SECONDARY source: TCGCSV (https://tcgcsv.com) — free, no auth needed, browser UA required.
//   Provides: sealed product listings + prices for English sets; per-card price fallback
//   by collector number.
//
// TERTIARY source: TCGdex (https://api.tcgdex.net/v2/en) — free, no auth needed.
//   Last-resort fallback ONLY: fills a missing price or image for individual cards that
//   come up empty from both pokemontcg.io and TCGCSV. Not bulk-fetched.
//
// PSA graded comps: NO live source — preserved from the prior src/data/sets.json.
//   At startup, the existing file is read and a card-id → psa map is built. After each
//   card is priced from free sources, its prior PSA comp is reattached and re-sanitized
//   against the new price (to maintain monotonicity). Drop-in safe: if sets.json doesn't
//   exist yet, no PSA data is attached (no crash).
//
// No paid key required. No RapidAPI / POKEMON_API_KEY / .pokemon-api-key references.
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { stripDerivableImages } from './strip-derivable-images.mjs'

// EUR→USD conversion for Cardmarket prices (approximate; used as fallback only).
const EUR_USD = 1.08

// English sets to build, keyed by OUR ids (which ARE the pokemontcg.io set ids — 1:1 match).
// `vintage:true` sets are hidden from the shop and sold only via the Vintage Vault vendor.
// `ep` is kept as a comment for reference but is no longer used for fetching.
const EN_SETS = [
  // modern (newest → oldest)
  { id: 'me4',      name: 'Chaos Rising' },
  { id: 'me3',      name: 'Perfect Order' },
  { id: 'me2pt5',   name: 'Ascended Heroes' },
  { id: 'me2',      name: 'Phantasmal Flames' },
  { id: 'me1',      name: 'Mega Evolution' },
  { id: 'zsv10pt5', name: 'Black Bolt' },
  { id: 'rsv10pt5', name: 'White Flare' },
  { id: 'sv10',     name: 'Destined Rivals' },
  { id: 'sv8pt5',   name: 'Prismatic Evolutions' },
  // Celebrations is a 50-card set: the 25-card main set (cel25) + the 25-card Classic
  // Collection reprints (cel25c — Base Charizard etc.), which are the premium inserts.
  // alsoFetch pulls the Classic Collection and merges it into this set.
  { id: 'cel25',    name: 'Celebrations', alsoFetch: ['cel25c'] },
  { id: 'g1',       name: 'Generations' },
  { id: 'sv3pt5',   name: '151' },
  // aftermarket (find-only) — older sealed you "can still kinda find": not sold fresh by
  // modern distributors, surfaced as secondary-market finds (shows / aftermarket source).
  // Full product lineups (unlike the single-pack vintage Vault sets).
  { id: 'sm9',    name: 'Team Up',         secondary: true },
  // Hidden Fates ships a 94-card "Shiny Vault" subset (sma — shiny Charizard-GX etc.); merge
  // it so the set is complete (69 main + 94 Shiny Vault = 163), mirroring Celebrations.
  { id: 'sm115',  name: 'Hidden Fates',    secondary: true, alsoFetch: ['sma'] },
  { id: 'sm10',   name: 'Unbroken Bonds',  secondary: true },
  { id: 'sm11',   name: 'Unified Minds',   secondary: true },
  { id: 'sm12',   name: 'Cosmic Eclipse',  secondary: true },
  { id: 'sm8',    name: 'Lost Thunder',    secondary: true },
  { id: 'xy12',   name: 'Evolutions',      secondary: true },
  { id: 'xy10',   name: 'Fates Collide',   secondary: true },
  { id: 'xy11',   name: 'Steam Siege',     secondary: true },
  { id: 'xy9',    name: 'BREAKpoint',      secondary: true },
  { id: 'xy8',    name: 'BREAKthrough',    secondary: true },
  { id: 'xy6',    name: 'Roaring Skies',   secondary: true },
  // vintage (sold only via the Vintage Vault) — most desirable older chase sets
  { id: 'ex15',    name: 'EX Dragon Frontiers',    vintage: true },
  { id: 'ex7',     name: 'EX Team Rocket Returns', vintage: true },
  { id: 'ex8',     name: 'EX Deoxys',              vintage: true },
  { id: 'ecard3',  name: 'Skyridge',               vintage: true },
  { id: 'neo4',    name: 'Neo Destiny',            vintage: true },
  { id: 'ecard2',  name: 'Aquapolis',              vintage: true },
  { id: 'neo1',    name: 'Neo Genesis',            vintage: true },
  { id: 'base6',   name: 'Legendary Collection',   vintage: true },
]
// Sets flagged `vintage` are NOT sold in the normal shop — they only surface via
// the rare "Vintage Vault" vendor that occasionally appears at higher-tier shows.
const VINTAGE_SETS = new Set(['base1', ...EN_SETS.filter(s => s.vintage).map(s => s.id)])

// pokemontcg.io rarity → engine rarity (RARITY_ORDER in engine.js). Modern sets
// already match. Vintage eras add Gold Star / Shining / Crystal / EX rarities —
// map them into engine tiers so they're treated as the chases they are.
const EN_RARITY_MAP = {
  'rare': 'Rare',
  'Rare Holo Star': 'Hyper Rare',          // Gold Stars — top vintage chase
  'Rare Shining':   'Hyper Rare',          // Neo "Shining" subtype
  'Rare Secret':    'Special Illustration Rare', // Crystals / secret rares
  'Rare Holo EX':   'Ultra Rare',          // EX-era full-art ex
  'Rare Holo':      'Rare Holo',
  'Rare Ultra':     'Ultra Rare',          // modern/Generations full-art ultra
  'Rare Holo V':    'Ultra Rare',          // SWSH-era V (Celebrations reprints) — chase tier
  'Rare Holo VMAX': 'Ultra Rare',          // SWSH-era VMAX (Celebrations reprints) — chase tier
  'Radiant Rare':   'Ultra Rare',          // SWSH Radiant — same era, map preemptively
  'Classic Collection': 'Special Illustration Rare', // Celebrations Classic reprints (Base Zard etc.)
  // SM / XY-era chases (aftermarket sets: Team Up, Hidden Fates, Evolutions, Fates Collide…)
  'Rare Holo GX':   'Ultra Rare',          // SM GX full-bodies
  'Rare Rainbow':   'Hyper Rare',          // SM rainbow-rare secret
  'Rare Holo LV.X': 'Ultra Rare',
  'Rare BREAK':     'Ultra Rare',          // XY BREAK cards
  'Rare Shining':   'Hyper Rare',
  'Rare Shiny':     'Special Illustration Rare',   // Hidden Fates Shiny Vault
  'Rare Shiny GX':  'Hyper Rare',          // Shiny Vault GX
  'Rare Prime':     'Ultra Rare',
  'Rare ACE':       'Ultra Rare',
  'LEGEND':         'Hyper Rare',
  // Mega-era JP-style rarity names
  'Art Rare':         'Illustration Rare',
  'Special Art Rare': 'Special Illustration Rare',
  'SECRET RARE':      'Mega Hyper Rare',
}
const KNOWN_RARITIES = new Set([
  'Common','Uncommon','Rare','Rare Holo','Double Rare','ACE SPEC Rare','Illustration Rare',
  'Ultra Rare','Special Illustration Rare','Hyper Rare','Mega Hyper Rare','Black White Rare',
  'MEGA_ATTACK_RARE', // Mega-era alt-art Mega ex (Ascended Heroes+) — passes through as-is
])
function mapRarity(r) {
  if (!r) return 'Common'
  if (EN_RARITY_MAP[r]) return EN_RARITY_MAP[r]
  if (KNOWN_RARITIES.has(r)) return r
  console.log(`    ⚠️  unknown rarity "${r}" → defaulting to Rare`)
  return 'Rare'
}

// Per-card rarity corrections keyed by card id. The source (pokemontcg.io) mis-tags a
// handful of top secret-numbered cards as plain "Rare"; these are the set's signature
// Black White Rare chases. Applied after mapRarity so a re-fetch keeps them correct.
const RARITY_ID_OVERRIDE = {
  'zsv10pt5-171': 'Black White Rare', // Black Bolt — Victini (secret)
  'rsv10pt5-172': 'Black White Rare', // White Flare — Victini (secret)
}

// --- TCGCSV sealed product / singles source (free, no auth) --------------------
// Maps our set ids → TCGplayer group ids on tcgcsv.com (category 3).
const TCGCSV = 'https://tcgcsv.com/tcgplayer/3'
const SET_GROUP = {
  sv8pt5:   23821, // Prismatic Evolutions
  zsv10pt5: 24325, // Black Bolt
  rsv10pt5: 24326, // White Flare
  sv10:     24269, // Destined Rivals
  sv3pt5:   23237, // 151
  cel25:    2867,  // Celebrations
  g1:       1728,  // Generations
  base1:    604,   // Base Set (1999) — vintage vault product
  me1:      24380, // Mega Evolution
  me2:      24448, // Phantasmal Flames
  me2pt5:   24541, // Ascended Heroes
  me3:      24587, // Perfect Order
  me4:      24655, // Chaos Rising
  // aftermarket (find-only) older sets — TCGplayer group ids for sealed products + price fallback
  sm9:     2377,   // SM Team Up
  sm115:   2480,   // Hidden Fates
  sm10:    2420,   // SM Unbroken Bonds
  sm11:    2464,   // SM Unified Minds
  sm12:    2534,   // SM Cosmic Eclipse
  sm8:     2328,   // SM Lost Thunder
  xy12:    1842,   // XY Evolutions
  xy10:    1780,   // XY Fates Collide (Mega Zygarde-EX product line)
  xy11:    1815,   // XY Steam Siege
  xy9:     1701,   // XY BREAKpoint
  xy8:     1661,   // XY BREAKthrough
  xy6:     1534,   // XY Roaring Skies
  // vintage sets — used for sealed products + singles price fallback
  ex15:    1411,   // EX Dragon Frontiers
  ex7:     1428,   // EX Team Rocket Returns
  ex8:     1404,   // EX Deoxys
  ecard3:  1372,   // Skyridge
  neo4:    1444,   // Neo Destiny
  ecard2:  1397,   // Aquapolis
  neo1:    1396,   // Neo Genesis
  base6:   1374,   // Legendary Collection
}

// Classify a sealed product by name → { type, packs, bonus }.
// packs = how many booster packs it rips into; bonus = guaranteed promo/extra.
// Order matters: most specific first. Returns null for things we don't sell
// (cases, code cards, singles, display cases, accessories).
function classifyProduct(name) {
  const n = name.toLowerCase()
  // Hard reject: code cards, cases, displays, accessories, exclusives, multi-packs, and —
  // for older sets — fixed THEME/THUNDER decks (no booster packs) and loose energy singles.
  if (/code card|^code |\bcase\b|case$|display|set of \d|pouch|binder|poster|sticker|\bpin\b|pin collection|figure collection|art bundle|accessory|exclusive|theme deck|\bdeck\b|\benergy\b|unnumbered/.test(n)) return null
  if (/super-premium collection$/.test(n))  return { type: 'Super-Premium Collection', icon: '🏆', packs: 15, bonus: 'promo' }
  if (/premium .*collection$|premium figure collection$/.test(n)) return { type: 'Premium Collection', icon: '💎', packs: 7, bonus: 'promo' }
  if (/build (&|and) battle/.test(n))       return { type: 'Build & Battle Box', icon: '⚔️', packs: 4, bonus: 'promo' }
  if (/elite trainer box$/.test(n))         return { type: 'Elite Trainer Box', icon: '📦', packs: 9, bonus: 'promo' }
  if (/booster box$/.test(n))               return { type: 'Booster Box', icon: '🗃️', packs: 36, bonus: null }
  if (/booster bundle$/.test(n))            return { type: 'Booster Bundle', icon: '🎟️', packs: 6, bonus: null }
  if (/surprise box$/.test(n))              return { type: 'Surprise Box', icon: '🎁', packs: 8, bonus: 'promo' }
  if (/mini tin/.test(n))                   return { type: 'Mini Tin', icon: '🥫', packs: 2, bonus: 'promo' }
  // GX/EX-era collector TINS (Team Up TAG TEAM tin, Triple Power tin, etc.): ~3 packs + a promo.
  if (/\btin\b/.test(n))                    return { type: 'Tin', icon: '🥫', packs: 3, bonus: 'promo' }
  // Real SV 3-pack blisters ship a fixed coin/energy/checklane card, not a hit-tier promo.
  if (/3-pack blister|three pack blister/.test(n)) return { type: '3-Pack Blister', icon: '🪟', packs: 3, bonus: null }
  if (/2-pack blister|two pack blister/.test(n))   return { type: '2-Pack Blister', icon: '🪟', packs: 2, bonus: 'promo' }
  // A single-pack blister: one booster + a fixed promo card.
  if (/single pack blister|1-pack blister|single booster/.test(n)) return { type: 'Blister', icon: '🪟', packs: 1, bonus: 'promo' }
  if (/sleeved booster( pack)?$|checklane/.test(n))   return { type: 'Sleeved Pack', icon: '🛡️', packs: 1, bonus: null }
  // "<Pokémon> ex Box" / "V Box" / "VMAX Box" — a small box built around a chase card.
  if (/\bex box$|\bv box$|\bvmax box$|\bvstar box$/.test(n)) return { type: 'ex Box', icon: '🎁', packs: 4, bonus: 'promo' }
  if (/booster( pack)?$/.test(n))           return { type: 'Booster Pack', icon: '🎴', packs: 1, bonus: null }
  // CATCH-ALL: survived hard-reject but matched no known type. Tag `_guessed`.
  return guessProduct(n)
}

// Best-effort classifier for an unrecognized (but non-rejected) sealed product.
function guessProduct(n) {
  if (/\bbox$|\bbox\b/.test(n))                 return { type: 'Box', icon: '📦', packs: 4, bonus: null, _guessed: true }
  if (/collection$|\bcollection\b|\btin\b/.test(n)) return { type: 'Collection', icon: '🧰', packs: 3, bonus: null, _guessed: true }
  if (/blister|\bpack(s)?\b/.test(n))           return { type: 'Blister', icon: '🪟', packs: 2, bonus: null, _guessed: true }
  return { type: 'Sealed Product', icon: '🎴', packs: 1, bonus: null, _guessed: true }
}

// Pull-rate model for modern Scarlet & Violet / Mega Evolution era English packs.
// RARE slot — "Rare or higher". Probabilities sum to ~1; remainder is Rare Holo.
const RARE_SLOT = [
  { rarity: 'Double Rare', p: 0.1405 },   // ex — 14.05% (1 in 7)
  { rarity: 'Ultra Rare',  p: 0.0651 },   // full art — 6.51% (1 in 15)
]
// REVERSE slot — normally an ordinary reverse holo, occasionally upgraded.
const REVERSE_SLOT = [
  { rarity: 'Illustration Rare',          p: 0.0752 }, // 7.52% (1 in 13)
  { rarity: 'Special Illustration Rare',  p: 0.0301 }, // 3.01% (1 in 33)
  { rarity: 'Hyper Rare',                 p: 0.0185 }, // 1.85% (1 in 54)
  { rarity: 'Mega Hyper Rare',            p: 0.0035 }, // chase — ~1 in 285
]

// Generic JSON fetcher with retry/backoff. Sends a browser UA because tcgcsv.com
// rejects the default Node fetch UA.
async function getJSON(url, extraHeaders = {}) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'application/json',
    ...extraHeaders,
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers })
    if (res.ok) return res.json()
    if (res.status === 429) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue }
    throw new Error(`${res.status} ${url}`)
  }
  throw new Error('too many retries ' + url)
}

// --- pokemontcg.io helpers ---------------------------------------------------
const PTCGIO = 'https://api.pokemontcg.io/v2'
// Optional free key (env POKEMONTCG_IO_KEY) lifts the rate limit from ~1000/day to 20000/day.
let PTCGIO_HEADERS = {}

// Prefer holofoil-type finishes for the headline price; fall back to normal/reverse.
// Higher rank = lower preference (0 = best).
const FINISH_RANK = {
  '1stEditionHolofoil': 0,
  'unlimitedHolofoil':  1,
  '1stEdition':         2,
  'unlimited':          3,
  'holofoil':           4,
  'Holofoil':           4, // TCGCSV finish name variant
  'normal':             5,
  'Normal':             5,
  'reverseHolofoil':    6,
  'Reverse Holofoil':   6,
}

// Best USD price across all finish keys present on a pokemontcg.io card's tcgplayer block.
// Returns the market price of the highest-ranked finish (prefer holo over normal over reverse).
function bestTcgplayerPrice(tcgplayer) {
  if (!tcgplayer?.prices) return null
  let best = null
  let bestRank = Infinity
  for (const [finish, prices] of Object.entries(tcgplayer.prices)) {
    const m = prices?.market
    if (m == null) continue
    const rank = FINISH_RANK[finish] ?? 7
    if (rank < bestRank || (rank === bestRank && m > (best ?? 0))) {
      best = m
      bestRank = rank
    }
  }
  return best
}

// USD price from a pokemontcg.io card. Prefers tcgplayer (already USD);
// falls back to cardmarket EUR→USD if tcgplayer has nothing.
function cardUSD(card) {
  const tcg = bestTcgplayerPrice(card.tcgplayer)
  if (tcg != null) return round2(tcg)
  const cm = card.cardmarket?.prices
  if (cm) {
    const eur = cm.avg7 ?? cm.avg30 ?? cm.trendPrice ?? cm.averageSellPrice
    if (eur != null) return round2(eur * EUR_USD)
  }
  return null
}

// Fetch all cards for a pokemontcg.io set, paging 250 at a time.
async function fetchPtcgioCards(setId) {
  const cards = []
  let page = 1
  let totalCount = null
  do {
    const j = await getJSON(`${PTCGIO}/cards?q=set.id:${setId}&pageSize=250&page=${page}`, PTCGIO_HEADERS)
    if (totalCount === null) totalCount = j.totalCount ?? 0
    if (!j.data?.length) break // guard: API said totalCount>0 but returned an empty page
    cards.push(...j.data)
    page++
  } while (cards.length < totalCount)
  return cards
}

// Fetch set metadata (name, series, releaseDate, logo, symbol, printedTotal, total).
async function fetchPtcgioSet(setId) {
  try {
    const j = await getJSON(`${PTCGIO}/sets/${setId}`, PTCGIO_HEADERS)
    return j.data || {}
  } catch { return {} }
}

// --- TCGCSV helpers (unchanged from original) --------------------------------

// Fetch SINGLE-card prices for a TCGCSV group → { collectorNumber: price }.
// Prefer Holofoil → Normal → Reverse Holo to match the headline finish.
async function fetchSingles(groupId) {
  if (!groupId) return {}
  let prods, prices
  try {
    prods = (await getJSON(`${TCGCSV}/${groupId}/products`)).results || []
    prices = (await getJSON(`${TCGCSV}/${groupId}/prices`)).results || []
  } catch (e) {
    console.log(`    (singles fetch failed for group ${groupId}: ${e.message})`)
    return {}
  }
  const bestByProduct = {}
  for (const pr of prices) {
    const m = pr.marketPrice ?? pr.midPrice
    if (!m) continue
    const rank = FINISH_RANK[pr.subTypeName] ?? 9
    const cur = bestByProduct[pr.productId]
    if (!cur || rank < cur.rank) bestByProduct[pr.productId] = { price: m, rank }
  }
  const byNumber = {}
  for (const p of prods) {
    const ext = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]))
    if (!ext.Number) continue
    // Skip Code Cards — digital redemption rows, not collectibles.
    if (ext.Rarity === 'Code Card') continue
    const best = bestByProduct[p.productId]
    if (!best) continue
    const num = String(ext.Number).split('/')[0].replace(/^0+/, '') || '0'
    const price = Math.round(best.price * 100) / 100
    if (byNumber[num] == null || price > byNumber[num]) byNumber[num] = price
  }
  return byNumber
}

// Fetch + classify sealed products for a TCGCSV group. Returns one entry per
// product TYPE (cheapest representative), with current market price.
async function fetchSealed(groupId) {
  if (!groupId) return []
  let prods, prices
  try {
    prods = (await getJSON(`${TCGCSV}/${groupId}/products`)).results || []
    prices = (await getJSON(`${TCGCSV}/${groupId}/prices`)).results || []
  } catch (e) {
    console.log(`    (sealed fetch failed for group ${groupId}: ${e.message})`)
    return []
  }
  const priceById = {}
  for (const pr of prices) {
    const m = pr.marketPrice ?? pr.midPrice
    if (m && (priceById[pr.productId] == null)) priceById[pr.productId] = m
  }
  const byType = {}
  for (const p of prods) {
    const ext = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]))
    if (ext.Number) continue // single card — skip
    const cls = classifyProduct(p.name)
    if (!cls) continue
    const price = priceById[p.productId]
    if (price == null) continue
    const cur = byType[cls.type]
    if (!cur || price < cur.price) {
      byType[cls.type] = { type: cls.type, icon: cls.icon, packs: cls.packs, bonus: cls.bonus,
        name: p.name, price: Math.round(price * 100) / 100, tcgId: p.productId, _guessed: cls._guessed || undefined }
    }
  }
  // Keep `_guessed` so main()'s per-set build log can flag heuristic types; main()
  // strips it before writing sets.json (the vintage/JP paths strip it inline instead).
  return sortProducts(Object.values(byType))
}

// --- TCGdex helpers (last-resort fallback only) ------------------------------
const TCGDEX = 'https://api.tcgdex.net/v2/en'
// Our set id → TCGdex set id. Only lists the ones that differ.
const TCGDEX_ID = {
  me4:      'me04',
  me3:      'me03',
  me2pt5:   'me02.5',
  me2:      'me02',
  me1:      'me01',
  zsv10pt5: 'sv10.5b',
  rsv10pt5: 'sv10.5w',
  sv8pt5:   'sv08.5',
  sv3pt5:   'sv03.5',  // 151 — TCGdex uses sv03.5
  base6:    'lc',
}

// Lazily-populated map: setId → { localId → { price, img } }
// Built on first miss for a set, then cached so we don't re-fetch per-card.
const tcgdexCache = {}

async function fetchTcgdexSetIndex(setId) {
  const tdId = TCGDEX_ID[setId] || setId
  if (tcgdexCache[setId]) return tcgdexCache[setId]
  let cards
  try {
    const j = await getJSON(`${TCGDEX}/sets/${tdId}`)
    cards = j.cards || []
  } catch { tcgdexCache[setId] = {}; return {} }
  // cards is [{ id, localId, image, name }] — id is "tdSetId-localId"
  // We need to look up by collector number (= localId stripped of leading zeros).
  const byNum = {}
  for (const c of cards) {
    // localId may be "001" or "1" or "100a" — strip leading zeros for numeric ones
    const num = String(c.localId).replace(/^0+(?=\d)/, '') || c.localId
    byNum[num] = { tdCardId: c.id, image: c.image }
  }
  tcgdexCache[setId] = byNum
  return byNum
}

// Fetch price + image for a single card from TCGdex.
// Returns { price, img } where price is USD (tcgplayer marketPrice preferred, else cardmarket EUR→USD).
async function tcgdexCard(setId, number) {
  const idx = await fetchTcgdexSetIndex(setId)
  const num = String(number).replace(/^0+(?=\d)/, '') || number
  const entry = idx[num]
  if (!entry) return null
  let j
  try { j = await getJSON(`${TCGDEX}/cards/${entry.tdCardId}`) } catch { return null }
  if (!j || j.status === 404) return null
  // Price: prefer tcgplayer USD market; fall back to cardmarket EUR avg7 → avg30 → trend → avg
  let price = null
  const tp = j.pricing?.tcgplayer
  if (tp) {
    // finish keys: normal, holofoil, reverse-holofoil, 1st-edition-holofoil, unlimited-holofoil, etc.
    let best = null, bestRank = Infinity
    for (const [finish, data] of Object.entries(tp)) {
      if (finish === 'unit' || finish === 'updated') continue
      const m = data?.marketPrice
      if (m == null) continue
      // Map TCGdex finish names to FINISH_RANK roughly
      const normFinish = finish.includes('1st') ? '1stEditionHolofoil'
        : finish.includes('holo') ? 'holofoil'
        : finish.includes('reverse') ? 'reverseHolofoil'
        : 'normal'
      const rank = FINISH_RANK[normFinish] ?? 7
      if (rank < bestRank || (rank === bestRank && m > (best ?? 0))) { best = m; bestRank = rank }
    }
    if (best != null) price = round2(best)
  }
  if (price == null) {
    const cm = j.pricing?.cardmarket
    if (cm) {
      const eur = cm.avg7 ?? cm.avg30 ?? cm.trend ?? cm.avg
      if (eur != null) price = round2(eur * EUR_USD)
    }
  }
  // Image: TCGdex gives a base URL; append /high.webp for large
  const img = entry.image ? `${entry.image}/high.webp` : null
  return { price, img }
}

// eBay sold-comps monotonicity filter. Drops any comp that violates
// the rule "higher grade must be worth more than raw or any lower grade".
function sanitizePsa(psa, price) {
  if (!psa) return null
  const raw = price ?? 0
  const out = {}
  let prev = raw
  for (let g = 1; g <= 10; g++) {
    const v = psa[String(g)]
    if (v == null) continue
    if (v >= prev) { out[g] = v; prev = v }
  }
  return Object.keys(out).length ? out : null
}

function round2(n) { return Math.round(n * 100) / 100 }

// Build one English set using pokemontcg.io as the primary source, TCGCSV for
// sealed products and singles fallback, TCGdex as last-resort per-card fallback.
async function fetchEnglishSet(cfg, psaMap) {
  // 1. Set metadata from pokemontcg.io
  const meta = await fetchPtcgioSet(cfg.id)

  // 2. All cards from pokemontcg.io (paged). `alsoFetch` merges sibling source sets into
  //    this one (e.g. Celebrations' Classic Collection subset) so the set is complete.
  const rawCards = await fetchPtcgioCards(cfg.id)
  for (const extraId of (cfg.alsoFetch || [])) {
    const extra = await fetchPtcgioCards(extraId)
    console.log(`    +${extra.length} cards merged from ${extraId}`)
    rawCards.push(...extra)
  }

  // 3. Build card objects. Skip Code Cards — digital redemption rows, not collectibles.
  const cards = []
  for (const raw of rawCards) {
    if (raw.rarity === 'Code Card') continue
    const price = cardUSD(raw)
    const img = raw.images?.small || null
    const imgLarge = raw.images?.large || null
    cards.push({
      id: raw.id, // e.g. "me4-1" — already matches our id format
      name: raw.name,
      number: String(raw.number),
      rarity: RARITY_ID_OVERRIDE[raw.id] || mapRarity(raw.rarity),
      supertype: raw.supertype || 'Pokémon',
      img,
      imgLarge,
      price,
      _needsPrice: price == null,
      _needsImg: !img,
    })
  }

  // 4. TCGCSV singles fallback: fill cards still missing a price
  const missingPrice = cards.filter(c => c._needsPrice)
  let tcgcsvSingles = null
  if (missingPrice.length && SET_GROUP[cfg.id]) {
    tcgcsvSingles = await fetchSingles(SET_GROUP[cfg.id])
    let filled = 0
    for (const c of missingPrice) {
      const key = String(c.number).replace(/^0+/, '') || '0'
      if (tcgcsvSingles[key] != null) { c.price = tcgcsvSingles[key]; c._needsPrice = false; filled++ }
    }
    if (filled) console.log(`    singles fallback: filled ${filled}/${missingPrice.length} from TCGCSV`)
  }

  // 5. TCGdex last-resort: fill cards still missing price OR image
  const needsTcgdex = cards.filter(c => c._needsPrice || c._needsImg)
  if (needsTcgdex.length) {
    let tdPriceFilled = 0, tdImgFilled = 0
    for (const c of needsTcgdex) {
      const td = await tcgdexCard(cfg.id, c.number)
      if (!td) continue
      if (c._needsPrice && td.price != null) { c.price = td.price; c._needsPrice = false; tdPriceFilled++ }
      if (c._needsImg && td.img) { c.img = td.img; c.imgLarge = td.img; c._needsImg = false; tdImgFilled++ }
      await new Promise(r => setTimeout(r, 80)) // light politeness for per-card calls
    }
    if (tdPriceFilled || tdImgFilled) console.log(`    TCGdex fallback: +${tdPriceFilled} prices, +${tdImgFilled} images`)
  }

  // 6. Attach prior PSA comps (re-sanitized against the new price).
  // c.id is the pokemontcg.io id (e.g. "me3-94"); the map also has a "setId-number" key
  // as a fallback for cards whose old id used a paid-API prefix (e.g. "POR-94").
  for (const c of cards) {
    const numKey = `${cfg.id}-${String(c.number).replace(/^0+/, '') || c.number}`
    const priorPsa = psaMap[c.id] || psaMap[numKey]
    if (priorPsa) {
      const clean = sanitizePsa(priorPsa, c.price)
      if (clean) c.psa = clean
    }
  }

  // 7. Strip build-only flags
  for (const c of cards) { delete c._needsPrice; delete c._needsImg }

  // 8. Sealed products from TCGCSV (primary; pokemontcg.io has no products endpoint)
  let products = SET_GROUP[cfg.id] ? await fetchSealed(SET_GROUP[cfg.id]) : []

  return { cards, products, meta }
}


// Canonical display order for product types.
const PRODUCT_ORDER = ['Booster Pack','Sleeved Pack','2-Pack Blister','3-Pack Blister','Mini Tin',
  'Booster Bundle','ex Box','Elite Trainer Box','Premium Collection','Super-Premium Collection','Surprise Box','Booster Box',
  'Box','Collection','Blister','Sealed Product']
function sortProducts(arr) {
  const rank = t => { const i = PRODUCT_ORDER.indexOf(t); return i === -1 ? PRODUCT_ORDER.length : i }
  return arr.sort((a, b) => rank(a.type) - rank(b.type))
}

// Choose the vintage "heavy pack" product. Prefer a real sealed Booster Pack price;
// otherwise fall back to a market-plausible vintage pack ask.
function pickVintagePack(products) {
  const realPack = products.find(p => p.packs === 1)
  const price = realPack ? Math.max(realPack.price, 250) : 600
  return {
    type: 'Vintage Booster Pack', icon: '🗝️', packs: 1, bonus: null, vintage: true,
    name: realPack?.name,
    price: Math.round(price * 100) / 100,
    tcgId: realPack?.tcgId,
  }
}

async function main() {
  // Wire optional pokemontcg.io key from env (lifts rate limits).
  const ptcgKey = process.env.POKEMONTCG_IO_KEY?.trim()
  if (ptcgKey) { PTCGIO_HEADERS = { 'X-Api-Key': ptcgKey }; console.log('Using POKEMONTCG_IO_KEY.') }

  // Load prior PSA comps from existing sets.json (preserved — free sources have no PSA data).
  // Primary key: card id (e.g. "me4-90"). Secondary key: "setId-number" for any card whose
  // old id used a non-standard prefix (e.g. the paid source emitted "POR-94" for me3 card #94).
  const psaMap = {}
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const existing = JSON.parse(await readFile(join(here, '../src/data/sets.json'), 'utf8'))
    for (const s of (existing.sets || [])) {
      for (const c of (s.cards || [])) {
        if (!c.psa) continue
        psaMap[c.id] = c.psa
        // Also index by canonical setId-number so paid-API ids (e.g. "POR-94") survive a
        // source swap. Only register the fallback key when the existing id uses a different prefix.
        const numKey = `${s.id}-${String(c.number).replace(/^0+/, '') || c.number}`
        if (numKey !== c.id) psaMap[numKey] = c.psa
      }
    }
    console.log(`Loaded ${Object.keys(psaMap).length} prior PSA comps from sets.json.`)
  } catch { console.log('No existing sets.json — starting fresh (no prior PSA comps).') }

  // Scoped fetch: ONLY=sm9,xy10,… fetches just those sets. Every write is merge-
  // preserving now (sets not in this run are always carried forward), so MERGE=1 is
  // no longer needed — ONLY just narrows how much gets re-fetched/re-priced.
  const onlyIds = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean)
  const setsToFetch = onlyIds.length ? EN_SETS.filter(s => onlyIds.includes(s.id)) : EN_SETS
  if (onlyIds.length) console.log(`Scoped fetch: ${setsToFetch.map(s => s.id).join(', ')}`)

  console.log(`Fetching ${setsToFetch.length} English sets from pokemontcg.io + TCGCSV…`)

  const out = []
  for (const cfg of setsToFetch) {
    console.log(`  ${cfg.name} (${cfg.id})…`)
    const { cards, products: rawProducts, meta } = await fetchEnglishSet(cfg, psaMap)

    let products = rawProducts

    // Prismatic SPC always ships the Eevee ex SIR (#167) as its guaranteed promo.
    if (cfg.id === 'sv8pt5') {
      const spc = products.find(p => p.type === 'Super-Premium Collection')
      if (spc) spc.fixedPromo = `${cfg.id}-167`
    }

    // Vintage sets sell ONE marked-up heavy pack via the Vault, never in the shop.
    if (cfg.vintage) {
      const vp = pickVintagePack(products)
      vp.name = vp.name || `${cfg.name} Booster Pack`
      products = [vp]
      console.log(`    vintage pack: ${vp.name} @ $${vp.price}`)
    } else {
      const label = products.map(p => p._guessed ? `${p.type}?(${p.packs}pk)` : p.type).join(', ') || 'none'
      console.log(`    sealed: ${label}`)
      const guessed = products.filter(p => p._guessed)
      if (guessed.length) console.log(`    ⚠️  ${guessed.length} guessed product type(s): ${guessed.map(p => `"${p.name}"→${p.type}/${p.packs}pk`).join('; ')}`)
    }
    // Strip the build-only `_guessed` tag.
    products = products.map(({ _guessed, ...p }) => p)

    const priced = cards.filter(c => c.price != null).length
    const withPsa = cards.filter(c => c.psa).length
    console.log(`    ${cards.length} cards (${priced} priced, ${withPsa} w/ PSA comps)`)

    out.push({
      id: cfg.id,
      name: cfg.name,
      series: meta.series || (cfg.vintage ? 'Vintage' : undefined),
      releaseDate: meta.releaseDate,
      printedTotal: meta.printedTotal || cards.length,
      total: meta.total || cards.length,
      logo: meta.images?.logo,
      symbol: meta.images?.symbol,
      vintage: cfg.vintage || undefined,
      secondary: cfg.secondary || undefined,
      cards,
      products,
    })
    await new Promise(r => setTimeout(r, 200))
  }

  // Fold the freshly-fetched sets into the existing snapshot. This is ALWAYS
  // merge-preserving now: sets in the prior snapshot that this run didn't fetch
  // (e.g. the WOTC legacy sets written by fetch-legacy.mjs) are kept, never
  // silently deleted — the old non-merge mode wiped every set outside EN_SETS.
  let prevMeta = null
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    prevMeta = JSON.parse(await readFile(join(here, '../src/data/sets.json'), 'utf8'))
  } catch { /* first ever run — nothing to preserve */ }
  const prevById = new Map((prevMeta?.sets || []).map(s => [s.id, s]))

  // Validation gate: a set that fetched EMPTY (API regression, schema change) must not
  // replace a good prior copy — an empty set crashes openPack at runtime. Keep the old
  // data and say so loudly. A set that shrank >30% is suspicious too: keep the fetch
  // (real rotations happen) but flag it for eyeballing.
  const validated = []
  for (const s of out) {
    const prev = prevById.get(s.id)
    if (!s.cards.length) {
      if (prev?.cards?.length) {
        console.log(`  ⚠️  ${s.id} fetched EMPTY — keeping the previous snapshot's ${prev.cards.length} cards`)
        validated.push(prev)
      } else {
        console.log(`  ⚠️  ${s.id} fetched EMPTY and has no prior copy — SKIPPING (would crash openPack)`)
      }
      continue
    }
    if (prev?.cards?.length && s.cards.length < prev.cards.length * 0.7) {
      console.log(`  ⚠️  ${s.id} shrank ${prev.cards.length} → ${s.cards.length} cards — keeping the fetch, but verify this is a real change`)
    }
    validated.push(s)
  }
  const fetchedIds = new Set(validated.map(s => s.id))
  const carried = (prevMeta?.sets || []).filter(s => !fetchedIds.has(s.id))
  const finalSets = [...carried, ...validated]
  if (carried.length) console.log(`Carried ${carried.length} set(s) not in this run: ${carried.map(s => s.id).join(', ')}`)

  // Drop image URLs the runtime rebuilds from card id+number (engine.js cardImg) —
  // ~40% of the snapshot's raw bytes. Only exact-pattern matches are stripped;
  // idempotent for sets carried forward from an already-stripped snapshot.
  const imgStats = stripDerivableImages(finalSets)
  console.log(`Stripped derivable art URLs from ${imgStats.stripped}/${imgStats.total} cards (${imgStats.keptExplicit} keep explicit URLs).`)

  await mkdir('src/data', { recursive: true })
  await writeFile('src/data/sets.json', JSON.stringify({
    fetchedAt: new Date().toISOString(),
    rareSlot: prevMeta?.rareSlot || RARE_SLOT,
    reverseSlot: prevMeta?.reverseSlot || REVERSE_SLOT,
    sets: finalSets,
  }, null, 0))
  const totalCards = finalSets.reduce((a, s) => a + s.cards.length, 0)
  const totalProd = finalSets.reduce((a, s) => a + (s.products?.length || 0), 0)
  const totalPsa = finalSets.reduce((a, s) => a + s.cards.filter(c => c.psa).length, 0)
  console.log(`Wrote src/data/sets.json — ${finalSets.length} sets, ${totalCards} cards, ${totalProd} sealed products, ${totalPsa} cards w/ PSA comps.`)
}

main().catch(e => { console.error(e); process.exit(1) })
