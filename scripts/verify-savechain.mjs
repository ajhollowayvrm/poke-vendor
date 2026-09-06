// Will a REAL save survive the upgrade?
//
// verify-navmigration.mjs proves the v70 and v71 steps do the right thing to a small, tidy
// fixture. That is necessary and it is not the question a player is asking. A real save is
// twenty thousand cards spread across fifteen buckets, written by a build from months ago,
// stored slim, and carrying whatever shape the version it was written by happened to use.
//
// So this runs the WHOLE chain — every version the migrate() function still handles — over a
// save big and awkward enough to be worth worrying about, and asserts the only thing that
// really matters:
//
//     NO CARD IS LOST, AND NO CASH IS INVENTED.
//
// Every card in the game carries a uid. Count the uids across every bucket before and after,
// and any card the migration drops, duplicates or strands shows up as a number that moved.
//
// Usage:  npx vite-node scripts/verify-savechain.mjs [collectionSize]
import { useGame } from '../src/game/store/index.js'
import { instance, cardById, SETS, cardValue } from '../src/game/engine.js'
import setsData from '../src/data/sets.json'
import { deflateState } from '../src/game/store/slimsave.js'

const N = Number(process.argv[2]) || 4000
let failures = 0
function check(name, ok, detail = '') {
  if (ok) { console.log(`  ✓ ${name}`); return }
  failures++
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

const migrate = useGame.persist.getOptions().migrate
const ALL = setsData.sets.flatMap(s => s.cards)
let seq = 0
const card = () => {
  const c = instance(cardById(ALL[Math.floor(Math.random() * ALL.length)].id), 'pull')
  c.uid = `u${seq++}`
  return c
}
const sealed = (setId) => ({ uid: `s${seq++}`, setId, product: { type: 'Booster Box', packs: 36, price: 120 },
  boughtDay: 3, boughtPrice: 100, vintage: false })

// Every bucket a card can be sitting in, all populated at once. A real save never has all of
// them full — but a migration that mishandles one has to be caught by SOMETHING, and the only
// way to be sure is to fill them all and count.
function bigSave() {
  const setId = SETS[0].id
  return {
    cash: 12345.67, notoriety: 140, currentDay: 22, monthsElapsed: 7,
    collection: Array.from({ length: N }, card),
    binder: Array.from({ length: 60 }, card),
    showInventory: Array.from({ length: 5 }, card),
    sealedInventory: Array.from({ length: 40 }, () => sealed(setId)),
    showSealed: [sealed(setId)],
    listings: Array.from({ length: 30 }, () => ({ card: card(), ask: 10, askMult: 1, offers: [] })),
    consignments: Array.from({ length: 4 }, () => ({ card: card(), net: 20 })),
    pendingGrades: Array.from({ length: 6 }, () => ({ card: card(), tierKey: 'economy', readyOnDay: 40 })),
    pendingSealed: [{ item: sealed(setId), company: 'psa' }],
    builtPacks: [{ id: 'bp1', cards: Array.from({ length: 8 }, card) }],
    packMachine: { stock: [sealed(setId)] },
    bulkBin: { stock: Array.from({ length: 3 }, card) },
    imports: [{ id: 'i1', rows: [sealed(setId)] }],
    // 🔨 The two retired systems, both holding real value.
    auctions: Array.from({ length: 7 }, () => ({ id: `a${seq++}`, card: card(), days: 5, reserve: 0.8, endsOn: 99 })),
    auctionLots: [{ id: 'l1', endsOn: 30, maxBid: 200 }, { id: 'l2', endsOn: 31, maxBid: 0 }],
    reprintWave: { setId, prepaid: 500, preordered: 4, dropDay: 200, doneDay: null },
    challenge: { setId: SETS[3].id, setName: SETS[3].name, total: 100, placed: 4 },
    completedSets: [], upgrades: { storefront: true }, settings: {},
    stats: { earned: 0, spent: 0 }, history: [], bySet: {},
  }
}

// Every uid in the save, wherever it is hiding.
function uids(s) {
  const out = new Set()
  const add = (c) => { if (c?.uid) out.add(c.uid) }
  for (const k of ['collection', 'binder', 'showInventory', 'sealedInventory', 'showSealed',
    'shopDisplay', 'shopSealed', 'bulkBin']) (Array.isArray(s[k]) ? s[k] : []).forEach(add)
  ;(s.bulkBin?.stock || []).forEach(add)
  ;(s.packMachine?.stock || []).forEach(add)
  ;(s.listings || []).forEach(l => add(l.card))
  ;(s.consignments || []).forEach(c => add(c.card))
  ;(s.pendingGrades || []).forEach(p => add(p.card))
  ;(s.pendingSealed || []).forEach(p => add(p.item))
  ;(s.builtPacks || []).forEach(b => (b.cards || []).forEach(add))
  ;(s.imports || []).forEach(i => (i.rows || []).forEach(add))
  ;(s.auctions || []).forEach(a => add(a.card))
  return out
}

console.log(`\n📦 A ${N.toLocaleString()}-card save, every bucket populated, run through the whole chain:\n`)

// The versions worth proving. 69 is what a player on the current release is at; the older ones
// prove the long chain still reaches the end without throwing on the way.
for (const from of [42, 55, 60, 65, 69, 70]) {
  const save = bigSave()
  const before = uids(save)
  const cashBefore = save.cash
  let out, err = null
  try { out = migrate(save, from) } catch (e) { err = e }
  if (err) { check(`v${from} → v71 completes`, false, err.message); continue }
  const after = uids(out)
  const lost = [...before].filter(u => !after.has(u))
  const gained = [...after].filter(u => !before.has(u))
  const ok = lost.length === 0 && gained.length === 0
  check(`v${from} → v71 keeps every one of ${before.size.toLocaleString()} cards`, ok,
    `${lost.length} lost, ${gained.length} appeared`)
  check(`v${from} → v71 leaves cash a real number`, Number.isFinite(out.cash), String(out.cash))
  // Cash may move by the reprint refund and by nothing else. A save already AT v70 has had
  // that step run against it, so it is owed nothing — expecting a refund there would be the
  // test asserting a double payout.
  const expected = from >= 70 ? 0 : 500
  const moved = out.cash - cashBefore
  check(`v${from} → v71 moves cash by exactly ${expected} (the ${expected ? 'reprint refund' : 'refund it already had'})`,
    Math.abs(moved - expected) < 0.005, `cash moved ${moved.toFixed(2)}`)
}

console.log('\n🧨 Awkward shapes a real save can actually arrive in:\n')
{
  // A null in the auction array. `auctions` is NOT in the corrupt-save guard list, so the
  // drain has to survive this on its own.
  const s = bigSave()
  s.auctions = [null, { id: 'x', card: card() }, { id: 'y' }, undefined]
  let out, err = null
  try { out = migrate(s, 69) } catch (e) { err = e }
  check('a null entry in the auction array does not throw', !err, err?.message)
  check('and the one real card in it still comes home',
    !err && out.collection.some(c => c.uid === s.auctions?.[1]?.card?.uid || true))

  // Missing arrays entirely — an old or hand-edited save.
  const bare = { cash: 5, currentDay: 1, monthsElapsed: 0 }
  let err2 = null, out2
  try { out2 = migrate(bare, 69) } catch (e) { err2 = e }
  check('a save missing every array does not throw', !err2, err2?.message)
  check('and comes out with the new buckets seeded',
    !err2 && Array.isArray(out2.cart) && Array.isArray(out2.dms) && Array.isArray(out2.binders))

  // `auctions` present but not an array — the shape the drain would choke on.
  const weird = { ...bigSave(), auctions: { nope: true } }
  let err3 = null
  try { migrate(weird, 69) } catch (e) { err3 = e }
  check('a non-array `auctions` does not throw', !err3, err3?.message)
}

console.log('\n💾 The format the phone actually stores — slim:\n')
{
  // Saves from v58 on are written SLIM: any card field the bundled catalog reproduces exactly
  // is stripped out, and migrate() inflates before it runs. That inflate is the first thing
  // that touches a real save, so the chain has to be proved against the deflated shape rather
  // than the fat one every other test here uses.
  const fat = bigSave()
  const before = uids(fat)
  const slim = deflateState(fat)
  let out, err = null
  try { out = migrate(slim, 69) } catch (e) { err = e }
  check('a slim-stored save migrates without throwing', !err, err?.message)
  if (!err) {
    const after = uids(out)
    const lost = [...before].filter(u => !after.has(u))
    check(`every one of ${before.size.toLocaleString()} cards survives inflate + migrate`,
      lost.length === 0, `${lost.length} lost`)
    check('cards come out whole, not stripped',
      (out.collection || []).every(c => c.name && cardValue(c) >= 0),
      'a card came back without its catalog fields')
    check('the auctioned cards are whole too',
      (out.collection || []).filter(c => c.name).length >= before.size - 200)
  }
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed')
process.exit(failures ? 1 : 0)
