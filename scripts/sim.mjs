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

  // ---- 1c. 👑 Cross-set ("era") product -------------------------------------------
  // An Ultra Premium Collection draws its packs from a whole era at rip time rather than
  // from one set. Three things must hold, and each has a way of silently breaking:
  //   • still -EV. Same rule as every other sealed product.
  //   • a box is FIXED at manufacture (same uid → same packs) but two boxes DIFFER. Lose the
  //     first and a save reload rerolls the box; lose the second and every UPC deals the same
  //     lineup, which is the tell that kills the illusion.
  //   • value never tracks contents. A UPC sells on potential, so two of them must list
  //     identically however lucky one of them happens to be.
  console.log('\n👑 ERA PRODUCT (cross-set collections, N=400 rips each) — want < 1.00:')
  const eraRip = await page.evaluate(async () => {
    const eng = await import('/src/game/engine.js')
    const out = []
    const sample = eng.ERA_PRODUCTS.filter(p => p.packs >= 4).slice(0, 8)
    for (const p of sample) {
      const anchor = eng.eraAnchorSet(p)
      if (!anchor || !p.price) continue
      const N = 400
      let total = 0
      for (let i = 0; i < N; i++)
        for (const c of eng.openProduct(anchor, p, { uid: `sim${i}` })) total += eng.cardValue(c)
      const a1 = eng.drawPackSets(p, 'simA'), a2 = eng.drawPackSets(p, 'simA'), b = eng.drawPackSets(p, 'simB')
      out.push({
        name: p.name, price: p.price, ev: total / N, packs: p.packs,
        stable: JSON.stringify(a1) === JSON.stringify(a2),
        varies: JSON.stringify(a1) !== JSON.stringify(b),
        spread: new Set(a1).size,
        sameValue: eng.sealedValue({ product: p, setId: anchor.id }) === eng.sealedValue({ product: p, setId: anchor.id }),
      })
    }
    return out
  })
  for (const r of eraRip) {
    const ratio = r.ev / r.price
    pass(`${r.name}: EV $${r.ev.toFixed(2)} vs $${r.price.toFixed(2)} (${(ratio * 100).toFixed(0)}%), ${r.spread} sets/box`,
      ratio < 1.0 && r.stable && r.varies && r.sameValue)
  }
  pass(`era shelf is stocked (${eraRip.length} cross-set products rippable)`, eraRip.length >= 3)
  pass('every era box is sealed at manufacture (same box → same packs)', eraRip.every(r => r.stable))
  pass('two boxes of the same product hold different packs', eraRip.every(r => r.varies))
  pass('a box spans several sets (a UPC is not a re-skinned booster box)', eraRip.every(r => r.spread > 1))

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
  // PLUS the hype surge, everywhere — so the old below-market arbitrage must never come back.
  // Scarcity lives in PRICE, reliability and lead time now, not in a truncated catalogue: the
  // marketplace really does carry every in-print set, and the corner shop really doesn't.
  console.log('\n🛒 SHOP SCARCITY:')
  const shop = await page.evaluate(async () => {
    const eng = await import('/src/game/engine.js')
    const cat = id => eng.distributorCatalog(eng.distributorById(id), eng.SHOP_SETS, 3)
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
    const wide = cat('tcgplayer').map(s => s.id)
    // 🕰️ THE SELL-THROUGH STAGE. 151 (mark G) stopped printing at the April 2026 rotation, but
    // you can still buy it sealed from a warehouse today — so it must stay on the deepStock
    // shelves and vanish only from the LGS's allocation shelf, at a premium over market. If it
    // disappears everywhere, we're back to conflating "the printer stopped" with "it's gone".
    const s151 = eng.setById('sv3pt5')
    const p151 = eng.setProducts(s151).find(p => p.price)
    const lgsIds = []
    for (let w = 0; w < 24; w++) for (const s of eng.distributorCatalog(eng.distributorById('lgs'), eng.SHOP_SETS, w)) lgsIds.push(s.id)
    return { inPrint: eng.IN_PRINT_SETS.length, outOfPrint: eng.OUT_OF_PRINT_SETS.length,
      lgs: cat('lgs').length, tcg: wide.length, amazon: cat('amazon').length, total: eng.SHOP_SETS.length,
      // Prismatic (mark H) is under active mass reprint — it must stay orderable however old it
      // gets. Age is never what retires a set here.
      prismatic: wide.includes('sv8pt5'),
      sellThruDeep: wide.includes('sv3pt5') && cat('amazon').some(s => s.id === 'sv3pt5'),
      sellThruLgs: lgsIds.includes('sv3pt5'),
      sellThruAsk: eng.distributorPrice(eng.distributorById('amazon'), p151.price, 0, { product: p151, set: s151 }) / p151.price,
      newestName: newest.name, minRatio,
      pcGone: !eng.DISTRIBUTORS.some(d => d.msrp || d.id === 'pokecenter') }
  })
  pass(`in print is curated, not a rolling window (${shop.inPrint} of ${shop.total} shop sets orderable, ${shop.outOfPrint} retired)`,
    shop.inPrint >= 4 && shop.inPrint + shop.outOfPrint === shop.total)
  pass(`Prismatic (still reprinting) never ages off the shelf`, shop.prismatic)
  pass(`151 stopped printing but still sells through the warehouses (Amazon + marketplace carry it)`,
    shop.sellThruDeep)
  pass(`...and the local shop can no longer reorder it (absent all 24 weeks of shelf rotation)`,
    !shop.sellThruLgs)
  pass(`...at a premium over market, because what's left is finite (${(shop.sellThruAsk * 100).toFixed(0)}% of market)`,
    shop.sellThruAsk > 1.05)
  pass(`the local shop is a local shop (${shop.lgs} sets on the shelf)`, shop.lgs <= 3)
  pass(`the corner shop is not the marketplace (${shop.lgs} sets vs ${shop.tcg})`, shop.lgs < shop.tcg)
  pass(`no MSRP printer: cheapest fresh-drop ask (${shop.newestName}) is ${(shop.minRatio * 100).toFixed(0)}% of market (want ≥ 100%)`,
    shop.pcGone && shop.minRatio >= 1 - 1e-9)

  // ---- 1d. 🛒 What is ON the shelf, not just which sets ----------------------------
  // The set count above was always right and always insufficient: 2 sets of ~20 manufacturer
  // SKUs each is still 40 sealed lines in a corner shop. A real small shop carries boxes of
  // the current sets, loose packs broken out of them, and one impulse line — so the thing to
  // pin is SKUs per shelf, not sets per shelf. See game/shelf.js.
  console.log('\n🛒 SHELF REALISM (what a retailer actually stocks):')
  const shelf = await page.evaluate(async () => {
    const eng = await import('/src/game/engine.js')
    const sh = await import('/src/game/shelf.js')
    const skusFor = (id, weeks = 12) => {
      const d = eng.distributorById(id)
      const counts = []
      for (let w = 0; w < weeks; w++) {
        let n = 0
        for (const set of eng.distributorCatalog(d, eng.SHOP_SETS, w)) {
          n += sh.shelfProducts(d, eng.setProducts(set), set, w).length
        }
        counts.push(n)
      }
      return counts
    }
    // Every archetype an allocation shelf ever shows, across a season of weeks.
    const archesOn = (id, weeks = 24) => {
      const d = eng.distributorById(id)
      const out = new Set()
      for (let w = 0; w < weeks; w++)
        for (const set of eng.distributorCatalog(d, eng.SHOP_SETS, w))
          for (const p of sh.shelfProducts(d, eng.setProducts(set), set, w)) out.add(sh.archetypeOf(p))
      return [...out]
    }
    // The worst variant pile-up in the raw data, and what the shelves do with it.
    const worst = eng.SHOP_SETS.map(set => {
      const c = {}
      for (const p of eng.setProducts(set)) { const a = sh.archetypeOf(p); c[a] = (c[a] || 0) + 1 }
      return { set: set.name, max: Math.max(...Object.values(c)) }
    }).sort((a, b) => b.max - a.max)[0]
    const lgsVariantMax = (() => {
      const d = eng.distributorById('lgs')
      let max = 0
      for (let w = 0; w < 24; w++)
        for (const set of eng.distributorCatalog(d, eng.SHOP_SETS, w)) {
          const c = {}
          for (const p of sh.shelfProducts(d, eng.setProducts(set), set, w)) {
            const a = sh.archetypeOf(p); c[a] = (c[a] || 0) + 1
          }
          max = Math.max(max, ...Object.values(c), 0)
        }
      return max
    })()
    const lgs = eng.distributorById('lgs')
    // The shelf must be STABLE for a week — the buy screen re-renders constantly.
    const set0 = eng.distributorCatalog(lgs, eng.SHOP_SETS, 3)[0]
    const a1 = sh.shelfProducts(lgs, eng.setProducts(set0), set0, 3).map(p => p.type).join('|')
    const a2 = sh.shelfProducts(lgs, eng.setProducts(set0), set0, 3).map(p => p.type).join('|')
    // ...and it must MOVE across weeks, or it is a static list pretending to rotate.
    const weeks = new Set()
    for (let w = 0; w < 24; w++) weeks.add(sh.shelfProducts(lgs, eng.setProducts(set0), set0, w).map(p => p.type).join('|'))
    // Depth: what a shop keeps behind the counter.
    const box = eng.setProducts(set0).find(p => (p.packs || 0) >= 21)
    const pack = eng.setProducts(set0).find(p => p.type === 'Booster Pack')
    return {
      lgsSkus: skusFor('lgs'), tcgSkus: skusFor('tcgplayer', 1), amazonSkus: skusFor('amazon', 1),
      dnaArches: archesOn('dna'), lgsArches: archesOn('lgs'), amazonArches: archesOn('amazon'),
      tcgArches: archesOn('tcgplayer', 1),
      worstRaw: worst, lgsVariantMax, stable: a1 === a2, distinctWeeks: weeks.size,
      boxCap: box ? eng.stockCap(lgs, box, 0, set0) : 0,
      packCap: pack ? eng.stockCap(lgs, pack, 0, set0) : 0,
      dnaSets: eng.distributorCatalog(eng.distributorById('dna'), eng.SHOP_SETS, 0).length,
      dnaCases: eng.distributorCatalog(eng.distributorById('dna'), eng.SHOP_SETS, 0).filter(s2 => eng.caseLot(s2)).length,
    }
  })
  const lgsLo = Math.min(...shelf.lgsSkus), lgsHi = Math.max(...shelf.lgsSkus)
  pass(`the corner shop is a corner shop: ${lgsLo}-${lgsHi} sealed lines across 12 weeks (want ≤ 12)`,
    lgsHi <= 12 && lgsLo >= 3)
  pass(`...against ${shelf.tcgSkus[0]} at the marketplace and ${shelf.amazonSkus[0]} at the warehouse`,
    shelf.tcgSkus[0] > lgsHi * 4 && shelf.amazonSkus[0] > lgsHi * 2)
  pass(`no shelf shows a pile of one thing (raw data peaks at ${shelf.worstRaw.max}× in ${shelf.worstRaw.set}; the LGS never shows more than ${shelf.lgsVariantMax})`,
    shelf.lgsVariantMax <= 1)
  pass(`Pokémon Center exclusives reach you through the MARKETPLACE only (lgs: ${shelf.lgsArches.join('/')})`,
    !shelf.lgsArches.includes('pcetb') && !shelf.amazonArches.includes('pcetb')
    && !shelf.dnaArches.includes('pcetb') && shelf.tcgArches.includes('pcetb'))
  // NB: case LOTS are built by caseLot() and added by the buy screen separately, so they never
  // appear in setProducts() and cannot show up here. What this pins is the retail mix.
  pass(`the wholesaler sells wholesale units, not checklane impulse buys (${shelf.dnaArches.join('/')})`,
    shelf.dnaArches.includes('box') && shelf.dnaArches.includes('etb')
    && !shelf.dnaArches.includes('blister') && !shelf.dnaArches.includes('tin'))
  pass(`...and cases are still its own thing (${shelf.dnaCases} of ${shelf.dnaSets} sets offer a case lot)`,
    shelf.dnaCases > 0)
  pass(`the shelf is stable within a week but moves across them (${shelf.distinctWeeks} distinct shelves over 24 weeks)`,
    shelf.stable && shelf.distinctWeeks > 1)
  pass(`depth is a real shop's: ${shelf.boxCap} booster boxes behind the counter, ${shelf.packCap} loose packs out front`,
    shelf.boxCap >= 2 && shelf.boxCap <= 6 && shelf.packCap >= 8 && shelf.packCap <= 20)

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

  // --- 8. 📱 CONTENT & AUDIENCE — the short-form batch's rails --------------------------
  // Short-form is a FLOOR under the channel, never a replacement for going live, and the
  // audience it builds must stay bounded: a post is worth a fraction of a stream clip, the
  // feed is capped, the challenge pays for the chase you actually filmed, and the one cash
  // faucet (sponsorship) is hard-capped and cannot be earned without spending money to honour
  // the feature. Nothing in the batch may introduce a demand or price multiplier — content
  // moves FOLLOWERS, and followers are capped in their effect elsewhere.
  console.log('\n📱 CONTENT & AUDIENCE:')
  {
    const ct = await page.evaluate(async () => {
      const c = await import('/src/game/content.js')
      const st = await import('/src/game/stream.js')
      // Compare like for like: the same $500 moment as a post vs. as a stream clip.
      const clip = st.clipFor(400, 500, false, 'a big pull', false)
      return {
        postBest: Math.max(...['pull', 'gem', 'page', 'haul', 'vlog', 'hunt'].map(k => c.postDrip(k, 1e6))),
        post500: c.postDrip('pull', 500), clip500: clip.perDay, clipDays: clip.daysLeft,
        postDays: c.POST_DAYS, feedCap: c.MAX_LIVE_POSTS,
        viral: c.VIRAL_CHANCE, viralMult: c.VIRAL_MULT,
        cadenceCap: c.cadenceMult(999),
        scaleFull: c.challengeScale(0, 200), scaleLate: c.challengeScale(190, 200),
        bountyFull: c.challengeBounty(200, 5000, 1), bountyLate: c.challengeBounty(200, 5000, 0.05),
        sponsorCap: c.SPONSOR_MONTHLY_CAP, sponsorHuge: c.sponsorMonthly(1e6, 1e5),
        sponsorFloor: c.SPONSOR_MIN_FOLLOWERS, sponsorPacks: c.SPONSOR_FEATURE_PACKS,
        vlogCap: Math.max(...Array.from({ length: 40 }, () => c.vlogFollowers(5, 1e6))),
        bias: c.CHALLENGE_BIAS,
      }
    })
    pass(`a post is worth a fraction of a stream clip ($500 moment: ${ct.post500}/day × ${ct.postDays}d vs clip ${ct.clip500}/day × ${ct.clipDays}d)`,
      ct.post500 * ct.postDays < ct.clip500 * ct.clipDays)
    pass(`post drip is capped no matter the value (max ${ct.postBest}/day across every kind)`, ct.postBest <= 15)
    pass(`the feed is capped at ${ct.feedCap} live posts (a box rip can't carpet-bomb it)`, ct.feedCap <= 5)
    pass(`viral is a lottery, not the plan (${(ct.viral * 100).toFixed(0)}% chance, ×${ct.viralMult})`,
      ct.viral <= 0.08 && ct.viralMult <= 8)
    pass(`cadence bonus rails at ×${ct.cadenceCap.toFixed(2)} (want ≤ 1.25)`, ct.cadenceCap <= 1.25 + 1e-9)
    pass(`challenge pays for the chase you filmed (declaring at 0% → ×${ct.scaleFull.toFixed(2)}, at 95% → ×${ct.scaleLate.toFixed(2)})`,
      ct.scaleFull === 1 && ct.scaleLate <= 0.06 && ct.bountyLate.followers < ct.bountyFull.followers * 0.2)
    pass(`payoff-video bounty is bounded (${ct.bountyFull.followers} followers max, +${ct.bountyFull.noto}★)`,
      ct.bountyFull.followers <= 400 && ct.bountyFull.noto <= 10)
    pass(`show-bin challenge bias is a minority of the bin (${Math.round(ct.bias * 100)}%)`, ct.bias <= 0.35)
    pass(`vlog followers stay bounded on a monster pickup (max ${ct.vlogCap})`, ct.vlogCap <= 120)
    pass(`sponsorship is hard-capped at $${ct.sponsorCap}/mo (a huge channel still bills $${ct.sponsorHuge})`,
      ct.sponsorHuge <= ct.sponsorCap + 1e-9)
    pass(`sponsorship demands an audience (${ct.sponsorFloor} followers) AND a paid-for feature (${ct.sponsorPacks} packs)`,
      ct.sponsorFloor >= 100 && ct.sponsorPacks >= 1)
  }

  // ---- 9. 📊 Population reports ---------------------------------------------------
  // The load-bearing invariant of the whole system: the scarcity multiplier averages 1.0
  // across the catalog. Without that, adding population reports would silently re-tune the
  // grading EV that section 2 pins — this is what makes it a spread rather than a nerf.
  console.log('\n📊 POPULATION REPORTS:')
  {
    const pop = await page.evaluate(async () => {
      const eng = await import('/src/game/engine.js')
      const p = await import('/src/game/population.js')
      // Every real card in the catalog, at the two grades that carry a premium.
      const cards = eng.SHOP_SETS.flatMap(s => s.cards).slice(0, 4000)
      const mean = (g) => cards.reduce((a, c) => a + p.popMult(c, g, {}), 0) / cards.length
      // A thin card vs a deep one, and what YOUR OWN ten submissions do to each.
      const thin = cards.reduce((b, c) => (p.popCount(c, 10, { vintage: true }) < p.popCount(b, 10, { vintage: true }) ? c : b), cards[0])
      const deep = cards.reduce((b, c) => (p.popCount(c, 10, {}) > p.popCount(b, 10, {}) ? c : b), cards[0])
      return {
        mean10: mean(10), mean9: mean(9),
        mean8: mean(8),                       // grades below 9 carry no premium at all
        spread10: [Math.min(...cards.map(c => p.popMult(c, 10, {}))), Math.max(...cards.map(c => p.popMult(c, 10, {})))],
        thinBefore: p.popMult(thin, 10, { vintage: true }), thinAfter: p.popMult(thin, 10, { vintage: true, adds: 10 }),
        thinPop: p.popCount(thin, 10, { vintage: true }),
        deepBefore: p.popMult(deep, 10, {}), deepAfter: p.popMult(deep, 10, { adds: 10 }),
        deepPop: p.popCount(deep, 10, {}),
        // A card with no catalog row must price EXACTLY as it did before this system existed.
        // Checked through the engine, because that is where the catalog guard lives — the
        // population module itself will happily hash any id you hand it.
        syntheticPop: eng.cardPopulation({ uid: 't', id: 'none-1', name: 'T', rarity: 'Rare Holo', price: 100 }, 10),
        // Two synthetic cards with DIFFERENT ids must value identically. If a census were
        // being applied to them, their hashes would differ and so would their prices.
        syntheticValues: ['none-1', 'none-2', 'zzz-99'].map(id =>
          eng.gradedValue({ uid: 't', id, name: 'T', rarity: 'Rare Holo', price: 100, condition: 'NM', grade: { overall: 10 } })),
      }
    })
    pass(`the census multiplier averages 1.0 across the catalog (PSA 10 mean ×${pop.mean10.toFixed(4)}, PSA 9 ×${pop.mean9.toFixed(4)}) — grading EV is untouched`,
      Math.abs(pop.mean10 - 1) < 0.01 && Math.abs(pop.mean9 - 1) < 0.01)
    pass(`only strong slabs carry a population premium (PSA 8 mean ×${pop.mean8.toFixed(2)})`, pop.mean8 === 1)
    pass(`scarcity is a real spread, not noise (PSA 10 ranges ×${pop.spread10[0].toFixed(2)}–×${pop.spread10[1].toFixed(2)})`,
      pop.spread10[0] < 0.8 && pop.spread10[1] > 1.2)
    pass(`your own submissions flood a THIN card (pop ${pop.thinPop}: ×${pop.thinBefore.toFixed(2)} → ×${pop.thinAfter.toFixed(2)} after 10 slabs)`,
      pop.thinAfter < pop.thinBefore - 0.05)
    pass(`...and barely dent a DEEP one (pop ${pop.deepPop.toLocaleString()}: ×${pop.deepBefore.toFixed(3)} → ×${pop.deepAfter.toFixed(3)})`,
      Math.abs(pop.deepAfter - pop.deepBefore) < 0.02)
    pass(`a card with no catalog row has no census (report ${pop.syntheticPop === null ? 'null' : 'PRESENT'}; three ids all price at $${pop.syntheticValues[0].toFixed(2)}) — the section-2 fixture is untouched`,
      pop.syntheticPop === null && new Set(pop.syntheticValues.map(v => v.toFixed(2))).size === 1)
  }

  // ---- 10. 🖨️ Misprints -----------------------------------------------------------
  // Errors add value to a pack, and section 1 requires every set to stay -EV to rip. The
  // category therefore has to be a rounding error on pack EV, which is what this measures.
  console.log('\n🖨️ ERRORS & MISPRINTS:')
  {
    const mp = await page.evaluate(async () => {
      const eng = await import('/src/game/engine.js')
      const m = await import('/src/game/misprints.js')
      const set = eng.SHOP_SETS[0]
      // Measure the contribution ANALYTICALLY through real pack composition rather than by
      // waiting for a 1-in-125,000 wrong-back to turn up in a sample: run real packs, and for
      // each one price what an error WOULD add if it landed on a uniformly chosen card of
      // that pack (which is exactly what pickMisprintIndex does). Expected added value per
      // pack is then the rate times that mean. Sampling the tail directly would need millions
      // of packs to stop swinging, and a gate that swings is a gate nobody trusts.
      const PACKS = 3000
      let packEV = 0, meanErrorAdd = 0
      const weights = m.MISPRINTS.reduce((a, x) => a + x.weight, 0)
      for (let i = 0; i < PACKS; i++) {
        const pack = eng.openPack(set)
        for (const c of pack) packEV += eng.cardValue(c)
        // What the average error on this pack would be worth, over the kind ladder AND over
        // which card in the pack it lands on.
        let add = 0
        for (const kind of m.MISPRINTS) {
          for (const c of pack) {
            const base = eng.rawValue({ ...c, misprint: null })
            add += (kind.weight / weights) * (1 / pack.length) * (m.misprintValue(base, { kind: kind.key }, false) - base)
          }
        }
        meanErrorAdd += add
      }
      packEV /= PACKS
      meanErrorAdd /= PACKS
      // The observed rate, over enough rolls to pin the headline number (not the tail).
      let hits = 0
      const N = 400000
      for (let i = 0; i < N; i++) if (m.rollMisprint()) hits++
      return {
        rate: hits / N, declared: m.MISPRINT_RATE,
        perPack: meanErrorAdd * m.MISPRINT_RATE, packEV,
        rawVsGraded: [m.misprintValue(100, { kind: 'wrongback' }, false), m.misprintValue(100, { kind: 'wrongback' }, true)],
        floorWorks: m.misprintValue(0.1, { kind: 'miscut' }, true), // a miscut common is not worth 3.2 × 10¢
      }
    })
    pass(`errors are rare (${(mp.rate * 100).toFixed(3)}% of packs, declared ${(mp.declared * 100).toFixed(3)}%)`,
      Math.abs(mp.rate - mp.declared) < mp.declared * 0.15)
    pass(`the whole category is a rounding error on pack EV (+$${mp.perPack.toFixed(4)}/pack against $${mp.packEV.toFixed(2)} = ${(mp.perPack / mp.packEV * 100).toFixed(2)}%) — rip EV is untouched`,
      mp.perPack < mp.packEV * 0.01)
    pass(`an error is worth less raw than authenticated ($${mp.rawVsGraded[0].toFixed(0)} vs $${mp.rawVsGraded[1].toFixed(0)} on a $100 card)`,
      mp.rawVsGraded[0] < mp.rawVsGraded[1])
    pass(`an error sets its own floor (a miscut 10¢ common is worth $${mp.floorWorks.toFixed(2)}, not 32¢)`, mp.floorWorks >= 10)
  }

  // ---- 11. 🔨 The auction house (buy side) ----------------------------------------
  // The channel must not be free money. A naive bidder who enters market value on everything
  // should end up paying about market once the house's premium and the misdescribed lots are
  // counted; the edge belongs to whoever reads the room and checks the description.
  console.log('\n🔨 AUCTION HOUSE (buy side) — want blind bidding to lose, discipline to pay:')
  {
    const auc = await page.evaluate(async () => {
      const L = await import('/src/game/lots.js')
      // Large N on purpose: the selective strategies below only bid on a slice of the board,
      // so a small sample leaves them with a few dozen wins and a ratio that swings run to run.
      const N = 20000
      // Lot values are fat-tailed (a $4 common and an $800 slab are on the same board), so the
      // aggregate value-per-dollar is dominated by whichever big lot happened to land and
      // swings run to run. The MEDIAN per-lot outcome is the stable statistic, and it is also
      // the better question: on a TYPICAL win, did you do well?
      const median = (xs) => {
        if (!xs.length) return 0
        const s = [...xs].sort((a, b) => a - b)
        const m = s.length >> 1
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
      }
      const run = (strategy) => {
        let won = 0, paid = 0, got = 0, burned = 0
        const each = []
        for (let i = 0; i < N; i++) {
          const lot = L.makeLot(60, 1)
          if (!lot) continue
          const market = L.lotMarket(lot)
          if (!market) continue
          const max = strategy(lot, market)
          if (max <= 0) continue
          const r = L.settleLot({ ...lot, maxBid: max })
          if (!r.won) continue
          won++
          paid += r.total
          got += L.lotTrueValue(lot)
          each.push(L.lotTrueValue(lot) / r.total)
          if (lot._misdescribed || lot._resealed) burned++
        }
        return { won, ratio: got / paid, median: median(each), burnRate: burned / Math.max(1, won) }
      }
      return {
        // Bids market on everything, checks nothing.
        naive: run((lot, market) => market),
        // The disciplined line: only quiet rooms, and only at a real discount to market.
        // This is what the channel is built to reward.
        disciplined: run((lot, market) => (lot.watchers <= 3 ? market * 0.65 : 0)),
        // Bids market but only on graded lots, where there is nothing to misdescribe — the
        // safe, boring line, and the control for the description-risk check below.
        slabsOnly: run((lot, market) => (lot.kind === 'slab' ? market : 0)),
        premium: L.HOUSE_PREMIUM, ship: L.LOT_SHIP_FLAT,
      }
    })
    pass(`the house takes ${Math.round(auc.premium * 100)}% on every win`, auc.premium >= 0.1)
    pass(`a naive bidder does NOT print money (typical win returns $${auc.naive.median.toFixed(2)} of value per $1 paid, ${Math.round(auc.naive.burnRate * 100)}% of wins misdescribed)`,
      auc.naive.median < 1.1)
    pass(`discipline is what pays — quiet rooms at 35% under market return $${auc.disciplined.median.toFixed(2)} on a typical win`,
      auc.disciplined.median > 1 && auc.disciplined.median > auc.naive.median)
    pass(`...and it is SLOW, not a printer (${auc.disciplined.won} wins against the naive bidder's ${auc.naive.won})`,
      auc.disciplined.won < auc.naive.won * 0.3)
    pass(`a quiet lot is quiet for a reason (${Math.round(auc.disciplined.burnRate * 100)}% of quiet-room wins are misdescribed vs ${Math.round(auc.slabsOnly.burnRate * 100)}% on slabs — checking is part of the discipline)`,
      auc.disciplined.burnRate > auc.slabsOnly.burnRate)
  }

  // ---- 12. 🔨 Cracking a slab -----------------------------------------------------
  // Cracking must not be a free reroll. Two separate properties do that work, and they are
  // different from each other:
  //
  //   • The grade a card earned is EVIDENCE about the card, so each crack refines its hidden
  //     cut toward what that grade implied — and the refinement CONVERGES. A card cannot be
  //     cracked its way to a better and better prediction; after a few opinions the estimate
  //     stops moving and the card is simply what it is.
  //   • The economics bite immediately. A strong slab is worth more than the raw card inside
  //     it, so cracking costs you real money before the new fee is even paid.
  console.log('\n🔨 CRACK & REGRADE — want convergence, not a printing press:')
  {
    const crack = await page.evaluate(async () => {
      const eng = await import('/src/game/engine.js')
      const mk = () => ({ uid: 'x', id: 'none-1', name: 'T', rarity: 'Rare Holo', price: 100, condition: 'NM', _cut: 0.5 })
      // Crack the same card over and over, always getting the same opinion back. The recorded
      // cut must settle rather than drift further every time.
      const walk = (grade) => {
        const cuts = []
        let card = mk()
        for (let i = 0; i < 5; i++) {
          card.gradeHistory = Array.from({ length: i + 1 }, () => ({ overall: grade }))
          card.grade = { overall: grade }
          card = eng.crackSlab(card, () => 1).card // rnd()=1 → never damaged, isolating the cut effect
          cuts.push(card._cut)
        }
        return cuts
      }
      const eights = walk(8), nines = walk(9)
      // Damage risk actually fires.
      let damaged = 0
      for (let i = 0; i < 4000; i++) { const c = mk(); c.grade = { overall: 9 }; if (eng.crackSlab(c).damaged) damaged++ }
      // The economics. A PSA 9 in the holder vs the raw card the moment you crack it, and
      // what a resubmission then costs on top.
      const slab9 = { ...mk(), grade: { overall: 9 } }
      const raw = eng.crackSlab(slab9, () => 1).card
      const fee = eng.gradingFee('standard', 0, 1) + eng.gradingShipping([raw], {})
      return {
        eights, nines,
        eightDeltas: eights.map((c, i) => Math.abs(c - (i ? eights[i - 1] : 0.5))),
        nineDeltas: nines.map((c, i) => Math.abs(c - (i ? nines[i - 1] : 0.5))),
        damageRate: damaged / 4000, declared: eng.CRACK_DAMAGE_CHANCE,
        slabWorth: eng.cardValue(slab9), rawWorth: eng.cardValue(raw), fee,
      }
    })
    pass(`a poor grade revises the card DOWN, a strong one UP (8s → ${crack.eights[4].toFixed(2)}, 9s → ${crack.nines[4].toFixed(2)}, from 0.50)`,
      crack.eights[4] < 0.5 && crack.nines[4] > 0.5)
    pass(`...and both CONVERGE — the estimate stops moving (8s: ${crack.eightDeltas.map(d => d.toFixed(3)).join(' → ')})`,
      crack.eightDeltas[4] < crack.eightDeltas[0] / 4 && crack.nineDeltas[4] < crack.nineDeltas[0] / 4)
    pass(`cracking a strong slab costs real money up front ($${crack.slabWorth.toFixed(0)} slab → $${crack.rawWorth.toFixed(0)} raw, then $${crack.fee.toFixed(0)} to send it again)`,
      crack.rawWorth < crack.slabWorth && crack.fee > 0)
    pass(`cracking risks the card (${(crack.damageRate * 100).toFixed(1)}% damaged, declared ${(crack.declared * 100).toFixed(0)}%)`,
      Math.abs(crack.damageRate - crack.declared) < 0.02)
  }

  // ---- 13. 🧾 Tax and 🏦 the bank --------------------------------------------------
  console.log('\n🧾 THE BOOKS & 🏦 THE BANK:')
  {
    const fin = await page.evaluate(async () => {
      const t = await import('/src/game/tax.js')
      const l = await import('/src/game/loans.js')
      const books = (revenue, expenses) => ({ ...t.freshBooks(0), revenue, expenses })
      const offer = l.LOAN_OFFERS[0]
      const totals = l.loanTotals(offer)
      const loan = l.makeLoan(offer, 0)
      // Halfway through the term, what does clearing it early cost against the balance left?
      const half = { ...loan, balance: loan.balance / 2 }
      return {
        floorFree: t.quarterBill(books(900, 0), {}),
        smallBill: t.quarterBill(books(5000, 0), {}),
        bigBill: t.quarterBill(books(60000, 0), {}),
        restocked: t.quarterBill(books(60000, 30000), {}),
        accountant: t.quarterBill(books(60000, 30000), { accountant: true }),
        progressive: [t.taxOn(5000) / 5000, t.taxOn(60000) / 60000],
        cashOnly: t.cashProfile({}, true),
        allRails: t.cashProfile({ payPaypal: true, payCard: true, payTap: true }, true),
        riskCash: t.auditChance(books(50000, 0), {}, true),
        riskRails: t.auditChance(books(50000, 0), { payPaypal: true, payCard: true, payTap: true, accountant: true }, true),
        loanTotal: totals.total, loanPrincipal: offer.principal, loanInterest: totals.interest,
        payoffHalf: l.payoffAmount(half), balanceHalf: half.balance,
      }
    })
    pass(`a small quarter files nothing ($${fin.floorFree.toFixed(0)} on $900 of profit)`, fin.floorFree === 0)
    pass(`the bill is progressive (${(fin.progressive[0] * 100).toFixed(0)}% at $5k, ${(fin.progressive[1] * 100).toFixed(0)}% at $60k)`,
      fin.progressive[1] > fin.progressive[0])
    pass(`restocking before the quarter closes lowers it ($${fin.bigBill.toFixed(0)} → $${fin.restocked.toFixed(0)} after $30k of stock)`,
      fin.restocked < fin.bigBill * 0.6)
    pass(`🧮 the accountant finds more ($${fin.restocked.toFixed(0)} → $${fin.accountant.toFixed(0)})`, fin.accountant < fin.restocked)
    pass(`a cash-only counter reads as ${Math.round(fin.cashOnly * 100)}% cash vs ${Math.round(fin.allRails * 100)}% with every rail`,
      fin.cashOnly > fin.allRails)
    pass(`...and that is the audit exposure (${(fin.riskCash * 100).toFixed(0)}% cash-only vs ${(fin.riskRails * 100).toFixed(0)}% with rails + accountant)`,
      fin.riskCash > fin.riskRails * 2)
    pass(`🏦 a note costs real interest ($${fin.loanPrincipal} borrowed, $${fin.loanTotal.toFixed(0)} repaid, $${fin.loanInterest.toFixed(0)} of it interest)`,
      fin.loanTotal > fin.loanPrincipal && fin.loanInterest > 0)
    pass(`...and clearing it early saves the interest you never reached ($${fin.payoffHalf.toFixed(0)} to settle a $${fin.balanceHalf.toFixed(0)} balance)`,
      fin.payoffHalf < fin.balanceHalf)
  }

  // ---- 14. 📦🔟 Sealed grading ------------------------------------------------------
  // The premium is a VINTAGE premium. Slabbing in-print product has to be a mistake, or the
  // system becomes a free multiplier on every box in the storeroom.
  console.log('\n📦🔟 SEALED GRADING — want vintage only:')
  {
    const sg = await page.evaluate(async () => {
      const s = await import('/src/game/sealedgrading.js')
      const g10 = { overall: 10, company: 'wata' }
      const vintage = { vintage: true }, modern = {}, after = { aftermarket: true }
      // Grade distribution for a 25-year-old wrapper vs a pallet-fresh box.
      const roll = (item, n = 20000) => {
        let tens = 0, sum = 0
        for (let i = 0; i < n; i++) { const r = s.rollSealedGrade(item); if (r.overall === 10) tens++; sum += r.overall }
        return { p10: tens / n, mean: sum / n }
      }
      return {
        vintMult: s.sealedGradeMult(vintage, g10),
        afterMult: s.sealedGradeMult(after, g10),
        modernMult: s.sealedGradeMult(modern, g10),
        vintRoll: roll(vintage), modernRoll: roll(modern),
        advice: s.worthGrading(modern, 500),
        cheap: s.worthGrading(vintage, 80),
        fee: s.sealedGradingFee(1000),
        days: s.sealedGradingDays('wata'),
      }
    })
    pass(`a vintage 10 is a real premium (×${sg.vintMult.toFixed(2)}), retired product half of it (×${sg.afterMult.toFixed(2)}), in-print almost nothing (×${sg.modernMult.toFixed(2)})`,
      sg.vintMult > 2.5 && sg.afterMult < sg.vintMult && sg.modernMult < 1.4)
    pass(`an old wrapper rarely gems (vintage ${(sg.vintRoll.p10 * 100).toFixed(1)}% vs modern ${(sg.modernRoll.p10 * 100).toFixed(1)}%)`,
      sg.vintRoll.p10 < sg.modernRoll.p10 && sg.vintRoll.mean < sg.modernRoll.mean)
    pass(`the game warns you off grading in-print product`, !sg.advice.ok)
    pass(`...and off grading something the fee would eat ($${sg.fee.toFixed(0)} on a $1,000 box, ${sg.days} days)`,
      !sg.cheap.ok && sg.fee > 0)
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
