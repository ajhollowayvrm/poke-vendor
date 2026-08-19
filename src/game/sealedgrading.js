// 📦🔟 Sealed grading — putting the box itself in a holder.
//
// Grading a sealed booster box is a real and fast-growing part of this hobby, and the game
// modelled none of it. It also fits what is already here better than almost anything else
// could: vintage sealed already appreciates in this economy, and a graded wrapper is how a
// serious holder protects and proves that appreciation.
//
// The rule that keeps it honest is the same rule the real market applies:
//
//   GRADING MODERN SEALED IS POINTLESS. A 2024 Elite Trainer Box in a holder is a 2024 Elite
//   Trainer Box with a fee attached. The premium lives almost entirely in vintage, where the
//   scarcity of an unsearched, undamaged wrapper is the whole proposition.
//
// So the multiplier ladder below is steep, and then it is scaled down hard by how modern the
// product is. Sending this quarter's restock to a grader is a mistake you are allowed to make.
//
// The other honest constraint: an old wrapper is old. Vintage sealed does not routinely come
// back a 10 — it has spent twenty-five years in somebody's cupboard, and the grade curve
// below says so.

import { round2 } from './engine'

// Who grades sealed product. Two real houses, and they differ the way the card graders do:
// price, speed, and what the holder is worth on resale.
export const SEALED_GRADERS = {
  wata: { key: 'wata', name: 'WATA', icon: '🟪', color: '#a78bfa', feeMult: 1, daysMult: 1, slabMult: 1,
    blurb: 'The name the sealed market quotes. Slowest and dearest, and the holder that sells.' },
  cgc:  { key: 'cgc', name: 'CGC', icon: '🟨', color: '#ffcb05', feeMult: 0.7, daysMult: 0.65, slabMult: 0.88,
    blurb: 'Cheaper and much quicker, at a real discount on resale. The volume option.' },
}
export const DEFAULT_SEALED_GRADER = 'wata'
export function sealedGraderById(key) { return SEALED_GRADERS[key] || SEALED_GRADERS[DEFAULT_SEALED_GRADER] }

// The ladder sealed grading actually uses — half steps, not whole numbers.
export const SEALED_GRADES = [7, 7.5, 8, 8.5, 9, 9.5, 10]

// What each grade does to a VINTAGE sealed product's value, before the modernity scaling.
const SEALED_MULT = { 10: 3.2, 9.5: 2.3, 9: 1.7, 8.5: 1.3, 8: 1.1, 7.5: 0.95, 7: 0.85 }

// How much of that ladder a product actually earns. True vintage gets all of it; retired
// modern product gets half; anything still in print gets almost none.
export function premiumShare(item) {
  if (item?.vintage) return 1
  if (item?.aftermarket) return 0.5
  return 0.15
}
// The value multiplier for a graded sealed item.
export function sealedGradeMult(item, grade) {
  if (!grade) return 1
  const base = SEALED_MULT[grade.overall] ?? 1
  const share = premiumShare(item)
  const scaled = 1 + (base - 1) * share
  return scaled * sealedGraderById(grade.company).slabMult
}

// --- The roll ---------------------------------------------------------------------
// Vintage wrappers are old. The curve is centred near 8.5 and a 10 is genuinely uncommon,
// which is why an unsearched 10 out of a 1999 case is worth what it is worth. Modern product
// comes off a pallet and grades high — and earns almost nothing for it.
const CURVE_VINTAGE = [[7, 0.10], [7.5, 0.16], [8, 0.24], [8.5, 0.22], [9, 0.16], [9.5, 0.08], [10, 0.04]]
const CURVE_MODERN  = [[7, 0.02], [7.5, 0.05], [8, 0.11], [8.5, 0.17], [9, 0.27], [9.5, 0.23], [10, 0.15]]

export function rollSealedGrade(item, company = DEFAULT_SEALED_GRADER, paidFee = null, rnd = Math.random) {
  const curve = item?.vintage ? CURVE_VINTAGE : CURVE_MODERN
  let r = rnd(), overall = curve[0][0]
  for (const [g, p] of curve) {
    r -= p
    if (r <= 0) { overall = g; break }
    overall = g
  }
  return { overall, company, fee: paidFee ?? 0, gradedAt: Date.now(), sealed: true }
}

// --- Cost and time ----------------------------------------------------------------
// A flat handling charge plus a slice of declared value, which is how sealed submissions are
// really priced — the holder is big, the insurance is real, and the freight is not trivial.
export const SEALED_FEE_BASE = 60
export const SEALED_FEE_RATE = 0.04
export const SEALED_FEE_FLOOR = 45
export const SEALED_DAYS = 40

export function sealedGradingFee(value, company = DEFAULT_SEALED_GRADER) {
  const g = sealedGraderById(company)
  return round2(Math.max(SEALED_FEE_FLOOR, (SEALED_FEE_BASE + (value || 0) * SEALED_FEE_RATE) * g.feeMult))
}
export function sealedGradingDays(company = DEFAULT_SEALED_GRADER, upgrades = null) {
  const g = sealedGraderById(company)
  // 🚚 The Grader Dealer Account courier covers sealed submissions too — speed only, as always.
  const mult = upgrades?.graderAccount ? 0.6 : 1
  return Math.max(2, Math.ceil(SEALED_DAYS * g.daysMult * mult))
}

// How a graded sealed item reads on screen: "WATA 9.5".
export function sealedSlabLabel(grade) {
  if (!grade) return ''
  const n = Number.isInteger(grade.overall) ? `${grade.overall}.0` : String(grade.overall)
  return `${sealedGraderById(grade.company).name} ${n}`
}

// Is this worth sending at all? The panel uses this to warn before a player pays a fee to
// put a $40 restock box in a holder — the most common way to lose money on this system.
export function worthGrading(item, value) {
  const share = premiumShare(item)
  if (share <= 0.2) return { ok: false, why: 'This is still in print. A holder adds almost nothing to it — the premium is a vintage premium.' }
  const fee = sealedGradingFee(value)
  if (fee >= value * 0.5) return { ok: false, why: 'The fee is worth half the product. Grading this cannot pay for itself.' }
  return { ok: true }
}
