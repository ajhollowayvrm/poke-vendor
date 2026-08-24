// Can a quote walk-up be bought at the CREDIT price without a credit deal actually happening?
//
// The 🗣️ quote walk-up asks you to name a number, in cash or in table credit. Credit is
// deliberately cheaper: makeQuoteRequest gives every seller a hidden `_floorCreditPct` sitting
// 10–15 points under their `_floorCashPct`, because on a credit deal they leave with your stock
// and no money leaves your till. That discount is only honest if a credit deal is really a
// credit deal — and two separate holes let you take the discount and pay cash anyway.
//
// The bugs this guards:
//
//   1. THE STALE COUNTER. Their counter is a number named against ONE method's floor. Nothing
//      cleared it when you switched method, so you could quote in 🎟️ credit, get countered at a
//      hair over the CREDIT floor, tap 💵 Cash, and the "Take their 62%" button was still live —
//      closing in cash at a price the cash floor would never have accepted. The auto-fallback
//      that drops you to cash when the table can't back credit fired the same path unprompted.
//
//   2. THE ONE-CARD BUNDLE. `creditFeasible` only asked whether the picked bundle was non-empty.
//      pickCreditBundle skips anything over credit×1.05, so a table holding one $600 slab and
//      one $5 card returns a single $5 item against a $500 quote. Non-empty → "feasible" → the
//      deal closed at the credit floor and then settled $495 of it in CASH.
//
// Usage:  npx vite-node scripts/verify-quotes.mjs
import { quoteRound, pickCreditBundle, creditCovers, CREDIT_COVER } from '../src/game/shows.js'

let failures = 0
function check(name, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// --- 1. The discount is real, which is what makes the exploit worth closing ----------------
console.log('\n💵 vs 🎟️ — the credit floor really is cheaper:')
{
  // Mirror makeQuoteRequest's generator rather than trusting one sample.
  let minGap = Infinity, maxGap = -Infinity
  for (let i = 0; i < 5000; i++) {
    const tight = i % 2 === 0
    const cashF = tight ? 0.75 + Math.random() * 0.10 : 0.55 + Math.random() * 0.15
    const creditF = Math.max(0.35, cashF - (0.10 + Math.random() * 0.05))
    const gap = cashF - creditF
    minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap)
  }
  check('a credit floor sits below the cash floor, always', minGap > 0,
    `smallest gap ${(minGap * 100).toFixed(1)} points`)
  check('...by roughly 10-15 points', minGap >= 0.099 && maxGap <= 0.151,
    `range ${(minGap * 100).toFixed(1)}-${(maxGap * 100).toFixed(1)} points`)
}

// --- 2. A counter is only ever acceptable to the method that produced it -------------------
console.log('\n🔁 A counter named in credit must not close in cash:')
{
  // A tight seller: cash floor 0.80, credit floor 0.68.
  const req = { tone: 'tight', _floorCashPct: 0.80, _floorCreditPct: 0.68 }
  // Quote 0.60 in credit until they counter rather than walk (the walk roll is random).
  let counter = null
  for (let i = 0; i < 4000 && counter == null; i++) {
    const r = quoteRound(req, 0.60, 'credit', 0)
    if (r.counter != null) counter = r.counter
  }
  check('a credit counter is produced', counter != null)
  check('...and it sits under the CASH floor', counter != null && counter < req._floorCashPct,
    `counter ${counter} vs cash floor ${req._floorCashPct}`)
  // The exploit: that same number offered as cash. quoteRound is the authority on what they
  // would accept, and it must say no — which is what makes the stale counter a real overpay.
  const asCash = quoteRound(req, counter, 'cash', 0)
  check('they would REJECT that number in cash', !asCash.accept,
    'the credit counter was acceptable as a cash price')
}

// --- 3. A credit bundle has to be a real bundle --------------------------------------------
console.log('\n🎟️ A credit deal must actually be paid in stock:')
{
  const CREDIT = 500
  // The exact shape that used to slip through: one item too big to fit, one trivial item.
  const lopsided = [
    { kind: 'card', uid: 'slab', val: 600 },
    { kind: 'card', uid: 'chaff', val: 5 },
  ]
  const picked = pickCreditBundle(lopsided, CREDIT)
  check('the lopsided table still yields a non-empty bundle', picked.take.length > 0,
    'precondition — the old check passed on exactly this')
  check('...covering almost none of the credit', picked.total < CREDIT * 0.1,
    `covers $${picked.total} of $${CREDIT}`)
  check('...and creditCovers REJECTS it', !creditCovers(picked, CREDIT),
    `$${picked.total} passed the ${CREDIT_COVER * 100}% bar`)

  // A table that can genuinely fill the order must still work.
  const healthy = [
    { kind: 'card', uid: 'a', val: 260 },
    { kind: 'card', uid: 'b', val: 200 },
    { kind: 'sealed', uid: 'c', val: 60 },
    { kind: 'card', uid: 'd', val: 30 },
  ]
  const good = pickCreditBundle(healthy, CREDIT)
  check('a healthy table still fills the order', creditCovers(good, CREDIT),
    `only covered $${good.total} of $${CREDIT}`)
  check('...without overshooting past the 5% band', good.total <= CREDIT * 1.05,
    `took $${good.total} against $${CREDIT}`)

  // An empty table can never pass.
  check('an empty table is rejected', !creditCovers(pickCreditBundle([], CREDIT), CREDIT))
  // Zero-value junk is not stock.
  check('zero-value items are not stock', !creditCovers(
    pickCreditBundle([{ kind: 'card', uid: 'z', val: 0 }], CREDIT), CREDIT))
}

// --- 4. Whatever the bundle covers, the cash top-up is the REMAINDER, never the deal --------
console.log('\n💰 The cash top-up stays a remainder:')
{
  let worst = 0
  for (let i = 0; i < 2000; i++) {
    const credit = 100 + Math.random() * 900
    const pool = Array.from({ length: 3 + Math.floor(Math.random() * 6) }, (_, k) => ({
      kind: 'card', uid: `p${k}`, val: round(5 + Math.random() * credit * 0.9),
    }))
    const picked = pickCreditBundle(pool, credit)
    if (!creditCovers(picked, credit)) continue // rejected — never reaches a confirm screen
    worst = Math.max(worst, (credit - picked.total) / credit)
  }
  check(`any accepted bundle leaves ≤${((1 - CREDIT_COVER) * 100).toFixed(0)}% to settle in cash`,
    worst <= 1 - CREDIT_COVER + 1e-9, `worst case ${(worst * 100).toFixed(1)}% in cash`)
}
function round(n) { return Math.round(n * 100) / 100 }

console.log(failures ? `\n✗ ${failures} check(s) failed\n` : '\n✓ all checks passed\n')
process.exitCode = failures ? 1 : 0
