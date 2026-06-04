// Fetches the latest Pokémon TCG sets + cards into src/data/sets.json
// Real data: pokemontcg.io (free, no key needed for modest use)
import { writeFile, mkdir } from 'node:fs/promises'

const API = 'https://api.pokemontcg.io/v2'
const NUM_SETS = 6 // most recent N sets become "buyable products"
// Sets we always include regardless of recency (fan-favorite chase product).
//   sv8pt5   — Prismatic Evolutions (the headline chase set)
//   rsv10pt5 — White Flare (SV-era companion to Black Bolt)
//   cel25    — Celebrations (25th-anniversary nostalgia set)
//   g1       — Generations (XY-era, classic Red/Blue feel)
const ALWAYS_INCLUDE = ['sv8pt5', 'rsv10pt5', 'cel25', 'g1', 'base1']
// Sets flagged `vintage` are NOT sold in the normal shop — they only surface via
// the rare "Vintage Vault" vendor that occasionally appears at higher-tier shows.
const VINTAGE_SETS = new Set(['base1']) // 1999 Base Set — the grail-tier heavy pack

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
  if (/sleeved booster pack$|checklane/.test(n))   return { type: 'Sleeved Pack', icon: '🛡️', packs: 1, bonus: null }
  if (/booster pack$/.test(n))              return { type: 'Booster Pack', icon: '🎴', packs: 1, bonus: null }
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
  console.log('Fetching latest sets…')
  const setsResp = await getJSON(`${API}/sets?orderBy=-releaseDate&pageSize=${NUM_SETS}`)
  const sets = setsResp.data

  // Ensure pinned sets are present (fetch their metadata if not already in the recent list).
  for (const id of ALWAYS_INCLUDE) {
    if (!sets.some(s => s.id === id)) {
      const r = await getJSON(`${API}/sets/${id}`)
      sets.push(r.data)
    }
  }

  const out = []
  for (const set of sets) {
    console.log(`  ${set.name} (${set.id})…`)
    let cards = []
    let page = 1
    while (true) {
      const r = await getJSON(`${API}/cards?q=set.id:${set.id}&pageSize=250&page=${page}`)
      cards = cards.concat(r.data)
      if (r.data.length < 250) break
      page++
    }
    const slim = cards.map(c => ({
      id: c.id,
      name: c.name,
      number: c.number,
      rarity: c.rarity || 'Common',
      supertype: c.supertype,
      img: c.images?.small,
      imgLarge: c.images?.large,
      // best available market price across finishes
      price: bestPrice(c),
    }))
    // Fallback: brand-new sets often have no prices on pokemontcg.io yet. Pull
    // real single-card prices from TCGCSV (same source as sealed) and fill the gaps.
    const missing = slim.filter(c => c.price == null).length
    if (missing && SET_GROUP[set.id]) {
      const singles = await fetchSingles(SET_GROUP[set.id])
      let filled = 0
      for (const c of slim) {
        if (c.price != null) continue
        const key = String(c.number).replace(/^0+/, '') || '0'
        if (singles[key] != null) { c.price = singles[key]; filled++ }
      }
      console.log(`    singles fallback: filled ${filled}/${missing} missing prices from TCGCSV`)
    }
    let products = await fetchSealed(SET_GROUP[set.id])
    // Set-specific fixed promos: the Prismatic Evolutions Super-Premium Collection
    // ALWAYS ships the Eevee ex Special Illustration Rare (#167 in this print) as its
    // bonus card, not a random hit. Tag the product so the engine mints that exact card.
    if (set.id === 'sv8pt5') {
      const spc = products.find(p => p.type === 'Super-Premium Collection')
      if (spc) spc.fixedPromo = `${set.id}-167`
    }
    // Vintage vault sets (1999 Base Set): pick the cheapest sealed pack TCGCSV has
    // (any finish) as the lone "heavy" vintage pack — a single unsearched 11-card
    // pack that can hold a Charizard. If TCGCSV has no clean pack price, fall back
    // to a market-realistic ask. These are never sold in the normal shop.
    if (VINTAGE_SETS.has(set.id)) {
      const vintagePack = pickVintagePack(products)
      products = [vintagePack]
      console.log(`    vintage pack: ${vintagePack.name || 'Base Set Pack'} @ $${vintagePack.price}`)
    } else if (products.length) {
      console.log(`    sealed: ${products.map(p => p.type).join(', ')}`)
    }
    out.push({
      id: set.id,
      name: set.name,
      series: set.series,
      releaseDate: set.releaseDate,
      printedTotal: set.printedTotal,
      total: set.total,
      logo: set.images?.logo,
      symbol: set.images?.symbol,
      vintage: VINTAGE_SETS.has(set.id) || undefined, // shop hides these; shown only at the Vintage Vault
      cards: slim,
      products, // real sealed product types + live market prices (TCGCSV)
    })
    await new Promise(r => setTimeout(r, 300))
  }

  // Japanese-only sets (TCGCSV category 85 — no pokemontcg.io equivalent).
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

// Choose the vintage "heavy pack" product. Prefer a real sealed Booster Pack price
// from TCGCSV; otherwise fall back to a market-plausible 1999 Base Set pack ask.
// Always emits a single-pack product tagged `vintage` with a fat price tag.
function pickVintagePack(products) {
  const realPack = products.find(p => p.packs === 1)
  const price = realPack ? Math.max(realPack.price, 250) : 600 // sealed Base packs run hundreds+
  return {
    type: 'Vintage Booster Pack', icon: '🗝️', packs: 1, bonus: null, vintage: true,
    name: realPack?.name || '1999 Base Set Booster Pack',
    price: Math.round(price * 100) / 100,
    tcgId: realPack?.tcgId,
  }
}

function bestPrice(c) {
  const tp = c.tcgplayer?.prices
  if (tp) {
    const finishes = ['holofoil', 'normal', 'reverseHolofoil', '1stEditionHolofoil', 'unlimitedHolofoil']
    for (const f of finishes) {
      const m = tp[f]?.market ?? tp[f]?.mid
      if (m) return Math.round(m * 100) / 100
    }
    // any finish
    for (const k of Object.keys(tp)) {
      const m = tp[k]?.market ?? tp[k]?.mid
      if (m) return Math.round(m * 100) / 100
    }
  }
  const cm = c.cardmarket?.prices
  if (cm?.averageSellPrice) return Math.round(cm.averageSellPrice * 100) / 100
  return null
}

main().catch(e => { console.error(e); process.exit(1) })
