// Fetch JAPANESE sets and merge them into src/data/sets.json as a browse-only `japanese` +
// `extra` category (never shop-buyable — no sealed pricing, and they'd swamp the shop).
//
// DATA FLOW (hybrid, decided 2026-07-21):
//   • PRICES + STRUCTURE + ENGLISH NAMES  ← JustTCG (game=pokemon-japan), the authoritative spine.
//     Real TCGplayer-market prices ($590 for a JP 151 Master Ball Gengar, etc). Needs a free API key.
//   • CARD IMAGES  ← TCGdex (api.tcgdex.net/v2/ja), used purely as an image dictionary keyed by
//     card NUMBER. No name matching (TCGdex names are Japanese, JustTCG's are English) — we just fill
//     a URL template from the card's number. Pattern-parallel chases TCGdex doesn't catalog fall back
//     to the base card's art (still the right Pokémon, wrong foil pattern) — acceptable, browse-only.
//
// We only fetch the INTERSECTION of JustTCG modern (SV + Mega) sets and TCGdex sets, so every card
// gets art. Set ids are `jp-`prefixed (never collide with English), the LOCAL suffix is hyphen-free
// so engine setIdOfCard() (slices at the LAST '-') resolves them.
//
//   JUSTTCG_KEY=xxx node scripts/fetch-japanese.mjs            # modern (SV+Mega) intersection
//   JUSTTCG_KEY=xxx ONLY=SV2a,M2a node scripts/fetch-japanese.mjs
//   JUSTTCG_KEY=xxx MAX_CALLS=90 node scripts/fetch-japanese.mjs  # cap daily JustTCG calls (free tier = 100/day)
//
// Free tier = 100 calls/day, 20 cards/call → modern era (~5k cards) is a ~3-day RESUMABLE job:
// rerun daily, sets already priced in sets.json are skipped, so it picks up where it left off.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.JUSTTCG_KEY
if (!KEY) { console.error('Set JUSTTCG_KEY (free key from justtcg.com). Never commit it — this repo auto-pushes.'); process.exit(1) }

const JT = 'https://api.justtcg.com/v1'
const JA = 'https://api.tcgdex.net/v2/ja'
const GAME = 'pokemon-japan'
const PAGE = 20                               // free-tier max cards/call
const CALL_GAP = Number(process.env.CALL_GAP || 350)  // ms between JustTCG calls (free tier throttles ~10/s but bursts 429)
const STOP_AT = Number(process.env.STOP_AT || 3)      // stop when this few daily calls remain
const MAX_CALLS = Number(process.env.MAX_CALLS || 500)// safety cap only (real limit is the server daily quota)
const round2 = n => Math.round(n * 100) / 100
const sleep = ms => new Promise(r => setTimeout(r, ms))

let okCalls = 0                               // successful JustTCG calls this run
let dailyRemaining = Infinity                 // server-reported daily quota left (authoritative)

async function tcgdex(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); if (r.status === 404) return null } catch { /* retry */ }
    await sleep(300 * (i + 1))
  }
  return null
}

// One JustTCG call. Returns parsed json on success; throws 'justtcg-failed' if it can't get a 200
// after retries (caller treats the whole set as failed, not silently empty). Honors Retry-After.
async function justtcg(path, tries = 12) {
  for (let i = 0; i < tries; i++) {
    let r
    try { r = await fetch(`${JT}${path}`, { headers: { 'x-api-key': KEY } }) }
    catch { await sleep(1000 * (i + 1)); continue }
    const j = await r.json().catch(() => null)
    const md = j?._metadata
    if (md?.apiDailyRequestsRemaining != null) dailyRemaining = md.apiDailyRequestsRemaining
    if (r.ok) { okCalls++; return j }
    if (r.status === 429) {                                        // rate limited (doesn't count vs quota) — wait it out
      const ra = Number(r.headers.get('retry-after')) || Math.min(2 + i, 12)
      await sleep(ra * 1000)
      continue
    }
    throw new Error(`justtcg ${r.status}: ${j?.error || ''}`)
  }
  throw new Error('justtcg-failed')
}

