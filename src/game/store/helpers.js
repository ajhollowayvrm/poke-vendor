// Small internal helpers shared across the store slices.
//
// These are extracted from the old monolithic store. They're not actions and not part of
// the public API — just utilities the slices reuse. Grouped by concern:
//   • Per-set ledger:   setIdOf, bumpSet   (used by economy.recordSetSpend + collection.addPulls)
//   • Payment messaging: methodLabel, feeNote, appendFeeMsg  (used by booth + sourcing)
//   • Liquidation value: realizableAssets  (used by daytick.settleRent + economy.netWorth)

import { round2, cardValue } from '../engine'

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

// Rough liquidation value: cash + market value of the raw/graded collection. Used to
// decide whether a behind-on-rent player still has a comeback (assets to sell) or is done,
// and to power the net-worth / runway readouts.
export function realizableAssets(s) {
  const coll = (s.collection || []).reduce((sum, c) => sum + cardValue(c), 0)
  return round2((s.cash || 0) + coll)
}
