import { useState } from 'react'
import { fmtMoney } from '../game/engine'
import { useGame } from '../game/store'
import { FILING_FLOOR, QUARTER_DAYS, ACCOUNTANT_DEDUCTION } from '../game/tax'
import { loanProgress } from '../game/loans'
import { creditFreezeReasons, CREDIT_FREEZE } from '../game/store/helpers'

// 🧾💳🏦 The books — the quarterly tax bill, the distributor credit line and the bank note,
// on the 🏬 Store → Financials tab (and 👤 You → Career until you have a store).
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
        <div className="cap mt-2">
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
              <span>{fmtMoney(q.bill)}{q.audited ? <span className="neg"> +{fmtMoney(q.penalty)} 🔍</span> : null}</span>
            </div>
          ))}
        </div>
      )}
      {msg && <div className="books-note warn">{msg}</div>}
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
      <div className="market-panel mt-5">
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
        {msg && <div className="books-note warn">{msg}</div>}
      </div>
    )
  }

  return (
    <div className="market-panel mt-5">
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
          <div className="cap">{offer.blurb}</div>
          <div className="loan-terms">
            <span className="pill">{fmtMoney(daily)}/day</span>
            <span className="pill">{offer.termDays} days</span>
            <span className="pill">{(offer.apr * 100).toFixed(0)}% APR</span>
            <span className="pill">
              pay back <b>{fmtMoney(total)}</b> ({fmtMoney(interest)} interest)
            </span>
          </div>
          {ok
            ? <button className="btn small" onClick={() => { const r = takeLoan(offer.id); flash(r?.error ? `⚠️ ${r.error}` : `🏦 ${fmtMoney(offer.principal)} in the account.`) }}>Sign it</button>
            : <div className="cap">🔒 {why}</div>}
        </div>
      ))}
      {msg && <div className="books-note warn">{msg}</div>}
    </div>
  )
}

// 💳 The distributor credit line, on the tab where a player looks for what they owe.
//
// The Buy tab has a credit panel too, but it is the SHELF's panel: it carries the pay-mode
// toggle, so it renders only inside the unlocked, non-marketplace distributor branch. Browse
// the 📱 marketplace or a locked account and the balance, the payment buttons and the reason
// the line is frozen all disappear — with nothing on any other tab showing them. A debt you
// cannot find is a debt you cannot pay, so the balance lives here unconditionally.
function CreditLinePanel() {
  const balance = useGame(s => s.credit?.balance || 0)
  const frozen = useGame(s => !!s.credit?.frozen)
  const limit = useGame(s => s.creditLimit())
  const avail = useGame(s => s.creditAvailable())
  const min = useGame(s => s.creditMinimum())
  const reasons = useGame(s => creditFreezeReasons(s))
  const payCredit = useGame(s => s.payCredit)
  const cash = useGame(s => s.cash)
  const [msg, setMsg] = useState(null)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000) }

  const hasBalance = balance > 0.005
  // Nothing owed and nothing frozen is the whole story — one line, no panel furniture.
  if (!hasBalance && !frozen) {
    return (
      <div className="market-panel mt-5">
        <div className="market-head">💳 The distributor line <span className="muted">— nothing owed</span></div>
        <div className="muted books-note">
          Revolving credit for stock, sized off what you are worth: {fmtMoney(limit)} limit,
          {' '}{fmtMoney(avail)} of it open. Buy sealed on credit from the Buy tab and the balance
          shows up here.
        </div>
      </div>
    )
  }

  const pay = (amt) => {
    const paid = payCredit(amt)
    flash(paid > 0 ? `💳 Paid ${fmtMoney(paid)} toward the line.` : '⚠️ No cash to pay it with.')
  }

  return (
    <div className="market-panel mt-5">
      <div className="market-head">
        💳 The distributor line <span className="muted">— revolving credit for stock</span>
      </div>

      {hasBalance && (
        <div className="books-due">
          <div>
            <b>{fmtMoney(balance)} outstanding</b>
            <span className="muted"> · {fmtMoney(min)} minimum auto-pays each month</span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small" disabled={cash + 0.005 < balance} onClick={() => pay(balance)}>
              Pay {fmtMoney(balance)}
            </button>
            {cash > 0 && cash + 0.005 < balance && (
              <button className="btn small ghost" onClick={() => pay(cash)}>Pay what I can ({fmtMoney(cash)})</button>
            )}
            {cash > 0 && <button className="btn small ghost" onClick={() => pay(min)}>Pay minimum ({fmtMoney(min)})</button>}
          </div>
        </div>
      )}

      <div className="books-grid">
        <div><span className="muted">Balance</span><b>{fmtMoney(balance)}</b></div>
        <div><span className="muted">Limit</span><b>{fmtMoney(limit)}</b></div>
        <div><span className="muted">Available</span><b>{fmtMoney(avail)}</b></div>
        <div>
          <span className="muted">Status</span>
          <b style={{ color: frozen ? 'var(--red)' : 'var(--green)' }}>{frozen ? 'Frozen' : 'Open'}</b>
        </div>
      </div>

      {/* A frozen line must always say WHAT froze it and WHAT lifts it — each reason has its
          own cure, and "pay it down" is the wrong answer for two of the three. */}
      {frozen && (
        <div className="books-note warn">
          <b>Frozen by {reasons.map(r => CREDIT_FREEZE[r]?.label || r).join(' and ')}.</b>
          {' '}Buys are cash-only until it lifts.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {reasons.map(r => <li key={r}>{CREDIT_FREEZE[r]?.cure || 'Pay the balance down to clear it.'}</li>)}
          </ul>
        </div>
      )}

      {msg && <div className="books-note warn">{msg}</div>}
    </div>
  )
}

export default function Books() {
  return (
    <>
      <TaxPanel />
      <CreditLinePanel />
      <LoanPanel />
    </>
  )
}
