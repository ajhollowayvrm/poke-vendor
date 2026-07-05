// Small internal helpers shared across the store slices.
//
// These are extracted from the old monolithic store. They're not actions and not part of
// the public API — just utilities the slices reuse. Grouped by concern:
//   • Per-set ledger:   setIdOf, bumpSet   (used by economy.recordSetSpend + collection.addPulls)
//   • Payment messaging: methodLabel, feeNote, appendFeeMsg  (used by booth + sourcing)
//   • Liquidation value: realizableAssets  (used by daytick.settleRent + economy.netWorth)

import { round2, cardValue, sealedValue } from '../engine'

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
import { PAYMENT_METHODS } from './constants'

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
    + cv(s.collection) + cv(s.binder) + cv(s.shopDisplay) + cv(s.showInventory)
    + (s.listings || []).reduce((a, l) => a + cardValue(l.card), 0)
    + (s.consignments || []).reduce((a, c) => a + (c.net || 0), 0)
    + (s.pendingGrades || []).reduce((a, p) => a + cardValue(p.card), 0)
    + sv(s.sealedInventory) + sv(s.showSealed) + sv(s.shopSealed)
    - (s.storeCredit || 0))
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
    + cv(s.collection) + cv(s.binder) + cv(s.shopDisplay) + cv(s.showInventory)
    + (s.listings || []).reduce((a, l) => a + cardValue(l.card), 0)
    + (s.consignments || []).reduce((a, c) => a + (c.net || 0), 0)
    + (s.pendingGrades || []).reduce((a, p) => a + cardValue(p.card), 0)
    + (s.sealedInventory || []).reduce((a, it) => a + sealedValue(it), 0)
    + (s.showSealed || []).reduce((a, it) => a + sealedValue(it), 0)
    + (s.shopSealed || []).reduce((a, it) => a + sealedValue(it), 0)
    // Built mystery packs: the contents are still your assets until a buyer takes the pack.
    + (s.builtPacks || []).reduce((a, p) => a + cv(p.cards) + (p.sealed || []).reduce((x, it) => x + sealedValue(it), 0), 0)
    - (s.storeCredit || 0)) // issued store credit is a liability — locals will spend it out of your future takings
}