// JustTCG rarity → our RARITY_ORDER tier (JP vocab: SR/RR/AR/SAR/UR + the SV/SWSH English tiers).
const RARITY_MAP = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
  'double rare': 'Double Rare', 'ace spec rare': 'ACE SPEC Rare', 'ace rare': 'ACE SPEC Rare',
  'illustration rare': 'Illustration Rare', 'special illustration rare': 'Special Illustration Rare',
  'art rare': 'Illustration Rare', 'special art rare': 'Special Illustration Rare',
  'character rare': 'Illustration Rare', 'character super rare': 'Special Illustration Rare',
  'ultra rare': 'Ultra Rare', 'super rare': 'Ultra Rare', 'hyper rare': 'Hyper Rare',
  'shiny rare': 'Ultra Rare', 'shiny super rare': 'Special Illustration Rare', 'shiny ultra rare': 'Hyper Rare',
  // SV4a (Shiny Treasure ex) surfaced this one unmapped, where it fell through to plain 'Rare'.
  // Mirrors the existing 'rare secret' mapping — a secret rare is never a base Rare.
  'shiny secret rare': 'Special Illustration Rare',
  'radiant rare': 'Ultra Rare', 'amazing rare': 'Ultra Rare',
  'rare holo': 'Rare Holo', 'holo rare': 'Rare Holo', 'rare holo ex': 'Ultra Rare',
  'rare rainbow': 'Hyper Rare', 'rare secret': 'Special Illustration Rare',
  'mega hyper rare': 'Mega Hyper Rare', 'black white rare': 'Black White Rare',
  promo: 'Rare Holo', unknown: 'Rare', none: 'Common', 'no rarity': 'Common', '': 'Common',
}
const unknownRarities = new Set()
function mapRarity(r) {
  const k = String(r || '').toLowerCase().trim()
  if (RARITY_MAP[k]) return RARITY_MAP[k]
  if (k) unknownRarities.add(r)
  return 'Rare'
}

// A JustTCG card carries printing/condition variants. Pick a representative raw price: Near-Mint,
// base (not 1st-edition) printing, current market with avg fallbacks.
function pickPrice(variants) {
  if (!variants?.length) return null
  const nm = variants.filter(v => /near mint/i.test(v.condition || ''))
  const pool = nm.length ? nm : variants
  const base = pool.filter(v => !/1st edition/i.test(v.printing || ''))
  const v = (base.length ? base : pool)[0]
  const p = v?.price ?? v?.avgPrice ?? v?.avgPrice30d ?? null
  return p != null ? round2(p) : null
}

// Pattern-parallel qualifier (Master Ball / Poké Ball) → a hyphen-free id tag distinguishing it from
// the base card that shares its printed number. Empty for normal cards.
function patternTag(name) {
  const m = /\(([^)]*pattern[^)]*)\)/i.exec(name || '')
  if (!m) return ''
  if (/master\s*ball/i.test(m[1])) return 'MB'
  if (/poke|poké/i.test(m[1])) return 'PB'
  return 'PT'
}
const numerator = num => String(num || '').split('/')[0].trim()          // "094/165" → "094"

// Build a NUMBER→image-base dict from a TCGdex set (keyed by localId, both padded + int form).
async function tcgdexImages(tcgdexId) {
  const s = await tcgdex(`${JA}/sets/${tcgdexId}`)
  if (!s?.cards) return { imgByNum: new Map(), set: null }
  const imgByNum = new Map()
  for (const c of s.cards) {
    if (!c.image) continue
    imgByNum.set(c.localId, c.image)
    const n = parseInt(c.localId, 10)
    if (!Number.isNaN(n)) imgByNum.set(String(n), c.image)
  }
  return { imgByNum, set: s }
}

async function fetchSet(pair) {
  const { tcgdexId, jtId, jtName } = pair
  const { imgByNum, set: tset } = await tcgdexImages(tcgdexId)

  // Page through every JustTCG card in this set.
  const jcards = []
  for (let offset = 0; ; offset += PAGE) {
    if (okCalls >= MAX_CALLS || dailyRemaining <= STOP_AT) throw new Error('budget')
    const j = await justtcg(`/cards?game=${GAME}&set=${encodeURIComponent(jtId)}&limit=${PAGE}&offset=${offset}`)
    await sleep(CALL_GAP)
    if (!j?.data?.length) break
    jcards.push(...j.data)
    if (!j.meta?.hasMore) break
  }
  if (!jcards.length) return null

  const usedIds = new Set()
  let priced = 0, art = 0
  // Keep singles only — JustTCG lists sealed (Booster Box/Pack, File Sets) with number "N/A".
  const cards = jcards.filter(jc => /^\d+$/.test(numerator(jc.number))).map(jc => {
    const num = numerator(jc.number)
    const tag = patternTag(jc.name)
    let suffix = (num || 'x') + tag                                       // hyphen-free local part
    while (usedIds.has(suffix)) suffix += 'x'                             // guarantee uniqueness
    usedIds.add(suffix)
    const base = imgByNum.get(num) || imgByNum.get(String(parseInt(num, 10)))
    const img = base ? `${base}/high.webp` : null
    const price = pickPrice(jc.variants)
    if (price != null) priced++
    if (img) art++
    return {
      id: `jp-${tcgdexId}-${suffix}`,          // jp-SV2a-094 / jp-SV2a-094MB → setIdOfCard → jp-SV2a
      name: jc.name,
      number: jc.number,
      rarity: mapRarity(jc.rarity),
      price,
      img, imgLarge: img,
      foil: null, reverse: false, condition: null, grade: null,
    }
  })

  return {
    id: `jp-${tcgdexId}`,
    name: jtName || tset?.name || tcgdexId,
    series: 'Japanese',
    releaseDate: tset?.releaseDate || null,
    printedTotal: tset?.cardCount?.official ?? cards.length,
    total: tset?.cardCount?.total ?? cards.length,
    logo: tset?.logo ? `${tset.logo}.png` : undefined,
    symbol: tset?.symbol ? `${tset.symbol}.png` : undefined,
    japanese: true,
    extra: true,                               // browse-only (see engine EXTRA_SETS)
    cards,
    products: [],
    _priced: priced, _art: art,
  }
}

