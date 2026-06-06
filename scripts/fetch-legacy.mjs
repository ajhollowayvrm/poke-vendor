// Adds LEGACY WOTC-era Pokémon sets (1999–2002) to src/data/sets.json — built ENTIRELY
// from the FREE, no-auth TCGCSV API (category 3). These sets are flagged `vintage:true`
// so the shop hides them; they surface only at show vendors (the Vintage Vault sealed
// packs + booth singles). This script is ADDITIVE and idempotent: it merges/replaces only
// these legacy sets in sets.json and leaves every other set (and its prices) untouched, so
// it never touches the paid RapidAPI source. Run: node scripts/fetch-legacy.mjs
import { readFile, writeFile } from 'node:fs/promises'

const TCGCSV = 'https://tcgcsv.com/tcgplayer/3' // English Pokémon category
// The 10 classic WOTC sets not already in the data (Neo Genesis/Destiny, Legendary
// Collection, Aquapolis, Skyridge already come from the paid path — skipped to avoid dupes).
// `series` groups them on the Prices tab; `released` orders them oldest→newest in the data.
const LEGACY = [
  { id: 'base1leg', group: 604,  name: 'Base Set',             series: 'Base',  released: '1999-01-09' },
  { id: 'jungle',   group: 635,  name: 'Jungle',               series: 'Base',  released: '1999-06-16' },
  { id: 'fossil',   group: 630,  name: 'Fossil',               series: 'Base',  released: '1999-10-10' },
  { id: 'base2',    group: 605,  name: 'Base Set 2',           series: 'Base',  released: '2000-02-24' },
  { id: 'rocket',   group: 1373, name: 'Team Rocket',          series: 'Base',  released: '2000-04-24' },
  { id: 'gym1',     group: 1441, name: 'Gym Heroes',           series: 'Gym',   released: '2000-08-14' },
  { id: 'gym2',     group: 1440, name: 'Gym Challenge',        series: 'Gym',   released: '2000-10-16' },
  { id: 'neo2',     group: 1434, name: 'Neo Discovery',        series: 'Neo',   released: '2001-06-01' },
  { id: 'neo3',     group: 1389, name: 'Neo Revelation',       series: 'Neo',   released: '2001-09-21' },
  { id: 'ecard1',   group: 1375, name: 'Expedition',           series: 'E-Card', released: '2002-09-15' },
]

// WOTC TCGplayer rarity strings → engine rarities (RARITY_ORDER in engine.js).
// 'Holo Rare' is the era's chase (Base Charizard etc.) → Rare Holo; the handful of
// e-Card 'Secret Rare' (★-prefixed Crystals) ride the top vintage chase tier.
const RARITY = {
  'Common': 'Common', 'Uncommon': 'Uncommon', 'Rare': 'Rare',
  'Holo Rare': 'Rare Holo', 'Secret Rare': 'Special Illustration Rare',
}

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept': 'application/json' }
async function getJSON(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: UA })
    if (res.ok) return res.json()
    if (res.status === 429) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue }
    throw new Error(`${res.status} ${url}`)
  }
  throw new Error('too many retries ' + url)
}
const round2 = n => Math.round(n * 100) / 100

// Classify a sealed product by name → { type, packs, bonus, icon }. WOTC-era naming is
// simpler than modern (no ETBs/blisters); we recognize packs, boxes, and theme/starter
// decks. Returns null for things we don't sell (singles handled separately, plus cases,
// 2-player CDs, gift sets, etc.). Order matters: most specific first.
function classifySealed(name) {
  const n = name.toLowerCase()
  if (/\bcase\b|booster box case|booster display box$/.test(n)) return null // bulk cases — out of scope
  if (/booster box$/.test(n))                 return { type: 'Booster Box', icon: '🗃️', packs: 36, bonus: null }
  if (/booster pack/.test(n))                 return { type: 'Booster Pack', icon: '🎴', packs: 1, bonus: null }
  if (/(theme|starter) deck|2-player/.test(n)) return { type: 'Theme Deck', icon: '🎴', packs: 1, bonus: null }
  return null
}

// Vintage sealed prices on the secondary market are wild (a sealed Base Set box trades
// for six figures). Cap them so a single product can't be a game-breaking buy/flip and the
// numbers stay believable. Packs cap lower than boxes. (These are still very expensive.)
const PACK_CAP = 4000, BOX_CAP = 12000
function capSealed(type, price) {
  const cap = /Box/.test(type) ? BOX_CAP : PACK_CAP
  return Math.min(price, cap)
}

