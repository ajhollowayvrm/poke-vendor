// Fetches Pokémon TCG sets + cards into src/data/sets.json.
//
// PRIMARY source: pokemon-api.com via RapidAPI (host pokemon-tcg-api.p.rapidapi.com) —
// English cards, images, USD/EUR prices, eBay PSA graded comps, and sealed products.
// Needs a key: set POKEMON_API_KEY env, or drop it in scripts/.pokemon-api-key (gitignored).
// FALLBACK / specialist source: TCGCSV (free, no auth) — the Japanese Abyss Eye set
// (category 85) and a per-field price fallback. pokemontcg.io is no longer used here.
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PA_HOST = 'pokemon-tcg-api.p.rapidapi.com'
const PA = `https://${PA_HOST}`
// EUR→USD for the rare card whose only price is Cardmarket (approximate; vintage mostly
// priced via tcgplayer/PSA anyway). Kept a const so it's obvious + easy to bump.
const EUR_USD = 1.08

// English sets to build, keyed by OUR ids (so SET_GROUP, the sv8pt5 promo pin, vintage
// flags, and vintageProduct() all keep working). `ep` = pokemon-api.com episode id.
//   Modern sets sell their full product lineup; `vintage:true` sets are hidden from the
//   shop and sold only via the Vintage Vault vendor (heavy single packs), like base1.
const EN_SETS = [
  // modern (newest → oldest)
  { id: 'me4',      ep: 413, name: 'Chaos Rising' },
  { id: 'me3',      ep: 399, name: 'Perfect Order' },
  { id: 'me2pt5',   ep: 396, name: 'Ascended Heroes' },
  { id: 'me2',      ep: 231, name: 'Phantasmal Flames' },
  { id: 'me1',      ep: 230, name: 'Mega Evolution' },
  { id: 'zsv10pt5', ep: 223, name: 'Black Bolt' },
  { id: 'rsv10pt5', ep: 224, name: 'White Flare' },
  { id: 'sv8pt5',   ep: 212, name: 'Prismatic Evolutions' },
  { id: 'cel25',    ep: 35,  name: 'Celebrations' },
  { id: 'g1',       ep: 75,  name: 'Generations' },
  // vintage (sold only via the Vintage Vault) — most desirable older chase sets
  { id: 'ex15',  ep: 130, name: 'EX Dragon Frontiers',    vintage: true },
  { id: 'ex7',   ep: 143, name: 'EX Team Rocket Returns', vintage: true },
  { id: 'ex8',   ep: 142, name: 'EX Deoxys',              vintage: true },
  { id: 'ecard3',ep: 154, name: 'Skyridge',               vintage: true },
  { id: 'neo4',  ep: 159, name: 'Neo Destiny',            vintage: true },
  { id: 'ecard2',ep: 155, name: 'Aquapolis',              vintage: true },
  { id: 'neo1',  ep: 163, name: 'Neo Genesis',            vintage: true },
  { id: 'base6', ep: 158, name: 'Legendary Collection',   vintage: true },
]
// Sets flagged `vintage` are NOT sold in the normal shop — they only surface via
// the rare "Vintage Vault" vendor that occasionally appears at higher-tier shows.
// base1 (1999 Base Set) stays on the TCGCSV path below; the rest come from EN_SETS.
const VINTAGE_SETS = new Set(['base1', ...EN_SETS.filter(s => s.vintage).map(s => s.id)])

