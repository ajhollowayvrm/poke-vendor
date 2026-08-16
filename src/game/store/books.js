// Books slice — 🧾 the quarterly tax bill and 🏦 the bank note.
//
// Both are money the business owes on a clock rather than money it chooses to spend, which
// is why they share a slice. The per-day work (closing a quarter, taking the day's loan
// instalment, accruing arrears) lives in daytick.js beside the other settlements; what is
// here is what the PLAYER can do about them: pay the bill, sign a note, clear it early.
//
// The accrual itself is not here either — economy.spend/earn fold every dollar into
// state.books as it moves, so there is exactly one place money is counted. See game/tax.js.

import { round2, fmtMoney } from '../engine'
import { netWorthFull } from './helpers'
import { absoluteDay } from './constants'
import {
  quarterBill, quarterNet, quarterEnds, freshBooks, quarterLabel, QUARTER_HISTORY,
  auditChance, auditPenalty, cashProfile, effectiveRate,
  ARREARS_DAILY_RATE, ARREARS_FREEZE_DAYS,
} from '../tax'
import {
  LOAN_OFFERS, loanOfferById, loanEligible, makeLoan, payoffAmount, loanTotals,
  LOAN_DEFAULT_DAYS, LOAN_DEFAULT_NOTORIETY, LOAN_DEFAULT_COOLDOWN,
} from '../loans'

export function createBooksSlice(set, get) {
  return {
    // --- 🧾 Tax --------------------------------------------------------------------
    // What the quarter looks like right now, for the Books panel. Everything the player
    // needs to decide whether to restock before the quarter closes.
    booksSummary() {
      const s = get()
      const b = s.books || freshBooks(0)
      const day = absoluteDay(s.currentDay, s.monthsElapsed)
      const hasStore = !!s.upgrades?.storefront
      return {
        books: b,
        label: quarterLabel(b),
        net: quarterNet(b, s.upgrades),
        bill: quarterBill(b, s.upgrades),
        rate: effectiveRate(b, s.upgrades),
        owed: b.owed || 0,
        arrears: b.arrears || 0,
        daysLeft: Math.max(0, quarterEnds(b) - day),
        cashProfile: cashProfile(s.upgrades, hasStore),
        auditRisk: auditChance(b, s.upgrades, hasStore),
        hasAccountant: !!s.upgrades?.accountant,
      }
    },

    // Settle the outstanding bill, in full or in part. Partial payment is allowed on
    // purpose: a bad quarter should be survivable by paying what you can and carrying the
    // rest at interest, rather than by a single unaffordable wall.
    payTaxBill(amount = null) {
      const s = get()
      const owed = s.books?.owed || 0
      if (owed <= 0) return { error: 'Nothing is outstanding.' }
      const pay = round2(Math.min(owed, amount == null ? owed : Math.max(0, amount)))
      if (pay <= 0) return { error: 'Nothing to pay.' }
      // 🧾 Paying tax is not itself a deductible expense — it is the tax.
      if (!get().spend(pay, { personal: true })) return { error: 'You cannot cover that right now.' }
      set(st => ({
        books: {
          ...st.books,
          owed: round2((st.books.owed || 0) - pay),
          arrears: (st.books.owed || 0) - pay <= 0.005 ? 0 : st.books.arrears,
          lifetimePaid: round2((st.books.lifetimePaid || 0) + pay),
        },
      }))
      const left = get().books.owed
      get().log('tax', `🧾 Paid ${fmtMoney(pay)} in tax${left > 0.005 ? ` — ${fmtMoney(left)} still outstanding` : ' — the quarter is settled'}`, -pay)
      // Clearing the bill lifts a tax freeze on the distributor line.
      if (left <= 0.005 && get().credit?.frozen && get()._creditFrozenByTax) {
        set(st => ({ credit: { ...st.credit, frozen: false }, _creditFrozenByTax: false }))
        get().log('credit', `🏦 The distributor line is open again now the tax lien is cleared.`, 0)
      }
      return { ok: true, paid: pay, left }
    },

    // --- 🏦 The bank note ----------------------------------------------------------
    // Every offer with its terms and whether the bank will write it today.
    loanDesk() {
      const s = get()
      const day = absoluteDay(s.currentDay, s.monthsElapsed)
      const worth = netWorthFull(s)
      return LOAN_OFFERS.map(o => ({
        offer: o,
        ...loanTotals(o),
        ...loanEligible(o, { notoriety: s.notoriety, netWorth: worth, loan: s.loan, defaultedUntil: s.loanDefaultedUntil, absDay: day }),
      }))
    },

    takeLoan(offerId) {
      const s = get()
      const offer = loanOfferById(offerId)
      if (!offer) return { error: 'No such note.' }
      const day = absoluteDay(s.currentDay, s.monthsElapsed)
      const check = loanEligible(offer, {
        notoriety: s.notoriety, netWorth: netWorthFull(s), loan: s.loan,
        defaultedUntil: s.loanDefaultedUntil, absDay: day,
      })
      if (!check.ok) return { error: check.why }
      const loan = makeLoan(offer, day)
      set({ loan })
      // Borrowed money is not income. It is a liability that happens to arrive as cash, so it
      // must NOT go through earn() — that would book it as revenue and tax you on your own debt.
      set(st => ({ cash: round2(st.cash + offer.principal) }))
      get().log('loan', `🏦 Signed the ${offer.name} — ${fmtMoney(offer.principal)} in, ${fmtMoney(loan.daily)}/day for ${offer.termDays} days (${fmtMoney(loanTotals(offer).interest)} in interest).`, offer.principal)
      return { ok: true, loan }
    },

    // Clear the note early. You pay the remaining PRINCIPAL, so the interest you have not
    // reached simply never accrues — the reward for a good run.
    payoffLoan() {
      const loan = get().loan
      if (!loan) return { error: 'You are not carrying a note.' }
      const due = payoffAmount(loan)
      if (due <= 0) { set({ loan: null }); return { ok: true, paid: 0 } }
      // 🧾 Clearing principal is not an expense; the interest inside each daily instalment
      // already was. Settling early therefore saves interest and books nothing.
      if (!get().spend(due, { personal: true })) return { error: `You need ${fmtMoney(due)} to clear it.` }
      const saved = round2(loan.balance - due)
      set({ loan: null })
      get().log('loan', `🏦 Cleared the ${loan.name} early — ${fmtMoney(due)} settled${saved > 0.5 ? `, ${fmtMoney(saved)} of interest never accrued` : ''}.`, -due)
      get().addNotoriety(2, false, 'sales')
      return { ok: true, paid: due, saved }
    },

    loanStatus() {
      const loan = get().loan
      if (!loan) return null
      return { ...loan, payoff: payoffAmount(loan) }
    },
  }
}

