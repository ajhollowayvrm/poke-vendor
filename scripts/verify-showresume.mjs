// Does a show survive being closed and reopened?
//
// Entering a show spends real, irreversible things — the entry fee, the calendar days, the
// pre-show leads — so the save carries an `activeShow` record and boot walks you back onto
// the floor (App.jsx). The floor itself is NOT saved: it is rebuilt by generateBooths from
// show.seed, and `activeShow.taken` is the short list of what you already lifted off the
// tables, replayed against the rebuilt floor to keep it off.
//
// That replay is the whole safety property, and it rests on one thing: the key in `taken`
// must still identify the same item after a rebuild. This asserts exactly that, plus the
// determinism it depends on.
//
// Usage:  npx vite-node scripts/verify-showresume.mjs
import { generateBooths, boothItemKey, makeShowVendors, SHOW_TIERS } from '../src/game/shows.js'

let failures = 0
function check(name, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// A show the way App.jsx hands one to the floor, and the way the save gives it back.
const roster = makeShowVendors()
const show = { id: 'sh-verify', name: 'Verify Regional', seed: 424242, tierKey: 'regional', day: 9 }
const build = (dayOffset = 0) => {
  const bs = generateBooths(show, dayOffset, roster, 'open', [], null)
  // Exactly what ShowFloor stamps on the floor it builds.
  bs.forEach((b, bi) => {
    ;(b.stock || []).forEach((c, ci) => { c._tk = `${bi}#c${ci}` })
    ;(b.products || []).forEach((p, pi) => { p._tk = `${bi}#s${pi}` })
  })
  return bs
}

// The floor before the app closed, and the one boot rebuilds from the same saved show.
const before = build()
const after = build()

console.log(`\n${SHOW_TIERS[show.tierKey].name}: ${before.length} booths, ` +
  `${before.reduce((a, b) => a + (b.stock?.length || 0), 0)} singles, ` +
  `${before.reduce((a, b) => a + (b.products?.length || 0), 0)} sealed lines.`)

// --- 1. the floor is deterministic ----------------------------------------------------
// If it weren't, resuming would be a different show and none of the rest could work.
console.log('\n1. A rebuild from the same seed is the same floor:')
check('same booth count', before.length === after.length)
check('same booth names', before.every((b, i) => b.name === after[i].name))
check('same singles, in the same order, at the same prices',
  before.every((b, i) => (b.stock || []).length === (after[i].stock || []).length
    && (b.stock || []).every((c, j) => c.id === after[i].stock[j].id && c._ask === after[i].stock[j]._ask)))
check('same sealed lines at the same prices',
  before.every((b, i) => (b.products || []).length === (after[i].products || []).length
    && (b.products || []).every((p, j) => p._ask === after[i].products[j]._ask)))

// --- 2. the uid does NOT survive the rebuild ------------------------------------------
// This is the bug's root: engine.instance() mints a uid from Date.now() + a counter, so the
// identical card comes back under a brand-new name. A `taken` list of uids matched nothing.
console.log('\n2. Why a card uid cannot be the key:')
const beforeUids = new Set(before.flatMap(b => (b.stock || []).map(c => c.uid)))
const sharedUids = after.flatMap(b => (b.stock || []).map(c => c.uid)).filter(u => beforeUids.has(u))
check('every rebuilt single carries a NEW uid', sharedUids.length === 0,
  `${sharedUids.length} uid(s) happened to repeat`)

// --- 3. the position DOES survive ------------------------------------------------------
console.log('\n3. Why the position can be:')
const keysOf = bs => bs.flatMap(b => [...(b.stock || []), ...(b.products || [])].map(boothItemKey))
const kBefore = keysOf(before), kAfter = keysOf(after)
check('every item resolves to the same key after the rebuild',
  kBefore.length === kAfter.length && kBefore.every((k, i) => k === kAfter[i]))
check('no two items on the floor share a key', new Set(kBefore).size === kBefore.length,
  `${kBefore.length - new Set(kBefore).size} collision(s)`)
check('singles and sealed cannot collide', kBefore.every(k => /#[cs]\d+$/.test(k)))

// --- 4. the actual resume ---------------------------------------------------------------
// Buy a scatter of singles, save the keys, throw the floor away, rebuild, replay. Nothing
// bought may come back — that return is the infinite rebuy.
console.log('\n4. Buying, closing the app, and coming back:')
const bought = before.flatMap(b => (b.stock || []).filter((_, i) => i % 7 === 3))
const taken = new Set(bought.map(boothItemKey))                 // what the save holds
const resumed = build()                                          // boot rebuilds the floor
const served = resumed.flatMap(b => (b.stock || []).filter(c => !taken.has(boothItemKey(c))))
// Compared by POSITION, not by card: a bin legitimately holds several copies of one common at
// one price, so "the same card is on the table" is not evidence of anything. Only the slot is.
const reServed = served.filter(c => taken.has(boothItemKey(c)))
check(`all ${bought.length} purchased singles stay off the table`,
  served.length === before.reduce((a, b) => a + (b.stock?.length || 0), 0) - bought.length,
  `${served.length} still served`)
check('no bought slot is served again under a fresh uid', reServed.length === 0,
  `${reServed.length} came back`)
// The key must address the card it was minted from, not merely be unique — a positional key
// that pointed at the wrong slot would pass every count above and still take the wrong card.
const atKey = (bs, k) => {
  const [bi, ci] = String(k).split('#c')
  return bs[Number(bi)]?.stock?.[Number(ci)]
}
check('each key still addresses the very card it was minted from',
  bought.every(x => atKey(resumed, boothItemKey(x))?.id === x.id))

// A second restart must not re-serve them either — that is what made it INFINITE.
const twice = build().flatMap(b => (b.stock || []).filter(c => !taken.has(boothItemKey(c))))
check('a second close-and-reopen changes nothing', twice.length === served.length)

// --- 5. a new show day is a new floor ---------------------------------------------------
// The keys are positions, so day 2 reuses every one of day 1's. ShowFloor drops the set when
// the day advances; if it did not, yesterday's purchases would blank today's stock.
console.log('\n5. Day 2 is a different floor at the same addresses:')
const day2 = build(1)
const d2keys = new Set(keysOf(day2))
check('day 2 reuses day 1 keys (so they MUST be cleared)',
  keysOf(before).some(k => d2keys.has(k)))
check('day 2 stocks different cards', day2.some((b, i) =>
  (b.stock || []).some((c, j) => c.id !== before[i]?.stock?.[j]?.id)))
const wronglyBlanked = day2.flatMap(b => (b.stock || []).filter(c => taken.has(boothItemKey(c))))
check(`replaying day 1's list against day 2 would blank ${wronglyBlanked.length} card(s)`,
  wronglyBlanked.length > 0)

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed')
process.exit(failures ? 1 : 0)
