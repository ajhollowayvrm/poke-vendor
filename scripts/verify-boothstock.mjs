// Is a show vendor's sealed stock actually finite?
//
// A booth brings a fixed number of each sealed SKU (generateBooths → boothSealed sets a `qty`
// per line). Everything that makes that real lives in game/boothstock.js: laying the table
// out, taking units off it, and laying it out again at its remaining depth after the booth —
// or the whole app — is closed and reopened.
//
// The bug this guards: the sealed tab renders COPIES of each line, and the decrement used to
// match on object identity, which a copy never satisfies. The line never went down, so the
// same box could be bought off one table an unlimited number of times.
//
// Usage:  npx vite-node scripts/verify-boothstock.mjs
import { generateBooths, makeShowVendors } from '../src/game/shows.js'
import { seedSealedLines, consumeLine, sameLine } from '../src/game/boothstock.js'

let failures = 0
function check(name, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const show = { id: 'sh-stock', name: 'Stock Regional', seed: 90210, tierKey: 'regional', day: 9 }
const booths = generateBooths(show, 0, makeShowVendors(), 'open', [], null)
booths.forEach((b, bi) => { (b.products || []).forEach((p, pi) => { p._tk = `${bi}#s${pi}` }) })

// How a player actually meets a line: through the grouped view, which spreads it into a copy.
const asRenderedRow = (line, i) => ({ ...line, _idx: i })

const totalUnits = booths.reduce((a, b) => a + (b.products || []).reduce((x, p) => x + (p.qty || 1), 0), 0)
console.log(`\n${booths.length} booths carrying ${totalUnits} sealed units across ` +
  `${booths.reduce((a, b) => a + (b.products || []).length, 0)} lines.`)

// --- 1. a clicked row still addresses its line ------------------------------------------
console.log('\n1. The rows a player clicks are copies:')
const line0 = booths.find(b => (b.products || []).length)?.products[0]
const row0 = asRenderedRow(line0, 0)
check('a rendered row is NOT reference-equal to its line', row0 !== line0)
check('sameLine still matches it', sameLine(row0, line0))
check('sameLine rejects a different line',
  !sameLine(row0, { _tk: 'somewhere#s9' }))

// --- 2. buying off a line drains it ------------------------------------------------------
// The bug in one assertion: click the row, buy, repeat, and see whether it ever runs out.
console.log('\n2. Buying the same row over and over:')
const deep = booths.flatMap(b => b.products || []).find(p => (p.qty || 1) >= 3)
{
  let lines = seedSealedLines([deep], null)
  const depth = lines[0].qty
  let bought = 0, keys = []
  for (let i = 0; i < depth + 25; i++) {                 // keep clicking well past the stack
    const row = asRenderedRow(lines[0] ?? {}, 0)         // always the row as rendered
    const r = consumeLine(lines, row, 1)
    lines = r.lines; bought += r.took; keys.push(...r.keys)
    if (!lines.length) break
  }
  check(`a stack of ${depth} sells exactly ${depth}`, bought === depth, `${bought} sold`)
  // The reported bug states itself here: the row was still sitting on the table, buyable, after
  // being clicked far more times than the vendor had units to sell.
  check(`the row is off the table after ${depth} buys, not still buyable`, lines.length === 0,
    `still on the table after ${depth + 25} clicks — this is the infinite rebuy`)
  check('every unit is recorded once', new Set(keys).size === keys.length && keys.length === depth)
}

// --- 3. you cannot take more than they brought -------------------------------------------
console.log('\n3. Asking for more than is on the table:')
{
  const lines = seedSealedLines([deep], null)
  const depth = lines[0].qty
  const r = consumeLine(lines, asRenderedRow(lines[0], 0), depth + 10)
  check(`a lot of ${depth + 10} takes only the ${depth} they have`, r.took === depth)
  check('and charges keys for only those', r.keys.length === depth)
  const gone = consumeLine(r.lines, asRenderedRow(lines[0], 0), 1)
  check('a stale click on a sold-out line takes nothing', gone.took === 0 && gone.keys.length === 0)
}

// --- 4. closing and reopening keeps the remaining depth ----------------------------------
// The half-bought stack is the case that matters: not full again, not gone entirely.
console.log('\n4. Closing the booth (and the app) mid-stack:')
{
  const products = booths.flatMap(b => b.products || [])
  const taken = new Set()
  let sold = 0
  // Buy one unit off every line that has depth to spare.
  let lines = seedSealedLines(products, taken)
  for (const line of lines.filter(l => (l.qty || 1) >= 2)) {
    const r = consumeLine(lines, asRenderedRow(line, 0), 1)
    lines = r.lines; r.keys.forEach(k => taken.add(k)); sold += r.took
  }
  const reopened = seedSealedLines(products, taken)          // walk away and come back
  const unitsNow = reopened.reduce((a, l) => a + l.qty, 0)
  const unitsThen = products.reduce((a, l) => a + (l.qty || 1), 0)
  check(`${sold} unit(s) bought stay bought across a reopen`,
    unitsNow === unitsThen - sold, `${unitsNow} on the table, expected ${unitsThen - sold}`)
  check('no line comes back deeper than the vendor brought',
    reopened.every(l => l.qty <= (products.find(p => p._tk === l._tk).qty || 1)))
  check('a partly-bought stack is not wiped out either',
    reopened.some(l => l.qty >= 1 && taken.has(`${l._tk}#u1`)))
  // And again — the restart loop is what made the singles bug infinite.
  const twice = seedSealedLines(products, taken).reduce((a, l) => a + l.qty, 0)
  check('a second reopen changes nothing', twice === unitsNow)
}

// --- 5. draining a line completely, across reopens ---------------------------------------
console.log('\n5. Clearing a vendor out, one visit at a time:')
{
  const taken = new Set()
  const depth = deep.qty || 1
  let visits = 0, bought = 0
  for (let v = 0; v < depth + 25; v++) {                 // one unit per visit, then walk away
    const lines = seedSealedLines([deep], taken)
    visits++
    if (!lines.length) break
    const r = consumeLine(lines, asRenderedRow(lines[0], 0), 1)
    r.keys.forEach(k => taken.add(k)); bought += r.took
  }
  check(`${depth} visit(s) empty the line and no more come back`, bought === depth, `${bought} bought`)
  check('the table stays empty on every later visit', seedSealedLines([deep], taken).length === 0)
  check('it took the depth of the stack, not the number of tries', visits === depth + 1)
}

// --- 6. a mystery pack is one-and-done ---------------------------------------------------
console.log('\n6. Mystery packs retire by whole line:')
{
  const mys = booths.flatMap(b => b.products || []).find(p => p.mystery)
  if (!mys) console.log('  (no mystery pack on this floor — skipped)')
  else {
    const taken = new Set([mys._tk])                     // openMystery records the bare key
    check('the line is gone after one purchase', seedSealedLines([mys], taken).length === 0)
    check('it is on the table before that', seedSealedLines([mys], new Set()).length === 1)
  }
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed')
process.exit(failures ? 1 : 0)
