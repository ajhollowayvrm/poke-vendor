// The v70 migration is the riskiest part of the navigation rewrite, because it is the one
// step that touches saves people are already playing. It has to do four things and no more:
//
//   1. Grandfather a 📒 binder for every set the player has already slotted cards into (and
//      for a declared 🃏 challenge), so nobody loses a masterset page they were filling.
//   2. Seed the new empty buckets — the cart and the DM inbox.
//   3. Refund cash sitting in live 🔨 auction-house bids, because those lots will never settle.
//   4. Refund 📰 reprint-wave preorder deposits, because that stock will never land.
//
// And it must not move a card. This asserts all of that against a synthetic v69 save.
//
// Usage:  npx vite-node scripts/verify-navmigration.mjs
import { useGame } from '../src/game/store/index.js'
import { instance, cardById, setIdOfCard } from '../src/game/engine.js'
import setsData from '../src/data/sets.json'
import { readFileSync } from 'node:fs'

let failures = 0
function check(name, ok, detail = '') {
  if (ok) { console.log(`  ✓ ${name}`); return }
  failures++
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

const migrate = useGame.persist.getOptions().migrate
if (typeof migrate !== 'function') {
  console.log('✗ could not reach the persist migrate function')
  process.exit(1)
}

const SETS = setsData.sets
const setA = SETS[0], setB = SETS[1], setC = SETS[2]
const card = (s, i) => instance(cardById(s.cards[i].id) || s.cards[i], 'pull')

// A v69 save, mid-career: cards in the binder for two sets, a chase declared on a THIRD set
// it has no cards for yet, money out on two auction lots, and a paid reprint preorder.
function v69Save() {
  return {
    cash: 1000,
    collection: [card(setA, 0), card(setB, 0), card(setC, 0)],
    binder: [card(setA, 1), card(setA, 2), card(setB, 1)],
    challenge: { setId: setC.id, setName: setC.name, total: 100, placed: 1 },
    auctionLots: [
      { id: 'l1', yourBid: 120, settled: false },
      { id: 'l2', yourBid: 80, settled: true },   // already settled: NOT refunded
      { id: 'l3', yourBid: 0, settled: false },
    ],
    auctionLotsDay: 4,
    auctionStats: { won: 1, lost: 2, spent: 300, burned: 0 },
    reprintWave: { setId: setA.id, prepaid: 250, preordered: 2, dropDay: 99, doneDay: null },
    currentDay: 12, monthsElapsed: 1,
  }
}

console.log('\n1. Binders are grandfathered, never taken away:')
{
  const out = migrate(v69Save(), 69)
  const ids = (out.binders || []).map(b => b.setId).sort()
  check('a binder exists for every set with slotted cards',
    ids.includes(setA.id) && ids.includes(setB.id), ids.join(','))
  check('the declared chase gets a binder even with nothing slotted yet',
    ids.includes(setC.id), ids.join(','))
  check('one binder per set, not one per card',
    new Set(ids).size === ids.length && ids.length === 3, `${ids.length} binders`)
  check('grandfathered binders are free (marked, not bought)',
    (out.binders || []).every(b => b.acquired === 'grandfathered' && b.boughtDay === 0))
  check('no slotted card was moved out of the binder',
    (out.binder || []).length === 3, `${(out.binder || []).length} cards`)
  check('no card was moved out of the collection',
    (out.collection || []).length === 3, `${(out.collection || []).length} cards`)
}

console.log('\n2. The new buckets are seeded, not left undefined:')
{
  const out = migrate(v69Save(), 69)
  check('cart', Array.isArray(out.cart) && out.cart.length === 0)
  check('dms', Array.isArray(out.dms) && out.dms.length === 0)
  check('dmStats', !!out.dmStats && out.dmStats.got === 0)
}

console.log('\n3. Money in retired systems comes BACK:')
{
  const out = migrate(v69Save(), 69)
  // 120 (live bid) + 250 (prepaid preorder). The settled lot and the zero bid pay nothing.
  check('live bids and the paid preorder are refunded',
    Math.abs(out.cash - (1000 + 120 + 250)) < 0.005, `cash ${out.cash}`)
  check('a settled lot is not refunded twice', out.cash !== 1000 + 120 + 80 + 250)
}

console.log('\n4. The retired systems are actually gone:')
{
  const out = migrate(v69Save(), 69)
  for (const k of ['auctionLots', 'auctionLotsDay', 'auctionStats', 'reprintWave']) {
    check(`${k} removed`, out[k] === undefined, `still ${JSON.stringify(out[k])}`)
  }
}

console.log('\n5. A save with none of it survives unchanged:')
{
  const bare = { cash: 50, collection: [], binder: [], currentDay: 1, monthsElapsed: 0 }
  const out = migrate(bare, 69)
  check('no binders invented out of nothing', (out.binders || []).length === 0)
  check('cash untouched', out.cash === 50, `cash ${out.cash}`)
  check('buckets still seeded', Array.isArray(out.cart) && Array.isArray(out.dms))
}

console.log('\n6. Re-running it is a no-op (a v70 save must not be re-migrated):')
{
  const once = migrate(v69Save(), 69)
  const cashAfterOnce = once.cash
  const twice = migrate({ ...once }, 70)
  check('no second refund', twice.cash === cashAfterOnce, `${cashAfterOnce} → ${twice.cash}`)
  check('binders unchanged', (twice.binders || []).length === (once.binders || []).length)
}

console.log('\n7. The 🛒 cart does not outlive the shelf that priced it:')
{
  // A line carries the price you were QUOTED. Shelves restock and re-price overnight, so a
  // basket parked for a month would let you buy at last month's price on a set that has since
  // run. The day tick empties it (daytick.js) — assert the field is actually in that write.
  const tick = readFileSync(new URL('../src/game/store/daytick.js', import.meta.url), 'utf8')
  check('the day tick clears the cart', /^\s*cart: \[\],\s*$/m.test(tick))
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed')
process.exit(failures ? 1 : 0)
