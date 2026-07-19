import { useState } from 'react'
import { useGame } from '../game/store'
import { fmtMoney, cardImg } from '../game/engine'
import HoloCard from './HoloCard'
import { useModalEscape } from '../ui/dialog'

const RAIL_LABEL = { venmo: 'Venmo', cash: 'cash', paypal: 'PayPal', card: 'card' }

// A stranger's inbound sealed deal (see makeSealedDeal). You can AUTHENTICATE it first
// (needs a Jeweler's Loupe — a paid, fallible read), BUY it, or PASS. Buying reveals
// whether it was real (stocked to your held inventory) or a scam; if you paid by a
// reversible rail (card / PayPal) you can file a CHARGEBACK to claw money back.
export default function SealedDealModal({ enc, id, onDone, onCancel, flash }) {
  const deal = enc.deal
  const cash = useGame(s => s.cash)
  const hasAuthKit = useGame(s => !!s.upgrades.authkit)
  const authenticateDeal = useGame(s => s.authenticateDeal)
  const buyDeal = useGame(s => s.buyDeal)
  const chargebackDeal = useGame(s => s.chargebackDeal)
  const clearItem = useGame(s => s.clearInboxItem)

  const [authRead, setAuthRead] = useState(enc.authResult || null)
  const [outcome, setOutcome] = useState(null)  // result of buyDeal
  const [charge, setCharge] = useState(null)     // result of chargebackDeal
  // You can bail before buying; once bought it's resolved, so Esc/backdrop are inert then.
  useModalEscape(() => { if (!outcome) onCancel?.() })

  const fee = Math.max(10, Math.round(deal.ask * 0.05 * 100) / 100)
  const rail = RAIL_LABEL[deal.payMethod] || 'cash'

  function doAuth() {
    const r = authenticateDeal(id)
    if (r?.error) { flash?.(r.error); return }
    setAuthRead(r)
  }
  function doBuy() {
    const r = buyDeal(deal)
    if (r?.error) { flash?.(r.msg); return }
    clearItem(id)          // consumed — clear now so a re-open can't double-buy
    setOutcome(r)
  }
  function doCharge() { setCharge(chargebackDeal(deal)) }
  function pass() {
    clearItem(id)
    flash?.(deal.fake ? 'Smart — that one had scam written all over it.' : 'You let a real deal walk. Can’t win them all.')
    onDone?.()
  }

  return (
    <div className="modalbg" onClick={() => { if (!outcome) onCancel?.() }}>
      <div className="modal encounter" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        {!outcome && onCancel && <button className="modal-close" aria-label="Close" onClick={onCancel}>✕</button>}
        <h2 style={{ fontSize: 19 }}>{enc.title}</h2>
        {enc.card && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
            <HoloCard card={enc.card} maxTilt={16} className="enc-card"><img src={cardImg(enc.card)} alt="" decoding="async" /></HoloCard>
          </div>
        )}
        <p style={{ fontSize: 15, lineHeight: 1.45 }}>{enc.body}</p>

        {/* payment-rail recourse note — the rail you were pushed onto is itself a tell */}
        <div className="banner" style={{ marginTop: 0, fontSize: 13 }}>
          {deal.reversible
            ? <>💳 They take <b>{rail}</b> — if it's fake you could <b>file a chargeback</b> to claw money back.</>
            : <>⚠️ <b>{rail === 'cash' ? 'Cash, no receipt' : `${rail} F&F`}</b> — irreversible. If it's fake, <b>there's no recourse</b>.</>}
        </div>

        {authRead && (
          <div className="banner result-in" style={{ marginTop: 8, fontSize: 13,
            background: authRead.looksFake ? 'color-mix(in srgb, var(--red) 13%, transparent)' : 'color-mix(in srgb, var(--green) 13%, transparent)',
            borderColor: authRead.looksFake ? 'color-mix(in srgb, var(--red) 33%, transparent)' : 'color-mix(in srgb, var(--green) 33%, transparent)' }}>
            🔍 <b>Authentication:</b> {authRead.looksFake
              ? <>looks <b style={{ color: 'var(--red)' }}>FAKE</b> — wrapper/weight is off.</>
              : <>looks <b style={{ color: 'var(--green)' }}>GENUINE</b> — checks out, but a clean reseal can still pass.</>}
            {' '}<span className="muted">(kit is ~{authRead.confidence}% reliable{deal.origin === 'vintage' ? ' · vintage reseals are trickiest' : ''})</span>
          </div>
        )}

        {!outcome ? (
          <div className="encopts">
            {hasAuthKit && !authRead && (
              <button className="encbtn tone-fair" disabled={cash < fee} onClick={doAuth}>
                <span>🔬</span> Authenticate first — {fmtMoney(fee)}{cash < fee ? ' (need cash)' : ''}
              </button>
            )}
            {!hasAuthKit && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                🔒 An <b>Authentication Kit</b> would let you authenticate before buying.
              </div>
            )}
            <button className="encbtn tone-kind" disabled={cash < deal.ask} onClick={doBuy}>
              <span>📦</span> Buy it — {fmtMoney(deal.ask)} ({rail}){cash < deal.ask ? ' · need cash' : ''}
            </button>
            <button className="encbtn tone-cold" onClick={pass}>
              <span>🚶</span> Pass — too risky
            </button>
          </div>
        ) : (
          <Outcome outcome={outcome} charge={charge} deal={deal} onCharge={doCharge} onFinish={onDone} />
        )}
      </div>
    </div>
  )
}

