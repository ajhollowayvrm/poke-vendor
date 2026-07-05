// Economy invariant sim — `npm run sim`
//
// Boots the real game (vite dev server + headless Chromium), imports the actual
// engine/store modules, and Monte-Carlos the money loops the design depends on:
//
//   1. RIP EV      — ripping sealed is -EV for every modern shop set ("the chase is
//                    the point"). A set whose packs pay out more than they cost is a
//                    balance regression.
//   2. GRADING EV  — a blind standard-fee submission is a gamble (EV <= ~0), and the
//                    edge comes from tools: loupe + good cut + fee discounts flip it
//                    positive. Gem odds stay in the designed band.
//   3. REPACK EV   — show-floor mystery packs pay out LESS than they cost on average
//                    (a slot machine, not an ATM), across all three tiers.
//   4. LIQUIDATION — every instant exit (quick-sell, buylist, sealed flip) is a real
//                    haircut (< 1x market).
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
  pass(`blind standard: EV $${grade.blind.ev.toFixed(2)} (want <= 0), P10 ${(grade.blind.p10 * 100).toFixed(1)}% (want 5-10%)`,
    grade.blind.ev <= 0 && grade.blind.p10 >= 0.05 && grade.blind.p10 <= 0.10)
  pass(`tooled standard: EV $${grade.tooled.ev.toFixed(2)} (want > 0)`, grade.tooled.ev > 0)
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
    const c = await import('/src/game/store/constants.js')
    const g = useGame.getState()
    return { quickSell: g.quickSellRate, buylist: g.buylistRate, flip: c.SEALED_FLIP_RATE ?? null }
  })
  pass(`quick-sell ${rates.quickSell}`, rates.quickSell > 0 && rates.quickSell <= 0.6)
  pass(`buylist ${rates.buylist}`, rates.buylist > 0 && rates.buylist <= 0.5)
  if (rates.flip != null) pass(`sealed flip ${rates.flip}`, rates.flip > 0 && rates.flip < 1)

  await browser.close()
} catch (e) {
  console.error('SIM ERROR:', e.message)
  failures.push('sim-crashed')
} finally {
  try { execSync(`taskkill /pid ${vite.pid} /T /F`, { stdio: 'ignore' }) } catch {}
}

console.log(failures.length ? `\n✗ ${failures.length} INVARIANT VIOLATION(S)` : '\n✓ ALL ECONOMY INVARIANTS HOLD')
process.exit(failures.length ? 1 : 0)
