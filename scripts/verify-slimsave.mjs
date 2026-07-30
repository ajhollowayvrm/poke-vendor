// Round-trip check for the slim save format (src/game/store/slimsave.js).
//
// The format's whole safety claim is that deflate → inflate is the identity on card data:
// a field is only dropped when the bundled catalog reproduces it byte-for-byte. This
// asserts that over the REAL data — every card in every set, plus the awkward shapes the
// walk has to survive (cards nested inside listings/grades/built packs, sealed items,
// minted promos with no catalog row, cards carrying runtime-only decoration) — and prints
// what the format actually saves against the 350KB cloud cap.
//
// Usage:  npx vite-node scripts/verify-slimsave.mjs [collectionSize]
// (vite-node, like scripts/audit-pulls.mjs, because this imports the app's own modules —
// extensionless paths and a JSON import that plain node won't resolve.)
import { gzipSync } from 'node:zlib'
import { deflateState, inflateState } from '../src/game/store/slimsave.js'
import { instance, cardById } from '../src/game/engine.js'
import setsData from '../src/data/sets.json'

const N = Number(process.argv[2]) || 6000
const ALL = setsData.sets.flatMap(s => s.cards)
let failures = 0

function check(name, ok, detail = '') {
  if (ok) return
  failures++
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

// `_cut` is deliberately rounded on the way out (slimsave.js explains why it's free), so
// normalize it everywhere before comparing rather than special-casing each assertion.
const CUT_PRECISION = 1e4
function roundCuts(node) {
  if (node === null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(roundCuts)
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    out[k] = k === '_cut' && typeof v === 'number'
      ? Math.round(v * CUT_PRECISION) / CUT_PRECISION
      : roundCuts(v)
  }
  return out
}

// Deep equality that treats a missing key and an undefined value as the same thing, since
// that's the distinction JSON.stringify erases anyway.
function deepEq(a, b, path = '') {
  if (a === b) return null
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return `${path || '<root>'}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (a[k] === undefined && b[k] === undefined) continue
    const d = deepEq(a[k], b[k], path ? `${path}.${k}` : k)
    if (d) return d
  }
  return null
}

// --- 1. every card in the catalog survives a round trip -----------------------------
{
  console.log(`1. Round-tripping all ${ALL.length} catalog cards…`)
  const cards = ALL.map(c => instance(c))
  const back = inflateState(deflateState({ collection: cards })).collection
  check('all cards round-trip', back.length === cards.length, `${back.length} vs ${cards.length}`)
  let firstDiff = null
  for (let i = 0; i < cards.length; i++) {
    const d = deepEq(roundCuts(cards[i]), back[i])
    if (d && !firstDiff) firstDiff = `card ${cards[i].id} → ${d}`
  }
  check('no field lost or altered', !firstDiff, firstDiff)
}

// --- 2. instance-specific values always win over the catalog ------------------------
{
  console.log('2. Modified copies keep their own values…')
  const base = ALL.find(c => c.price != null && c.rarity)
  const mutated = {
    ...instance(base),
    price: 99999.99,            // a hand-priced copy must never be healed back to catalog
    rarity: 'Totally Made Up',
    name: `${base.name} (Signed)`,
    condition: 'MP', grade: { overall: 9, centering: 8, fee: 25 },
    loc: 'floor', locked: true, _featured: true, _heldFor: 'Dana', _isHit: true,
  }
  const [out] = inflateState(deflateState({ collection: [mutated] })).collection
  check('modified fields preserved', !deepEq(roundCuts(mutated), out), deepEq(roundCuts(mutated), out))
  const [slim] = deflateState({ collection: [mutated] }).collection
  check('modified fields written to disk', slim.price === 99999.99 && slim.name === mutated.name)
}

// --- 3. the awkward shapes ----------------------------------------------------------
{
  console.log('3. Nested, wrapped and catalog-less shapes…')
  const c = instance(ALL[0])
  const state = {
    collection: [instance(ALL[1])],
    pendingGrades: [{ card: c, tierKey: 'standard', readyOnDay: 12 }],
    listings: [{ card: instance(ALL[2]), price: 40, offers: [{ id: 1, amount: 30 }] }],
    builtPacks: [{ id: 'p1', cards: [instance(ALL[3])], sealed: [{ uid: 's1', setId: 'me1' }] }],
    bulkBin: { price: 0.25, stock: [instance(ALL[4])], sold: 3 },
    packMachine: { stock: [{ uid: 's2', setId: 'me1', product: { type: 'Booster Pack', price: 4.99 } }] },
    // No catalog row: a minted promo and a sealed pseudo-card. Both must pass through whole.
    promo: { uid: 'x1', id: 'me1-promoPikachu', name: 'Pikachu Promo', rarity: 'Promo', price: 12.5 },
    sealedListing: { uid: 's3', id: 'me1-sealed', name: 'Pitch Black Booster Box', price: 119, _sealed: true },
    cash: 1234.5, currentDay: 9, settings: { ripSpeed: 2 },
    log: () => {},                                  // actions ride along on the state object
  }
  const round = inflateState(deflateState(state))
  const d = deepEq({ ...roundCuts(state), log: undefined }, { ...round, log: undefined })
  check('nested structures round-trip', !d, d)
  check('functions passed through', round.log === state.log)
  const slim = deflateState(state)
  check('catalog-less cards kept whole', slim.promo.name === 'Pikachu Promo' && slim.sealedListing.price === 119)
  check('catalog cards actually slimmed', slim.collection[0].name === undefined)
}

// --- 4. inflate is idempotent and a no-op on fat saves ------------------------------
{
  console.log('4. Idempotence + backwards compatibility…')
  const fat = { collection: ALL.slice(0, 500).map(c => instance(c)) }
  const once = inflateState(fat)
  check('fat save returned by reference', once === fat)
  const slim = deflateState(fat)
  const a = inflateState(slim)
  const b = inflateState(a)
  check('second inflate is a no-op', b === a)
  const d = deepEq(a.collection, b.collection)
  check('double inflate unchanged', !d, d)
}

// --- 5. an orphaned card id (a set dropped from the data) --------------------------
{
  console.log('5. Orphaned card ids…')
  const orphan = { uid: 'o1', id: 'gone1-42', condition: 'NM', _cut: 0.5, grade: null }
  check('orphan id really is unknown', !cardById(orphan.id))
  const [out] = inflateState({ collection: [orphan] }).collection
  check('orphan survives with everything it had', out.uid === 'o1' && out.condition === 'NM' && out.grade === null)
  check('orphan gets a readable name', out.name === 'gone1-42')
  // The walk identifies cards by uid + id. Nothing in the save is shaped that way today
  // apart from real cards, but a future container could be — and it must not get labelled
  // as an orphaned card. Only objects carrying a card's own fields qualify.
  const container = { uid: 'k1', id: 'some-future-thing', rows: [instance(ALL[0])], total: 3 }
  const [round] = inflateState({ things: [container] }).things
  check('a uid+id container is not mistaken for a card', round.name === undefined)
}

// --- 6. what it saves ---------------------------------------------------------------
{
  const coll = Array.from({ length: N }, () => instance(ALL[Math.floor(Math.random() * ALL.length)]))
  const fat = JSON.stringify({ state: { collection: coll }, version: 58 })
  const slim = JSON.stringify({ state: deflateState({ collection: coll }), version: 58 })
  const gz = s => gzipSync(Buffer.from(s)).length
  const b64 = n => Math.ceil(n / 3) * 4          // cloudSave uploads gzip as base64
  const kb = n => `${(n / 1024).toFixed(0)}KB`
  const CAP = 350_000
  console.log(`\n6. A ${N.toLocaleString()}-card collection:`)
  console.log(`   raw JSON       ${kb(fat.length)} → ${kb(slim.length)}   (${(fat.length / slim.length).toFixed(1)}× smaller; localStorage caps ~5MB)`)
  console.log(`   cloud payload  ${kb(b64(gz(fat)))} → ${kb(b64(gz(slim)))}   (${(gz(fat) / gz(slim)).toFixed(1)}× smaller; cap ${kb(CAP)})`)
  console.log(`   cards that fit under the cloud cap: ` +
    `${Math.round(N * CAP / b64(gz(fat))).toLocaleString()} → ${Math.round(N * CAP / b64(gz(slim))).toLocaleString()}`)
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed')
process.exit(failures ? 1 : 0)