// pokemon-api.com rarity → engine rarity (RARITY_ORDER in engine.js). Modern sets
// already match (just title-case `rare`). Vintage eras add Gold Star / Shining /
// Crystal / EX rarities — map them into engine tiers so they're treated as the chases
// they are, not silently ranked 0 (which would make them pull/price like commons).
const EN_RARITY_MAP = {
  'rare': 'Rare',
  'Rare Holo Star': 'Hyper Rare',          // Gold Stars — top vintage chase
  'Rare Shining':   'Hyper Rare',          // Neo "Shining" subtype
  'Rare Secret':    'Special Illustration Rare', // Crystals / secret rares
  'Rare Holo EX':   'Ultra Rare',          // EX-era full-art ex
  'Rare Holo':      'Rare Holo',
  'Rare Ultra':     'Ultra Rare',          // modern/Generations full-art ultra
  'Classic Collection': 'Special Illustration Rare', // Celebrations Classic reprints (Base Zard etc.) — chase tier
  // Some Mega-era episodes (e.g. Perfect Order, ep 399) come back with the JP-style
  // rarity names for their secret rares — map them like the JP set does, or they fall
  // through to the "Rare" default and the set loses its IR/SIR/Mega Hyper Rare chases.
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

// Japanese-only sets. pokemontcg.io is English-only, so these are built entirely
// from TCGCSV's Japanese category (85): real card names, numbers, rarities, prices,
// and TCGplayer CDN images. JP rarity names are mapped to the engine's rarity
// vocabulary so the pull model works unchanged.
const JP_SETS = [
  { id: 'jp-m5', tcgGroup: 24711, name: 'Abyss Eye', series: 'Scarlet & Violet (JP)', releaseDate: '2025/06/06' },
]
// JP TCGplayer rarity → engine rarity. (ex = Double Rare, full-art = Ultra Rare,
// Art Rare = Illustration Rare, Special Art Rare = Special Illustration Rare,
// the lone Mega Ultra Rare chase = Hyper Rare.)
const JP_RARITY_MAP = {
  'Common': 'Common', 'Uncommon': 'Uncommon', 'Rare': 'Rare',
  'Double Rare': 'Double Rare', 'Super Rare': 'Ultra Rare',
  'Art Rare': 'Illustration Rare', 'Special Art Rare': 'Special Illustration Rare',
  'Ultra Rare': 'Ultra Rare', 'Mega Ultra Rare': 'Hyper Rare',
  'Shiny Super Rare': 'Hyper Rare', 'Special Rare': 'Special Illustration Rare',
}

// --- Sealed product pricing via TCGCSV (free, no auth) ---------------------
// Maps our pokemontcg.io set ids → TCGplayer group ids on tcgcsv.com (category 3).
const TCGCSV = 'https://tcgcsv.com/tcgplayer/3'
const SET_GROUP = {
  sv8pt5:   23821, // Prismatic Evolutions
  zsv10pt5: 24325, // Black Bolt
  rsv10pt5: 24326, // White Flare
  cel25:    2867,  // Celebrations
  g1:       1728,  // Generations
  base1:    604,   // Base Set (1999) — vintage vault product
  me1:      24380, // Mega Evolution
  me2:      24448, // Phantasmal Flames
  me2pt5:   24541, // Ascended Heroes
  me3:      24587, // Perfect Order
  me4:      24655, // Chaos Rising
}
// Classify a sealed product by name → { type, packs, bonus }.
// packs = how many booster packs it rips into; bonus = guaranteed promo/extra.
// Order matters: most specific first. Returns null for things we don't sell
// (cases, code cards, singles, display cases, accessories).
function classifyProduct(name) {
  const n = name.toLowerCase()
  // Hard reject: code cards, cases, displays, accessories, exclusives, multi-packs.
  if (/code card|^code |\bcase\b|case$|display|set of \d|pouch|binder|poster|sticker|figure collection|art bundle|accessory|exclusive|\bcase\b/.test(n)) return null
  if (/super-premium collection$/.test(n))  return { type: 'Super-Premium Collection', icon: '🏆', packs: 15, bonus: 'promo' }
  if (/premium .*collection$|premium figure collection$/.test(n)) return { type: 'Premium Collection', icon: '💎', packs: 7, bonus: 'promo' }
  if (/elite trainer box$/.test(n))         return { type: 'Elite Trainer Box', icon: '📦', packs: 9, bonus: 'promo' }
  if (/booster box$/.test(n))               return { type: 'Booster Box', icon: '🗃️', packs: 36, bonus: null }
  if (/booster bundle$/.test(n))            return { type: 'Booster Bundle', icon: '🎟️', packs: 6, bonus: null }
  if (/surprise box$/.test(n))              return { type: 'Surprise Box', icon: '🎁', packs: 8, bonus: 'promo' }
  if (/mini tin/.test(n))                   return { type: 'Mini Tin', icon: '🥫', packs: 2, bonus: 'promo' }
  // Real SV 3-pack blisters ship a fixed coin/energy/checklane card, not a hit-tier
  // promo — so no bonus. (ETBs / tins / premiums are the ones with a real promo.)
  if (/3-pack blister|three pack blister/.test(n)) return { type: '3-Pack Blister', icon: '🪟', packs: 3, bonus: null }
  if (/2-pack blister|two pack blister/.test(n))   return { type: '2-Pack Blister', icon: '🪟', packs: 2, bonus: 'promo' }
  if (/sleeved booster( pack)?$|checklane/.test(n))   return { type: 'Sleeved Pack', icon: '🛡️', packs: 1, bonus: null }
  // pokemon-api names the single pack just "<Set> Booster" (no "Pack"); also match that.
  if (/booster( pack)?$/.test(n))           return { type: 'Booster Pack', icon: '🎴', packs: 1, bonus: null }
  return null
}

// Pull-rate model for modern Scarlet & Violet / Mega Evolution era English packs.
// Real SV packs have TWO hit-bearing slots, modeled separately below.
// Rates are empirical per-pack pull rates compiled from large community samples:
//   - Card Shop Live (1,728 packs): https://cardshoplive.com/pages/hit-rates-for-pokemon-tcg-scarlet-and-violet
//   - DigitalTQ (676 packs):        https://www.digitaltq.com/scarlet-violet-pull-rates-pokemon-tcg
// A pack = 4 commons, 3 uncommons, 1 RARE slot, 1 REVERSE slot (+ energy, ignored).
//
// RARE slot — "Rare or higher". Probabilities sum to ~1; remainder is Rare Holo.
const RARE_SLOT = [
  { rarity: 'Double Rare', p: 0.1405 },   // ex — 14.05% (1 in 7)
  { rarity: 'Ultra Rare',  p: 0.0651 },   // full art — 6.51% (1 in 15)
  // remainder → Rare Holo (~0.7944)
]
// REVERSE slot — normally an ordinary reverse holo, occasionally upgraded.
const REVERSE_SLOT = [
  { rarity: 'Illustration Rare',          p: 0.0752 }, // 7.52% (1 in 13)
  { rarity: 'Special Illustration Rare',  p: 0.0301 }, // 3.01% (1 in 33)
  { rarity: 'Hyper Rare',                 p: 0.0185 }, // 1.85% (1 in 54)
  { rarity: 'Mega Hyper Rare',            p: 0.0035 }, // chase — ~1 in 285 (Mega-era top card)
  // remainder → ordinary reverse holo (~0.8727)
]

async function getJSON(url) {
  // Some CDNs (tcgcsv.com) reject the default Node fetch UA → send a browser UA.
  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept': 'application/json' }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers })
    if (res.ok) return res.json()
    if (res.status === 429) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue }
    throw new Error(`${res.status} ${url}`)
  }
  throw new Error('too many retries ' + url)
}

