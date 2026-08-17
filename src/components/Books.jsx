import { useState } from 'react'
import { fmtMoney } from '../game/engine'
import { useGame } from '../game/store'
import { FILING_FLOOR, QUARTER_DAYS, ACCOUNTANT_DEDUCTION } from '../game/tax'
import { loanProgress } from '../game/loans'

// 🧾🏦 The books — the quarterly tax bill and the bank note, on the Stats tab.
//
// Both are money the business owes on a clock, and both need to be VISIBLE BEFORE they land.
// A tax bill that arrives as a surprise is a punishment; a tax bill you can watch building,
// with a countdown and a running figure, is a decision — because the lever that lowers it is
// buying inventory before the quarter closes, and you can only pull that lever if you know
// the quarter is closing.

function Bar({ pct, color }) {
  return (
    <div className="books-bar">
      <div className="books-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, background: color }} />
    </div>
  )
}

function TaxPanel() {
  const summary = useGame(s => s.booksSummary())
  const payTaxBill = useGame(s => s.payTaxBill)
  const cash = useGame(s => s.cash)
  const [msg, setMsg] = useState(null)

  const { books, label, net, bill, rate, owed, arrears, daysLeft, cashProfile, auditRisk, hasAccountant } = summary
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000) }
  const pay = (amt) => {
    const r = payTaxBill(amt)
    flash(r?.error ? `⚠️ ${r.error}` : `🧾 Paid ${fmtMoney(r.paid)}.`)
  }

  const riskLabel = auditRisk >= 0.2 ? 'high' : auditRisk >= 0.08 ? 'worth reducing' : 'low'
  const riskColor = auditRisk >= 0.2 ? 'var(--red)' : auditRisk >= 0.08 ? '#ff9f43' : 'var(--green)'

  return (
    <div className="market-panel">
      <div className="market-head">
        🧾 The books <span className="muted">— {label}, {daysLeft} day{daysLeft === 1 ? '' : 's'} to close</span>
      </div>

      {owed > 0 && (
        <div className="books-due">
          <div>
            <b>{fmtMoney(owed)} outstanding</b>
            {arrears > 0 && <span className="muted"> · {arrears} day{arrears === 1 ? '' : 's'} late, accruing interest</span>}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small" disabled={cash < owed} onClick={() => pay(null)}>Pay {fmtMoney(owed)}</button>
            {cash > 0 && cash < owed && (
              <button className="btn small ghost" onClick={() => pay(cash)}>Pay what I can ({fmtMoney(cash)})</button>
            )}
          </div>
        </div>
      )}

      <div className="books-grid">
        <div><span className="muted">Revenue this quarter</span><b>{fmtMoney(books.revenue || 0)}</b></div>
        <div><span className="muted">Deductible spending</span><b>{fmtMoney(books.expenses || 0)}</b></div>
        <div><span className="muted">Net profit</span><b>{fmtMoney(net)}</b></div>
        <div>
          <span className="muted">Tax if it closed today</span>
          <b style={{ color: bill > 0 ? '#ff9f43' : 'var(--green)' }}>{fmtMoney(bill)}</b>
        </div>
      </div>

      <Bar pct={1 - daysLeft / QUARTER_DAYS} color="#5aa0ff" />

      {net <= FILING_FLOOR ? (
        <div className="muted books-note">
          Under the {fmtMoney(FILING_FLOOR)} filing floor, so nothing is due. The books only start
          costing you once the business is genuinely making money.
        </div>
      ) : (
        <div className="muted books-note">
          Effective rate {(rate * 100).toFixed(0)}%. Every dollar you put into stock before the
          quarter closes is a dollar off the taxable line — restocking on the last week of a fat
          quarter is not a trick, it is what the cash-basis books are for.
          {hasAccountant && <> Your 🧮 accountant is finding an extra {Math.round(ACCOUNTANT_DEDUCTION * 100)}% of deductions.</>}
        </div>
      )}

      <div className="books-risk">
        {/* Label and value are adjacent inline nodes — without the separator the accessible
            name read "Audit exposure0% — low" and the two ran together on screen too. */}
        <span className="muted">Audit exposure</span>{' '}
        <b style={{ color: riskColor }}>{(auditRisk * 100).toFixed(0)}% — {riskLabel}</b>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
          {Math.round(cashProfile * 100)}% of your trade reads as cash.
          {cashProfile > 0.45
            ? ' A shop that can only take cash and Venmo is a cash business, and that is the profile that gets looked at. Card rails cost a processing fee and buy this down.'
            : ' Your card rails keep the paperwork ordinary.'}
          {!hasAccountant && ' A 🧮 Accountant halves it outright.'}
        </div>
      </div>

      {!!(books.quarters || []).length && (
        <div className="books-history">
          {books.quarters.slice(0, 4).map((q, i) => (
            <div key={i} className="books-hrow">
              <b>{q.label}</b>
              <span className="muted">{fmtMoney(q.revenue)} in · {fmtMoney(q.net)} net</span>
              <span>{fmtMoney(q.bill)}{q.audited ? <span style={{ color: 'var(--red)' }}> +{fmtMoney(q.penalty)} 🔍</span> : null}</span>
            </div>
          ))}
        </div>
      )}
      {msg && <div className="books-note" style={{ color: 'var(--gold)' }}>{msg}</div>}
    </div>
  )
}

