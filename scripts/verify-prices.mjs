// Cross-check our stored card prices (TCGCSV/TCGplayer) against TCGdex as an independent source.
// Focuses on HIGH-VALUE cards (where a wrong price actually matters) across shop + secondary sets.
// Reports the agreement rate and flags outliers — it does NOT overwrite (markets/finishes differ;
// this is a data-quality signal, not an auto-correct). TCGdex price = tcgplayer USD market, else
// Cardmarket EUR→USD.
//   node scripts/verify-prices.mjs [minValue=15] [perSet=6]
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const EN = 'https://api.tcgdex.net/v2/en'
const EUR_USD = 1.08
const round2 = n => Math.round(n * 100) / 100
const sleep = ms => new Promise(r => setTimeout(r, ms))
const MIN = Number(process.argv[2]) || 15
const PER_SET = Number(process.argv[3]) || 6

// our set id → TCGdex set id (only the ones that differ; mirrors fetch-data.mjs)
const TCGDEX_ID = { me5:'me05', me4:'me04', me3:'me03', me2pt5:'me02.5', me2:'me02', me1:'me01',
  zsv10pt5:'sv10.5b', rsv10pt5:'sv10.5w', sv8pt5:'sv08.5', sv3pt5:'sv03.5', base6:'lc' }

async function getJSON(url) { try { const r = await fetch(url); return r.ok ? r.json() : null } catch { return null } }
const idxCache = {}
async function setIndex(setId) {
  if (idxCache[setId]) return idxCache[setId]
  const j = await getJSON(`${EN}/sets/${TCGDEX_ID[setId] || setId}`)
  const byNum = {}
  for (const c of (j?.cards || [])) { const n = String(c.localId).replace(/^0+(?=\d)/, '') || c.localId; byNum[n] = c.id }
  return (idxCache[setId] = byNum)
}
async function tcgdexPrice(setId, number) {
  const idx = await setIndex(setId)
  const id = idx[String(number).replace(/^0+(?=\d)/, '') || number]
  if (!id) return null
  const j = await getJSON(`${EN}/cards/${id}`)
  const tp = j?.pricing?.tcgplayer
  if (tp) { let best = null; for (const [k, v] of Object.entries(tp)) { if (k === 'unit' || k === 'updated') continue; const m = v?.marketPrice; if (m != null && m > (best ?? 0)) best = m } if (best != null) return round2(best) }
  const cm = j?.pricing?.cardmarket
  const eur = cm?.avg7 ?? cm?.avg30 ?? cm?.trend ?? cm?.avg
  return eur != null ? round2(eur * EUR_USD) : null
}

const here = dirname(fileURLToPath(import.meta.url))
const sets = JSON.parse(await readFile(join(here, '../src/data/sets.json'), 'utf8')).sets
  .filter(s => !s.extra && !s.japanese)

let checked = 0, agree = 0, noRef = 0
const outliers = []
for (const s of sets) {
  const top = s.cards.filter(c => (c.price ?? 0) >= MIN).sort((a, b) => b.price - a.price).slice(0, PER_SET)
  for (const c of top) {
    const ref = await tcgdexPrice(s.id, c.number)
    await sleep(25)
    if (ref == null) { noRef++; continue }
    checked++
    const ratio = c.price / ref
    if (ratio >= 0.5 && ratio <= 2.0) agree++
    else outliers.push({ set: s.name, id: c.id, name: c.name, ours: c.price, ref, ratio: round2(ratio) })
  }
}

outliers.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)))
console.log(`Price cross-check vs TCGdex — cards ≥ $${MIN}, top ${PER_SET}/set, ${sets.length} sets`)
console.log(`  checked ${checked} (with a TCGdex reference), ${noRef} had no reference`)
console.log(`  within 0.5x–2x of TCGdex: ${agree}/${checked} (${checked ? Math.round(agree / checked * 100) : 0}%)`)
console.log(`\n${outliers.length} outliers (|ratio| outside 0.5x–2x), worst first:`)
for (const o of outliers.slice(0, 40)) console.log(`  ${o.ratio}x  ours $${o.ours} vs tcgdex $${o.ref}  ${o.name} (${o.id}) [${o.set}]`)
