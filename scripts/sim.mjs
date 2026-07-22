// Economy invariant sim — `npm run sim`
//
// Boots the real game (vite dev server + headless Chromium), imports the actual
// engine/store modules, and Monte-Carlos the money loops the design depends on:
//
//   1. RIP EV      — ripping sealed is -EV for every modern shop set ("the chase is
//                    the point"). A set whose packs pay out more than they cost is a
//                    balance regression.
//   2. GRADING EV  — gem odds match REAL modern-Pokémon PSA data (blind P10 ~24%), which
//                    makes grading a genuine, profitable business (blind EV > 0) — as it is
//                    in real life. The edge still ladders up: tools/pre-screen beat blind,
//                    and endgame fee discounts beat that. Gem odds stay in the real-world band.
//   3. REPACK EV   — show-floor mystery packs pay out LESS than they cost on average
//                    (a slot machine, not an ATM), across all three tiers.
//   4. LIQUIDATION — every instant exit (quick-sell, buylist, sealed flip) is a real
//                    haircut (< 1x market).
//   5. STORAGE     — the daily fee taxes ONLY the idle storeroom hoard: floor stock,
//                    listings, consignments, built packs, 🔒 keepsakes and held-for-a-
//                    regular are all exempt; the free allowance grows with a storefront;
//                    the Vault waives it entirely.
//
// Any violated invariant prints in red and the process exits nonzero, so this can run
// after balance changes as a regression gate.
import { spawn, execSync } from 'child_process'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright')

const PORT = 5178
const URL = `http://localhost:${PORT}/`

// --- boot the dev server ---------------------------------------------------------
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, shell: true, stdio: 'ignore', detached: false,
})
async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(URL); if (r.ok) return true } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

