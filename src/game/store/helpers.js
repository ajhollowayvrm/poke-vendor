// Small internal helpers shared across the store slices.
//
// These are extracted from the old monolithic store. They're not actions and not part of
// the public API — just utilities the slices reuse. Grouped by concern:
//   • Per-set ledger:   setIdOf, bumpSet   (used by economy.recordSetSpend + collection.addPulls)
//   • Payment messaging: methodLabel, feeNote, appendFeeMsg  (used by booth + sourcing)
//   • Liquidation value: realizableAssets  (used by daytick.settleRent + economy.netWorth)
//   • Vintage shelf:     vintageFindOf, vintageLeft  (used by sourcing + the Buy screen)

import { round2, cardValue, sealedValue, distributorById, distributorVintageFind, DISTRIBUTOR_NOTO, DISTRIBUTOR_WORTH } from '../engine'

// Card ids are "<setId>-<number>" (e.g. "me4-2"); the set id is everything before
// the last hyphen so multi-hyphen set ids like "sv8pt5" survive.
export function setIdOf(card) {
  const id = card?.id
  if (!id) return null
  const i = id.lastIndexOf('-')
  return i > 0 ? id.slice(0, i) : id
}

// Merge a delta into a per-set ledger entry. Returns a new bySet object.
export function bumpSet(bySet, setId, delta) {
  if (!setId) return bySet
  const cur = bySet[setId] || { spent: 0, pulledValue: 0, packsOpened: 0, cardsPulled: 0, hits: 0 }
  return { ...bySet, [setId]: {
    spent: round2(cur.spent + (delta.spent || 0)),
    pulledValue: round2(cur.pulledValue + (delta.pulledValue || 0)),
    packsOpened: cur.packsOpened + (delta.packsOpened || 0),
    cardsPulled: cur.cardsPulled + (delta.cardsPulled || 0),
    hits: cur.hits + (delta.hits || 0),
  } }
}

// --- Payment-method result messaging ----------------------------------------
import { PAYMENT_METHODS, CREDIT_LIMIT_PCT, CREDIT_MIN_PCT, CREDIT_MIN_FLOOR } from './constants'

export function methodLabel(key) {
  const m = PAYMENT_METHODS[key]
  return m ? `${m.icon} ${m.short}` : 'cash'
}
export function feeNote(fee) { return fee > 0 ? ` − $${fee.toFixed(2)} fee` : '' }
export function appendFeeMsg(msg, fee, payMethod, net = null) {
  if (fee <= 0) return msg
  const m = PAYMENT_METHODS[payMethod]
  let out = `${msg} (${m?.short || 'processing'} took $${fee.toFixed(2)} in fees.)`.trim()
  // When a fee rail eats the whole sale, nudge toward a fee-free method next time.
  if (net != null && net <= 0.005) out += ' 💡 That tiny sale netted ~$0 — fee-free rails (Venmo/Cash) keep the cents on sub-$1 cards.'
  return out
}

// Liquidation value: cash + everything you could actually sell to dig out of rent arrears.
// Powers the rent death-check and the runway readouts, so it MUST count the liquid buckets
// beyond the collection — a player sitting on $50k of sealed (flippable at ~80% in one tap)
// but an empty collection is NOT bankrupt. Sealed takes a fire-sale haircut (flip rate);
// cards at market value; consignments at their owed net; issued store credit is a liability.
const FLIP = 0.8 // instant sealed-flip rate (SEALED_FLIP_RATE) — the fast-cash haircut
export function realizableAssets(s) {
  const cv = (arr) => (arr || []).reduce((a, c) => a + cardValue(c), 0)
  const sv = (arr) => (arr || []).reduce((a, it) => a + sealedValue(it) * FLIP, 0)
  return round2(
    (s.cash || 0)
    + (s.showReserve || 0)  // cash left at home for a show — still yours, still spendable
    + cv(s.collection) + cv(s.binder) + cv(s.shopDisplay) + cv(s.showInventory)
    + (s.listings || []).reduce((a, l) => a + cardValue(l.card), 0)
    + (s.consignments || []).reduce((a, c) => a + (c.net || 0), 0)
    + (s.pendingGrades || []).reduce((a, p) => a + cardValue(p.card), 0)
    + sv(s.sealedInventory) + sv(s.showSealed) + sv(s.shopSealed)
    + (s.lgsCredit || 0)          // LGS store credit you hold is spendable value → an asset
    - (s.storeCredit || 0)
    - (s.credit?.balance || 0))   // distributor credit you owe is a liability you must dig out of
}

