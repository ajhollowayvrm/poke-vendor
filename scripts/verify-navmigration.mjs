// The v70 migration is the riskiest part of the navigation rewrite, because it is the one
// step that touches saves people are already playing. It has to do four things and no more:
//
//   1. Grandfather a 📒 binder for every set the player has already slotted cards into (and
//      for a declared 🃏 challenge), so nobody loses a masterset page they were filling.
//   2. Seed the new empty buckets — the cart and the DM inbox.
//   3. Refund 📰 reprint-wave preorder deposits, because that stock will never land — but NOT
//      one that already dropped, whose boxes are in the storeroom.
//
// v71 retires the SELL side of the auction house, and that one is card-safety critical: a
// card listed at auction was REMOVED from the collection and lived only inside the auction
// record, so the array has to be drained home before it is dropped.
//
// This asserts all of that against synthetic v69 and v70 saves.
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

// A v69 save, mid-career: cards in the binder for two sets, a chase declared on a THIRD set it
// has no cards for yet, proxy bids on the auction board, and a paid reprint preorder.
//
// THE LOTS CARRY THE REAL FIELD NAMES. An earlier version of this file invented
// `{ id, yourBid, settled }` and asserted against that — a shape the game has never written —
// so it passed green while the migration's refund loop read fields that do not exist and
// silently paid back nothing. A fixture you made up only ever tests the fixture.
//
// The generator (src/game/lots.js) is DELETED by this same change, so this cannot import it.
// The shape below is what refillLots() wrote at the point of deletion — see the file in
// `git show 643706a:src/game/lots.js` (makeLot, ~line 185): an id, an `endsOn` clock, and
// `maxBid`, the player's proxy, starting at 0. There is no `yourBid` and no `settled`.
//
// The load-bearing fact: `maxBid` is a COMMITMENT, not an escrow. bidOnLot only wrote the
// number; the cash left at settlement in settleAuctionLots. So an open lot holds none of the
// player's money, and the assertions below pin that the migration pays back nothing for one.
function v69Save(waveOverrides = {}) {
  const lots = [
    { id: 'lot1', endsOn: 9, maxBid: 120, watchers: 3 },  // a live proxy bid
    { id: 'lot2', endsOn: 11, maxBid: 80, watchers: 1 },  // another
    { id: 'lot3', endsOn: 7, maxBid: 0, watchers: 6 },    // never bid on
  ]
  return {
    cash: 1000,
    collection: [card(setA, 0), card(setB, 0), card(setC, 0)],
    binder: [card(setA, 1), card(setA, 2), card(setB, 1)],
    challenge: { setId: setC.id, setName: setC.name, total: 100, placed: 1 },
    auctionLots: lots,
    auctionLotsDay: 4,
    auctionStats: { won: 1, lost: 2, spent: 300, burned: 0 },
    // Announced, deposits paid, NOT yet dropped — this stock will never land, so it refunds.
    reprintWave: { setId: setA.id, prepaid: 250, preordered: 2, dropDay: 99, doneDay: null,
      ...waveOverrides },
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

console.log('\n3. Money comes back where money was actually taken — and nowhere else:')
{
  // An UNDELIVERED preorder refunds: the boxes will never land now.
  const out = migrate(v69Save(), 69)
  check('an undelivered reprint preorder is refunded in full',
    Math.abs(out.cash - (1000 + 250)) < 0.005, `cash ${out.cash}`)

  // A proxy bid is a COMMITMENT, not an escrow — bidOnLot never spent, settleAuctionLots did.
  // Refunding maxBid would hand the player money that never left their pocket.
  const bids = v69Save().auctionLots.reduce((a, l) => a + (l.maxBid || 0), 0)
  check('the fixture really does carry open proxy bids (or this proves nothing)',
    bids > 0, `bids total ${bids}`)
  check('open proxy bids are NOT refunded — no cash was ever held in them',
    Math.abs(out.cash - (1000 + 250)) < 0.005, `cash ${out.cash}, bids ${bids}`)

  // A wave that already dropped delivered its stock. `prepaid` survives the drop (it only
  // stamps doneDay), so refunding it would hand back the money AND leave the boxes.
  const dropped = migrate(v69Save({ doneDay: 40 }), 69)
  check('a DELIVERED preorder is not refunded',
    Math.abs(dropped.cash - 1000) < 0.005, `cash ${dropped.cash} — the stock already landed`)
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

console.log('\n7. v71 brings every auctioned card home before dropping the array:')
{
  // The load-bearing fact: listing a card at auction REMOVED it from `collection`
  // (selling.js filtered it out), so `auctions[].card` was the only copy in the save. Dropping
  // the array without draining destroys them — and they are the player's BEST cards, because
  // those are the ones worth sending to auction in the first place.
  const auctioned = [card(setA, 5), card(setB, 5)]
  const save = {
    cash: 400, currentDay: 3, monthsElapsed: 0,
    collection: [card(setC, 5)],
    binder: [],
    auctions: [
      { id: 'a1', card: auctioned[0], days: 5, reserve: 0.8, endsOn: 40, watchers: 4, bids: 0 },
      { id: 'a2', card: auctioned[1], days: 3, reserve: null, endsOn: 41, watchers: 1, bids: 0 },
    ],
  }
  const before = save.collection.length
  const out = migrate(save, 70)
  check('every card on the block came home',
    out.collection.length === before + 2, `${before} → ${out.collection.length}`)
  const uids = new Set(out.collection.map(c => c.uid))
  check('and they are the SAME cards, by uid',
    auctioned.every(c => uids.has(c.uid)))
  check('the array is gone', out.auctions === undefined)
  check('no cash was invented on the way', Math.abs(out.cash - 400) < 0.005, `cash ${out.cash}`)

  // A save with nothing at auction must not gain a phantom card.
  const bare = migrate({ cash: 10, collection: [], binder: [], auctions: [], currentDay: 1, monthsElapsed: 0 }, 70)
  check('an empty block adds nothing', (bare.collection || []).length === 0)
}

console.log('\n8. The 🛒 cart does not outlive the shelf that priced it:')
{
  // A line carries the price you were QUOTED. Shelves restock and re-price overnight, so a
  // basket parked for a month would let you buy at last month's price on a set that has since
  // run. The day tick empties it (daytick.js) — assert the field is actually in that write.
  const tick = readFileSync(new URL('../src/game/store/daytick.js', import.meta.url), 'utf8')
  check('the day tick clears the cart', /^\s*cart: \[\],\s*$/m.test(tick))
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed')
process.exit(failures ? 1 : 0)