function Outcome({ outcome, charge, deal, onCharge, onFinish }) {
  if (!outcome.fake) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div className="banner result-in" style={{ background: 'color-mix(in srgb, var(--green) 13%, transparent)', borderColor: 'color-mix(in srgb, var(--green) 33%, transparent)' }}>
          📦 <b>Legit!</b> Stocked a {outcome.type} of {outcome.setName} for {fmtMoney(outcome.ask)} — a real steal. Find it in 📦 Inventory.
        </div>
        <button className="btn gold" style={{ maxWidth: 200, marginTop: 12 }} onClick={onFinish}>Nice — done</button>
      </div>
    )
  }
  const dud = outcome.origin === 'vintage' ? 'a resealed pack stuffed with bulk commons' : 'an empty box — it never really shipped'
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="banner result-in" style={{ background: 'color-mix(in srgb, var(--red) 13%, transparent)', borderColor: 'color-mix(in srgb, var(--red) 33%, transparent)' }}>
        💸 <b>Scammed.</b> You paid {fmtMoney(outcome.ask)} and got {dud}.
      </div>
      {outcome.reversible ? (
        charge ? (
          <>
            <div className="banner result-in" style={{ marginTop: 8,
              background: charge.won ? 'color-mix(in srgb, var(--green) 13%, transparent)' : 'color-mix(in srgb, var(--red) 13%, transparent)',
              borderColor: charge.won ? 'color-mix(in srgb, var(--green) 33%, transparent)' : 'color-mix(in srgb, var(--red) 33%, transparent)' }}>
              {charge.won
                ? <>💳 <b>Chargeback won</b> — recovered {fmtMoney(charge.recovered)}.</>
                : <>💳 <b>Chargeback denied</b> — the seller contested it. The money's gone.</>}
            </div>
            <button className="btn gold" style={{ maxWidth: 200, marginTop: 12 }} onClick={onFinish}>Done</button>
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13 }}>You paid by {RAIL_LABEL[deal.payMethod]} — you can dispute it (~60% to recover most of it).</p>
            <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 4 }}>
              <button className="btn gold" style={{ maxWidth: 200 }} onClick={onCharge}>💳 File a chargeback</button>
              <button className="btn alt" style={{ maxWidth: 140 }} onClick={onFinish}>Eat the loss</button>
            </div>
          </>
        )
      ) : (
        <>
          <p className="muted" style={{ fontSize: 13 }}>{RAIL_LABEL[deal.payMethod] === 'cash' ? 'Cash, no receipt' : `${RAIL_LABEL[deal.payMethod]} F&F`} — nothing to dispute. Lesson learned.</p>
          <button className="btn gold" style={{ maxWidth: 200, marginTop: 8 }} onClick={onFinish}>Done</button>
        </>
      )}
    </div>
  )
}
