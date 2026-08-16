// 🧾 The books — quarterly tax on what the business actually made.
//
// Every dollar this game has ever paid out was tax free. That is the one bill a real card
// dealer cannot ignore, and leaving it out quietly made the whole economy easier than the
// thing it is modelling.
//
// The model is CASH BASIS, which is what a small dealer really files:
//   • Revenue is money that came in.
//   • Expenses are money that went out on the business — inventory, fees, freight, grading,
//     the lease, wages, booth fees, supplies.
//   • Tax is charged on the difference, once a quarter.
//
// Two consequences make this a decision rather than a toll:
//
//   1. BUYING INVENTORY BEFORE THE QUARTER CLOSES LOWERS THE BILL. That is not an exploit,
//      it is exactly what cash-basis accounting does and exactly what dealers do every
//      December. Sitting on a fat quarter with no restock is the expensive way to play.
//   2. THE PAYMENT RAILS NOW CUT BOTH WAYS. Cash and Venmo skip the processing fee, which
//      the game already rewarded. A shop that can only take those rails is a cash business,
//      and a cash business is the profile that gets audited. Buying a card rail costs 2.9%
//      of every sale and buys down that exposure. See cashProfile below for why this is read
//      off the rails you own rather than tallied per sale — it is how an auditor really
//      profiles a shop, and it needs no bookkeeping the player cannot see.
//
// A quarter whose profit lands under FILING_FLOOR bills nothing, so an early-game player who
// is barely clearing rent never meets this system at all. It arrives when the business does.

import { round2 } from './engine'

// A quarter is three 30-day calendar months.
export const QUARTER_DAYS = 90
// Profit below this in a quarter is not worth anyone's paperwork. It is also what keeps the
// opening weeks of a game clear of the whole system.
export const FILING_FLOOR = 1000

// Brackets on the quarter's NET profit, low to high. Real self-employment tax plus income
// tax lands a small dealer in the high teens to low thirties; this is that shape, simplified
// to three steps you can hold in your head while deciding whether to restock.
export const TAX_BRACKETS = [
  { upTo: 6000,     rate: 0.16 },
  { upTo: 25000,    rate: 0.24 },
  { upTo: Infinity, rate: 0.31 },
]

// 🧮 An accountant finds the deductions you would never have claimed: mileage to every show,
// the home office, packing materials, the phone. Worth a real slice of the bill.
export const ACCOUNTANT_DEDUCTION = 0.08

// --- What the quarter owes -------------------------------------------------------
// Net profit for the period. Deductions the accountant surfaces come off the top.
export function quarterNet(books, upgrades) {
  const revenue = books?.revenue || 0
  let expenses = books?.expenses || 0
  if (upgrades?.accountant) expenses = expenses * (1 + ACCOUNTANT_DEDUCTION)
  return round2(Math.max(0, revenue - expenses))
}

// The bill itself, charged progressively through the brackets.
export function taxOn(net) {
  if (net <= FILING_FLOOR) return 0
  let owed = 0, prev = 0
  for (const b of TAX_BRACKETS) {
    const slice = Math.min(net, b.upTo) - prev
    if (slice <= 0) break
    owed += slice * b.rate
    prev = b.upTo
    if (net <= b.upTo) break
  }
  return round2(owed)
}
export function quarterBill(books, upgrades) {
  return taxOn(quarterNet(books, upgrades))
}

// The effective rate, for the panel's readout.
export function effectiveRate(books, upgrades) {
  const net = quarterNet(books, upgrades)
  if (net <= 0) return 0
  return quarterBill(books, upgrades) / net
}