const failures = []
const pass = (name, ok, detail) => {
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

try {
  if (!(await waitForServer())) throw new Error('vite dev server did not come up')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(URL)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForTimeout(1200)

  // ---- 1. RIP EV per modern shop set ---------------------------------------------
  // N is large: pack value is fat-tailed (a rare chase dwarfs a whole box), so a small
  // sample swings wildly run-to-run. 5k packs keeps the mean stable enough to gate on.
  console.log('\nRIP EV (avg pack value / booster price, N=5000 packs per set) — want < 1.00:')
  const rip = await page.evaluate(async () => {
    const eng = await import('/src/game/engine.js')
    const out = []
    for (const s of eng.SHOP_SETS) {
      const booster = (s.products || []).find(p => p.packs === 1 && /booster pack/i.test(p.type || ''))
      if (!booster || !booster.price) continue
      const N = 5000
      let total = 0
      for (let i = 0; i < N; i++) for (const c of eng.openPack(s)) total += eng.cardValue(c)
      out.push({ set: s.name, price: booster.price, ev: total / N })
    }
    return out
  })
  for (const r of rip) {
    const ratio = r.ev / r.price
    pass(`${r.set}: EV $${r.ev.toFixed(2)} vs $${r.price.toFixed(2)} pack (${(ratio * 100).toFixed(0)}%)`, ratio < 1.0)
  }

  // ---- 2. Grading EV --------------------------------------------------------------
  console.log('\nGRADING EV ($100 comp-less NM card, N=40k rolls):')
  const grade = await page.evaluate(async () => {
    const eng = await import('/src/game/engine.js')
    const N = 40000
    const mk = (cut) => { const c = { uid: 't', id: 'none-1', name: 'T', rarity: 'Rare Holo', price: 100, condition: 'NM' }; if (cut != null) c._cut = cut; return c }
    const run = (luck, cut, fee) => {
      let sum = 0, tens = 0
      for (let i = 0; i < N; i++) {
        const g = eng.rollGrade(mk(cut), 'standard', luck).overall
        if (g === 10) tens++
        const c = mk(cut); c.grade = { overall: g }
        sum += eng.gradedValue(c)
      }
      return { ev: sum / N - 100 - fee, p10: tens / N }
    }
    return { blind: run(0, null, 60), tooled: run(0.13, 0.8, 60), endgame: run(0.13, 0.8, 8) }
  })
  // Gem odds are anchored to real modern-Pokémon PSA data (blind P10 ~18-30%), which makes
  // grading a real, profitable business (blind EV > 0) rather than a suppressed gamble. The
  // ladder still has to hold: pre-screen/tools beat blind, and endgame fee discounts beat that.
  pass(`blind standard: EV $${grade.blind.ev.toFixed(2)} (want > 0 — grading is a real business), P10 ${(grade.blind.p10 * 100).toFixed(1)}% (want 18-30%, real modern data)`,
    grade.blind.ev > 0 && grade.blind.p10 >= 0.18 && grade.blind.p10 <= 0.30)
  pass(`tooled standard: EV $${grade.tooled.ev.toFixed(2)} (want > blind — pre-screen is the edge)`, grade.tooled.ev > grade.blind.ev)
  pass(`endgame fees: EV $${grade.endgame.ev.toFixed(2)} (want > tooled)`, grade.endgame.ev > grade.tooled.ev)

  // ---- 3. Repack EV through the REAL store action ---------------------------------
  console.log('\nREPACK EV (real buyMysteryPack, N=500 per tier) — want payout/price < 1.00:')
  const repack = await page.evaluate(async () => {
    const eng = await import('/src/game/engine.js')
    const { useGame } = await import('/src/game/store/index.js')
    // representative tier configs straight from shows.js's pricing formulas
    const tiers = [
      { name: 'basic ($12)', price: 12, band: [3, 36] },          // [0.25p, 3p]
      { name: 'premium ($60)', price: 60, band: [21, 240] },      // [0.35p, 4p]
      { name: 'high roller ($400)', price: 400, band: [180, 1400] }, // [0.45p, 3.5p]
    ]
    const out = []
    for (const t of tiers) {
      let paid = 0, got = 0
      for (let i = 0; i < 500; i++) {
        useGame.setState({ cash: 10_000_000, collection: [], sealedInventory: [] })
        const res = useGame.getState().buyMysteryPack(t.price, t.band)
        if (!res) continue
        paid += t.price
        got += res.card ? eng.cardValue(res.card) : eng.sealedValue(res.sealed)
      }
      out.push({ name: t.name, ratio: got / paid })
    }
    return out
  })
  for (const r of repack) pass(`${r.name}: payout ${(r.ratio * 100).toFixed(0)}% of price`, r.ratio < 1.0)

  // ---- 4. Liquidation haircuts -----------------------------------------------------
  console.log('\nLIQUIDATION RATES — every instant exit < 1.00x market:')
  const rates = await page.evaluate(async () => {
    const { useGame } = await import('/src/game/store/index.js')
    const e = await import('/src/game/engine.js')
    const g = useGame.getState()
    return { quickSell: g.quickSellRate, bulkCredit: e.BULK_CREDIT_PER_CARD ?? null, flip: e.SEALED_FLIP_RATE ?? null }
  })
  pass(`quick-sell ${rates.quickSell}`, rates.quickSell > 0 && rates.quickSell <= 0.6)
  // Bulk isn't a cash exit anymore — it's a flat, small per-card STORE CREDIT (a nickel-ish).
  pass(`bulk credit ${rates.bulkCredit}/card`, rates.bulkCredit > 0 && rates.bulkCredit <= 0.25)
  if (rates.flip != null) pass(`sealed flip ${rates.flip}`, rates.flip > 0 && rates.flip < 1)

  // ---- 5. Storage fee targets only the idle hoard -----------------------------------
  // Pure-function checks against synthetic states: the fee must bite an idle storeroom
  // hoard and NOTHING else. If a future change quietly re-adds listings/keepsakes/floor
  // stock to heldUnits (the pre-2026-07 behavior), this is what catches it.
  console.log('\nSTORAGE FEE — idle storeroom sealed only:')
  const storage = await page.evaluate(async () => {
    const k = await import('/src/game/store/constants.js')
    const rows = (n, over = {}) => Array.from({ length: n }, (_, i) =>
      ({ uid: 'sim' + i, setId: 'x', product: { type: 'Booster Box', packs: 36, price: 150 }, loc: 'storeroom', ...over }))
    const S = (over = {}) => ({ upgrades: {}, sealedInventory: [], listings: [], consignments: [], builtPacks: [], ...over })
    return {
      freeBase: k.storageFreeUnits(S()),
      freeStore: k.storageFreeUnits(S({ upgrades: { storefront: true } })),
      perUnit: k.STORAGE_PER_UNIT,
      hoard: k.storageFee(S({ sealedInventory: rows(k.STORAGE_FREE_UNITS + 5) })),
      underStoreAllowance: k.storageFee(S({ upgrades: { storefront: true }, sealedInventory: rows(k.STORAGE_FREE_UNITS + 5) })),
      keepsakes: k.storageFee(S({ sealedInventory: rows(60, { locked: true }) })),
      floorStock: k.storageFee(S({ upgrades: { storefront: true }, sealedInventory: rows(200, { loc: 'floor' }) })),
      heldForRegular: k.storageFee(S({ sealedInventory: rows(60, { _heldFor: 'sim-regular' }) })),
      listings: k.storageFee(S({ listings: rows(60) })),
      consignments: k.storageFee(S({ consignments: rows(60) })),
      builtPacks: k.storageFee(S({ builtPacks: rows(60) })),
      vault: k.storageFee(S({ upgrades: { vault: true }, sealedInventory: rows(200) })),
    }
  })
  pass(`idle hoard bleeds: ${storage.freeBase + 5} storeroom boxes → $${storage.hoard}/day`, storage.hoard === 5 * storage.perUnit)
  pass(`storefront allowance: ${storage.freeBase} free → ${storage.freeStore} with a store (same hoard → $${storage.underStoreAllowance})`,
    storage.freeStore > storage.freeBase && storage.underStoreAllowance === 0)
  pass(`🔒 keepsakes exempt ($${storage.keepsakes})`, storage.keepsakes === 0)
  pass(`floor stock exempt ($${storage.floorStock})`, storage.floorStock === 0)
  pass(`held-for-a-regular exempt ($${storage.heldForRegular})`, storage.heldForRegular === 0)
  pass(`listings exempt ($${storage.listings})`, storage.listings === 0)
  pass(`consignments exempt ($${storage.consignments})`, storage.consignments === 0)
  pass(`built packs exempt ($${storage.builtPacks})`, storage.builtPacks === 0)
  pass(`🏛️ Vault waives all ($${storage.vault})`, storage.vault === 0)

  await browser.close()
} catch (e) {
  console.error('SIM ERROR:', e.message)
  failures.push('sim-crashed')
} finally {
  try { execSync(`taskkill /pid ${vite.pid} /T /F`, { stdio: 'ignore' }) } catch {}
}

console.log(failures.length ? `\n✗ ${failures.length} INVARIANT VIOLATION(S)` : '\n✓ ALL ECONOMY INVARIANTS HOLD')
process.exit(failures.length ? 1 : 0)