function LoanPanel() {
  const loan = useGame(s => s.loanStatus())
  const desk = useGame(s => s.loanDesk())
  const takeLoan = useGame(s => s.takeLoan)
  const payoffLoan = useGame(s => s.payoffLoan)
  const cash = useGame(s => s.cash)
  const [msg, setMsg] = useState(null)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4500) }

  if (loan) {
    const p = loanProgress(loan)
    return (
      <div className="market-panel" style={{ marginTop: 12 }}>
        <div className="market-head">
          {loan.icon} {loan.name} <span className="muted">— {p.left} of {p.of} instalments left</span>
        </div>
        <div className="books-grid">
          <div><span className="muted">Owed</span><b>{fmtMoney(loan.balance)}</b></div>
          <div><span className="muted">Daily instalment</span><b>{fmtMoney(loan.daily)}</b></div>
          <div><span className="muted">Clear it today for</span><b>{fmtMoney(loan.payoff)}</b></div>
          <div>
            <span className="muted">Missed</span>
            <b style={{ color: loan.missed > 0 ? 'var(--red)' : 'var(--green)' }}>{loan.missed || 0}</b>
          </div>
        </div>
        <Bar pct={p.pct} color="var(--green)" />
        <div className="muted books-note">
          The instalment comes out every day whether or not the shop had a good one. Clearing it
          early costs only the remaining principal — the interest you have not reached never accrues.
        </div>
        <button className="btn small" disabled={cash < loan.payoff}
          onClick={() => { const r = payoffLoan(); flash(r?.error ? `⚠️ ${r.error}` : `🏦 Cleared for ${fmtMoney(r.paid)}.`) }}>
          Clear the note ({fmtMoney(loan.payoff)})
        </button>
        {msg && <div className="books-note" style={{ color: 'var(--gold)' }}>{msg}</div>}
      </div>
    )
  }

  return (
    <div className="market-panel" style={{ marginTop: 12 }}>
      <div className="market-head">🏦 The bank <span className="muted">— a term loan against the business</span></div>
      <div className="muted books-note">
        Different money from the distributor line. That one is revolving credit for stock, sized
        off what you are already worth. This is a lump sum with a fixed term — the way a shop
        buys a lease instead of grinding for it.
      </div>
      {desk.map(({ offer, daily, total, interest, ok, why }) => (
        <div key={offer.id} className={`loan-offer ${ok ? '' : 'locked'}`}>
          <div className="loan-head">
            <b>{offer.icon} {offer.name}</b>
            <span>{fmtMoney(offer.principal)}</span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{offer.blurb}</div>
          <div className="loan-terms">
            <span className="pill">{fmtMoney(daily)}/day</span>
            <span className="pill">{offer.termDays} days</span>
            <span className="pill">{(offer.apr * 100).toFixed(0)}% APR</span>
            <span className="pill" title="What you hand back in total, and how much of it is interest.">
              pay back <b>{fmtMoney(total)}</b> ({fmtMoney(interest)} interest)
            </span>
          </div>
          {ok
            ? <button className="btn small" onClick={() => { const r = takeLoan(offer.id); flash(r?.error ? `⚠️ ${r.error}` : `🏦 ${fmtMoney(offer.principal)} in the account.`) }}>Sign it</button>
            : <div className="muted" style={{ fontSize: 12 }}>🔒 {why}</div>}
        </div>
      ))}
      {msg && <div className="books-note" style={{ color: 'var(--gold)' }}>{msg}</div>}
    </div>
  )
}

export default function Books() {
  return (
    <>
      <TaxPanel />
      <LoanPanel />
    </>
  )
}