// --- Per-day settlement, called from the day tick -----------------------------------
// Kept here rather than in daytick.js so the whole tax lifecycle reads in one file: accrue
// (economy), close and bill (here), pay (the action above).
export function settleQuarter(set, get, absDay) {
  const s = get()
  const b = s.books || freshBooks(absDay)
  if (absDay < quarterEnds(b)) return null
  const hasStore = !!s.upgrades?.storefront
  const net = quarterNet(b, s.upgrades)
  const bill = quarterBill(b, s.upgrades)
  const label = quarterLabel(b)

  // The audit is rolled at the close, against the profile of the business you ran.
  let penalty = 0
  const audited = Math.random() < auditChance(b, s.upgrades, hasStore)
  if (audited) penalty = auditPenalty(b, s.upgrades, hasStore)

  const owed = round2((b.owed || 0) + bill + penalty)
  const closed = {
    label, revenue: b.revenue || 0, expenses: b.expenses || 0, net, bill,
    penalty, audited, day: absDay,
  }
  const next = freshBooks(absDay)
  next.owed = owed
  next.arrears = owed > 0 ? (b.arrears || 0) : 0
  next.lifetimePaid = b.lifetimePaid || 0
  next.audits = (b.audits || 0) + (audited ? 1 : 0)
  next.lastAudit = audited ? absDay : (b.lastAudit || 0)
  next.quarters = [closed, ...(b.quarters || [])].slice(0, QUARTER_HISTORY)
  set({ books: next })

  if (bill <= 0 && penalty <= 0) {
    get().log('tax', `🧾 ${label} closed — ${fmtMoney(net)} net. Under the filing floor, so nothing is due.`, 0)
    return { ...closed, owed }
  }
  get().log('tax', `🧾 ${label} closed — ${fmtMoney(b.revenue || 0)} in, ${fmtMoney(b.expenses || 0)} out, ${fmtMoney(net)} net. Tax due: ${fmtMoney(bill)}.`, 0)
  if (audited) {
    get().log('tax-audit', `🔍 AUDITED. They looked at how much of your trade runs on cash and reassessed you ${fmtMoney(penalty)} on top. An accountant, and card rails on the counter, are what keep you out of this bracket.`, 0)
    get().addNotoriety(-2, false, 'dings')
  }
  return { ...closed, owed }
}