async function fetchLegacySet(cfg) {
  const prods = (await getJSON(`${TCGCSV}/${cfg.group}/products`)).results || []
  const prices = (await getJSON(`${TCGCSV}/${cfg.group}/prices`)).results || []
  // best (cheapest in-stock) market price per productId, by finish preference
  const FINISH_RANK = { 'Holofoil': 0, 'Normal': 1, 'Reverse Holofoil': 2, 'Unlimited': 1, '1st Edition': 0 }
  const bestById = {}
  for (const pr of prices) {
    const m = pr.marketPrice ?? pr.midPrice
    if (!m) continue
    const rank = FINISH_RANK[pr.subTypeName] ?? 9
    const cur = bestById[pr.productId]
    if (!cur || rank < cur.rank) bestById[pr.productId] = { price: m, rank }
  }
  const cards = []
  const byType = {}
  for (const p of prods) {
    const ext = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]))
    if (ext.Number) {
      const num = String(ext.Number).split('/')[0].replace(/^0+/, '') || '0'
      const best = bestById[p.productId]
      cards.push({
        id: `${cfg.id}-${num}`,
        name: p.cleanName || p.name,
        number: String(ext.Number).split('/')[0],
        rarity: RARITY[ext.Rarity] || 'Common',
        supertype: 'Pokémon',
        img: p.imageUrl,
        imgLarge: p.imageUrl?.replace('_200w', '_400w') || p.imageUrl,
        price: best ? round2(best.price) : null,
      })
    } else {
      const cls = classifySealed(p.name)
      if (!cls) continue
      const best = bestById[p.productId]
      if (!best) continue
      const price = capSealed(cls.type, round2(best.price))
      const cur = byType[cls.type]
      if (!cur || price < cur.price) byType[cls.type] = { ...cls, name: p.name, price, tcgId: p.productId }
    }
  }
  if (!cards.length) throw new Error(`no cards for ${cfg.name} (group ${cfg.group})`)
  // A vintage set is sold only via the Vintage Vault as ONE heavy single pack. Prefer the
  // real Booster Pack price; else a market-plausible vintage ask. (Mirrors pickVintagePack.)
  const realPack = Object.values(byType).find(p => p.packs === 1)
  const vintagePack = {
    type: 'Vintage Booster Pack', icon: '🗝️', packs: 1, bonus: null, vintage: true,
    name: realPack?.name || `${cfg.name} Booster Pack`,
    price: round2(realPack ? Math.max(realPack.price, 250) : 600),
    tcgId: realPack?.tcgId,
  }
  const priced = cards.filter(c => c.price != null).length
  return {
    id: cfg.id, name: cfg.name, series: cfg.series, releaseDate: cfg.released,
    printedTotal: cards.length, total: cards.length,
    logo: undefined, symbol: undefined, vintage: true,
    cards, products: [vintagePack],
    _priced: priced,
  }
}

async function main() {
  const path = 'src/data/sets.json'
  const data = JSON.parse(await readFile(path, 'utf8'))
  console.log(`Adding ${LEGACY.length} legacy WOTC sets from free TCGCSV…`)
  const built = []
  for (const cfg of LEGACY) {
    try {
      const set = await fetchLegacySet(cfg)
      console.log(`  ${cfg.name} (${cfg.id}, group ${cfg.group}): ${set.cards.length} cards (${set._priced} priced) · vault pack $${set.products[0].price}`)
      delete set._priced
      built.push(set)
    } catch (e) {
      console.log(`  ⚠️  ${cfg.name}: ${e.message} — skipped`)
    }
    await new Promise(r => setTimeout(r, 150))
  }
  // Merge: replace any existing entry with the same id, then append the rest. Leaves all
  // other sets (and their prices) exactly as they were — this never refetches them.
  const newIds = new Set(built.map(s => s.id))
  const kept = data.sets.filter(s => !newIds.has(s.id))
  data.sets = [...kept, ...built]
  await writeFile(path, JSON.stringify(data)) // keep the existing minified format
  const v = data.sets.filter(s => s.vintage).length
  console.log(`Wrote ${path} — ${data.sets.length} sets total (${v} vintage), added ${built.length} legacy.`)
}
main().catch(e => { console.error(e); process.exit(1) })
