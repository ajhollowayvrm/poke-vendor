// 🏦 The bank — a term loan against the business.
//
// The game had exactly one form of credit: the distributor line, which is revolving, priced
// for stock, and sized off what you are already worth. That is a good instrument for buying
// this week's cases and a bad one for buying a building.
//
// The Brick-and-Mortar Store costs $8,000, and until now the only route to it was grinding
// the full amount out of flips. A term loan is the other route real shops take: borrow the
// buildout, open early, and let the shop pay for itself while you carry the note.
//
// It is a real commitment and it is meant to be:
//   • The payment comes out every single day, whether or not the shop had a good day.
//   • Interest means you pay back meaningfully more than you borrowed.
//   • Miss enough payments and you default, which costs you your name and freezes the
//     distributor line on top.
//
// Paying it off early is free and it is the reward for a good run — the remaining interest
// simply never accrues.

import { round2 } from './engine'

// The offers on the desk. Bigger notes are cheaper money, and the bank will not write one
// until the business looks like it can service it.
//   • `minNoto`    — they lend on a name as much as a balance sheet.
//   • `minWorthPct`— collateral: your net worth must cover this share of what you borrow.
// Rates are high because the borrower is. A card shop with no trading history and a box of
// cardboard for collateral does not get prime money — short-term small-business paper really
// runs at these numbers, and it falls sharply as the business proves itself, which is what
// makes graduating to the next note feel like something.
//
// Note that on a term this short the interest is NOT the commitment. A $5,000 note over 60
// days is $85 a day, every day, against a $40 rent and a $120 lease — the daily payment is
// what you are signing up for, and the default is what happens when the shop has a bad week.
export const LOAN_OFFERS = [
  { id: 'starter', name: 'Starter Note', icon: '🏦', principal: 5000, termDays: 60, apr: 0.36,
    minNoto: 10, minWorthPct: 0.25,
    blurb: 'The small-business note every new shop signs, at the rate a shop with no history pays. Enough to open the doors, short enough to hurt if the doors stay quiet.' },
  { id: 'expansion', name: 'Expansion Loan', icon: '🏦', principal: 15000, termDays: 120, apr: 0.22,
    minNoto: 45, minWorthPct: 0.35,
    blurb: 'Real money on real terms, at half the starter rate — you have a trading history now. The one you sign to buy inventory depth rather than a lease.' },
  { id: 'commercial', name: 'Commercial Note', icon: '🏛️', principal: 50000, termDays: 180, apr: 0.13,
    minNoto: 120, minWorthPct: 0.45,
    blurb: 'The bank treats you as a business now. Six months of runway at a rate that says so.' },
]
export function loanOfferById(id) { return LOAN_OFFERS.find(o => o.id === id) || null }

// Days behind before the note is called in.
export const LOAN_DEFAULT_DAYS = 8
// What a default does to your standing.
export const LOAN_DEFAULT_NOTORIETY = 12
// How long the bank remembers a default before it will talk to you again.
export const LOAN_DEFAULT_COOLDOWN = 120

// --- The arithmetic ---------------------------------------------------------------
// A standard amortised payment: equal instalments that clear principal and interest across
// the term. Daily, because this game's clock is daily.
export function dailyPayment(principal, apr, termDays) {
  const r = apr / 365
  if (r <= 0) return round2(principal / termDays)
  const factor = Math.pow(1 + r, termDays)
  return round2(principal * r * factor / (factor - 1))
}
// What the note costs you in total, and in interest alone. This is the number the offer card
// leads with, because "14% APR" means nothing next to "you pay back $5,190".
export function loanTotals(offer) {
  const daily = dailyPayment(offer.principal, offer.apr, offer.termDays)
  const total = round2(daily * offer.termDays)
  return { daily, total, interest: round2(total - offer.principal) }
}

// Can the bank write this note today?
export function loanEligible(offer, { notoriety = 0, netWorth = 0, loan = null, defaultedUntil = 0, absDay = 0 } = {}) {
  if (loan) return { ok: false, why: 'You are already carrying a note. One at a time.' }
  if (absDay < (defaultedUntil || 0)) {
    return { ok: false, why: `You defaulted on a note. The bank will talk again in ${Math.ceil((defaultedUntil - absDay))} days.` }
  }
  if ((notoriety || 0) < offer.minNoto) {
    return { ok: false, why: `They lend on a track record — reach ⭐${offer.minNoto}.` }
  }
  const need = offer.principal * offer.minWorthPct
  if ((netWorth || 0) < need) {
    return { ok: false, why: `They want collateral — a net worth of $${Math.round(need).toLocaleString()}.` }
  }
  return { ok: true }
}

// Open a note.
export function makeLoan(offer, absDay) {
  const daily = dailyPayment(offer.principal, offer.apr, offer.termDays)
  return {
    id: offer.id,
    name: offer.name,
    icon: offer.icon,
    principal: offer.principal,
    balance: round2(daily * offer.termDays), // what you owe in total, paid down by instalments
    daily,
    apr: offer.apr,
    termDays: offer.termDays,
    startDay: absDay,
    dueDay: absDay + offer.termDays,
    paid: 0,
    missed: 0,       // consecutive days a payment could not be taken
    missedTotal: 0,
  }
}

// Settling the note early clears the remaining PRINCIPAL, not the remaining instalments —
// the interest you have not reached yet simply never accrues. That is how a real note works
// and it is a genuine reward for a good month.
export function payoffAmount(loan) {
  if (!loan) return 0
  const r = loan.apr / 365
  const left = Math.max(0, Math.round(loan.balance / loan.daily))
  if (left <= 0) return 0
  if (r <= 0) return round2(loan.balance)
  // Present value of the remaining instalments.
  const pv = loan.daily * (1 - Math.pow(1 + r, -left)) / r
  return round2(Math.min(loan.balance, pv))
}

// Instalments left, and how far through the term you are.
export function loanProgress(loan) {
  if (!loan) return { left: 0, of: 0, pct: 1 }
  const of = loan.termDays
  const left = Math.max(0, Math.ceil(loan.balance / loan.daily))
  return { left, of, pct: of ? Math.max(0, Math.min(1, (of - left) / of)) : 1 }
}