// Resolve the RapidAPI key: env var first, then the gitignored local file.
async function resolveApiKey() {
  if (process.env.POKEMON_API_KEY) return process.env.POKEMON_API_KEY.trim()
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const key = (await readFile(join(here, '.pokemon-api-key'), 'utf8')).trim()
    if (key) return key
  } catch { /* fall through */ }
  throw new Error('No API key. Set POKEMON_API_KEY env or create scripts/.pokemon-api-key')
}

// GET a pokemon-api.com (RapidAPI) endpoint as JSON, with retry/backoff. Guards
// against the occasional empty/malformed body (seen live) by treating it as retryable.
let PA_KEY = null
async function paGet(path) {
  const headers = { 'x-rapidapi-host': PA_HOST, 'x-rapidapi-key': PA_KEY, 'Content-Type': 'application/json' }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${PA}${path}`, { headers })
      if (res.status === 429) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue }
      if (!res.ok) throw new Error(`${res.status}`)
      const text = await res.text()
      if (!text) throw new Error('empty body')
      return JSON.parse(text)
    } catch (e) {
      if (attempt === 4) throw new Error(`paGet ${path}: ${e.message}`)
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)))
    }
  }
}

// Page through every card row of a pokemon-api episode (20/page; lists every printing).
async function fetchEpisodeCards(ep) {
  const rows = []
  let page = 1, total = 1
  do {
    const j = await paGet(`/episodes/${ep}/cards?page=${page}`)
    const data = j?.data || []
    rows.push(...data)
    total = j?.paging?.total ?? page // if paging is missing, stop after this page
    page++
  } while (page <= total)
  return rows
}

// USD price for a card row: tcgplayer market → cardmarket EUR→USD → PSA-9 comp → null.
function rowUSD(row, psa) {
  const tp = row.prices?.tcg_player?.market_price
  if (tp != null) return round2(tp)
  const cm = row.prices?.cardmarket?.lowest_near_mint ?? row.prices?.cardmarket?.['7d_average']
  if (cm != null) return round2(cm * EUR_USD)
  if (psa && psa['9'] != null) return round2(psa['9']) // old slab-only cards: PSA 9 as a raw proxy
  return null
}

// Pull the PSA median-sale comps off a row → { "10": usd, "9": usd, ... } (PSA only).
function psaComps(row) {
  const psa = row.prices?.ebay?.graded?.psa
  if (!psa) return null
  const out = {}
  for (const g of Object.keys(psa)) {
    const m = psa[g]?.median_price
    if (m != null) out[g] = round2(m)
  }
  return Object.keys(out).length ? out : null
}

// eBay sold-comps are sparse and noisy: a low-volume grade can post a median sale
// BELOW the raw card or below a worse grade. Those are nonsensical (grading only
// adds value, and a higher grade beats a lower one). Drop any comp that violates
// monotonicity — leaving it absent lets the game floor it to raw/the next grade
// down, rather than baking a bogus "PSA 10 < raw" number into the data.
// Returns a cleaned comp object (or null if nothing survives).
function sanitizePsa(psa, price) {
  if (!psa) return null
  const raw = price ?? 0
  const out = {}
  let prev = raw // running floor: raw, then each accepted lower grade
  for (let g = 1; g <= 10; g++) {
    const v = psa[String(g)]
    if (v == null) continue
    if (v >= prev) { out[g] = v; prev = v } // keep only monotonic, ≥ raw comps
    // else: drop it (the game will floor this grade to `prev` at runtime)
  }
  return Object.keys(out).length ? out : null
}

// Build one English set from pokemon-api.com: page cards, dedupe to one per collector
// number (the API lists each card as several identical rows — same tcgid/rarity, differing
// only by internal id; NOT finish variants), emit a slim card + PSA comps + sealed products.
async function fetchEnglishSet(cfg) {
  // episode metadata (logo + series) — best-effort, not fatal if it fails
  let meta = {}
  try { const m = await paGet(`/episodes/${cfg.ep}`); meta = m?.data || m || {} } catch { /* ignore */ }
  const rows = await fetchEpisodeCards(cfg.ep)
  // group rows by collector number; pick the most-complete row as the representative.
  const byNum = new Map()
  for (const row of rows) {
    const num = String(row.card_number ?? '').trim()
    if (!num) continue
    if (!byNum.has(num)) byNum.set(num, [])
    byNum.get(num).push(row)
  }
  const cards = []
  for (const [num, group] of byNum) {
    // representative = the row that actually carries pricing (some dup rows are bare).
    const base = group.find(r => r.prices?.tcg_player?.market_price != null || r.prices?.ebay?.graded?.psa)
      || group[0]
    const rawPsa = psaComps(base) || group.map(psaComps).find(Boolean) || null
    const price = rowUSD(base, rawPsa) // price may use PSA-9 as a proxy → compute first
    const psa = sanitizePsa(rawPsa, price) // then drop any sub-raw / non-monotonic grade
    const card = {
      id: base.tcgid || `${cfg.id}-${num}`, // tcgid = pokemontcg.io id → keeps id-keyed logic working
      name: base.name,
      number: num,
      rarity: mapRarity(base.rarity),
      supertype: base.supertype || 'Pokémon',
      img: base.image,
      imgLarge: base.image,
      price,
    }
    if (psa) card.psa = psa
    cards.push(card)
  }
  // sealed products: pokemon-api → classify; fall back to TCGCSV per-set if none.
  let products = await fetchPaProducts(cfg.ep)
  if (!products.length && SET_GROUP[cfg.id]) products = await fetchSealed(SET_GROUP[cfg.id])
  return {
    cfg, cards, products,
    logo: meta.logo || undefined,
    series: meta.series?.name || undefined,
    releaseDate: meta.released_at || undefined,
  }
}

// Fetch + classify sealed products from pokemon-api.com for an episode.
async function fetchPaProducts(ep) {
  let j
  try { j = await paGet(`/episodes/${ep}/products`) } catch { return [] }
  const byType = {}
  for (const p of (j?.data || [])) {
    const cls = classifyProduct(p.name || '')
    if (!cls) continue
    const price = p.prices?.tcg_player?.market_price
      ?? (p.prices?.cardmarket?.lowest != null ? p.prices.cardmarket.lowest * EUR_USD : null)
    if (price == null) continue
    const cur = byType[cls.type]
    if (!cur || price < cur.price) {
      byType[cls.type] = { type: cls.type, icon: cls.icon, packs: cls.packs, bonus: cls.bonus,
        name: p.name, price: round2(price), tcgId: p.tcgplayer_id ?? p.id }
    }
  }
  const order = ['Booster Pack','Sleeved Pack','2-Pack Blister','3-Pack Blister','Mini Tin',
    'Booster Bundle','Elite Trainer Box','Premium Collection','Super-Premium Collection','Surprise Box','Booster Box']
  return Object.values(byType).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
}

function round2(n) { return Math.round(n * 100) / 100 }

// Fetch SINGLE-card prices for a TCGCSV group → { collectorNumber: price }.
// Used as a fallback when pokemontcg.io has no price yet (brand-new sets).
// TCGCSV identifies singles by extendedData "Number" like "116/086"; we key on
// the printed collector number ("116"). Prefer Holofoil → Normal → Reverse Holo
// to match the headline finish (mirrors bestPrice's finish order).
const FINISH_RANK = { 'Holofoil': 0, 'Normal': 1, 'Reverse Holofoil': 2 }
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
  // best market price per productId, by finish preference
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
    if (!ext.Number) continue // not a single card
    const best = bestByProduct[p.productId]
    if (!best) continue
    const num = String(ext.Number).split('/')[0].replace(/^0+/, '') || '0' // "116/086" → "116"
    const price = Math.round(best.price * 100) / 100
    // keep the highest-priced match for a given number (handles dup printings)
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
  // Best (cheapest in-stock) representative per product type.
  const byType = {}
  for (const p of prods) {
    const ext = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]))
    if (ext.Number) continue // it's a single card, skip
    const cls = classifyProduct(p.name)
    if (!cls) continue
    const price = priceById[p.productId]
    if (price == null) continue
    const cur = byType[cls.type]
    if (!cur || price < cur.price) {
      byType[cls.type] = { type: cls.type, icon: cls.icon, packs: cls.packs, bonus: cls.bonus,
        name: p.name, price: Math.round(price * 100) / 100, tcgId: p.productId }
    }
  }
  // canonical display order
  const order = ['Booster Pack','Sleeved Pack','2-Pack Blister','3-Pack Blister','Mini Tin',
    'Booster Bundle','Elite Trainer Box','Premium Collection','Super-Premium Collection','Surprise Box','Booster Box']
  return Object.values(byType).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
}

// Build a whole Japanese set from TCGCSV category 85 (no pokemontcg.io equivalent).
// Cards carry real names/numbers/prices/images + engine-mapped rarities; sealed
// products are classified the same way as English sets.
async function fetchJapaneseSet(cfg) {
  const CAT = 'https://tcgcsv.com/tcgplayer/85'
  let prods, prices
  try {
    prods = (await getJSON(`${CAT}/${cfg.tcgGroup}/products`)).results || []
    prices = (await getJSON(`${CAT}/${cfg.tcgGroup}/prices`)).results || []
  } catch (e) {
    console.log(`    (JP fetch failed for group ${cfg.tcgGroup}: ${e.message})`)
    return null
  }
  const priceById = {}
  for (const pr of prices) {
    const m = pr.marketPrice ?? pr.midPrice
    if (m && priceById[pr.productId] == null) priceById[pr.productId] = Math.round(m * 100) / 100
  }
  const cards = []
  const byType = {}
  for (const p of prods) {
    const ext = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]))
    if (ext.Number) {
      const jpR = ext.Rarity || 'Common'
      cards.push({
        id: `${cfg.id}-${String(ext.Number).split('/')[0].replace(/^0+/, '') || '0'}`,
        name: p.cleanName || p.name,
        number: String(ext.Number).split('/')[0],
        rarity: JP_RARITY_MAP[jpR] || 'Common',
        supertype: 'Pokémon',
        img: p.imageUrl,
        imgLarge: p.imageUrl?.replace('_200w', '_400w') || p.imageUrl,
        price: priceById[p.productId] ?? null,
      })
    } else {
      const cls = classifyProduct(p.name)
      if (!cls) continue
      const price = priceById[p.productId]
      if (price == null) continue
      const cur = byType[cls.type]
      if (!cur || price < cur.price) byType[cls.type] = { ...cls, name: p.name, price, tcgId: p.productId }
    }
  }
  const order = ['Booster Pack','Sleeved Pack','2-Pack Blister','3-Pack Blister','Mini Tin',
    'Booster Bundle','Elite Trainer Box','Premium Collection','Super-Premium Collection','Surprise Box','Booster Box']
  const products = Object.values(byType).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
  return {
    id: cfg.id, name: cfg.name, series: cfg.series, releaseDate: cfg.releaseDate,
    printedTotal: cards.length, total: cards.length,
    logo: undefined, symbol: undefined, japanese: true,
    cards, products,
  }
}

async function main() {
  PA_KEY = await resolveApiKey()
  console.log(`Fetching ${EN_SETS.length} English sets from pokemon-api.com…`)

  const out = []
  for (const cfg of EN_SETS) {
    console.log(`  ${cfg.name} (${cfg.id}, ep ${cfg.ep})…`)
    const { cards, products: rawProducts, logo, series, releaseDate } = await fetchEnglishSet(cfg)

    // Per-field fallback: any card still missing a price → TCGCSV singles by number.
    const missing = cards.filter(c => c.price == null)
    if (missing.length && SET_GROUP[cfg.id]) {
      const singles = await fetchSingles(SET_GROUP[cfg.id])
      let filled = 0
      for (const c of missing) {
        const key = String(c.number).replace(/^0+/, '') || '0'
        if (singles[key] != null) { c.price = singles[key]; filled++ }
      }
      if (filled) console.log(`    singles fallback: filled ${filled}/${missing.length} from TCGCSV`)
    }

    let products = rawProducts
    // Prismatic SPC always ships the Eevee ex SIR (#167) as its guaranteed promo.
    if (cfg.id === 'sv8pt5') {
      const spc = products.find(p => p.type === 'Super-Premium Collection')
      if (spc) spc.fixedPromo = `${cfg.id}-167`
    }
    // Vintage sets sell ONE marked-up heavy pack via the Vault, never in the shop.
    if (cfg.vintage) {
      const vp = pickVintagePack(products)
      vp.name = vp.name?.includes('Base Set') ? `${cfg.name} Booster Pack` : (vp.name || `${cfg.name} Booster Pack`)
      products = [vp]
      console.log(`    vintage pack: ${vp.name} @ $${vp.price}`)
    } else {
      console.log(`    ${cards.length} cards, sealed: ${products.map(p => p.type).join(', ') || 'none'}`)
    }

    const priced = cards.filter(c => c.price != null).length
    const withPsa = cards.filter(c => c.psa).length
    console.log(`    ${cards.length} cards (${priced} priced, ${withPsa} w/ PSA comps)`)

    out.push({
      id: cfg.id,
      name: cfg.name,
      series: series || (cfg.vintage ? 'Vintage' : undefined),
      releaseDate,
      printedTotal: cards.length,
      total: cards.length,
      logo,
      symbol: undefined,
      vintage: cfg.vintage || undefined, // shop hides these; shown only at the Vintage Vault
      cards,
      products,
    })
    await new Promise(r => setTimeout(r, 200))
  }

  // Japanese-only sets (TCGCSV category 85 — no English release exists anywhere).
  for (const cfg of JP_SETS) {
    console.log(`  ${cfg.name} (${cfg.id}) [JP]…`)
    const jp = await fetchJapaneseSet(cfg)
    if (!jp) { console.log('    skipped (fetch failed)'); continue }
    const priced = jp.cards.filter(c => c.price != null).length
    console.log(`    ${jp.cards.length} cards (${priced} priced), sealed: ${jp.products.map(p => p.type).join(', ') || 'none'}`)
    out.push(jp)
    await new Promise(r => setTimeout(r, 300))
  }

  await mkdir('src/data', { recursive: true })
  await writeFile('src/data/sets.json', JSON.stringify({ fetchedAt: new Date().toISOString(), rareSlot: RARE_SLOT, reverseSlot: REVERSE_SLOT, sets: out }, null, 0))
  const totalCards = out.reduce((a, s) => a + s.cards.length, 0)
  const totalProd = out.reduce((a, s) => a + (s.products?.length || 0), 0)
  console.log(`Wrote src/data/sets.json — ${out.length} sets, ${totalCards} cards, ${totalProd} sealed products.`)
}

// Choose the vintage "heavy pack" product. Prefer a real sealed Booster Pack price;
// otherwise fall back to a market-plausible vintage pack ask (these run hundreds+).
// Always emits a single-pack product tagged `vintage` with a fat price tag.
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

main().catch(e => { console.error(e); process.exit(1) })