async function main() {
  // TCGdex modern (SV + Mega) sets — the image + canonical-id source.
  const tsets = (await tcgdex(`${JA}/sets`)) || []
  const modern = tsets.filter(s => /^(SV|M)/.test(s.id))
  // JustTCG JP sets — the price + structure source.
  const jlist = await justtcg(`/sets?game=${GAME}&limit=500`)
  if (!jlist?.data) { console.error('Could not list JustTCG JP sets'); process.exit(1) }
  const jtByCode = new Map()                   // "sv2a" → { id, name }
  for (const s of jlist.data) jtByCode.set(s.id.split('-')[0].toLowerCase(), { id: s.id, name: s.name })

  // Intersect by set code (TCGdex "SV2a" ↔ JustTCG "sv2a-…"). Only matched sets are fetched (art guaranteed).
  let pairs = modern
    .map(s => { const j = jtByCode.get(s.id.toLowerCase()); return j ? { tcgdexId: s.id, jtId: j.id, jtName: j.name } : null })
    .filter(Boolean)

  // ONLY=a,b,c is a PRIORITY list, not just a filter: fetch in the order given, so when the daily
  // quota runs out mid-run the sets you actually wanted are the ones that landed.
  const onlyIds = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean)
  if (onlyIds.length) {
    const rank = new Map(onlyIds.map((id, i) => [id.toLowerCase(), i]))
    pairs = pairs.filter(p => rank.has(p.tcgdexId.toLowerCase()))
                 .sort((a, b) => rank.get(a.tcgdexId.toLowerCase()) - rank.get(b.tcgdexId.toLowerCase()))
    const missing = onlyIds.filter(id => !pairs.some(p => p.tcgdexId.toLowerCase() === id.toLowerCase()))
    if (missing.length) console.log(`ONLY ids with no TCGdex↔JustTCG match (skipped): ${missing.join(', ')}\n`)
  }

  // Resume: skip sets already priced in the snapshot.
  const here = dirname(fileURLToPath(import.meta.url))
  const path = join(here, '../src/data/sets.json')
  const meta = JSON.parse(await readFile(path, 'utf8'))
  const donePriced = new Set(meta.sets.filter(s => s.japanese && s.cards?.some(c => c.price != null)).map(s => s.id))
  const todo = onlyIds.length ? pairs : pairs.filter(p => !donePriced.has(`jp-${p.tcgdexId}`))  // ONLY forces re-fetch

  console.log(`JP modern intersection: ${pairs.length} sets (${jlist.data.length} JustTCG JP sets, ${modern.length} TCGdex SV/M).`)
  console.log(`Already priced: ${donePriced.size}. To fetch now: ${todo.length}. Budget: ${MAX_CALLS} calls.\n`)
  const unmatched = modern.filter(s => !jtByCode.get(s.id.toLowerCase()))
  if (unmatched.length) console.log(`No JustTCG price counterpart (skipped): ${unmatched.map(s => s.id).join(', ')}\n`)

  const out = []
  let stopped = false
  for (const p of todo) {
    process.stdout.write(`  ${p.jtName} (${p.tcgdexId})… `)
    try {
      const s = await fetchSet(p)
      if (!s) { console.log('empty — skipped'); continue }
      console.log(`${s.cards.length} cards (${s._priced} priced, ${s._art} art)  [${dailyRemaining} calls left today]`)
      delete s._priced; delete s._art
      out.push(s)
    } catch (e) {
      if (e.message === 'budget') { console.log('— daily budget reached, stopping (rerun tomorrow to resume)'); stopped = true; break }
      console.log(`failed: ${e.message}`)
    }
  }

  // Merge-preserve into the snapshot.
  const fetched = new Set(out.map(s => s.id))
  meta.sets = [...meta.sets.filter(s => !fetched.has(s.id)), ...out]
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(meta, null, 0))

  const jp = meta.sets.filter(s => s.japanese)
  const jpCards = jp.reduce((a, s) => a + s.cards.length, 0)
  const jpPriced = jp.reduce((a, s) => a + s.cards.filter(c => c.price != null).length, 0)
  console.log(`\nWrote ${out.length} JP sets this run (${okCalls} JustTCG calls). Total JP: ${jp.length} sets, ${jpCards} cards (${jpCards ? Math.round(jpPriced / jpCards * 100) : 0}% priced).`)
  if (stopped) console.log('Daily budget hit — rerun the same command tomorrow to fetch the rest.')
  if (unknownRarities.size) console.log(`Unmapped rarities (→ Rare): ${[...unknownRarities].join(', ')}`)
}
main().catch(e => { console.error(e); process.exit(1) })