// FULL net worth: cash on hand + the market value of EVERY asset you hold, wherever it
// sits — your collection & binder, cards out on the market (listings/consignments), your
// store shelf & show table, cards at the grader, and all sealed product (held or on your
// booth). Unlike realizableAssets (a quick liquidation figure for rent/job gating), this
// is the "total worth" headline: it stays put when you just MOVE value around (list a card,
// buy sealed, send a card to grade) — only real income/spend moves it. One definition, used
// by the header readout, the daily recap, and the Stats trend so they never disagree.
export function netWorthFull(s) {
  const cv = (arr) => (arr || []).reduce((a, c) => a + cardValue(c), 0)
  return round2(
    (s.cash || 0)
    + (s.showReserve || 0)  // cash left at home for a show — still yours, still spendable
    + cv(s.collection) + cv(s.binder) + cv(s.shopDisplay) + cv(s.showInventory)
    + (s.listings || []).reduce((a, l) => a + cardValue(l.card), 0)
    + (s.consignments || []).reduce((a, c) => a + (c.net || 0), 0)
    + (s.pendingGrades || []).reduce((a, p) => a + cardValue(p.card), 0)
    + (s.sealedInventory || []).reduce((a, it) => a + sealedValue(it), 0)
    // 🚢 import shipments on the water are paid-for stock — assets in transit, not spent money
    + (s.imports || []).reduce((a, sh) => a + (sh.rows || []).reduce((x, it) => x + sealedValue(it), 0), 0)
    + (s.showSealed || []).reduce((a, it) => a + sealedValue(it), 0)
    + (s.shopSealed || []).reduce((a, it) => a + sealedValue(it), 0)
    // Built mystery packs: the contents are still your assets until a buyer takes the pack.
    + (s.builtPacks || []).reduce((a, p) => a + cv(p.cards) + (p.sealed || []).reduce((x, it) => x + sealedValue(it), 0), 0)
    + (s.lgsCredit || 0)   // LGS store credit you hold is spendable value → an asset
    - (s.storeCredit || 0)  // issued store credit is a liability — locals will spend it out of your future takings
    - (s.credit?.balance || 0)) // distributor credit balance is money you owe — a liability
}

// Your distributor credit line and how much of it is still open. The limit scales with net
// worth (they lend against what you're worth). We base it on your DEBT-FREE net worth — add
// the balance back before applying the percentage — so drawing on the line moves `available`
// down 1:1 with the balance instead of the limit shrinking underneath you as you borrow.
export function creditLimit(s) {
  const base = netWorthFull(s) + (s.credit?.balance || 0) // assets net of other liabilities, before this debt
  return Math.max(0, round2(CREDIT_LIMIT_PCT * base))
}
export function creditAvailable(s) {
  if (s.credit?.frozen) return 0 // line suspended until a missed minimum is cured
  return Math.max(0, round2(creditLimit(s) - (s.credit?.balance || 0)))
}
// The monthly minimum payment on the current balance (10% of it, at least the floor, never
// more than the balance itself). Shared by the auto-settle and the "pay minimum" UI.
export function creditMinimum(s) {
  const bal = s.credit?.balance || 0
  if (bal <= 0) return 0
  return round2(Math.min(bal, Math.max(CREDIT_MIN_FLOOR, bal * CREDIT_MIN_PCT)))
}

// Have you crossed into being a DISTRIBUTOR yourself? The endgame status: a Household Name
// (notoriety) AND a millionaire (net worth) at once — both bars, not either. Once true, the
// trade orders wholesale from you (a passive daily margin resolved in the day tick).
export function isDistributor(s) {
  return (s.notoriety || 0) >= DISTRIBUTOR_NOTO && netWorthFull(s) >= DISTRIBUTOR_WORTH
}

// --- The vintage shelf ------------------------------------------------------
// This week's vintage find at a distributor (see engine.distributorVintageFind). Reads the
// live 🕵️ Vintage Scout upgrade so the shop UI and the buy path agree on what's out there.
import { weekIndexOf } from './constants'

export function vintageFindOf(s, distId) {
  const dist = distributorById(distId)
  if (!dist) return null
  return distributorVintageFind(dist, weekIndexOf(s.currentDay, s.monthsElapsed), s.upgrades?.vintageScout ? 1.5 : 1)
}

// How many of this week's find are STILL on the shelf. The find carries a small `qty` (1–2)
// — it's out-of-print product the vendor happened to turn up, not something they can reorder
// — so buying it clears the shelf until next week rotates in a new find.
//
// We store what you've TAKEN as {week, taken} rather than a remaining count: the tally
// self-expires the moment the week rolls over, so there's no restock tick to run, and a save
// written before this existed simply reads as "none taken yet" instead of "sold out".
//
// `setId`, when given, also demands the find BE that set — you can only re-buy a particular
// vintage pack while that exact pack is the one they've got out. Anywhere else it came from
// (a show, a trade, a DM deal) there's no shelf to go back to, and this correctly returns 0.
export function vintageLeft(s, distId, setId = null) {
  if (!distId) return 0
  const find = vintageFindOf(s, distId)
  if (!find) return 0
  if (setId && find.setId !== setId) return 0
  const rec = s.distributors?.[distId]?.vintage
  const taken = rec?.week === weekIndexOf(s.currentDay, s.monthsElapsed) ? (rec.taken || 0) : 0
  return Math.max(0, (find.qty || 1) - taken)
}
