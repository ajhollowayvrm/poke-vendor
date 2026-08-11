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
//                    regular are all exempt; loose packs rack 36-to-a-tray (a box's worth
//                    of shelf, not 36 units); the free allowance grows with a storefront;
//                    the Vault waives it entirely.
//
// Any violated invariant prints in red and the process exits nonzero, so this can run
// after balance changes as a regression gate.
import { spawn, execSync } from 'child_process'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

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
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
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

  // ---- 1b. 🎌 JP import rip EV ----------------------------------------------------
  // The Import License shelf (JP_SHOP_SETS) prices sealed OFF the set's own singles EV
  // (jpPackEV × 30 / 0.78 per box), so ripping imports must stay -EV too — closer to
  // break-even than English product (that's the import play), but never over the line.
  console.log('\n🎌 JP IMPORT RIP EV (5-card packs, N=5000 per set) — want < 1.00:')
  const jpRip = await page.evaluate(async () => {
    const eng = await import('/src/game/engine.js')
    const out = []
    for (const s of eng.JP_SHOP_SETS) {
      const booster = eng.setProducts(s).find(p => p.packs === 1)
      if (!booster?.price) continue
      const N = 5000
      let total = 0
      for (let i = 0; i < N; i++) for (const c of eng.openPack(s)) total += eng.cardValue(c)
      out.push({ set: s.name, price: booster.price, ev: total / N })
    }
    return out
  })
  for (const r of jpRip) {
    const ratio = r.ev / r.price
    pass(`${r.set}: EV $${r.ev.toFixed(2)} vs $${r.price.toFixed(2)} pack (${(ratio * 100).toFixed(0)}%)`, ratio < 1.0)
  }
  // The shelf must actually be stocked — a data regression that empties JP_SHOP_SETS would
  // otherwise "pass" this section by testing nothing.
  pass(`import shelf is stocked (${jpRip.length} JP sets rippable)`, jpRip.length >= 3)

  // JP singles must actually CIRCULATE, not just sit on the import shelf. cardInValueRange is
  // the one funnel every "a card appears" path runs through (vendor bins, wants, offers,
  // encounters, shop requests), so sampling it measures the whole world at once. A refactor
  // that drops the import roll, or data where no JP card lands in a common band, silently
  // un-ships the feature — this is the tripwire.
  const jpMix = await page.evaluate(async () => {
    const eng = await import('/src/game/engine.js')
    const bands = [[1, 20], [20, 120], [120, 600]]
    const out = {}
    for (const [lo, hi] of bands) {
      let jp = 0
      const N = 3000
      for (let i = 0; i < N; i++) if (/^jp-/.test(eng.setIdOfCard(eng.cardInValueRange(lo, hi)) || '')) jp++
      out[`$${lo}-${hi}`] = jp / N
    }
    return { mix: out, rate: eng.JP_WORLD_RATE }
  })
  for (const [band, share] of Object.entries(jpMix.mix)) {
    // Want it near JP_WORLD_RATE: present everywhere, dominant nowhere.
    pass(`🎌 imports circulate in ${band}: ${(share * 100).toFixed(1)}% of draws (want 3-25%)`,
      share >= 0.03 && share <= 0.25)
  }

  // ---- 1c. 🛒 Shop scarcity + the scalper premium -----------------------------------
  // There is deliberately NO MSRP channel (the Pokémon Center shelf was removed 2026-08-10:
  // IRL it sells out to bots before a shop owner gets one). A fresh drop is bought at market
  // PLUS the hype surge, everywhere — so the old below-market arbitrage must never come back,
  // and the in-print window keeps the shop a rotating shelf rather than a warehouse.
  console.log('\n🛒 SHOP SCARCITY:')
  const shop = await page.evaluate(async () => {
    const eng = await import('/src/game/engine.js')
    const cat = id => eng.distributorCatalog(eng.distributorById(id), eng.SHOP_SETS, 3).length
    // Cheapest zero-rapport ask on the NEWEST set across every English seller, as a share of
    // the market number — if any shelf sells the fresh drop below market, the printer is back.
    const newest = eng.IN_PRINT_SETS[0]
    let minRatio = Infinity
    for (const id of ['lgs', 'tcgplayer', 'amazon', 'dna']) {
      const d = eng.distributorById(id)
      for (const p of eng.setProducts(newest)) {
        if (!p.price) continue
        minRatio = Math.min(minRatio, eng.distributorPrice(d, p.price, 0, { product: p, set: newest }) / p.price)
      }
    }
    return { inPrint: eng.IN_PRINT_SETS.length, outOfPrint: eng.OUT_OF_PRINT_SETS.length,
      lgs: cat('lgs'), tcg: cat('tcgplayer'), amazon: cat('amazon'), total: eng.SHOP_SETS.length,
      newestName: newest.name, minRatio,
      pcGone: !eng.DISTRIBUTORS.some(d => d.msrp || d.id === 'pokecenter') }
  })
  pass(`in-print window is a rotating shelf, not a catalogue (${shop.inPrint} in print, ${shop.outOfPrint} out)`,
    shop.inPrint >= 4 && shop.inPrint <= 10)
  pass(`the local shop is a local shop (${shop.lgs} sets on the shelf)`, shop.lgs <= 3)
  pass(`no retailer carries everything (biggest catalogue ${Math.max(shop.lgs, shop.tcg, shop.amazon)} of ${shop.total} sets)`,
    Math.max(shop.lgs, shop.tcg, shop.amazon) < shop.total)
  pass(`no MSRP printer: cheapest fresh-drop ask (${shop.newestName}) is ${(shop.minRatio * 100).toFixed(0)}% of market (want ≥ 100%)`,
    shop.pcGone && shop.minRatio >= 1 - 1e-9)

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
    // Read the fees from the REAL fee table rather than hardcoding them — a hardcoded 60/8 kept
    // passing this gate after GRADING was repriced, which is precisely the regression the gate
    // exists to catch. `blind`/`tooled` pay list; `endgame` is the platinum-loyalty + deep-bulk
    // rate a late-game player actually pays. A $100 card sits under every tier's declared-value
    // ceiling, so this measures the sticker path (the value premium is exercised separately).
    // Freight counts. It's charged per SUBMISSION, so a lone card pays the whole round trip
    // while a 50-card batch barely notices it — costing the blind case at the per-card fee
    // alone was flattering grading by the price of a parcel.
    const one = [mk(null)]
    const shipOne = eng.gradingShipping(one, {})
    const shipBatch = eng.gradingShipping(Array.from({ length: 50 }, () => mk(0.8)), {}) / 50
    const listFee = eng.gradingFee('standard', 0, 1) + shipOne
    const endgameFee = eng.gradingFee('standard', 250, 50) + shipBatch
    return { blind: run(0, null, listFee), tooled: run(0.13, 0.8, listFee), endgame: run(0.13, 0.8, endgameFee),
             fees: { list: listFee, endgame: endgameFee, shipOne, shipBatch } }
  })
  // Gem odds are anchored to real modern-Pokémon PSA data (blind P10 ~18-30%), which makes
  // grading a real, profitable business (blind EV > 0) rather than a suppressed gamble. The
  // ladder still has to hold: pre-screen/tools beat blind, and endgame fee discounts beat that.
  console.log(`  (live from GRADING, freight included: one card $${grade.fees.list.toFixed(2)} incl $${grade.fees.shipOne.toFixed(2)} freight · endgame/card $${grade.fees.endgame.toFixed(2)} incl $${grade.fees.shipBatch.toFixed(2)})`)
  pass(`blind standard: EV $${grade.blind.ev.toFixed(2)} (want > 0 — grading is a real business), P10 ${(grade.blind.p10 * 100).toFixed(1)}% (want 18-30%, real modern data)`,
    grade.blind.ev > 0 && grade.blind.p10 >= 0.18 && grade.blind.p10 <= 0.30)
  pass(`tooled standard: EV $${grade.tooled.ev.toFixed(2)} (want > blind — pre-screen is the edge)`, grade.tooled.ev > grade.blind.ev)
  pass(`endgame fees: EV $${grade.endgame.ev.toFixed(2)} (want > tooled)`, grade.endgame.ev > grade.tooled.ev)

  // Declared-value pricing: no grader slabs a four-figure card at the bulk sticker, and paying
  // for speed must still cost more at the top end — otherwise Express strictly dominates.
  const vfee = await page.evaluate(async () => {
    const eng = await import('/src/game/engine.js')
    return {
      cheap: eng.gradingFee('economy', 250, 50, 'psa', 50),
      rich: eng.gradingFee('economy', 250, 50, 'psa', 10000),
      express: eng.gradingFee('express', 250, 50, 'psa', 10000),
      ladder: [5000, 25000, 100000, 250000].map(v => eng.gradingFee('economy', 250, 50, 'psa', v)),
      slowDays: eng.gradingDays('economy', 'psa', 10000),
      fastDays: eng.gradingDays('express', 'psa', 10000),
      baseSlowDays: eng.gradingDays('economy', 'psa', 50),
    }
  })
  pass(`declared value bites: $10k card costs $${vfee.rich.toFixed(0)}, not the $${vfee.cheap.toFixed(0)} bulk rate`,
    vfee.rich > vfee.cheap * 5)
  // PSA's real premium ladder is a STEP function on insured value, and above it the service
  // tier stops mattering — a five-figure card has no slow, cheap option at any grader. So the
  // property to hold isn't "express costs more" (it doesn't, and shouldn't); it's that the
  // ladder climbs with value, and that a premium card can't be parked on a 45-day service.
  pass(`premium ladder climbs with value ($${vfee.ladder.join(' → $')})`,
    vfee.ladder.every((v, i) => i === 0 || v > vfee.ladder[i - 1]))
  pass(`a premium card can't be parked on the slow tier (${vfee.baseSlowDays}d normally → ${vfee.slowDays}d at $10k, vs express ${vfee.fastDays}d)`,
    vfee.slowDays < vfee.baseSlowDays && vfee.slowDays <= vfee.fastDays * 3)

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
      // 🏗️ Storage Unit: raises the ALLOWANCE only — heldUnits' definition must not move.
      freeUnit: k.storageFreeUnits(S({ upgrades: { storageUnit: true } })),
      unitAllowance: k.storageFee(S({ upgrades: { storageUnit: true }, sealedInventory: rows(k.STORAGE_FREE_UNITS + 10) })),
      packsPerRack: k.PACKS_PER_RACK,
      // Loose packs rack 36-to-a-tray: 15 boxes fill the base allowance, then 180 loose
      // packs bill as ceil(180/36)=5 units — not 180. Same count of BOXES bills in full.
      looseRacked: k.storageFee(S({ sealedInventory: [
        ...rows(15),
        ...rows(180, { product: { type: 'Booster Pack', packs: 1, price: 6 } }),
      ] })),
      looseAsBoxes: k.storageFee(S({ sealedInventory: rows(195) })),
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
  pass(`🏗️ Storage Unit: allowance ${storage.freeBase} → ${storage.freeUnit} (+15), hoard of allowance+10 → $${storage.unitAllowance}`,
    storage.freeUnit === storage.freeBase + 15 && storage.unitAllowance === 0)
  pass(`loose packs rack ${storage.packsPerRack}/tray: 15 boxes + 180 loose → $${storage.looseRacked}/day (as boxes: $${storage.looseAsBoxes})`,
    storage.looseRacked === 5 * storage.perUnit && storage.looseAsBoxes === 180 * storage.perUnit)

  // --- 6. ⭐/🔥 REPUTATION CURVES — the two-speed rep model's exploit rails ------------
  // Pure math (rep.js is dependency-free), asserted against LIVE exports so a retune
  // can't silently blow past the caps: hype may boost DEMAND ≤ ×1.35 and PRICES ≤ ×1.05,
  // ⭐ gains taper above the soft cap while losses always land in full, and the rank
  // thresholds must stay equal to the show-tier gates they replaced.
  console.log('\n⭐ REPUTATION CURVES:')
  {
    const rep = await import(pathToFileURL(path.join(ROOT, 'src', 'game', 'rep.js')).href)
    pass(`hype demand mult rails at ×${rep.hypeDemandMult(100).toFixed(2)} (want ≤ 1.35)`, rep.hypeDemandMult(100) <= 1.35 + 1e-9 && rep.hypeDemandMult(0) === 1)
    pass(`hype price mult rails at ×${rep.hypePriceMult(100).toFixed(2)} (want ≤ 1.05)`, rep.hypePriceMult(100) <= 1.05 + 1e-9 && rep.hypePriceMult(0) === 1)
    pass(`hype decays (half-life ${rep.HYPE_HALF_LIFE}d) and cure is capped at ${rep.HYPE_CURE_DAILY_CAP}⭐/day`,
      rep.decayHype(100, rep.HYPE_HALF_LIFE) === 50 && rep.HYPE_CURE_DAILY_CAP <= 3)
    const taperOk = rep.applyNotoGain(300, 10) - 300 < 10 && rep.applyNotoGain(100, 10) === 110
    const lossOk = rep.applyNotoGain(300, -10) === 290 && rep.applyNotoGain(5, -10) === 0
    pass('⭐ gains taper above the soft cap; losses land in full (floor 0)', taperOk && lossOk)
    const ladderOk = [0, 15, 40, 80, 150, 280].every((m, i) => rep.RANKS[i]?.min === m)
    pass('rank thresholds equal the historical show-tier gates (0/15/40/80/150/280)', ladderOk)
    pass('every rank past 0 has 3 deeds and a 2-of-3 bar', rep.RANKS.slice(1).every(r => r.deeds.length === 3) && rep.DEEDS_NEEDED === 2)
  }

  // --- 7. 🖼️ MASTERSET SHOWCASE — the completed-binder economy's rails ------------------
  // The showcase is a capped DRAW (like signage), never a demand printer; the master-lot
  // premium is a bounded prize; and the completion ⭐ must scale with set VALUE (the old
  // card-count formula paid a $22k vintage master set like a cheap 250-carder).
  console.log('\n🖼️ MASTERSET SHOWCASE:')
  {
    const ms = await page.evaluate(async () => {
      const eng = await import('/src/game/engine.js')
      const cards = (prefix, n, price) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, price }))
      return {
        walkCap: eng.showcaseMult(99), streamCap: eng.showcaseStreamMult(99),
        lo: eng.LOT_PREMIUM_LO, hi: eng.LOT_PREMIUM_HI,
        small: eng.completionReward({ cards: cards('x', 100, 2) }),
        big: eng.completionReward({ cards: cards('y', 100, 80) }),
      }
    })
    pass(`showcase draw rails: walk-ins ×${ms.walkCap} (want ≤ 1.16), streams ×${ms.streamCap} (want ≤ 1.10)`,
      ms.walkCap <= 1.16 + 1e-9 && ms.streamCap <= 1.10 + 1e-9)
    pass(`master-lot premium band ${ms.lo}–${ms.hi}× of book (a prize, not a printer)`,
      ms.lo >= 1.1 && ms.hi <= 1.5 && ms.lo < ms.hi)
    pass(`completion ⭐ scales with set VALUE (same length: ${ms.small.noto}★ cheap vs ${ms.big.noto}★ flagship, +${ms.big.clout} 🎫)`,
      ms.big.noto > ms.small.noto && ms.small.clout >= 1 && ms.big.clout >= ms.small.clout)
  }

  await browser.close()
} catch (e) {
  console.error('SIM ERROR:', e.message)
  failures.push('sim-crashed')
} finally {
  try { execSync(`taskkill /pid ${vite.pid} /T /F`, { stdio: 'ignore' }) } catch {}
}

console.log(failures.length ? `\n✗ ${failures.length} INVARIANT VIOLATION(S)` : '\n✓ ALL ECONOMY INVARIANTS HOLD')
process.exit(failures.length ? 1 : 0)
