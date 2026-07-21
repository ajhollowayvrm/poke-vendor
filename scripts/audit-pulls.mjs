// Exhaustive pull-rate audit. For every rippable set it samples the REAL openPack path N times
// and reports the modeled per-rarity pull rate, special-subset + foil rates, hits/pack and rip EV,
// then flags structural problems that a shared rate ladder tends to hide:
//   • chase-orphan — the set HAS cards of a chase tier (SIR/Hyper/Mega/Black-White/ACE SPEC) but
//                    the modeled pull rate for it is ~0, so that chase never actually appears.
//   • config-ghost — the rate config assigns probability to a rarity the set has NO cards for
//                    (wasted odds; the slot silently downgrades).
//   • baseline     — the set has no explicit researched rate config (uses BASELINE_RATES).
//   • no-hits      — a rippable set produces essentially no hits per pack.
//
// Usage:  node scripts/audit-pulls.mjs [N]        (default N=6000 packs/set)
//         node scripts/audit-pulls.mjs 6000 flags (only print sets with a flag)
import { openPack, cardValue, cardsByRarity, RATED_SET_IDS, rateConfigFor, effectiveRates, isHit } from '../src/game/engine.js'
import setsData from '../src/data/sets.json' with { type: 'json' }

const N = Number(process.argv[2]) || 6000
const FLAGS_ONLY = process.argv.includes('flags')
const sets = setsData.sets

// Chase tiers we specifically want to guarantee actually appear when a set has them.
const CHASE_TIERS = ['Special Illustration Rare', 'Hyper Rare', 'Mega Hyper Rare', 'Black White Rare', 'ACE SPEC Rare', 'Illustration Rare', 'Ultra Rare', 'Double Rare']

function auditSet(s) {
  const byR = cardsByRarity(s)
  const has = r => (byR[r]?.length || 0) > 0
  const cfg = rateConfigFor(s.id)
  // sample
  const tierCount = {}   // rarity -> total pulled across N packs
  let hitPacks = 0, ev = 0
  for (let i = 0; i < N; i++) {
    const pack = openPack(s)
    let packHit = false
    for (const c of pack) {
      tierCount[c.rarity] = (tierCount[c.rarity] || 0) + 1
      ev += cardValue(c)
      if (isHit(c)) packHit = true
    }
    if (packHit) hitPacks++
  }
  const rate = r => (tierCount[r] || 0) / N
  const flags = []

  // chase-orphan: set HAS this chase tier's cards but NO slot in its effective config routes to it
  // (not in rare/reverse/chase, and not the ACE SPEC slot) — so the chase can never appear. This is
  // a deterministic config check, so a configured-but-brutal grail (Mega Hyper Rare 1 in 1260) is
  // correctly NOT flagged even if a finite sample happens to pull it zero times.
  const eff = effectiveRates(s.id)
  const routed = new Set([...(eff.rare || []), ...(eff.reverse || []), ...(eff.chase || [])].map(e => e.rarity))
  if (eff.aceSpec) routed.add('ACE SPEC Rare')
  // ...and it actually never pulls in the sample (so tiers covered by a SUBSET_SLOT — Trainer
  // Gallery / Shiny Vault, which show observed > 0 — are correctly NOT flagged).
  for (const t of CHASE_TIERS) {
    if (has(t) && !routed.has(t) && (tierCount[t] || 0) === 0) flags.push(`chase-orphan:${t}(has ${byR[t].length}, never pulls)`)
  }
  // config-ghost: rate config assigns odds to a rarity the set has NO cards for (odds wasted).
  if (cfg) {
    for (const slot of ['rare', 'reverse', 'chase']) {
      for (const e of (cfg[slot] || [])) if (!has(e.rarity)) flags.push(`config-ghost:${e.rarity}@${slot}`)
    }
  }
  if (hitPacks / N < 0.02) flags.push('no-hits')

  return {
    id: s.id, name: s.name, era: s.vintage ? 'V' : s.secondary ? 'S' : s.extra ? 'X' : 'shop',
    baseline: !RATED_SET_IDS.has(s.id),
    hitsPct: hitPacks / N, ev: ev / N,
    tiers: CHASE_TIERS.filter(has).map(t => `${t.split(' ').map(w=>w[0]).join('')}=${(rate(t)*100).toFixed(2)}%`),
    flags,
  }
}

const rippable = sets.filter(s => s.cards?.length && !s.extra && (s.products || []).some(p => (p.packs || 0) >= 1))
const rows = rippable.map(auditSet)

let flagged = 0
const baselineIds = rows.filter(r => r.baseline).map(r => r.id)
console.log(`Pull-rate audit — ${rippable.length} rippable sets, ${N} packs each\n`)
for (const r of rows.sort((a, b) => (b.flags.length - a.flags.length) || (a.era.localeCompare(b.era)))) {
  if (FLAGS_ONLY && !r.flags.length) continue
  if (r.flags.length) flagged++
  const base = r.baseline ? ' ·base' : ''
  const tag = r.flags.length ? `  ⚠️ ${r.flags.join('  ')}` : ''
  console.log(`[${r.era}${base}] ${r.id.padEnd(10)} ${r.name.padEnd(22)} hits ${(r.hitsPct*100).toFixed(0).padStart(3)}%  EV $${r.ev.toFixed(2).padStart(6)}  ${r.tiers.join(' ')}${tag}`)
}
console.log(`\n${flagged}/${rows.length} sets have a ⚠️ flag (chase-orphan / config-ghost / no-hits).`)
console.log(`${baselineIds.length} sets use BASELINE_RATES (no researched config): ${baselineIds.join(', ')}`)
console.log('Legend: era [shop|S=secondary|V=vintage] ·base=no explicit rate config.')
