// Fetch JAPANESE sets from TCGdex (https://api.tcgdex.net/v2/ja) and merge them into
// src/data/sets.json as a browse-only `japanese` + `extra` category (never shop-buyable — no
// sealed pricing, and they'd swamp the shop). Card data + images are reliable; PRICES come from
// Cardmarket (EUR→USD) and only ~half of JP cards have one — the rest fall back to a rarity
// estimate at runtime (engine estimateByRarity). Set ids are prefixed `jp-` so they never collide
// with the English catalog, and setIdOfCard still resolves (it slices at the LAST hyphen).
//
//   node scripts/fetch-japanese.mjs            # ALL 177 JP sets (~16k cards, slow)
//   ERA=modern node scripts/fetch-japanese.mjs # SV + Mega era only (~37 sets, ~5k cards)
//   ONLY=sv1a,sv8a node scripts/fetch-japanese.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const JA = 'https://api.tcgdex.net/v2/ja'
const EUR_USD = 1.08
const round2 = n => Math.round(n * 100) / 100
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); if (r.status === 404) return null } catch { /* retry */ }
    await sleep(300 * (i + 1))
  }
  return null
}

// TCGdex JP rarity → our RARITY_ORDER tier. TCGdex already anglicizes JP rarities; we normalize
// case and fold the JP-specific art/character tiers into the nearest engine tier. Unknowns log + Rare.
const RARITY_MAP = {
  'common': 'Common', 'uncommon': 'Uncommon', 'rare': 'Rare',
  'double rare': 'Double Rare', 'ace spec rare': 'ACE SPEC Rare',
  'illustration rare': 'Illustration Rare', 'special illustration rare': 'Special Illustration Rare',
  'ultra rare': 'Ultra Rare', 'hyper rare': 'Hyper Rare', 'shiny rare': 'Ultra Rare', 'shiny ultra rare': 'Hyper Rare',
  'radiant rare': 'Ultra Rare', 'amazing rare': 'Ultra Rare',
  'art rare': 'Illustration Rare', 'special art rare': 'Special Illustration Rare',
  'character rare': 'Illustration Rare', 'character super rare': 'Special Illustration Rare',
  'rare holo': 'Rare Holo', 'holo rare': 'Rare Holo',
  'rare holo v': 'Ultra Rare', 'rare holo vmax': 'Ultra Rare', 'rare holo vstar': 'Ultra Rare', 'rare holo gx': 'Ultra Rare',
  'rare holo ex': 'Ultra Rare', 'rare holo lv.x': 'Ultra Rare', 'rare ultra': 'Ultra Rare',
  'rare rainbow': 'Hyper Rare', 'rare secret': 'Special Illustration Rare', 'rare shiny': 'Special Illustration Rare',
  'rare shining': 'Hyper Rare', 'rare holo star': 'Hyper Rare', 'rare prime': 'Ultra Rare', 'legend': 'Hyper Rare',
  'rare break': 'Ultra Rare', 'rare prism star': 'Ultra Rare', 'classic collection': 'Special Illustration Rare',
  'unknown': 'Rare', 'none': 'Common', 'no rarity': 'Common', 'promo': 'Rare Holo',
  'mega hyper rare': 'Mega Hyper Rare', 'black white rare': 'Black White Rare',
}
const unknownRarities = new Set()
function mapRarity(r) {
  if (!r) return 'Common'
  const k = String(r).toLowerCase().trim()
  if (RARITY_MAP[k]) return RARITY_MAP[k]
  unknownRarities.add(r)
  return 'Rare'
}

function priceOf(pricing) {
  const cm = pricing?.cardmarket
  if (!cm) return null
  const eur = cm.avg7 ?? cm.avg30 ?? cm.trend ?? cm.avg ?? cm.averageSellPrice
  return eur != null ? round2(eur * EUR_USD) : null
}

async function fetchSet(brief) {
  const full = await getJSON(`${JA}/sets/${brief.id}`)
  if (!full?.cards?.length) return null
  const cards = []
  let priced = 0
  for (const bc of full.cards) {
    const j = await getJSON(`${JA}/cards/${bc.id}`)
    await sleep(25) // politeness
    const price = j ? priceOf(j.pricing) : null
    if (price != null) priced++
    const img = bc.image ? `${bc.image}/high.webp` : null
    cards.push({
      id: `jp-${bc.id}`,               // e.g. jp-SV1a-001 → setIdOfCard slices last '-' → "jp-SV1a"
      name: bc.name || j?.name || bc.localId,
      number: bc.localId,
      rarity: mapRarity(j?.rarity),
      price,
      img, imgLarge: img,
      foil: null, reverse: false, condition: null, grade: null,
    })
  }
  return {
    id: `jp-${brief.id}`,
    name: full.name || brief.name,
    series: 'Japanese',
    releaseDate: full.releaseDate || brief.releaseDate,
    printedTotal: full.cardCount?.official ?? cards.length,
    total: full.cardCount?.total ?? cards.length,
    logo: full.logo ? `${full.logo}.png` : undefined,
    symbol: full.symbol ? `${full.symbol}.png` : undefined,
    japanese: true,
    extra: true,        // browse-only: excluded from SHOP_SETS/distributors/Vault (see engine EXTRA_SETS)
    cards,
    products: [],
    _priced: priced,
  }
}

async function main() {
  const all = await getJSON(`${JA}/sets`)
  if (!all) { console.error('Could not list JP sets'); process.exit(1) }
  const onlyIds = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean)
  const era = process.env.ERA
  let todo = all
  if (onlyIds.length) todo = all.filter(s => onlyIds.includes(s.id))
  else if (era === 'modern') todo = all.filter(s => /^(SV|M)/i.test(s.id))
  console.log(`Fetching ${todo.length} Japanese sets from TCGdex (of ${all.length} total)…`)

  const out = []
  for (const brief of todo) {
    process.stdout.write(`  ${brief.name} (${brief.id})… `)
    try {
      const s = await fetchSet(brief)
      if (!s) { console.log('empty — skipped'); continue }
      console.log(`${s.cards.length} cards (${s._priced} priced)`)
      delete s._priced
      out.push(s)
    } catch (e) { console.log(`failed: ${e.message}`) }
  }

  // Merge-preserve into the existing snapshot.
  const here = dirname(fileURLToPath(import.meta.url))
  const path = join(here, '../src/data/sets.json')
  const meta = JSON.parse(await readFile(path, 'utf8'))
  const fetched = new Set(out.map(s => s.id))
  meta.sets = [...meta.sets.filter(s => !fetched.has(s.id)), ...out]
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(meta, null, 0))

  const jp = meta.sets.filter(s => s.japanese)
  const jpCards = jp.reduce((a, s) => a + s.cards.length, 0)
  const jpPriced = jp.reduce((a, s) => a + s.cards.filter(c => c.price != null).length, 0)
  console.log(`\nWrote ${out.length} JP sets. Total JP now: ${jp.length} sets, ${jpCards} cards (${Math.round(jpPriced / jpCards * 100)}% priced).`)
  if (unknownRarities.size) console.log(`Unmapped rarities (→ Rare): ${[...unknownRarities].join(', ')}`)
}
main().catch(e => { console.error(e); process.exit(1) })