// An unpaid bill accrues interest and counts days. Left long enough it freezes the
// distributor line — a business with a tax lien does not get net terms from anybody.
export function settleTaxArrears(set, get, days) {
  const b = get().books
  if (!b || (b.owed || 0) <= 0.005) return null
  const grown = round2(b.owed * Math.pow(1 + ARREARS_DAILY_RATE, days))
  const arrears = (b.arrears || 0) + days
  set(st => ({ books: { ...st.books, owed: grown, arrears } }))
  if (arrears >= ARREARS_FREEZE_DAYS && !get().credit?.frozen) {
    set(st => ({ credit: { ...(st.credit || { balance: 0 }), frozen: true }, _creditFrozenByTax: true }))
    get().log('tax-late', `🧾 ${arrears} days behind on tax. The lien froze your distributor credit line — clear the bill to reopen it.`, 0)
  }
  return { owed: grown, arrears }
}

// The daily loan instalment, and what happens when the till cannot cover it.
export function settleLoan(set, get, days) {
  const loan = get().loan
  if (!loan) return null
  let paid = 0, missed = 0
  for (let i = 0; i < days; i++) {
    const l = get().loan
    if (!l || l.balance <= 0) break
    const due = round2(Math.min(l.daily, l.balance))
    // 🧾 An instalment is a business cost, so it comes off the taxable line like any other.
    if (get().spend(due)) {
      paid = round2(paid + due)
      set(st => ({ loan: { ...st.loan, balance: round2(st.loan.balance - due), paid: round2((st.loan.paid || 0) + due), missed: 0 } }))
    } else {
      missed++
      set(st => ({ loan: { ...st.loan, missed: (st.loan.missed || 0) + 1, missedTotal: (st.loan.missedTotal || 0) + 1 } }))
    }
  }
  const l = get().loan
  if (l && l.balance <= 0.005) {
    set({ loan: null })
    get().log('loan', `🏦 The ${l.name} is paid off in full. The bank will remember that.`, 0)
    get().addNotoriety(3, false, 'sales')
    return { cleared: true, paid }
  }
  // Called in. Enough consecutive days with nothing in the till and the note is in default:
  // the debt stands, your name takes a real hit, the distributor line freezes on top, and the
  // bank will not write another for a long while.
  if (l && (l.missed || 0) >= LOAN_DEFAULT_DAYS) {
    const day = absoluteDay(get().currentDay, get().monthsElapsed)
    set(st => ({
      loan: null,
      loanDefaultedUntil: day + LOAN_DEFAULT_COOLDOWN,
      credit: { ...(st.credit || { balance: 0 }), frozen: true },
      // The unpaid balance does not evaporate — it lands on the books as money owed.
      books: { ...(st.books || {}), owed: round2((st.books?.owed || 0) + l.balance) },
    }))
    get().addNotoriety(-LOAN_DEFAULT_NOTORIETY, false, 'dings')
    get().log('loan-default', `🏦 DEFAULT. ${LOAN_DEFAULT_DAYS} days without an instalment and the bank called the ${l.name} in. The ${fmtMoney(l.balance)} still stands, your distributor line is frozen, and nobody is lending to you for ${LOAN_DEFAULT_COOLDOWN} days.`, 0)
    return { defaulted: true, paid, balance: l.balance }
  }
  if (missed > 0) {
    get().log('loan-late', `🏦 Missed ${missed} instalment${missed > 1 ? 's' : ''} on the ${l.name} (${l.missed}/${LOAN_DEFAULT_DAYS} before it is called in).`, 0)
  }
  return { paid, missed, loan: get().loan }
}
