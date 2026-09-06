import { useGame } from '../game/store'
import { fmtMoney } from '../game/engine'
import { Collapse, useOpen } from '../ui/Collapse'
import { creditFreezeReasons, CREDIT_FREEZE } from '../game/store/helpers'
import { CREDIT_MONTHLY_RATE, creditMonthlyRate } from '../game/store/constants'

// 💳 The distributor line, lifted out of Shop.jsx so two screens can render the same panel.
// The Buy tab needs it above the shelf (the pay-mode toggle decides what every buy button
// below charges); You → Career needs it because a line of credit is part of your money, not
// a property of the shop you happen to be looking at. One component, one set of rules.

// The distributor credit line — a single global account (limit scales with net worth). Shows
// the balance / limit / available, a Cash⇄Credit toggle that routes every buy on this tab, and
// pay-down controls. Carrying a balance accrues monthly interest; the minimum auto-pays from
// cash each month, and missing it freezes the line (surfaced here) until you pay it down.
export default function CreditPanel({ balance, limit, avail, min, frozen, cash, payMode, setPayMode, onPay }) {
  const canUseCredit = !frozen && avail > 0
  const hasBalance = balance > 0.005
  // 🏦 Preferred Account shows its cheaper carry — the panel must quote the real rate.
  const preferred = useGame(s => !!s.upgrades.preferredAccount)
  // Why the line is shut. "Pay your balance down" is the wrong answer for two of the three
  // freezes (a tax lien and a called-in loan), and a default freeze often leaves no balance
  // to pay at all — so the panel names the actual cure.
  const reasons = useGame(s => creditFreezeReasons(s))
  const ratePct = +( (preferred ? creditMonthlyRate({ preferredAccount: true }) : CREDIT_MONTHLY_RATE) * 100).toFixed(1)
  // A credit mode the line can't back reads as Cash (matches the Shop's onCredit/split gating).
  const active = canUseCredit ? payMode : 'cash'
  const freezeCure = reasons.map(r => CREDIT_FREEZE[r]?.cure).filter(Boolean).join(' ')
  const creditTitle = frozen ? `Frozen by ${reasons.map(r => CREDIT_FREEZE[r]?.label || r).join(' and ')} — ${freezeCure}`
    : avail <= 0 ? 'No credit available yet — your line grows with your net worth (and frees up as you pay down the balance)'
    : `up to ${fmtMoney(avail)} available`
  // Collapsible: the header always shows the load-bearing numbers — balance owed + open credit —
  // so closed still informs; the stats and pay-down buttons live in the body.
  //
  // Closed by DEFAULT now, on desktop too. This panel sat expanded above the shelf and was one of
  // four reference panels the player scrolled past to reach the thing they came to buy — the
  // sealed shelf rendered TWELFTH on this tab. Reference material collapses; the shelf does not.
  //
  // The key is `pv-col-credit2`, not `pv-col-credit`. useOpen persists the player's choice
  // forever, so changing the default alone would have reached nobody who had ever toggled the old
  // panel — including every existing save. A new key is the only way a changed default lands.
  const [openPanel, togglePanel] = useOpen('pv-col-credit2', false)
  return (
    <div className={`credit-panel ${frozen ? 'frozen' : ''}`}>
      <div className="credit-top" role="button" tabIndex={0} aria-expanded={openPanel}
        style={{ cursor: 'pointer', userSelect: 'none' }} onClick={togglePanel}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel() } }}>
        <div className="credit-head">💳 Credit line{frozen && <span className="credit-badge">FROZEN</span>}</div>
        <span className="cap">
          {hasBalance ? <><b className="credit-owe">{fmtMoney(balance)}</b> owed · </> : null}
          <b className="credit-avail">{fmtMoney(avail)}</b> open
        </span>
        {/* Paying off the line is the one action worth reaching from the collapsed header — the
            rest (min payment, stats) stays behind the toggle, but "I'm looking at what I owe,
            let me clear it" shouldn't require opening the panel first. stopPropagation keeps the
            tap from also toggling the collapse underneath it. */}
        {hasBalance && (
          <button className="btn small gold" style={{ marginLeft: 'auto' }} disabled={cash <= 0}
            onClick={e => { e.stopPropagation(); onPay(balance) }}>
            {cash + 0.005 < balance ? `Pay ${fmtMoney(cash)}` : `Pay off ${fmtMoney(balance)}`}
          </button>
        )}
        <span className="muted" style={{ marginLeft: hasBalance ? 0 : 'auto' }}>{openPanel ? '▾' : '▸'}</span>
      </div>
      {/* The pay-with toggle stays OUTSIDE the collapse. It is not reference material: it decides
          what every buy button on the shelf below charges, so hiding it behind a closed panel
          would hide the price the player is about to pay. Only the balance detail collapses. */}
      <div className="credit-toggle mt-4" role="group" aria-label="Pay with">
        <button className={`btn ${active === 'cash' ? 'gold' : 'alt'}`} onClick={() => setPayMode('cash')}>💵 Cash</button>
        <button className={`btn ${active === 'split' ? 'gold' : 'alt'}`} disabled={!canUseCredit}
          onClick={() => setPayMode('split')}>🔀 Cash + Credit</button>
        <button className={`btn ${active === 'credit' ? 'gold' : 'alt'}`} disabled={!canUseCredit}
          onClick={() => setPayMode('credit')}>💳 Credit</button>
      </div>
      <div className="cap t-sm mt-1">
        {!canUseCredit ? creditTitle
          : active === 'cash' ? 'Buys come out of cash on hand.'
          : active === 'split' ? `Cash first, the rest on credit (${creditTitle}).`
          : `Buys charge to your credit line (${creditTitle}).`}
      </div>
      {openPanel && (<>
      <div className="credit-stats">
        <span>Balance <b className={hasBalance ? 'credit-owe' : ''}>{fmtMoney(balance)}</b></span>
        <span>Limit <b>{fmtMoney(limit)}</b></span>
        <span>Available <b className="credit-avail">{fmtMoney(avail)}</b></span>
        {hasBalance && <span>Min/mo <b>{fmtMoney(min)}</b></span>}
      </div>
      {hasBalance ? (
        <div className="credit-pay">
          <div className="muted credit-note">~{ratePct}%/mo interest on the balance · the minimum auto-pays from cash each month.</div>
          {frozen && <div className="muted credit-note">🧊 {freezeCure}</div>}
          <div className="credit-pay-btns">
            <button className="btn alt" disabled={cash <= 0} onClick={() => onPay(min)}>Pay min {fmtMoney(min)}</button>
            <button className="btn gold" disabled={cash <= 0} onClick={() => onPay(balance)}>
              {cash + 0.005 < balance ? `Pay ${fmtMoney(cash)} (all cash)` : `Pay off ${fmtMoney(balance)}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="muted credit-note">
          {frozen
            ? `🧊 Nothing is owed, but the line is shut by ${reasons.map(r => CREDIT_FREEZE[r]?.label || r).join(' and ')}. ${freezeCure}`
            : `Buy sealed on credit and pay it off monthly — your line grows with your net worth. Carry a balance and it accrues ~${ratePct}%/mo.`}
        </div>
      )}
      </>)}
    </div>
  )
}

// 🧮 The Purchasing Agent's reorder-points ledger: one stepper per product TYPE across the
// buyable shop list (incl. the 🎌 import shelf once licensed). The agent tops every set that
// carries the type up to the minimum overnight — see the day tick for the buying rules.