// --- The audit -------------------------------------------------------------------
// Audit exposure is modelled the way a real auditor builds it: as a PROFILE OF THE BUSINESS,
// not a per-transaction ledger. The question an auditor asks is not "which sale was cash", it
// is "what kind of shop is this" — and a shop that can only take cash and Venmo is, by
// definition, a cash business. That is the profile below, read straight off the payment rails
// you have actually bought.
//
// The consequence is the point of the whole system: the card rails cost a processing fee on
// every sale, and they now BUY something back. Refusing to pay 2.9% keeps more of each sale
// and puts you in the bracket that gets looked at. Both sides of that are true in real life.
const TRACEABLE_RAILS = ['payPaypal', 'payCard', 'payTap']
export function cashProfile(upgrades, hasStore = false) {
  const rails = TRACEABLE_RAILS.filter(k => upgrades?.[k]).length
  // No card rail at all is a pure cash business. Each rail you add moves the profile down.
  const base = rails === 0 ? 1 : rails === 1 ? 0.62 : rails === 2 ? 0.42 : 0.30
  // A counter with a till takes more cash than a mail-order operation, whatever rails it has.
  return Math.max(0, Math.min(1, base + (hasStore ? 0.08 : 0)))
}
// Everyone takes some cash. A shop that takes almost nothing else is a shop that gets looked at.
export const CASH_SHARE_SAFE = 0.45
export const AUDIT_BASE = 0.02
export function auditChance(books, upgrades, hasStore = false) {
  if ((books?.revenue || 0) <= 0) return 0
  let p = AUDIT_BASE + Math.max(0, cashProfile(upgrades, hasStore) - CASH_SHARE_SAFE) * 0.35
  if ((books?.arrears || 0) > 0) p += 0.10  // a missed bill puts you on a list
  if (upgrades?.accountant) p *= 0.5        // a filed, professional return draws far less attention
  return Math.max(0, Math.min(0.5, p))
}
// What an audit costs when it lands: they reassess the share of revenue they believe went
// unreported, and add a penalty to it.
export const AUDIT_PENALTY_RATE = 0.22
export function auditPenalty(books, upgrades, hasStore = false) {
  const exposed = (books?.revenue || 0) * cashProfile(upgrades, hasStore)
  return round2(Math.min(exposed * AUDIT_PENALTY_RATE, 25000))
}

// --- Arrears ---------------------------------------------------------------------
// Interest on an unpaid bill, per day. Slow enough to survive a bad quarter, fast enough
// that ignoring it is not a strategy.
export const ARREARS_DAILY_RATE = 0.004
// Past this many days behind, the distributor credit line freezes — a business with a tax
// lien does not get net terms.
export const ARREARS_FREEZE_DAYS = 20

// --- Bookkeeping -----------------------------------------------------------------
export function freshBooks(day = 0) {
  return {
    qStart: day,        // absolute day this quarter opened
    revenue: 0,         // money in, this quarter
    expenses: 0,        // deductible money out, this quarter
    owed: 0,            // billed and unpaid
    arrears: 0,         // days a bill has gone unpaid
    lifetimePaid: 0,    // every quarter you have settled
    quarters: [],       // a short ring of closed quarters, for the panel
    lastAudit: 0,       // absolute day of the last audit
    audits: 0,          // how many you have had
  }
}

// The two accrual writes, as pure patches. economy.spend/earn fold these into the single
// set() they already make, so the books cost no extra state write on any hot path.
export function bookRevenue(books, amount) {
  const b = books || freshBooks(0)
  return { ...b, revenue: round2((b.revenue || 0) + amount) }
}
export function bookExpense(books, amount) {
  const b = books || freshBooks(0)
  return { ...b, expenses: round2((b.expenses || 0) + amount) }
}

// Which absolute day the current quarter ends on.
export function quarterEnds(books) {
  return (books?.qStart || 0) + QUARTER_DAYS
}
export function daysLeftInQuarter(books, absDay) {
  return Math.max(0, quarterEnds(books) - absDay)
}
// Quarter number, for the ledger lines.
export function quarterLabel(books) {
  return `Q${Math.floor((books?.qStart || 0) / QUARTER_DAYS) + 1}`
}

// How many closed quarters the panel remembers.
export const QUARTER_HISTORY = 8
